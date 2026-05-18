import 'server-only';

// Single source of truth for the admin panel about which arcade games exist
// and how revenue maps onto them. Keeping this co-located with the admin
// aggregator (instead of importing from `lib/builtin-games/config.ts`) lets
// us track per-game fees and labels independently — e.g. if Drift Racer or
// Fly Birds ever runs a different entry price.

import { BUILTIN_ENTRY_FEE_SOL } from '@/lib/builtin-games/config';

export interface AdminGame {
  /** URL/slug used in /play and the scores API. */
  key: string;
  /** Pretty label used in dashboard tables + charts. */
  label: string;
  /** Postgres table holding completed plays for this game. */
  scoresTable: string;
  /** Per-entry fee in SOL. */
  feeSol: number;
  /** Accent color for chart bars + game-cards. */
  color: string;
}

export const ADMIN_GAMES: AdminGame[] = [
  {
    key: 'neon-asteroids',
    label: 'Neon Asteroids',
    scoresTable: 'neon_asteroids_scores',
    feeSol: BUILTIN_ENTRY_FEE_SOL,
    color: '#22d3ee',
  },
  {
    key: 'cube-runner',
    label: 'Cube Runner',
    scoresTable: 'cube_runner_scores',
    feeSol: BUILTIN_ENTRY_FEE_SOL,
    color: '#ec4899',
  },
  {
    key: 'brick-smash',
    label: 'Brick Smash',
    scoresTable: 'brick_smash_scores',
    feeSol: BUILTIN_ENTRY_FEE_SOL,
    color: '#60a5fa',
  },
  {
    key: 'sky-glider',
    label: 'Sky Glider',
    scoresTable: 'sky_glider_scores',
    feeSol: BUILTIN_ENTRY_FEE_SOL,
    color: '#818cf8',
  },
  {
    key: 'hex-tower',
    label: 'Hex Tower',
    scoresTable: 'hex_tower_scores',
    feeSol: BUILTIN_ENTRY_FEE_SOL,
    color: '#f472b6',
  },
  {
    key: 'drone-arena',
    label: 'Drone Arena',
    scoresTable: 'drone_arena_scores',
    feeSol: BUILTIN_ENTRY_FEE_SOL,
    color: '#a855f7',
  },
  {
    key: 'voxel-heist',
    label: 'Voxel Heist',
    scoresTable: 'voxel_heist_scores',
    feeSol: BUILTIN_ENTRY_FEE_SOL,
    color: '#facc15',
  },
  {
    key: 'drift-racer',
    label: 'Drift Racer',
    scoresTable: 'drift_racer_scores',
    feeSol: BUILTIN_ENTRY_FEE_SOL,
    color: '#fb923c',
  },
];
