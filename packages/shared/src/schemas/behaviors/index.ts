import { z } from 'zod';

/**
 * Behaviors are how a static scene becomes a playable game.
 *
 * Each game element can carry a list of behaviors. The runtime in
 * `@arcadery/engine` reads these and steps physics + input + game state every
 * frame. Behaviors are pure data — never functions — so they round-trip cleanly
 * through Supabase JSONB columns and through the AI scene generator.
 *
 * Coordinate system: game-units in world space, y-up. Velocity is units/sec.
 * 1 game unit ≈ 1 sprite tile / one floor block.
 */

// ─── Player input behaviors ──────────────────────────────────────────────

export const PlatformerControllerSchema = z.object({
  type: z.literal('platformer-controller'),
  speed: z.number().min(0.1).max(50).default(5),
  jumpVelocity: z.number().min(0.1).max(50).default(12),
  gravity: z.number().min(0).max(200).default(28),
  controls: z.enum(['wasd', 'arrows', 'both']).default('both'),
  /** Optional: tag of elements treated as ground for jump-reset. Defaults to "solid". */
  groundTag: z.string().default('solid'),
});

export const TopDownControllerSchema = z.object({
  type: z.literal('top-down-controller'),
  speed: z.number().min(0.1).max(50).default(5),
  controls: z.enum(['wasd', 'arrows', 'both']).default('both'),
});

// ─── Movement behaviors ──────────────────────────────────────────────────

export const AutoMoveSchema = z.object({
  type: z.literal('auto-move'),
  velocityX: z.number().default(0),
  velocityY: z.number().default(0),
  /** When true, reverses velocityX on horizontal collision (patrol enemy). */
  reverseOnHit: z.boolean().default(false),
});

// ─── Static body ─────────────────────────────────────────────────────────

export const SolidSchema = z.object({
  type: z.literal('solid'),
  /** Tag controllers can target — e.g. "solid" lets PlatformerController land on it. */
  surfaceTag: z.string().default('solid'),
});

// ─── Interactive triggers ────────────────────────────────────────────────

export const PickupOnContactSchema = z.object({
  type: z.literal('pickup-on-contact'),
  /** Tag of elements that can pick this up. Default: "player". */
  collectorTag: z.string().default('player'),
  scoreDelta: z.number().int().default(10),
  healthDelta: z.number().int().default(0),
  destroyOnPickup: z.boolean().default(true),
});

export const DamageOnContactSchema = z.object({
  type: z.literal('damage-on-contact'),
  /** Tag of elements taking the damage. Default: "player". */
  victimTag: z.string().default('player'),
  damage: z.number().int().min(0).default(1),
  destroySelfOnHit: z.boolean().default(false),
  /** Per-victim cooldown (ms) so a single contact doesn't drain a life per frame. */
  cooldownMs: z.number().int().default(1000),
});

// ─── Discriminated union ─────────────────────────────────────────────────

// ─── Projectile spawning ─────────────────────────────────────────────────

export const ShootProjectileSchema = z.object({
  type: z.literal('shoot-projectile'),
  /** "auto" fires every cooldownMs, "space" fires on spacebar, "click" fires on canvas click. */
  trigger: z.enum(['auto', 'space', 'click']).default('auto'),
  cooldownMs: z.number().int().min(50).default(400),
  /** Where the projectile flies. "forward" follows the owner's last movement. */
  direction: z
    .enum(['forward', 'up', 'down', 'left', 'right'])
    .default('forward'),
  projectileSpeed: z.number().min(0.1).default(12),
  /** Game-units diameter (1 = 50 px). */
  projectileSize: z.number().min(0.1).default(0.4),
  projectileColor: z.string().default('#fbbf24'),
  damage: z.number().int().min(0).default(1),
  /** Tag the projectile damages on contact. */
  victimTag: z.string().default('enemy'),
  /** Auto-destroy after this many ms even if it doesn't hit anything. */
  lifetimeMs: z.number().int().min(100).default(1500),
});

// ─── Spawner — clones a template element on an interval ─────────────────

export const SpawnerSchema = z.object({
  type: z.literal('spawner'),
  /** id of a sibling element to clone. The template is removed from the
   *  initial simulation — it only exists as a blueprint. */
  templateElementId: z.string(),
  intervalMs: z.number().int().min(50).default(2000),
  /** Skip spawning when this many copies are still alive. */
  maxConcurrent: z.number().int().min(1).default(8),
  /** Initial velocity for the spawned clone (units/sec). */
  spawnVelocityX: z.number().default(0),
  spawnVelocityY: z.number().default(0),
  /** Pixel offset from the spawner's own position. */
  offsetX: z.number().default(0),
  offsetY: z.number().default(0),
  /** Optional lifetime (ms) for each spawned clone. 0 = forever. */
  cloneLifetimeMs: z.number().int().min(0).default(0),
});

// ─── Win condition behaviors (attached to scene-level decisions) ─────────

export const WinOnTagDestroyedSchema = z.object({
  type: z.literal('win-on-tag-destroyed'),
  /** Win when no living elements carry this tag. Attach to any element. */
  targetTag: z.string(),
});

export const BehaviorSchema = z.discriminatedUnion('type', [
  PlatformerControllerSchema,
  TopDownControllerSchema,
  AutoMoveSchema,
  SolidSchema,
  PickupOnContactSchema,
  DamageOnContactSchema,
  ShootProjectileSchema,
  SpawnerSchema,
  WinOnTagDestroyedSchema,
]);

export type Behavior = z.infer<typeof BehaviorSchema>;
export type BehaviorType = Behavior['type'];

// ─── Scene-level game state ──────────────────────────────────────────────

export const GameStateConfigSchema = z.object({
  initialScore: z.number().int().default(0),
  initialHealth: z.number().int().min(0).default(3),
  /** Game ends with WIN when player score >= winScore. 0 disables. */
  winScore: z.number().int().min(0).default(0),
  /** Game ends with WIN after surviving N seconds. 0 disables. */
  winSurviveSec: z.number().int().min(0).default(0),
  /** Camera follow this element id during play. */
  cameraFollowId: z.string().optional(),
});

export type GameStateConfig = z.infer<typeof GameStateConfigSchema>;
