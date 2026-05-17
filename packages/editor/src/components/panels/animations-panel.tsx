'use client';

import { useEffect, useMemo, useState } from 'react';
import { useEditorStore } from '../../stores/editor-store';
import type { AssetData } from '../asset-manager';
import type { SpriteAnimationClip, SpriteElement } from '@arcadery/shared';

/**
 * Mini animator inspector panel.
 *
 * Visible only when exactly one sprite element is selected. Lets the user:
 *   - List existing clips on the sprite (idle / run / jump style)
 *   - Set one as active (sprite.currentClip) — engine swaps playback live
 *   - Edit fps / loop mode inline
 *   - Rename / delete clips
 *   - Add a new clip from any user asset that has multi-frame metadata
 *     (`asset.frameMetadata.frame_urls` length ≥ 2) — typically AI-generated
 *     animation assets.
 *
 * The data model is `SpriteAnimationClipSchema` (clips[] + currentClip on
 * SpriteElement) plus the orphan-currentClip cross-validation already enforced
 * by GameSceneSchema. We just mutate via `updateElement(id, { clips, currentClip })`.
 */

const PANEL_WIDTH = 280;
const DEFAULT_FPS = 8;

type Props = {
  /** All known assets — passed through from the AI chat / asset manager
   *  surface so the picker can list them without re-fetching. */
  assets: AssetData[];
};

const COLLAPSE_KEY = 'arcadery_animations_panel_collapsed';

export function AnimationsPanel({ assets }: Props) {
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const element = useEditorStore((s) =>
    selectedIds.length === 1 ? s.scene.elements[selectedIds[0]] : null,
  );
  const updateElement = useEditorStore((s) => s.updateElement);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  });

  function toggleCollapsed() {
    setCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {}
      return next;
    });
  }

  const sprite = element && element.type === 'sprite' ? (element as SpriteElement) : null;
  const clips = sprite?.clips ?? [];
  const currentClip = sprite?.currentClip ?? null;
  const hasLegacyAnim =
    !!sprite && Array.isArray(sprite.frameUrls) && sprite.frameUrls.length >= 2;

  // Collapsed → tiny pill that can be re-expanded. Always rendered so the
  // feature is discoverable even before any sprite exists in the scene.
  // Sits on the same horizontal row as the Library/2D-3D pills on the left
  // (matches `pt-3` of the top toolbar bar in editor-shell.tsx).
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={toggleCollapsed}
        className="pointer-events-auto absolute right-3 top-3 z-30 flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/40 backdrop-blur px-3 py-1 text-xs font-medium text-white/65 hover:text-white"
        title="Show animations panel"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M14 5l7 7-7 7M5 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        </svg>
        Animations
        {sprite && clips.length > 0 && (
          <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-mono text-white/60">
            {clips.length}
          </span>
        )}
      </button>
    );
  }

  return (
    <aside
      // Anchored at the same vertical position as the Library / 2D-3D pills
      // on the opposite side. The expanded panel grows downward from there.
      className="pointer-events-auto absolute right-3 top-3 z-30 flex flex-col rounded-xl border border-white/10 bg-[#13141a]/95 backdrop-blur shadow-2xl"
      style={{ width: PANEL_WIDTH }}
    >
      <header className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40">
            Animations
          </p>
          <p className="mt-0.5 text-xs text-white/65 truncate">
            {sprite ? sprite.name : 'No sprite selected'}
          </p>
        </div>
        {sprite && (
          <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-mono text-white/50">
            {clips.length}
          </span>
        )}
        <button
          type="button"
          onClick={toggleCollapsed}
          className="ml-2 flex h-6 w-6 items-center justify-center rounded text-white/35 hover:bg-white/[0.06] hover:text-white/70"
          aria-label="Collapse panel"
          title="Collapse"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M5 5l7 7-7 7M14 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
          </svg>
        </button>
      </header>

      <div className="max-h-[60vh] overflow-y-auto px-2 py-2">
        {!sprite ? (
          <div className="px-3 py-4 text-[11px] leading-relaxed text-white/45">
            <p>
              Select a <span className="text-white/75">sprite</span> on the
              canvas to manage its named animation clips (idle, run, jump…).
            </p>
            <p className="mt-2 text-white/30">
              No sprites yet? Go to the <span className="text-white/55">Assets</span>{' '}
              tab, generate an animation, then drag it onto the canvas.
            </p>
          </div>
        ) : clips.length === 0 ? (
          <div className="px-2 py-3 space-y-2">
            <p className="text-[11px] text-white/40">
              No clips yet. Add an animation asset below to create your first
              named clip (e.g. <span className="text-white/70">idle</span>,
              <span className="text-white/70"> run</span>).
            </p>
            {hasLegacyAnim && (
              <button
                type="button"
                onClick={() => {
                  // Promote the legacy top-level frameUrls into a proper clip
                  // so the user can rename/extend/multi-clip from here.
                  const name = 'idle';
                  const promoted: SpriteAnimationClip = {
                    name,
                    frameUrls: sprite.frameUrls ?? [],
                    frameRate: sprite.frameRate ?? DEFAULT_FPS,
                    loopMode: sprite.loopMode ?? 'loop',
                  };
                  updateElement(sprite.id, {
                    clips: [promoted],
                    currentClip: name,
                  });
                }}
                className="block w-full rounded-md border border-[#8b7ec8]/30 bg-[#8b7ec8]/[0.08] px-3 py-2 text-[11px] font-medium text-[#a99ad4] hover:bg-[#8b7ec8]/[0.15]"
                title="Convert this sprite's existing animation into a named clip"
              >
                Promote current animation to a clip
              </button>
            )}
          </div>
        ) : (
          <ul className="flex flex-col gap-1">
            {clips.map((clip) => (
              <ClipRow
                key={clip.name}
                clip={clip}
                isActive={clip.name === currentClip}
                onSetActive={() =>
                  updateElement(sprite!.id, { currentClip: clip.name })
                }
                onChange={(next) => {
                  const renamed = next.name !== clip.name;
                  const nextClips = clips.map((c) =>
                    c.name === clip.name ? next : c,
                  );
                  updateElement(sprite!.id, {
                    clips: nextClips,
                    ...(renamed && currentClip === clip.name
                      ? { currentClip: next.name }
                      : {}),
                  });
                }}
                onDelete={() => {
                  const nextClips = clips.filter((c) => c.name !== clip.name);
                  const patch: Partial<SpriteElement> = { clips: nextClips };
                  if (currentClip === clip.name) {
                    patch.currentClip = nextClips[0]?.name;
                  }
                  updateElement(sprite!.id, patch);
                }}
              />
            ))}
          </ul>
        )}
      </div>

      {sprite && (
        <AddClipFromAsset
          assets={assets}
          existingNames={clips.map((c) => c.name)}
          onAdd={(clip) => {
            const nextClips = [...clips, clip];
            updateElement(sprite.id, {
              clips: nextClips,
              ...(clips.length === 0 ? { currentClip: clip.name } : {}),
            });
          }}
        />
      )}
    </aside>
  );
}

function ClipRow({
  clip,
  isActive,
  onSetActive,
  onChange,
  onDelete,
}: {
  clip: SpriteAnimationClip;
  isActive: boolean;
  onSetActive: () => void;
  onChange: (next: SpriteAnimationClip) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [nameDraft, setNameDraft] = useState(clip.name);
  useEffect(() => setNameDraft(clip.name), [clip.name]);

  const commitName = () => {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === clip.name) {
      setNameDraft(clip.name);
      return;
    }
    onChange({ ...clip, name: trimmed });
  };

  return (
    <li
      className={`rounded-lg border transition-colors ${
        isActive
          ? 'border-[#8b7ec8]/40 bg-[#8b7ec8]/[0.08]'
          : 'border-white/[0.05] bg-white/[0.02] hover:bg-white/[0.04]'
      }`}
    >
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <button
          type="button"
          onClick={onSetActive}
          aria-label={isActive ? 'Active clip' : 'Set active'}
          className="flex h-5 w-5 items-center justify-center rounded-full transition-colors"
          title={isActive ? 'Active' : 'Set active'}
        >
          <span
            className={`h-2 w-2 rounded-full transition-colors ${
              isActive ? 'bg-[#a99ad4]' : 'bg-white/15 hover:bg-white/40'
            }`}
          />
        </button>
        <input
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitName();
            if (e.key === 'Escape') setNameDraft(clip.name);
          }}
          className="flex-1 min-w-0 bg-transparent text-xs font-medium text-white/85 outline-none focus:bg-white/[0.05] focus:rounded px-1"
        />
        <span className="font-mono text-[9px] text-white/30">
          {clip.frameUrls.length}f
        </span>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex h-5 w-5 items-center justify-center rounded text-white/30 hover:bg-white/[0.06] hover:text-white/70"
          aria-label="Toggle details"
          title="Settings"
        >
          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d={expanded ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
          </svg>
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="flex h-5 w-5 items-center justify-center rounded text-white/30 hover:text-red-400"
          aria-label="Delete clip"
          title="Delete"
        >
          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
          </svg>
        </button>
      </div>

      {expanded && (
        <div className="border-t border-white/[0.06] px-2 py-2 space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-[10px] uppercase tracking-wider text-white/40 w-10">
              FPS
            </label>
            <input
              type="range"
              min={1}
              max={60}
              step={1}
              value={clip.frameRate}
              onChange={(e) =>
                onChange({ ...clip, frameRate: Number(e.target.value) })
              }
              className="flex-1 accent-[#8b7ec8]"
            />
            <span className="w-7 text-right font-mono text-[10px] text-white/60">
              {clip.frameRate}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[10px] uppercase tracking-wider text-white/40 w-10">
              Loop
            </label>
            <div className="flex gap-1">
              {(['loop', 'once', 'pingpong'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onChange({ ...clip, loopMode: mode })}
                  className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                    clip.loopMode === mode
                      ? 'bg-[#8b7ec8]/20 text-[#a99ad4]'
                      : 'bg-white/[0.04] text-white/40 hover:bg-white/[0.08] hover:text-white/60'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
          {/* Tiny frame strip preview — first 6 frames inline */}
          <div className="flex gap-0.5 overflow-x-auto">
            {clip.frameUrls.slice(0, 6).map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={url}
                alt=""
                className="h-8 w-8 flex-none rounded border border-white/10 object-cover bg-white/5"
              />
            ))}
            {clip.frameUrls.length > 6 && (
              <span className="flex h-8 w-8 flex-none items-center justify-center rounded border border-dashed border-white/10 text-[9px] font-mono text-white/30">
                +{clip.frameUrls.length - 6}
              </span>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

function AddClipFromAsset({
  assets,
  existingNames,
  onAdd,
}: {
  assets: AssetData[];
  existingNames: string[];
  onAdd: (clip: SpriteAnimationClip) => void;
}) {
  const [open, setOpen] = useState(false);

  const candidates = useMemo(
    () =>
      assets.filter((a) => {
        const urls = a.frameMetadata?.frame_urls;
        return Array.isArray(urls) && urls.length >= 2;
      }),
    [assets],
  );

  function uniqueName(base: string): string {
    const cleaned = base
      .replace(/\.(png|jpg|jpeg|webp)$/i, '')
      .replace(/[^a-z0-9_-]+/gi, '-')
      .toLowerCase()
      .replace(/^-|-$/g, '') || 'clip';
    if (!existingNames.includes(cleaned)) return cleaned;
    for (let i = 2; i < 100; i++) {
      const candidate = `${cleaned}-${i}`;
      if (!existingNames.includes(candidate)) return candidate;
    }
    return `${cleaned}-${Date.now()}`;
  }

  return (
    <div className="border-t border-white/[0.06] p-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={candidates.length === 0}
        className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-[#8b7ec8]/15 hover:bg-[#8b7ec8]/25 disabled:bg-white/[0.03] disabled:text-white/30 py-2 text-[11px] font-semibold text-[#a99ad4] transition-colors disabled:cursor-not-allowed"
        title={
          candidates.length === 0
            ? 'No multi-frame assets available — generate an animation in the Assets tab first.'
            : 'Pick an animation asset to add as a clip'
        }
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M12 4v16m8-8H4" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        </svg>
        {candidates.length === 0
          ? 'No animation assets'
          : open
            ? 'Pick an asset…'
            : 'Add clip from asset'}
      </button>

      {open && candidates.length > 0 && (
        <div className="mt-2 grid grid-cols-3 gap-1.5 max-h-48 overflow-y-auto">
          {candidates.map((asset) => {
            const fm = asset.frameMetadata!;
            const thumb = fm.thumbnail_url ?? fm.frame_urls?.[0] ?? asset.url;
            return (
              <button
                key={asset.id}
                type="button"
                onClick={() => {
                  onAdd({
                    name: uniqueName(asset.name),
                    frameUrls: fm.frame_urls ?? [],
                    frameRate: fm.fps && fm.fps >= 1 ? fm.fps : DEFAULT_FPS,
                    loopMode: 'loop',
                  });
                  setOpen(false);
                }}
                className="group relative aspect-square overflow-hidden rounded border border-white/10 bg-white/5 hover:border-[#8b7ec8]/40"
                title={asset.name}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumb}
                  alt={asset.name}
                  className="h-full w-full object-cover"
                  draggable={false}
                />
                <span className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 text-[8px] font-mono text-white/70 truncate">
                  {fm.frame_count ?? fm.frame_urls?.length ?? 0}f
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
