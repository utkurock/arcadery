'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Search,
  Gamepad2,
  Rocket,
  Sparkles,
  Crosshair,
  Castle,
  Sword,
  Puzzle,
  Wind,
  Layers,
  Box,
  Car,
  Joystick,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useViewer } from '@/lib/auth/use-viewer';
import { useModals } from '@/lib/ui/modals';
import { staticSlug } from '@/lib/slugify';

export interface PublishedGame {
  id: string;
  slug: string;
  name: string;
  creator_name: string;
  created_at: string;
}

export interface FeaturedTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  created_at: string;
}

interface CategoryMeta {
  label: string;
  icon: LucideIcon;
  gradient: string;
  accent: string;
}

// Mirrors the templates page so featured cards keep the same visual language.
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
  showcase: {
    label: '3D Showcase',
    icon: Box,
    gradient: 'from-fuchsia-500/30 via-fuchsia-700/25 to-indigo-900/50',
    accent: 'text-fuchsia-300',
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

// Hand-coded games that live outside the data-driven template system. They
// surface here as ordinary cards but route to dedicated /play/* pages.
const BUILTIN_TEMPLATES: FeaturedTemplate[] = [
  {
    id: '__builtin_drift_racer__',
    name: 'Drift Racer',
    description:
      'High-speed Three.js circuit race — drift through corners with the handbrake and beat the AI rival across three laps.',
    category: 'racing',
    created_at: '2026-05-12T00:00:00.000Z',
  },
  {
    id: '__builtin_neon_asteroids__',
    name: 'Neon Asteroids',
    description:
      'Vector-style arcade shooter — drift your ship through endless asteroid waves, chain hits for combo multipliers, survive as long as you can.',
    category: 'shooter',
    created_at: '2026-05-12T00:00:00.000Z',
  },
  {
    id: '__builtin_cube_runner__',
    name: 'Cube Runner',
    description:
      'Synthwave endless 3D runner — swap lanes, jump and slide through procedural obstacles, collect coin combos as the speed ramps up.',
    category: 'runner',
    created_at: '2026-05-12T00:00:00.000Z',
  },
  {
    id: '__builtin_brick_smash__',
    name: 'Brick Smash',
    description:
      'Modern 3D breakout — slide the paddle to bounce a glowing ball through six brick layers. Power-ups drop, multi-ball chaos ensues.',
    category: 'arcade',
    created_at: '2026-05-12T00:00:00.000Z',
  },
  {
    id: '__builtin_sky_glider__',
    name: 'Sky Glider',
    description:
      'Neon canyon wingsuit — dive through procedural ravines, slipstream scoring rings, and chain combos at terminal velocity.',
    category: 'flight',
    created_at: '2026-05-19T00:00:00.000Z',
  },
  {
    id: '__builtin_hex_tower__',
    name: 'Hex Tower',
    description:
      'Pastel-isometric vertical climb — chain-jump between crumbling hex platforms, ground-pound combos, climb until gravity wins.',
    category: 'platformer',
    created_at: '2026-05-19T00:00:00.000Z',
  },
  {
    id: '__builtin_drone_arena__',
    name: 'Drone Arena',
    description:
      'Third-person drone combat — dash, lock-on missiles, and survive escalating mob waves in a PBR-lit holographic colosseum.',
    category: 'shooter',
    created_at: '2026-05-19T00:00:00.000Z',
  },
  {
    id: '__builtin_voxel_heist__',
    name: 'Voxel Heist',
    description:
      'Speedrun voxel maze — slip through swinging laser grids, crack glowing vaults, and exfil before the alarm runs your clock down.',
    category: 'stealth',
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

export function ExploreClient({
  games,
  templates,
}: {
  games: PublishedGame[];
  templates: FeaturedTemplate[];
}) {
  const [search, setSearch] = useState('');
  const viewer = useViewer();
  const isSignedIn = viewer.status === 'signed-in';

  const q = search.trim().toLowerCase();

  const filteredTemplates = useMemo(() => {
    // Builtins come first so they're the visible featured card.
    const merged = [...BUILTIN_TEMPLATES, ...templates];
    if (!q) return merged;
    return merged.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q),
    );
  }, [templates, q]);

  const filteredGames = useMemo(() => {
    if (!q) return games;
    return games.filter((g) => g.name.toLowerCase().includes(q));
  }, [games, q]);

  // Split templates so Explore can render featured playable games and 3D
  // showcases as two distinct rows. The 3D showcases are Roblox-style scenes
  // you can pan around — they're not yet playable, hence the separate band.
  const playableTemplates = useMemo(
    () => filteredTemplates.filter((t) => t.category !== 'showcase'),
    [filteredTemplates],
  );
  const showcaseTemplates = useMemo(
    () => filteredTemplates.filter((t) => t.category === 'showcase'),
    [filteredTemplates],
  );

  const showEmptyState =
    playableTemplates.length === 0 &&
    showcaseTemplates.length === 0 &&
    filteredGames.length === 0;

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 border-b border-white/[0.06] px-4 pt-5 pb-4 sm:px-6 md:px-8 lg:px-10">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold text-white">Explore</h1>
            <p className="text-xs mt-0.5 text-white/30">
              Featured templates and games built by the community.
            </p>
          </div>
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/25" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search games..."
              className="w-full rounded-lg border border-white/10 bg-white/[0.04] py-2 pl-8 pr-3 text-xs text-white/80 placeholder:text-white/25 outline-none transition-colors focus:border-[#8b7ec8]/40"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 md:px-8 lg:px-10">
        {showEmptyState ? (
          <EmptyState signedIn={isSignedIn} searching={Boolean(q)} />
        ) : (
          <div className="space-y-10">
            {playableTemplates.length > 0 && (
              <section>
                <div className="mb-4 flex items-center gap-2">
                  <Sparkles size={14} className="text-[#c0b6ed]" />
                  <h2 className="text-sm font-semibold text-white/80">Featured templates</h2>
                  <span className="text-[11px] text-white/30">{playableTemplates.length}</span>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {playableTemplates.map((t) => (
                    <TemplateCard key={t.id} template={t} />
                  ))}
                </div>
              </section>
            )}

            {showcaseTemplates.length > 0 && (
              <section>
                <div className="mb-4 flex items-center gap-2">
                  <Box size={14} className="text-fuchsia-300" />
                  <h2 className="text-sm font-semibold text-white/80">3D showcases</h2>
                  <span className="text-[11px] text-white/30">{showcaseTemplates.length}</span>
                  <span className="ml-2 rounded-full bg-fuchsia-500/15 px-2 py-0.5 text-[10px] font-medium text-fuchsia-200/80">
                    Pan to explore
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {showcaseTemplates.map((t) => (
                    <TemplateCard key={t.id} template={t} />
                  ))}
                </div>
              </section>
            )}

            {filteredGames.length > 0 && (
              <section>
                <div className="mb-4 flex items-center gap-2">
                  <Gamepad2 size={14} className="text-white/60" />
                  <h2 className="text-sm font-semibold text-white/80">Community games</h2>
                  <span className="text-[11px] text-white/30">{filteredGames.length}</span>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {filteredGames.map((game) => (
                    <Link
                      key={game.id}
                      href={`/game/${game.slug}`}
                      className="group overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02] transition-all hover:border-white/15 hover:bg-white/[0.04]"
                    >
                      <div className="flex aspect-[16/9] items-center justify-center bg-[#12121a]">
                        <span className="text-2xl font-bold tracking-tight text-white/10">
                          {game.name.slice(0, 2).toUpperCase()}
                        </span>
                      </div>
                      <div className="p-3.5">
                        <h3 className="truncate text-sm font-semibold text-white/90">
                          {game.name}
                        </h3>
                        <p className="mt-0.5 text-[11px] text-white/30">@{game.creator_name}</p>
                      </div>
                    </Link>
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

function TemplateCard({ template }: { template: FeaturedTemplate }) {
  const meta = metaFor(template.category);
  const Icon = meta.icon;
  const isShowcase = template.category === 'showcase';
  const isBuiltin = template.id.startsWith('__builtin_');
  // Strip the "(Playable)" suffix that exists on the seed names so the
  // Explore cards read as ordinary game titles.
  const displayName = template.name.replace(/\s*\(Playable\)\s*$/, '');
  const href = builtinHref(template.id) ?? `/template/${staticSlug(template.name)}`;

  return (
    <Link
      href={href}
      className="group block w-full overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02] text-left transition-all hover:border-white/15 hover:bg-white/[0.04]"
    >
      <div
        className={`relative flex aspect-[16/9] items-center justify-center overflow-hidden bg-gradient-to-br ${meta.gradient}`}
      >
        <Icon
          className={`h-10 w-10 ${meta.accent} opacity-70 transition-transform group-hover:scale-110`}
        />
        {isShowcase ? (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-fuchsia-500/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-fuchsia-50 backdrop-blur">
            <Box size={10} className="text-fuchsia-200" />
            3D Showcase
          </span>
        ) : isBuiltin ? (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-orange-500/35 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-orange-50 backdrop-blur">
            <Rocket size={10} className="text-orange-200" />
            3D · Playable
          </span>
        ) : (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/90 backdrop-blur">
            <Rocket size={10} className="text-emerald-300" />
            Featured
          </span>
        )}
      </div>
      <div className="p-3.5">
        <div className="mb-1 flex items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-white/90">{displayName}</h3>
          <span className={`shrink-0 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] ${meta.accent}`}>
            {meta.label}
          </span>
        </div>
        {template.description && (
          <p className="line-clamp-2 text-[11px] text-white/40">{template.description}</p>
        )}
      </div>
    </Link>
  );
}

function EmptyState({
  signedIn,
  searching,
}: {
  signedIn: boolean;
  searching: boolean;
}) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center text-white/40">
      <Gamepad2 className="mb-3 h-10 w-10 opacity-40" />
      <p className="text-sm font-medium">
        {searching ? 'No games found.' : 'No published games yet.'}
      </p>
      <p className="text-xs mt-1 text-white/25">Be the first to publish a game!</p>
      {signedIn ? (
        <Link
          href="/create/new"
          className="mt-4 rounded-full bg-[#8b7ec8] px-5 py-2 text-sm font-semibold text-white hover:bg-[#7a6db8]"
        >
          Create game
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
