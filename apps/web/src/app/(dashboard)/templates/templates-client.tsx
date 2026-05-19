'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  Search,
  LayoutTemplate,
  Gamepad2,
  Rocket,
  Sword,
  Crosshair,
  Castle,
  Puzzle,
  Wind,
  Sparkles,
  Layers,
  Car,
  Joystick,
  Box,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useViewer } from '@/lib/auth/use-viewer';
import { useModals } from '@/lib/ui/modals';
import { ChatTrigger } from '@/components/chat/chat-trigger';

export interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  thumbnail_url: string | null;
  created_at: string;
}

interface CategoryMeta {
  label: string;
  icon: LucideIcon;
  gradient: string;
  accent: string;
}

const CATEGORY_META: Record<string, CategoryMeta> = {
  platformer: {
    label: 'Platformer',
    icon: Gamepad2,
    gradient: 'from-emerald-500/30 via-emerald-700/20 to-emerald-900/40',
    accent: 'text-emerald-300',
  },
  shooter: {
    label: 'Shooter',
    icon: Crosshair,
    gradient: 'from-rose-500/30 via-rose-700/20 to-rose-900/40',
    accent: 'text-rose-300',
  },
  strategy: {
    label: 'Strategy',
    icon: Castle,
    gradient: 'from-amber-500/30 via-amber-700/20 to-amber-900/40',
    accent: 'text-amber-300',
  },
  card: {
    label: 'Card',
    icon: Sword,
    gradient: 'from-violet-500/30 via-violet-700/20 to-violet-900/40',
    accent: 'text-violet-300',
  },
  puzzle: {
    label: 'Puzzle',
    icon: Puzzle,
    gradient: 'from-sky-500/30 via-sky-700/20 to-sky-900/40',
    accent: 'text-sky-300',
  },
  runner: {
    label: 'Runner',
    icon: Wind,
    gradient: 'from-cyan-500/30 via-cyan-700/20 to-cyan-900/40',
    accent: 'text-cyan-300',
  },
  racing: {
    label: 'Racing',
    icon: Car,
    gradient: 'from-orange-500/30 via-rose-700/25 to-fuchsia-900/50',
    accent: 'text-orange-300',
  },
  arcade: {
    label: 'Arcade',
    icon: Joystick,
    gradient: 'from-pink-500/30 via-purple-700/25 to-indigo-900/50',
    accent: 'text-pink-300',
  },
  starter: {
    label: 'Starter',
    icon: Sparkles,
    gradient: 'from-[#8b7ec8]/40 via-[#6b5fa8]/25 to-[#3b2f78]/50',
    accent: 'text-[#c0b6ed]',
  },
  general: {
    label: 'General',
    icon: Layers,
    gradient: 'from-slate-500/30 via-slate-700/20 to-slate-900/40',
    accent: 'text-slate-300',
  },
};

function metaFor(category: string): CategoryMeta {
  return CATEGORY_META[category] ?? CATEGORY_META.general;
}

// Hand-coded games surfaced as ordinary template cards but routed to
// dedicated /play/* pages instead of the data-driven /create/new flow.
const BUILTIN_TEMPLATES: Template[] = [
  {
    id: '__builtin_drift_racer__',
    name: 'Drift Racer (Playable)',
    description:
      'High-speed Three.js circuit race — drift through corners with the handbrake and beat the AI rival across three laps.',
    category: 'racing',
    thumbnail_url: null,
    created_at: '2026-05-12T00:00:00.000Z',
  },
  {
    id: '__builtin_neon_asteroids__',
    name: 'Neon Asteroids (Playable)',
    description:
      'Vector-style arcade shooter — drift your ship through endless asteroid waves, chain hits for combo multipliers, survive as long as you can.',
    category: 'shooter',
    thumbnail_url: null,
    created_at: '2026-05-12T00:00:00.000Z',
  },
  {
    id: '__builtin_cube_runner__',
    name: 'Cube Runner (Playable)',
    description:
      'Synthwave endless 3D runner — swap lanes, jump and slide through procedural obstacles, collect coin combos as the speed ramps up.',
    category: 'runner',
    thumbnail_url: null,
    created_at: '2026-05-12T00:00:00.000Z',
  },
  {
    id: '__builtin_brick_smash__',
    name: 'Brick Smash (Playable)',
    description:
      'Modern 3D breakout — slide the paddle to bounce a glowing ball through six brick layers. Power-ups drop, multi-ball chaos ensues.',
    category: 'arcade',
    thumbnail_url: null,
    created_at: '2026-05-12T00:00:00.000Z',
  },
  {
    id: '__builtin_sky_glider__',
    name: 'Sky Glider (Playable)',
    description:
      'Neon canyon wingsuit — dive through procedural ravines, slipstream scoring rings, and chain combos at terminal velocity.',
    category: 'flight',
    thumbnail_url: null,
    created_at: '2026-05-19T00:00:00.000Z',
  },
  {
    id: '__builtin_hex_tower__',
    name: 'Hex Tower (Playable)',
    description:
      'Pastel-isometric vertical climb — chain-jump between crumbling hex platforms, ground-pound combos, climb until gravity wins.',
    category: 'platformer',
    thumbnail_url: null,
    created_at: '2026-05-19T00:00:00.000Z',
  },
  {
    id: '__builtin_drone_arena__',
    name: 'Drone Arena (Playable)',
    description:
      'Third-person drone combat — dash, lock-on missiles, and survive escalating mob waves in a PBR-lit holographic colosseum.',
    category: 'shooter',
    thumbnail_url: null,
    created_at: '2026-05-19T00:00:00.000Z',
  },
  {
    id: '__builtin_voxel_heist__',
    name: 'Voxel Heist (Playable)',
    description:
      'Speedrun voxel maze — slip through swinging laser grids, crack glowing vaults, and exfil before the alarm runs your clock down.',
    category: 'stealth',
    thumbnail_url: null,
    created_at: '2026-05-19T00:00:00.000Z',
  },
];

function builtinHref(id: string): string | null {
  if (id === '__builtin_drift_racer__') return '/play/drift-racer';
  if (id === '__builtin_neon_asteroids__') return '/play/neon-asteroids';
  if (id === '__builtin_cube_runner__') return '/play/cube-runner';
  if (id === '__builtin_brick_smash__') return '/play/brick-smash';
  if (id === '__builtin_sky_glider__') return '/play/sky-glider';
  if (id === '__builtin_hex_tower__') return '/play/hex-tower';
  if (id === '__builtin_drone_arena__') return '/play/drone-arena';
  if (id === '__builtin_voxel_heist__') return '/play/voxel-heist';
  return null;
}

// A template is "playable" if it's a builtin (handcoded /play/* route) or if
// its name carries the "(Playable)" suffix that the seed script uses to
// flag scenes with a working gameState. Everything else is a static 3D
// showcase the user can remix in the editor but not run as a game.
function isPlayableTemplate(t: Template): boolean {
  return t.id.startsWith('__builtin_') || t.name.includes('Playable');
}

export function TemplatesClient({ templates }: { templates: Template[] }) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const viewer = useViewer();
  const isSignedIn = viewer.status === 'signed-in';

  // Show "Playable" templates first — they're the highest-quality demos.
  // Builtins (handcoded games like Drift Racer) are pinned at the top.
  const sorted = useMemo(() => {
    const list = [...BUILTIN_TEMPLATES, ...templates];
    list.sort((a, b) => {
      const ab = a.id.startsWith('__builtin_') ? 0 : 1;
      const bb = b.id.startsWith('__builtin_') ? 0 : 1;
      if (ab !== bb) return ab - bb;
      const ap = a.name.includes('Playable') ? 0 : 1;
      const bp = b.name.includes('Playable') ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [templates]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of sorted) counts.set(t.category, (counts.get(t.category) ?? 0) + 1);
    return counts;
  }, [sorted]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sorted.filter((t) => {
      if (activeCategory !== 'all' && t.category !== activeCategory) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
      );
    });
  }, [sorted, search, activeCategory]);

  // Split into Playable + 3D Showcase sections. Render order is determined by
  // the section, not the sort, so we don't bother re-sorting within each.
  const playableTemplates = useMemo(() => filtered.filter(isPlayableTemplate), [filtered]);
  const showcaseTemplates = useMemo(
    () => filtered.filter((t) => !isPlayableTemplate(t)),
    [filtered],
  );

  const allCategories = Array.from(categoryCounts.keys()).sort((a, b) => {
    if (a === 'starter') return 1;
    if (b === 'starter') return -1;
    return a.localeCompare(b);
  });

  return (
    // Full-width flex layout matching /explore. Removed the previous
    // `mx-auto max-w-7xl` cap because on wide monitors the 4-column grid was
    // collapsing the card hero area to ~290px while Explore's same grid hits
    // ~390px. Cards now render at the same size across listing pages.
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-white/[0.06] px-4 pt-5 pb-4 sm:px-6 md:px-8 lg:px-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold text-white">Templates</h1>
            <p className="mt-0.5 text-xs text-white/30">
              Drop into a playable game, or remix a 3D showcase into your own.
            </p>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <div className="relative w-full sm:w-56">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/25" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search templates..."
                className="w-full rounded-lg border border-white/10 bg-white/[0.04] py-2 pl-8 pr-3 text-xs text-white/80 placeholder:text-white/25 outline-none transition-colors focus:border-[#8b7ec8]/40"
              />
            </div>
            <ChatTrigger />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 md:px-8 lg:px-10">
      {sorted.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          <CategoryPill
            label="All"
            count={sorted.length}
            active={activeCategory === 'all'}
            onClick={() => setActiveCategory('all')}
          />
          {allCategories.map((cat) => {
            const meta = metaFor(cat);
            const Icon = meta.icon;
            return (
              <CategoryPill
                key={cat}
                label={meta.label}
                count={categoryCounts.get(cat) ?? 0}
                icon={<Icon size={12} className={meta.accent} />}
                active={activeCategory === cat}
                onClick={() => setActiveCategory(cat)}
              />
            );
          })}
        </div>
      )}

      {sorted.length === 0 ? (
        <EmptyState signedIn={isSignedIn} />
      ) : filtered.length === 0 ? (
        <NoResults onClear={() => { setSearch(''); setActiveCategory('all'); }} />
      ) : (
        <div className="space-y-10">
          {playableTemplates.length > 0 && (
            <section>
              <SectionHeader
                icon={<Rocket className="h-3.5 w-3.5 text-emerald-300" />}
                label="Playable"
                description="Real games — drop in and play, or remix into your own."
                count={playableTemplates.length}
                accent="text-emerald-300"
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {playableTemplates.map((t) => (
                  <TemplateCard key={t.id} template={t} signedIn={isSignedIn} />
                ))}
              </div>
            </section>
          )}

          {showcaseTemplates.length > 0 && (
            <section>
              <SectionHeader
                icon={<Box className="h-3.5 w-3.5 text-sky-300" />}
                label="3D Showcases"
                description="Static scenes — open them in the editor to wire up gameplay."
                count={showcaseTemplates.length}
                accent="text-sky-300"
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {showcaseTemplates.map((t) => (
                  <TemplateCard key={t.id} template={t} signedIn={isSignedIn} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
      </div>
    </div>
  );
}

function SectionHeader({
  icon,
  label,
  description,
  count,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  count: number;
  accent: string;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className={`text-sm font-bold uppercase tracking-widest ${accent}`}>{label}</h2>
          <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold text-white/50 tabular-nums">
            {count}
          </span>
        </div>
        <p className="mt-1 text-xs text-white/35">{description}</p>
      </div>
    </div>
  );
}

function CategoryPill({
  label,
  count,
  icon,
  active,
  onClick,
}: {
  label: string;
  count: number;
  icon?: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? 'bg-[#8b7ec8] text-white'
          : 'bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white/90'
      }`}
    >
      {icon}
      <span>{label}</span>
      <span className={`text-[10px] ${active ? 'text-white/70' : 'text-white/30'}`}>
        {count}
      </span>
    </button>
  );
}

function TemplateCard({ template, signedIn }: { template: Template; signedIn: boolean }) {
  const meta = metaFor(template.category);
  const Icon = meta.icon;
  const isPlayable = template.name.includes('Playable');
  const builtin = builtinHref(template.id);

  const cardClass =
    'group block w-full text-left overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02] transition-all hover:border-white/15 hover:bg-white/[0.04]';

  const Inner = (
    <>
      <div
        className={`relative flex aspect-[16/9] items-center justify-center overflow-hidden bg-gradient-to-br ${meta.gradient}`}
      >
        {template.thumbnail_url ? (
          <Image
            src={template.thumbnail_url}
            alt={template.name}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            className="object-cover"
          />
        ) : (
          <Icon className={`h-10 w-10 ${meta.accent} opacity-70 transition-transform group-hover:scale-110`} />
        )}
        {builtin ? (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-orange-500/35 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-orange-50 backdrop-blur">
            <Rocket size={10} className="text-orange-200" />
            3D · Playable
          </span>
        ) : isPlayable ? (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/90 backdrop-blur">
            <Rocket size={10} className="text-emerald-300" />
            Playable
          </span>
        ) : (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-sky-500/25 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-sky-100 backdrop-blur">
            <Box size={10} className="text-sky-200" />
            3D Showcase
          </span>
        )}
      </div>
      <div className="p-4">
        <div className="mb-1 flex items-center gap-2">
          <h3 className="text-sm font-semibold text-white/90">
            {template.name.replace(/\s*\(Playable\)\s*$/, '')}
          </h3>
          <span className={`rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] ${meta.accent}`}>
            {meta.label}
          </span>
        </div>
        {template.description && (
          <p className="line-clamp-2 text-xs text-white/40">{template.description}</p>
        )}
      </div>
    </>
  );

  // Builtin games are playable without auth — link straight to /play route.
  if (builtin) {
    return (
      <Link href={builtin} className={cardClass}>
        {Inner}
      </Link>
    );
  }

  if (!signedIn) {
    return (
      <button
        type="button"
        onClick={() => useModals.getState().openLogin()}
        className={cardClass}
        aria-label={`Sign in to remix ${template.name}`}
      >
        {Inner}
      </button>
    );
  }

  return (
    <Link href={`/create/new?template=${template.id}`} className={cardClass}>
      {Inner}
    </Link>
  );
}

function EmptyState({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-white/40">
      <LayoutTemplate className="mb-3 h-10 w-10 opacity-40" />
      <p className="text-sm font-medium">No templates yet.</p>
      <p className="mt-1 text-xs text-white/25">
        If you&apos;re running locally, seed the DB with{' '}
        <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[11px] text-white/60">
          pnpm seed:templates
        </code>
        .
      </p>
      {signedIn ? (
        <Link
          href="/create/new"
          className="mt-4 rounded-full bg-[#8b7ec8] px-5 py-2 text-sm font-semibold text-white hover:bg-[#7a6db8]"
        >
          Create from scratch
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => useModals.getState().openLogin()}
          className="mt-4 rounded-full bg-[#8b7ec8] px-5 py-2 text-sm font-semibold text-white hover:bg-[#7a6db8]"
        >
          Connect to create
        </button>
      )}
    </div>
  );
}

function NoResults({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-white/40">
      <Search className="mb-3 h-10 w-10 opacity-40" />
      <p className="text-sm font-medium">No templates match your filters.</p>
      <button
        type="button"
        onClick={onClear}
        className="mt-4 rounded-full border border-white/10 bg-white/[0.04] px-5 py-2 text-xs font-semibold text-white/80 hover:bg-white/[0.08] hover:text-white"
      >
        Clear filters
      </button>
    </div>
  );
}
