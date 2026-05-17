'use client';

import { useEffect } from 'react';
import { useEditorStore } from '../stores/editor-store';
import { isFormElementFocused } from './utils';

/**
 * Global keyboard shortcuts for the editor.
 * Must be called once in the editor shell component.
 * Shortcuts are suppressed when an input/textarea/select/contentEditable has
 * focus — guard delegated to the shared isFormElementFocused() helper from
 * utils.ts (Wave 0). Phase 8 SELECT-03/05 shortcuts (Esc/Cmd+A/Arrows) live in
 * use-selection-keyboard.ts; this hook keeps W/E/R, Delete (multi-aware),
 * undo/redo, and Esc-in-PLAY-mode (mode toggle).
 */
export function useKeyboardShortcuts() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Suppress shortcuts when typing in form fields
      if (isFormElementFocused(e.target)) return;

      const state = useEditorStore.getState();

      // Only process shortcuts in edit mode
      if (state.mode !== 'edit') {
        // Exception: allow mode toggle even in play mode
        if (e.key === 'Escape') {
          e.preventDefault();
          state.setMode('edit');
          return;
        }
        return;
      }

      // Transform mode switching:
      //   V = select (Figma/Photoshop pointer tool — default cursor mode)
      //   W = move/translate gizmo (Unity/Blender)
      //   E = rotate gizmo
      //   R = scale gizmo
      switch (e.key.toLowerCase()) {
        case 'v':
          e.preventDefault();
          state.setTransformMode('select');
          return;
        case 'w':
          e.preventDefault();
          state.setTransformMode('translate');
          return;
        case 'e':
          e.preventDefault();
          state.setTransformMode('rotate');
          return;
        case 'r':
          e.preventDefault();
          state.setTransformMode('scale');
          return;
      }

      // Delete selected element(s) — multi-aware iteration. Snapshot the array
      // first because removeElement filters selectedIds in-flight; without the
      // snapshot, the shrinking array would skip half the targets mid-loop.
      // Multi-delete atomicity (single undo entry) deferred per RESEARCH Open
      // Question 2; N undo entries today is acceptable for Phase 8.
      if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedIds.length > 0) {
        e.preventDefault();
        for (const id of [...state.selectedIds]) {
          state.removeElement(id);
        }
        return;
      }

      // Undo: Ctrl+Z (or Cmd+Z on Mac)
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        useEditorStore.temporal.getState().undo();
        return;
      }

      // Redo: Ctrl+Shift+Z (or Cmd+Shift+Z on Mac)
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        useEditorStore.temporal.getState().redo();
        return;
      }

      // Redo alternative: Ctrl+Y
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        useEditorStore.temporal.getState().redo();
        return;
      }

      // Escape-in-edit-mode handler removed in Phase 8 (Wave 1, 08-02). It is
      // re-introduced in Wave 3 (08-04) inside use-selection-keyboard.ts so the
      // marquee/keyboard module owns its own focus-guarded shortcut surface
      // (RESEARCH Q4 / Pitfall 1 — Esc handler collision avoidance). The
      // play-mode Esc handler above (line ~30) stays.
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
