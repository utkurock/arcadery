/**
 * Prefab catalog — ready-made, behavior-wired building blocks ("components")
 * the user drops straight into a scene. Each prefab knows how to build itself
 * for the active render engine (2D / phaser uses display-pixel coords, 3D /
 * three uses world units) and may patch the scene's gameState (e.g. a player
 * sets cameraFollowId; a pickup bumps winScore).
 *
 * Built-in only — no persistence. Single-element blocks; the user arranges
 * them on the canvas afterwards.
 */

import {
  createBoxElement,
  createSphereElement,
  type SceneElement,
  type GameStateConfig,
  type Behavior,
} from '@arcadery/shared';
import {
  User,
  Square,
  Layers,
  Coins,
  Heart,
  Bug,
  Triangle,
  Flag,
  type LucideIcon,
} from 'lucide-react';

export type PrefabEngine = '2d' | '3d';

export interface PrefabBuildResult {
  elements: SceneElement[];
  /** Optional: derive the new gameState after this prefab is added. */
  patchGameState?: (current: GameStateConfig | undefined, addedIds: string[]) => GameStateConfig;
}

export interface Prefab {
  id: string;
  label: string;
  category: string;
  icon: LucideIcon;
  /** Short helper text shown under the label. */
  hint: string;
  engines: PrefabEngine[];
  build: (engine: PrefabEngine) => PrefabBuildResult;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function baseGameState(): GameStateConfig {
  return { initialScore: 0, initialHealth: 3, winScore: 0, winSurviveSec: 0 };
}

/** Ensure a gameState exists, returning a mutable copy. */
function ensureGameState(current: GameStateConfig | undefined): GameStateConfig {
  return current ? { ...current } : baseGameState();
}

function pos(engine: PrefabEngine, p2d: { x: number; y: number }, p3d: { x: number; y: number; z: number }) {
  const position = engine === '2d' ? { x: p2d.x, y: p2d.y, z: 0 } : p3d;
  return {
    position,
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  };
}

const solid: Behavior = { type: 'solid', surfaceTag: 'solid' };

// ─── Catalog ─────────────────────────────────────────────────────────────

export const PREFABS: Prefab[] = [
  // ── Player ──────────────────────────────────────────────────────────────
  {
    id: 'player-platformer',
    label: 'Platformer Player',
    category: 'Player',
    icon: User,
    hint: 'WASD + jump',
    engines: ['2d'],
    build: () => {
      const el = createBoxElement({
        name: 'Player',
        size: { x: 1, y: 1, z: 1 },
        material: { color: '#5db8a8', opacity: 1 },
        tags: ['player'],
        transform: pos('2d', { x: 200, y: 300 }, { x: 0, y: 0, z: 0 }),
        behaviors: [
          {
            type: 'platformer-controller',
            speed: 5,
            jumpVelocity: 12,
            gravity: 28,
            controls: 'both',
            groundTag: 'solid',
          },
        ],
      });
      return {
        elements: [el],
        patchGameState: (cur, ids) => ({ ...ensureGameState(cur), cameraFollowId: ids[0] }),
      };
    },
  },
  {
    id: 'player-topdown',
    label: 'Top-down Player',
    category: 'Player',
    icon: User,
    hint: '8-way move',
    engines: ['2d'],
    build: () => {
      const el = createBoxElement({
        name: 'Player',
        size: { x: 1, y: 1, z: 1 },
        material: { color: '#5db8a8', opacity: 1 },
        tags: ['player'],
        transform: pos('2d', { x: 300, y: 300 }, { x: 0, y: 0, z: 0 }),
        behaviors: [{ type: 'top-down-controller', speed: 5, controls: 'both' }],
      });
      return {
        elements: [el],
        patchGameState: (cur, ids) => ({ ...ensureGameState(cur), cameraFollowId: ids[0] }),
      };
    },
  },
  {
    id: 'player-3d',
    label: '3D Player',
    category: 'Player',
    icon: User,
    hint: 'WASD + jump, chase cam',
    engines: ['3d'],
    build: () => {
      const el = createBoxElement({
        name: 'Player',
        size: { x: 1, y: 1, z: 1 },
        material: { color: '#5db8a8', opacity: 1 },
        tags: ['player'],
        transform: pos('3d', { x: 0, y: 0 }, { x: 0, y: 1, z: 0 }),
        behaviors: [
          {
            type: 'third-person-controller',
            speed: 6,
            jumpVelocity: 10,
            gravity: 24,
            controls: 'both',
            groundTag: 'solid',
            cameraDistance: 10,
            cameraHeight: 6,
          },
        ],
      });
      return {
        elements: [el],
        patchGameState: (cur, ids) => ({ ...ensureGameState(cur), cameraFollowId: ids[0] }),
      };
    },
  },

  // ── Terrain ──────────────────────────────────────────────────────────────
  {
    id: 'ground',
    label: 'Ground',
    category: 'Terrain',
    icon: Layers,
    hint: 'Solid floor',
    engines: ['2d', '3d'],
    build: (engine) => {
      const el = createBoxElement({
        name: 'Ground',
        size: engine === '2d' ? { x: 24, y: 1, z: 1 } : { x: 40, y: 1, z: 40 },
        material: { color: '#2b3245', opacity: 1 },
        tags: ['solid'],
        transform: pos(engine, { x: 400, y: 50 }, { x: 0, y: -0.5, z: 0 }),
        behaviors: [solid],
      });
      return { elements: [el] };
    },
  },
  {
    id: 'platform',
    label: 'Platform',
    category: 'Terrain',
    icon: Square,
    hint: 'Solid ledge',
    engines: ['2d', '3d'],
    build: (engine) => {
      const el = createBoxElement({
        name: 'Platform',
        size: engine === '2d' ? { x: 4, y: 0.5, z: 1 } : { x: 4, y: 0.5, z: 4 },
        material: { color: '#3a4555', opacity: 1 },
        tags: ['solid'],
        transform: pos(engine, { x: 350, y: 250 }, { x: 6, y: 1.5, z: 0 }),
        behaviors: [solid],
      });
      return { elements: [el] };
    },
  },
  {
    id: 'wall',
    label: 'Wall',
    category: 'Terrain',
    icon: Square,
    hint: 'Solid barrier',
    engines: ['2d', '3d'],
    build: (engine) => {
      const el = createBoxElement({
        name: 'Wall',
        size: engine === '2d' ? { x: 0.5, y: 6, z: 1 } : { x: 1, y: 3, z: 8 },
        material: { color: '#475569', opacity: 1 },
        tags: ['solid'],
        transform: pos(engine, { x: 100, y: 300 }, { x: -8, y: 1, z: 0 }),
        behaviors: [solid],
      });
      return { elements: [el] };
    },
  },

  // ── Pickups ──────────────────────────────────────────────────────────────
  {
    id: 'coin',
    label: 'Coin',
    category: 'Pickups',
    icon: Coins,
    hint: '+score, win target',
    engines: ['2d', '3d'],
    build: (engine) => {
      const score = engine === '2d' ? 25 : 20;
      const el = createSphereElement({
        name: 'Coin',
        radius: engine === '2d' ? 0.3 : 0.5,
        material: { color: '#fbbf24', opacity: 1 },
        tags: ['pickup'],
        transform: pos(engine, { x: 300, y: 350 }, { x: 4, y: 1, z: -4 }),
        behaviors: [
          {
            type: 'pickup-on-contact',
            collectorTag: 'player',
            scoreDelta: score,
            healthDelta: 0,
            destroyOnPickup: true,
          },
        ],
      });
      return {
        elements: [el],
        // Coins drive a "collect them all" win: each one raises the target.
        patchGameState: (cur) => {
          const gs = ensureGameState(cur);
          return { ...gs, winScore: gs.winScore + score };
        },
      };
    },
  },
  {
    id: 'heart',
    label: 'Heart',
    category: 'Pickups',
    icon: Heart,
    hint: '+1 health',
    engines: ['2d', '3d'],
    build: (engine) => {
      const el = createSphereElement({
        name: 'Heart',
        radius: engine === '2d' ? 0.3 : 0.5,
        material: { color: '#ef4444', opacity: 1 },
        tags: ['pickup'],
        transform: pos(engine, { x: 500, y: 350 }, { x: -4, y: 1, z: -4 }),
        behaviors: [
          {
            type: 'pickup-on-contact',
            collectorTag: 'player',
            scoreDelta: 0,
            healthDelta: 1,
            destroyOnPickup: true,
          },
        ],
      });
      return { elements: [el] };
    },
  },

  // ── Hazards & Enemies ──────────────────────────────────────────────────
  {
    id: 'enemy-patrol',
    label: 'Patrol Enemy',
    category: 'Hazards & Enemies',
    icon: Bug,
    hint: 'Moves + damages',
    engines: ['2d', '3d'],
    build: (engine) => {
      const move: Behavior =
        engine === '2d'
          ? { type: 'auto-move', velocityX: 2, velocityY: 0, velocityZ: 0, reverseOnHit: true }
          : { type: 'auto-move', velocityX: 0, velocityY: 0, velocityZ: 3, reverseOnHit: true };
      const el = createBoxElement({
        name: 'Enemy',
        size: engine === '2d' ? { x: 0.8, y: 0.8, z: 1 } : { x: 1.2, y: 1.2, z: 1.2 },
        material: { color: '#ef4444', opacity: 1 },
        tags: ['enemy'],
        transform: pos(engine, { x: 600, y: 300 }, { x: -6, y: 1, z: 0 }),
        behaviors: [
          move,
          {
            type: 'damage-on-contact',
            victimTag: 'player',
            damage: 1,
            destroySelfOnHit: false,
            cooldownMs: 800,
          },
        ],
      });
      return { elements: [el] };
    },
  },
  {
    id: 'hazard',
    label: 'Hazard',
    category: 'Hazards & Enemies',
    icon: Triangle,
    hint: 'Static danger',
    engines: ['2d', '3d'],
    build: (engine) => {
      const el = createBoxElement({
        name: 'Hazard',
        size: engine === '2d' ? { x: 1, y: 0.4, z: 1 } : { x: 1.5, y: 0.3, z: 1.5 },
        material: { color: '#f97316', opacity: 1 },
        tags: ['hazard'],
        transform: pos(engine, { x: 450, y: 80 }, { x: 4, y: 0.2, z: 4 }),
        behaviors: [
          {
            type: 'damage-on-contact',
            victimTag: 'player',
            damage: 1,
            destroySelfOnHit: false,
            cooldownMs: 800,
          },
        ],
      });
      return { elements: [el] };
    },
  },

  // ── Goal ────────────────────────────────────────────────────────────────
  {
    id: 'goal',
    label: 'Goal',
    category: 'Goal',
    icon: Flag,
    hint: 'Reach to win',
    engines: ['2d', '3d'],
    build: (engine) => {
      const reward = 100;
      const el = createBoxElement({
        name: 'Goal',
        size: engine === '2d' ? { x: 1, y: 2, z: 1 } : { x: 1.5, y: 2, z: 1.5 },
        material: { color: '#22c55e', opacity: 1 },
        tags: ['goal'],
        transform: pos(engine, { x: 1200, y: 120 }, { x: 12, y: 1, z: 0 }),
        behaviors: [
          {
            type: 'pickup-on-contact',
            collectorTag: 'player',
            scoreDelta: reward,
            healthDelta: 0,
            destroyOnPickup: true,
          },
        ],
      });
      return {
        elements: [el],
        patchGameState: (cur) => {
          const gs = ensureGameState(cur);
          return { ...gs, winScore: gs.winScore + reward };
        },
      };
    },
  },
];

export const PREFAB_CATEGORIES = [
  'Player',
  'Terrain',
  'Pickups',
  'Hazards & Enemies',
  'Goal',
] as const;
