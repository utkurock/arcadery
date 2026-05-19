'use client';

import { useState, useEffect, useRef } from 'react';
import { useEditorStore } from '@arcadery/editor/store';
import { createClient } from '@/lib/supabase/client';

type SaveStatus = 'saved' | 'saving' | 'error' | 'idle';

const LOCAL_SAVE_DELAY = 1000;
const REMOTE_SAVE_DELAY = 10000;
const STORAGE_PREFIX = 'arcadery_project_';

export function useAutoSave(projectId: string): SaveStatus {
  const isLocal = projectId.startsWith('local-');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const localTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remoteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      // Sweep orphan guest snapshots from older sessions. Before this, every
      // `/create/new` visit minted a fresh `local-{Date.now()}` id and the
      // auto-save key piled up in localStorage until the 5MB quota threw on
      // setItem. We only sweep the `local-*` namespace so DB-backed project
      // keys (uuid) are untouched.
      const ownKey = STORAGE_PREFIX + projectId;
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (!key) continue;
        if (key === ownKey) continue;
        if (key.startsWith(STORAGE_PREFIX + 'local-')) {
          localStorage.removeItem(key);
        }
      }

      const saved = localStorage.getItem(ownKey);
      if (saved) {
        const scene = JSON.parse(saved);
        const current = useEditorStore.getState().scene;
        // Only restore if current scene is empty (fresh load)
        if (Object.keys(current.elements).length === 0 && Object.keys(scene.elements || {}).length > 0) {
          useEditorStore.getState().loadScene(scene);
        }
      }
    } catch {}
  }, [projectId]);

  useEffect(() => {
    // Skip the first scene change after subscribing — that's the parent
    // calling `loadScene(initialProject.scene)` to hydrate the editor, NOT a
    // user edit. Writing the hydration back to storage (and worse, to the
    // remote row) would clobber in-flight edits during a project-id swap
    // (e.g. `/create/new` → `/create/<uuid>` redirect).
    let hydrated = false;
    const unsub = useEditorStore.subscribe((state, prevState) => {
      if (state.scene === prevState.scene) return;
      if (!hydrated) {
        hydrated = true;
        return;
      }

      // --- Local save (fast, 1s debounce) ---
      if (localTimeoutRef.current) clearTimeout(localTimeoutRef.current);
      localTimeoutRef.current = setTimeout(() => {
        try {
          localStorage.setItem(STORAGE_PREFIX + projectId, JSON.stringify(state.scene));
          setSaveStatus('saved');
        } catch {
          // localStorage full — non-critical
        }
      }, LOCAL_SAVE_DELAY);

      // --- Remote save (Supabase, 10s debounce, login only) ---
      if (!isLocal) {
        if (remoteTimeoutRef.current) clearTimeout(remoteTimeoutRef.current);
        remoteTimeoutRef.current = setTimeout(async () => {
          abortRef.current?.abort();
          abortRef.current = new AbortController();
          setSaveStatus('saving');

          try {
            const supabase = createClient();
            const { error } = await supabase
              .from('projects')
              .update({
                // Also persist the scene name to the top-level `name` column
                // so the My Games list reflects renames done in the editor
                // (Top bar's editable scene title, AI-generated names, etc).
                // Previously only `scene` jsonb was synced and the column
                // stayed at the original "Untitled Game" forever.
                name: state.scene.name || 'Untitled Game',
                scene: state.scene,
                updated_at: new Date().toISOString(),
              })
              .eq('id', projectId)
              .abortSignal(abortRef.current.signal);

            setSaveStatus(error ? 'error' : 'saved');
          } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') return;
            setSaveStatus('error');
          }
        }, REMOTE_SAVE_DELAY);
      }
    });

    return () => {
      unsub();
      if (localTimeoutRef.current) clearTimeout(localTimeoutRef.current);
      if (remoteTimeoutRef.current) clearTimeout(remoteTimeoutRef.current);
      abortRef.current?.abort();
    };
  }, [projectId, isLocal]);

  return saveStatus;
}
