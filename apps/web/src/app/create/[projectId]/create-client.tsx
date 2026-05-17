'use client';

import { useEffect, useRef, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Monitor } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { createEmptyScene } from '@arcadery/shared';
import type { GameScene } from '@arcadery/shared';
import { EditorLoader } from './editor-loader';
import { useModals } from '@/lib/ui/modals';
import { useViewer } from '@/lib/auth/use-viewer';

export type Project = {
  id: string;
  user_id: string;
  name: string;
  scene: GameScene;
  created_at: string;
  updated_at: string;
};

export function CreatePageClient({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ template?: string; fork?: string; prompt?: string }>;
}) {
  const { projectId } = use(params);
  const resolvedSearch = use(searchParams);
  const router = useRouter();

  // Fast-path heuristic: brand-new project with no template/fork hydration =
  // we already know everything we need to render the editor on the very
  // first paint. Skip the "Preparing project..." flash entirely — set the
  // project synchronously and let the DB insert happen in the background.
  const fastPath =
    typeof window !== 'undefined' &&
    projectId === 'new' &&
    !resolvedSearch.template &&
    !resolvedSearch.fork;

  const [project, setProject] = useState<Project | null>(() => {
    if (!fastPath) return null;
    return {
      // user_id is patched in once viewer resolves + background insert lands.
      // The auto-save hook treats `local-*` as localStorage-only — safe for
      // edits made before the real DB row exists.
      id: `local-pending-${Date.now()}`,
      user_id: 'pending',
      name: 'Untitled Game',
      scene: createEmptyScene(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  });
  const [loading, setLoading] = useState(!fastPath);
  const [storedPrompt, setStoredPrompt] = useState<string | undefined>(undefined);

  // Guards: prevent double-firing the background insert if the load effect
  // re-runs (e.g. viewer transitioning from `loading` → `signed-in` after the
  // fast-path useState init already minted a local project).
  const insertKickedRef = useRef(false);

  // Use the centralized viewer store rather than a duplicate getSession() call.
  // The store is initialized by the root layout (one subscription, one getSession
  // call for the whole app), so by the time this page mounts the answer is
  // ready synchronously.
  const viewer = useViewer();
  const authChecked = viewer.status !== 'loading';
  const userId = viewer.status === 'signed-in' ? viewer.userId : null;

  // Pick up prompt from URL (preferred) or legacy sessionStorage. We keep
  // sessionStorage as a fallback for the reference-image flow that pre-dates
  // the URL param approach.
  useEffect(() => {
    if (resolvedSearch.prompt) {
      setStoredPrompt(resolvedSearch.prompt);
      return;
    }
    try {
      const p = sessionStorage.getItem('arcadery_prompt');
      if (p) { setStoredPrompt(p); sessionStorage.removeItem('arcadery_prompt'); }
    } catch {}
  }, [resolvedSearch.prompt]);

  useEffect(() => {
    if (!authChecked) return;
    // Auth gate: creating or remixing a game requires a signed-in viewer.
    // Guests get bounced to /explore (the app's primary landing inside the
    // dashboard) with the login modal open so they can sign in and try again.
    if (!userId) {
      useModals.getState().openLogin();
      router.replace('/explore');
      return;
    }

    let cancelled = false;
    // Last-resort safety: if any client-side Supabase call inside loadProject
    // hangs (network drop, extension interference), don't leave the user on
    // a permanent "Loading editor..." screen. After 8 s, hand them an
    // unsaved local project with the chosen scene — better than nothing.
    const watchdog = setTimeout(() => {
      if (cancelled) return;
      console.warn('[create] loadProject watchdog tripped — rendering local fallback');
      setProject({
        id: 'local-guest',
        user_id: userId,
        name: 'Untitled Game',
        scene: createEmptyScene(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      setLoading(false);
    }, 8000);

    loadProject().finally(() => {
      cancelled = true;
      clearTimeout(watchdog);
    });

    return () => {
      cancelled = true;
      clearTimeout(watchdog);
    };
  }, [authChecked, projectId, userId, router]);

  async function loadProject() {
    const authenticated = !!userId;

    if (projectId === 'new') {
      let scene: GameScene = createEmptyScene();
      let projectName = 'Untitled Game';

      // Template remix — wrapped in a 4s timeout race so a hung client-side
      // Supabase call (extension interference, flaky network) can't block the
      // editor forever. On timeout we proceed with an empty scene rather than
      // leaving the user staring at a spinner.
      if (resolvedSearch.template && resolvedSearch.template !== 'empty') {
        try {
          const supabase = createClient();
          const fetchPromise = supabase
            .from('templates')
            .select('scene, name')
            .eq('id', resolvedSearch.template)
            .single();
          const timeoutPromise = new Promise<{ data: null }>((resolve) =>
            setTimeout(() => {
              console.warn('[create] template fetch timed out after 4s');
              resolve({ data: null });
            }, 4000),
          );
          const { data: template } = await Promise.race([fetchPromise, timeoutPromise]);
          if (template) {
            scene = (template as { scene: GameScene; name: string }).scene;
            projectName = `${(template as { scene: GameScene; name: string }).name} Remix`;
          }
        } catch {}
      }

      // Fork
      if (resolvedSearch.fork) {
        try {
          const supabase = createClient();
          const { data: published } = await supabase
            .from('published_games')
            .select('scene, name, id')
            .eq('id', resolvedSearch.fork)
            .single();
          if (published) {
            scene = published.scene as GameScene;
            projectName = `${published.name} Remix`;
          }
        } catch {}
      }

      // Render editor immediately with a local project ID, kick off the DB
      // insert in the background, then swap the ID once it lands. The editor
      // doesn't need a remote row to function — auto-save persists to
      // localStorage under `local-*` IDs, so edits made during the insert
      // window aren't lost. The useState initializer already created a
      // local-pending project for the fast path; reuse it instead of minting
      // a fresh one (which would force EditorLoader to re-receive a different
      // initialProject and reset useAssets state). For the template/fork case
      // the useState init returned null and we mint a new local-pending here.
      const existing = project;
      const existingIsLocalPending = !!existing?.id.startsWith('local-pending-');
      let localId: string;
      if (existingIsLocalPending) {
        localId = existing!.id;
        // Patch user_id once viewer resolves and scene if template/fork
        // loaded one (only setProject if something actually changed).
        if (
          (userId && existing!.user_id !== userId) ||
          existing!.scene !== scene
        ) {
          setProject({
            ...existing!,
            user_id: userId || existing!.user_id,
            name: projectName,
            scene,
          });
        }
      } else {
        localId = `local-pending-${Date.now()}`;
        setProject({
          id: localId,
          user_id: userId || 'guest',
          name: projectName,
          scene,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
      setLoading(false);

      // Guest (shouldn't happen — auth gate above redirects — but defend it).
      if (!authenticated || !userId) return;

      // Single-flight insert. If the load effect re-runs (viewer transitions,
      // userId changes, etc.) we MUST NOT fire a second insert.
      if (insertKickedRef.current) return;
      insertKickedRef.current = true;

      (async () => {
        try {
          const supabase = createClient();
          const { data: newProject } = await supabase
            .from('projects')
            .insert({
              user_id: userId,
              name: projectName,
              scene,
              forked_from: resolvedSearch.fork || null,
            })
            .select('id')
            .single();
          if (!newProject) return;

          try {
            const oldKey = `arcadery_project_${localId}`;
            const cached = localStorage.getItem(oldKey);
            if (cached) {
              localStorage.setItem(`arcadery_project_${newProject.id}`, cached);
              localStorage.removeItem(oldKey);
            }
          } catch {}

          const promptQs = resolvedSearch.prompt
            ? `?prompt=${encodeURIComponent(resolvedSearch.prompt)}`
            : '';
          try {
            window.history.replaceState(null, '', `/create/${newProject.id}${promptQs}`);
          } catch {}

          setProject((prev) => (prev ? { ...prev, id: newProject.id } : prev));
        } catch (err) {
          console.warn('[create] background insert failed — staying local', err);
          // Allow retry on next mount/effect-run rather than wedging here.
          insertKickedRef.current = false;
        }
      })();
      return;
    }

    // Load existing project
    if (authenticated) {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from('projects')
          .select('*')
          .eq('id', projectId)
          .single();
        if (data) {
          setProject(data as Project);
          setLoading(false);
          return;
        }
      } catch {}
    }

    // Fallback
    setProject({
      id: 'local-guest',
      user_id: userId || 'guest',
      name: 'Untitled Game',
      scene: createEmptyScene(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    setLoading(false);
  }

  if (loading || !project) {
    return (
      <>
        <DesktopGate />
        <div className="hidden h-screen w-screen items-center justify-center bg-[#0D0D0E] text-white md:flex">
          <div className="text-sm text-white/40">Preparing project...</div>
        </div>
      </>
    );
  }

  return (
    <>
      <DesktopGate />
      <div className="hidden md:block">
        <EditorLoader
          initialProject={project}
          initialPrompt={storedPrompt || resolvedSearch.prompt}
        />
      </div>
    </>
  );
}

// The Three.js editor needs a real keyboard, mouse, and screen room. Below
// `md` we render a polite stop-page instead of letting users pinch-zoom into
// a broken sidebar. Pure CSS gating so there's no flash of editor on phones.
function DesktopGate() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0a0a0f] px-6 py-10 text-center text-white md:hidden">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#8b7ec8]/15">
        <Monitor className="h-7 w-7 text-[#8b7ec8]" />
      </div>
      <h1 className="text-xl font-semibold">Open on desktop</h1>
      <p className="max-w-xs text-sm text-white/60">
        The editor needs a wider screen and a keyboard. Continue on a laptop or desktop browser to build and edit your game.
      </p>
      <Link
        href="/"
        className="mt-2 rounded-full bg-[#8b7ec8] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#7a6db8]"
      >
        Back to home
      </Link>
      <Link
        href="/explore"
        className="text-xs font-medium text-white/50 hover:text-white"
      >
        or explore games →
      </Link>
    </div>
  );
}
