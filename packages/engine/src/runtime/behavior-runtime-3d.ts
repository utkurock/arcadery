/**
 * 3D behavior runtime — turns a static "three" scene into a playable game.
 *
 * The 3D sibling of `behavior-runtime.ts`. Where the 2D runtime works in PixiJS
 * display pixels on an x/y plane, this one works in **world units** on x/z
 * (ground plane) with y as up — matching how the R3F renderer places elements
 * (element.transform.position is world-space; no px scaling). Gravity pulls
 * along -Y; movement is on the XZ plane.
 *
 * Supported behaviors in 3D: third-person-controller, top-down-controller,
 * auto-move (x/y/z), solid (AABB ground + walls), pickup-on-contact,
 * damage-on-contact, win-on-tag-destroyed, plus scene-level winScore /
 * winSurviveSec / health. Projectiles + spawners stay 2D-only for now.
 */

import type {
  GameScene,
  SceneElement,
  Behavior,
  GameStateConfig,
} from '@arcadery/shared';
import type { RuntimeState, GameStatus } from './behavior-runtime';

// ─── Types ───────────────────────────────────────────────────────────────

type LiveTransform3D = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Half-extent footprint in world units (full width/height/depth). */
  w: number;
  h: number;
  d: number;
  onGround: boolean;
  damageCooldowns: Record<string, number>;
};

type LiveElement3D = {
  id: string;
  element: SceneElement;
  transform: LiveTransform3D;
  alive: boolean;
};

/**
 * Structurally a superset of the 2D `RuntimeState` (adds `z` to positions),
 * so it's assignable wherever a `RuntimeState` is expected — the play HUD reads
 * only score/health/status/paused, and the 3D renderer reads positions[].z.
 */
export type RuntimeState3D = Omit<RuntimeState, 'positions'> & {
  positions: Record<string, { x: number; y: number; z: number; alive: boolean }>;
};

type StateChangeListener = (state: RuntimeState3D) => void;

export type CameraConfig3D = {
  followId: string;
  distance: number;
  height: number;
};

// ─── Helpers ─────────────────────────────────────────────────────────────

const KEY_MAP3D = {
  forward: ['arrowup', 'w'],
  back: ['arrowdown', 's'],
  left: ['arrowleft', 'a'],
  right: ['arrowright', 'd'],
  jump: [' '],
};

function elementSize3D(el: SceneElement): { w: number; h: number; d: number } {
  const s = el.transform?.scale ?? { x: 1, y: 1, z: 1 };
  let w = 1;
  let h = 1;
  let d = 1;
  switch (el.type) {
    case 'box':
      w = el.size?.x ?? 1;
      h = el.size?.y ?? 1;
      d = el.size?.z ?? 1;
      break;
    case 'sphere': {
      const r = el.radius ?? 0.5;
      w = h = d = r * 2;
      break;
    }
    case 'plane':
      // A plane is a floor/wall slab — thin on Y, full on its width/height.
      w = el.width ?? 10;
      h = 0.2;
      d = el.height ?? 10;
      break;
    case 'sprite':
      w = el.width ?? 1;
      h = el.height ?? 1;
      d = 0.2;
      break;
    case 'model':
    default:
      w = h = d = 1;
      break;
  }
  return { w: w * (s.x ?? 1), h: h * (s.y ?? 1), d: d * (s.z ?? 1) };
}

function aabb3(a: LiveTransform3D, b: LiveTransform3D): boolean {
  return (
    Math.abs(a.x - b.x) < (a.w + b.w) / 2 &&
    Math.abs(a.y - b.y) < (a.h + b.h) / 2 &&
    Math.abs(a.z - b.z) < (a.d + b.d) / 2
  );
}

function pickBehavior<T extends Behavior['type']>(
  el: SceneElement,
  type: T,
): Extract<Behavior, { type: T }> | undefined {
  return el.behaviors?.find((b) => b.type === type) as
    | Extract<Behavior, { type: T }>
    | undefined;
}

// ─── Runtime ─────────────────────────────────────────────────────────────

export class BehaviorRuntime3D {
  private elements = new Map<string, LiveElement3D>();
  private keys = new Set<string>();
  private listeners: StateChangeListener[] = [];
  private elapsedSec = 0;
  private score = 0;
  private health = 0;
  private status: GameStatus = 'playing';
  private gameStateConfig: GameStateConfig;
  private paused = false;
  private cameraConfig: CameraConfig3D | null = null;

  constructor(scene: GameScene) {
    const cfg: GameStateConfig = scene.gameState ?? {
      initialScore: 0,
      initialHealth: 3,
      winScore: 0,
      winSurviveSec: 0,
    };
    this.gameStateConfig = cfg;
    this.score = cfg.initialScore;
    this.health = cfg.initialHealth;

    for (const [id, el] of Object.entries(scene.elements)) {
      // Lights/text don't participate in physics — keep them out of the sim.
      if (el.type === 'light' || el.type === 'text') continue;
      const { w, h, d } = elementSize3D(el);
      const p = el.transform.position;
      this.elements.set(id, {
        id,
        element: el,
        transform: {
          x: p.x,
          y: p.y,
          z: p.z ?? 0,
          vx: 0,
          vy: 0,
          vz: 0,
          w,
          h,
          d,
          onGround: false,
          damageCooldowns: {},
        },
        alive: true,
      });

      // Resolve the follow camera: explicit cameraFollowId wins, else the
      // element carrying the third-person controller.
      const tp = pickBehavior(el, 'third-person-controller');
      if (tp && (!this.cameraConfig || cfg.cameraFollowId === id)) {
        this.cameraConfig = {
          followId: id,
          distance: tp.cameraDistance,
          height: tp.cameraHeight,
        };
      }
    }
    if (cfg.cameraFollowId && this.elements.has(cfg.cameraFollowId) && !this.cameraConfig) {
      this.cameraConfig = { followId: cfg.cameraFollowId, distance: 10, height: 6 };
    }
  }

  getCameraConfig(): CameraConfig3D | null {
    return this.cameraConfig;
  }

  start(): void {
    if (typeof window === 'undefined') return;
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
  }

  stop(): void {
    if (typeof window === 'undefined') return;
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
  }

  onStateChange(cb: StateChangeListener): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  togglePause(): void {
    this.paused = !this.paused;
  }

  /** Step the simulation by `dt` seconds. */
  tick(dt: number): void {
    if (this.status !== 'playing') return;
    if (this.paused) {
      this.emitState();
      return;
    }
    dt = Math.min(dt, 1 / 30);
    this.elapsedSec += dt;
    const nowMs = Date.now();

    // Phase 1: input + auto-move set velocity
    for (const live of this.elements.values()) {
      if (!live.alive) continue;
      this.applyController(live, dt);
      this.applyAutoMove(live);
    }

    // Phase 2: integrate + resolve collisions per axis
    for (const live of this.elements.values()) {
      if (!live.alive) continue;
      this.integrateAndCollide(live, dt);
    }

    // Phase 3: triggers
    this.processTriggers(nowMs);

    // Phase 4: win/lose
    this.checkWinLose();

    this.emitState();
  }

  getState(): RuntimeState3D {
    const positions: RuntimeState3D['positions'] = {};
    for (const live of this.elements.values()) {
      positions[live.id] = {
        x: live.transform.x,
        y: live.transform.y,
        z: live.transform.z,
        alive: live.alive,
      };
    }
    return {
      status: this.status,
      score: this.score,
      health: this.health,
      elapsedSec: this.elapsedSec,
      paused: this.paused,
      positions,
      spawnedElements: [],
      scorePopups: [],
    };
  }

  // ─── Input ─────────────────────────────────────────────────────────────

  private handleKeyDown = (e: KeyboardEvent) => {
    this.keys.add(e.key.toLowerCase());
  };
  private handleKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
  };
  private isPressed(role: keyof typeof KEY_MAP3D): boolean {
    return KEY_MAP3D[role].some((k) => this.keys.has(k));
  }

  /** Test-only: drive input without a DOM. */
  setKey(key: string, down: boolean): void {
    if (down) this.keys.add(key.toLowerCase());
    else this.keys.delete(key.toLowerCase());
  }

  // ─── Behavior phases ───────────────────────────────────────────────────

  private applyController(live: LiveElement3D, dt: number) {
    const t = live.transform;
    const tp = pickBehavior(live.element, 'third-person-controller');
    if (tp) {
      let dx = 0;
      let dz = 0;
      if (this.isPressed('left')) dx -= 1;
      if (this.isPressed('right')) dx += 1;
      if (this.isPressed('forward')) dz -= 1; // W moves into the screen (-Z)
      if (this.isPressed('back')) dz += 1;
      const len = Math.hypot(dx, dz);
      if (len > 0) {
        dx /= len;
        dz /= len;
      }
      t.vx = dx * tp.speed;
      t.vz = dz * tp.speed;
      if (this.isPressed('jump') && t.onGround) {
        t.vy = tp.jumpVelocity;
        t.onGround = false;
      }
      t.vy -= tp.gravity * dt;
      return;
    }

    const td = pickBehavior(live.element, 'top-down-controller');
    if (td) {
      let dx = 0;
      let dz = 0;
      if (this.isPressed('left')) dx -= 1;
      if (this.isPressed('right')) dx += 1;
      if (this.isPressed('forward')) dz -= 1;
      if (this.isPressed('back')) dz += 1;
      const len = Math.hypot(dx, dz);
      if (len > 0) {
        dx /= len;
        dz /= len;
      }
      t.vx = dx * td.speed;
      t.vz = dz * td.speed;
      t.vy = 0;
    }
  }

  private applyAutoMove(live: LiveElement3D) {
    const auto = pickBehavior(live.element, 'auto-move');
    if (!auto) return;
    const hasController =
      pickBehavior(live.element, 'third-person-controller') ||
      pickBehavior(live.element, 'top-down-controller');
    if (hasController) return;
    live.transform.vx = auto.velocityX;
    live.transform.vy = auto.velocityY;
    live.transform.vz = auto.velocityZ ?? 0;
  }

  private integrateAndCollide(live: LiveElement3D, dt: number) {
    const t = live.transform;
    t.x += t.vx * dt;
    t.y += t.vy * dt;
    t.z += t.vz * dt;
    t.onGround = false;
    this.resolveSolids(live);
  }

  /**
   * Resolve overlaps with solids using the minimum-translation-vector: push
   * out along whichever axis has the *least* penetration. This avoids the
   * per-axis-sequential failure where a small body embedded in a wide thin
   * floor gets shoved sideways to the floor's edge — it correctly pops the
   * body straight up onto the surface instead.
   */
  private resolveSolids(live: LiveElement3D) {
    const t = live.transform;
    const auto = pickBehavior(live.element, 'auto-move');
    for (const other of this.elements.values()) {
      if (other === live || !other.alive) continue;
      if (!pickBehavior(other.element, 'solid')) continue;

      const o = other.transform;
      const dx = t.x - o.x;
      const dy = t.y - o.y;
      const dz = t.z - o.z;
      const px = (t.w + o.w) / 2 - Math.abs(dx);
      const py = (t.h + o.h) / 2 - Math.abs(dy);
      const pz = (t.d + o.d) / 2 - Math.abs(dz);
      if (px <= 0 || py <= 0 || pz <= 0) continue; // no overlap on some axis

      if (px <= py && px <= pz) {
        t.x += (dx < 0 ? -1 : 1) * px;
        if (auto?.reverseOnHit) t.vx = -t.vx;
        else t.vx = 0;
      } else if (pz <= px && pz <= py) {
        t.z += (dz < 0 ? -1 : 1) * pz;
        if (auto?.reverseOnHit) t.vz = -t.vz;
        else t.vz = 0;
      } else {
        // Vertical: dy >= 0 means we're above the solid → landing.
        t.y += (dy < 0 ? -1 : 1) * py;
        t.vy = 0;
        if (dy >= 0) t.onGround = true;
      }
    }
  }

  private processTriggers(now: number) {
    const live = Array.from(this.elements.values()).filter((e) => e.alive);
    for (const a of live) {
      const tagsA = a.element.tags ?? [];
      for (const b of live) {
        if (a === b || !b.alive) continue;
        if (!aabb3(a.transform, b.transform)) continue;

        const pickup = pickBehavior(b.element, 'pickup-on-contact');
        if (pickup && tagsA.includes(pickup.collectorTag)) {
          this.score += pickup.scoreDelta;
          if (pickup.healthDelta) this.health += pickup.healthDelta;
          if (pickup.destroyOnPickup) b.alive = false;
        }

        const dmg = pickBehavior(b.element, 'damage-on-contact');
        if (dmg && tagsA.includes(dmg.victimTag)) {
          const last = a.transform.damageCooldowns[b.id] ?? 0;
          if (now - last >= dmg.cooldownMs) {
            a.transform.damageCooldowns[b.id] = now;
            this.health -= dmg.damage;
            if (dmg.destroySelfOnHit) b.alive = false;
          }
        }
      }
    }
  }

  private checkWinLose() {
    if (this.health <= 0) {
      this.status = 'lost';
      return;
    }
    if (this.gameStateConfig.winScore > 0 && this.score >= this.gameStateConfig.winScore) {
      this.status = 'won';
      return;
    }
    if (
      this.gameStateConfig.winSurviveSec > 0 &&
      this.elapsedSec >= this.gameStateConfig.winSurviveSec
    ) {
      this.status = 'won';
      return;
    }
    for (const live of this.elements.values()) {
      const winBehavior = pickBehavior(live.element, 'win-on-tag-destroyed');
      if (!winBehavior) continue;
      const anyAlive = Array.from(this.elements.values()).some(
        (e) => e.alive && (e.element.tags ?? []).includes(winBehavior.targetTag),
      );
      if (!anyAlive) {
        this.status = 'won';
        return;
      }
    }
  }

  private emitState() {
    const state = this.getState();
    for (const cb of this.listeners) cb(state);
  }
}
