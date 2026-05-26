'use client';

/**
 * Page authoring: the editor treats a game as INTRO · GAME · END pages
 * ("Canva-style"). PageTabs switches the active page; IntroPageEditor and
 * EndPageEditor edit scene.intro / scene.outro with a live themed preview.
 * The GAME page is the existing canvas (rendered elsewhere).
 */

import type { CSSProperties } from 'react';
import { DoorOpen, Gamepad2, Trophy, Play } from 'lucide-react';
import { INTRO_THEMES, type IntroTheme, type IntroConfig, type OutroConfig } from '@arcadery/shared';
import { useEditorStore } from '../stores/editor-store';
import type { EditorPage } from '../stores/types';

// ─── Theme preview tokens (editor-side, CSS only) ──────────────────────────
const THEME_PREVIEW: Record<IntroTheme, { label: string; bg: string; title: string; btn: string; sub: string }> = {
  'arcade-neon': {
    label: 'Arcade Neon',
    bg: 'linear-gradient(135deg,#06070f,#1a1030)',
    title: 'background:linear-gradient(120deg,#67e8f9,#e879f9);-webkit-background-clip:text;background-clip:text;color:transparent',
    btn: 'background:linear-gradient(90deg,#22d3ee,#d946ef);color:#000',
    sub: '#a5f3fc',
  },
  'sunset-pop': {
    label: 'Sunset Pop',
    bg: 'linear-gradient(135deg,#2a1030,#3a1530)',
    title: 'background:linear-gradient(120deg,#fde68a,#fb923c,#ec4899);-webkit-background-clip:text;background-clip:text;color:transparent',
    btn: 'background:linear-gradient(90deg,#fbbf24,#ec4899);color:#2a0f12',
    sub: '#fed7aa',
  },
  'pixel-retro': {
    label: 'Pixel Retro',
    bg: '#0a0f0a',
    title: 'color:#6ee7b7;text-shadow:2px 2px 0 #064e3b',
    btn: 'background:#34d399;color:#052e16',
    sub: '#a7f3d0',
  },
  'clean-mint': {
    label: 'Clean Mint',
    bg: 'linear-gradient(135deg,#ffffff,#e6f0ea)',
    title: 'color:#0f1c17',
    btn: 'background:#10b981;color:#fff',
    sub: '#0f1c1799',
  },
};

const PAGES: { id: EditorPage; label: string; icon: typeof DoorOpen }[] = [
  { id: 'intro', label: 'Intro', icon: DoorOpen },
  { id: 'game', label: 'Game', icon: Gamepad2 },
  { id: 'end', label: 'End', icon: Trophy },
];

export function PageTabs() {
  const page = useEditorStore((s) => s.editorPage);
  const setPage = useEditorStore((s) => s.setEditorPage);
  return (
    <div className="flex rounded-lg border border-white/10 bg-black/40 p-0.5 backdrop-blur" role="group" aria-label="Page">
      {PAGES.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => setPage(id)}
          aria-pressed={page === id}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
            page === id ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white'
          }`}
        >
          <Icon size={13} />
          {label}
        </button>
      ))}
    </div>
  );
}

// ─── Shared input styles ────────────────────────────────────────────────────
const fieldCls =
  'w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/85 placeholder:text-white/25 outline-none focus:border-[#8b7ec8]/60';
const labelCls = 'mb-1 block text-[11px] font-semibold uppercase tracking-wider text-white/40';

const DEFAULT_INTRO: IntroConfig = {
  enabled: true,
  theme: 'arcade-neon',
  title: '',
  subtitle: '',
  ctaLabel: 'Play',
};

export function IntroPageEditor() {
  const intro = useEditorStore((s) => s.scene.intro) ?? DEFAULT_INTRO;
  const setIntro = useEditorStore((s) => s.setIntro);
  const sceneName = useEditorStore((s) => s.scene.name);
  const update = (patch: Partial<IntroConfig>) => setIntro({ ...DEFAULT_INTRO, ...intro, ...patch });

  const theme = THEME_PREVIEW[intro.theme] ?? THEME_PREVIEW['arcade-neon'];
  const previewTitle = (intro.title || sceneName || 'Untitled Game').toUpperCase();

  return (
    <div className="flex h-full w-full flex-col gap-6 overflow-y-auto p-6 lg:flex-row">
      {/* Controls */}
      <div className="w-full max-w-md space-y-5">
        <div>
          <h2 className="text-lg font-bold text-white">Intro screen</h2>
          <p className="text-xs text-white/40">The splash players see before the game starts.</p>
        </div>

        <label className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
          <span className="text-sm text-white/80">Show intro screen</span>
          <input
            type="checkbox"
            checked={intro.enabled}
            onChange={(e) => update({ enabled: e.target.checked })}
            className="h-4 w-4 accent-[#8b7ec8]"
          />
        </label>

        <div>
          <span className={labelCls}>Theme</span>
          <div className="grid grid-cols-2 gap-2">
            {INTRO_THEMES.map((t) => {
              const tp = THEME_PREVIEW[t];
              const active = intro.theme === t;
              return (
                <button
                  key={t}
                  onClick={() => update({ theme: t })}
                  className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                    active ? 'border-[#8b7ec8] bg-[#8b7ec8]/15' : 'border-white/10 hover:border-white/25'
                  }`}
                >
                  <span className="h-6 w-6 shrink-0 rounded-md border border-white/15" style={{ background: tp.bg }} />
                  <span className="text-xs font-medium text-white/80">{tp.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className={labelCls}>Title</label>
          <input
            value={intro.title}
            onChange={(e) => update({ title: e.target.value })}
            placeholder={sceneName || 'Game title'}
            className={fieldCls}
            maxLength={40}
          />
        </div>
        <div>
          <label className={labelCls}>Subtitle</label>
          <input
            value={intro.subtitle}
            onChange={(e) => update({ subtitle: e.target.value })}
            placeholder="One-line hook…"
            className={fieldCls}
            maxLength={120}
          />
        </div>
        <div>
          <label className={labelCls}>Button label</label>
          <input
            value={intro.ctaLabel}
            onChange={(e) => update({ ctaLabel: e.target.value })}
            placeholder="Play"
            className={fieldCls}
            maxLength={20}
          />
        </div>
      </div>

      {/* Live preview */}
      <div className="flex flex-1 items-center justify-center">
        <div
          className="relative flex aspect-[4/3] w-full max-w-2xl flex-col items-center justify-center overflow-hidden rounded-2xl border border-white/10 px-8 text-center"
          style={{ background: theme.bg }}
        >
          <h1 className="mb-3 text-4xl font-black tracking-tight sm:text-5xl" style={cssToObj(theme.title)}>
            {previewTitle}
          </h1>
          {intro.subtitle && (
            <p className="mb-7 max-w-sm text-sm" style={{ color: theme.sub }}>
              {intro.subtitle}
            </p>
          )}
          <span
            className="inline-flex items-center gap-2 rounded-2xl px-8 py-3.5 text-lg font-black"
            style={cssToObj(theme.btn)}
          >
            <Play className="h-5 w-5 fill-current" />
            {intro.ctaLabel || 'Play'}
          </span>
          {!intro.enabled && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-xs font-mono uppercase tracking-widest text-white/60">
              Intro disabled — play starts immediately
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const DEFAULT_OUTRO: OutroConfig = {
  winTitle: 'You won!',
  winSubtitle: '',
  loseTitle: 'Game over',
  loseSubtitle: '',
};

export function EndPageEditor() {
  const outro = useEditorStore((s) => s.scene.outro) ?? DEFAULT_OUTRO;
  const setOutro = useEditorStore((s) => s.setOutro);
  const update = (patch: Partial<OutroConfig>) => setOutro({ ...DEFAULT_OUTRO, ...outro, ...patch });

  return (
    <div className="flex h-full w-full flex-col gap-6 overflow-y-auto p-6 lg:flex-row">
      <div className="w-full max-w-md space-y-5">
        <div>
          <h2 className="text-lg font-bold text-white">End screen</h2>
          <p className="text-xs text-white/40">Shown when the player wins or loses.</p>
        </div>

        <div>
          <label className={labelCls}>Win title</label>
          <input value={outro.winTitle} onChange={(e) => update({ winTitle: e.target.value })} className={fieldCls} maxLength={40} />
        </div>
        <div>
          <label className={labelCls}>Win subtitle</label>
          <input value={outro.winSubtitle} onChange={(e) => update({ winSubtitle: e.target.value })} placeholder="Nice run!" className={fieldCls} maxLength={120} />
        </div>
        <div>
          <label className={labelCls}>Lose title</label>
          <input value={outro.loseTitle} onChange={(e) => update({ loseTitle: e.target.value })} className={fieldCls} maxLength={40} />
        </div>
        <div>
          <label className={labelCls}>Lose subtitle</label>
          <input value={outro.loseSubtitle} onChange={(e) => update({ loseSubtitle: e.target.value })} placeholder="Try again!" className={fieldCls} maxLength={120} />
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <EndPreview title={outro.winTitle} subtitle={outro.winSubtitle} accent="#34d399" />
        <EndPreview title={outro.loseTitle} subtitle={outro.loseSubtitle} accent="#f87171" />
      </div>
    </div>
  );
}

function EndPreview({ title, subtitle, accent }: { title: string; subtitle: string; accent: string }) {
  return (
    <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#13141a] p-7 text-center">
      <h3 className="mb-1 text-2xl font-bold" style={{ color: accent }}>
        {title || '—'}
      </h3>
      {subtitle && <p className="text-sm text-white/50">{subtitle}</p>}
      <p className="mt-2 text-xs text-white/30">Final score · 0</p>
    </div>
  );
}

/** Parse a "prop:value;prop:value" CSS string into a React style object. */
function cssToObj(css: string): CSSProperties {
  const out: Record<string, string> = {};
  for (const decl of css.split(';')) {
    const idx = decl.indexOf(':');
    if (idx === -1) continue;
    const prop = decl.slice(0, idx).trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const value = decl.slice(idx + 1).trim();
    // Gradient titles pair `background` with `background-clip:text`. React warns
    // when a `background` shorthand and a non-shorthand `backgroundClip` live in
    // the same style object. A gradient is really an image, so route it to the
    // specific `backgroundImage` longhand and avoid the conflict. Solid-colour
    // values (e.g. button backgrounds) stay on the `background` shorthand.
    if (prop === 'background' && value.includes('gradient')) {
      out.backgroundImage = value;
      continue;
    }
    out[prop] = value;
  }
  return out as CSSProperties;
}
