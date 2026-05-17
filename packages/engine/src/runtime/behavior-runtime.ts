/**
 * Behavior runtime — turns a static scene into a playable game.
 *
 * Reads each element's `behaviors[]` array, simulates physics + input each
 * frame, and emits live state for the renderer + HUD.
 *
 * Coordinate system: positions are in PixiJS display pixels (matches the
 * existing PhaserCanvas convention — element.transform.position is pixel
 * space, with y-up; the renderer flips y at draw time).
 *
 * Behavior numbers (speed, jumpVelocity, gravity, …) are authored in
 * "game units" per second and converted internally — 1 unit = 50 px,
 * matching the renderer's element-size scaling.
 */
const PX_PER_UNIT = 50;

import type {
  GameScene,
  SceneElement,
  Behavior,
  GameStateConfig,
} from '@arcadery/shared';

let runtimeIdCounter = 0;
function makeRuntimeId(prefix: string): string {
  runtimeIdCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${runtimeIdCounter}`;
}

// ─── Types ───────────────────────────────────────────────────────────────

type LiveTransform = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Width in game units, used for AABB collision. Falls back to 1. */
  w: number;
  h: number;
  /** Set every frame: did we land on something this frame? */
  onGround: boolean;
  /** Cooldown timestamps per damage source, ms epoch. */
  damageCooldowns: Record<string, number>;
};

type LiveElement = {
  id: string;
  element: SceneElement;
  transform: LiveTransform;
  alive: boolean;
  /** Frame at which this element was added — used for ms-based lifetime. */
  bornAtMs: number;
  /** When set, the element is auto-destroyed after this many ms. */
  lifetimeMs?: number;
  /** Per-behavior cooldown timestamps (e.g. last shot fired). */
  behaviorCooldowns: Record<string, number>;
  /** Last non-zero movement direction — used by ShootProjectile "forward". */
  facing: { x: number; y: number };
};

export type GameStatus = 'playing' | 'won' | 'lost';

type ScorePopupEvent = {
  x: number;
  y: number;
  delta: number;
};

export type RuntimeState = {
  status: GameStatus;
  score: number;
  health: number;
  elapsedSec: number;
  paused: boolean;
  /** id → { x, y, alive } — keys preserved between frames so renderer can map. */
  positions: Record<string, { x: number; y: number; alive: boolean }>;
  /** Elements that came into being after construction (projectiles, spawns). */
  spawnedElements: { id: string; element: SceneElement }[];
  /** Pickups that just triggered — renderer animates a "+N" floating text. */
  scorePopups: ScorePopupEvent[];
};

type StateChangeListener = (state: RuntimeState) => void;

// ─── Helpers ─────────────────────────────────────────────────────────────

const KEY_MAP = {
  left: ['arrowleft', 'a'],
  right: ['arrowright', 'd'],
  up: ['arrowup', 'w', ' '], // up + space for jump
  down: ['arrowdown', 's'],
  jump: [' ', 'arrowup', 'w'],
};

function elementSize(el: SceneElement): { w: number; h: number } {
  // Returns AABB in PIXELS (matches renderer's 50 px/unit scaling).
  if (el.type === 'sprite')
    return { w: (el.width ?? 1) * PX_PER_UNIT, h: (el.height ?? 1) * PX_PER_UNIT };
  if (el.type === 'box')
    return { w: (el.size?.x ?? 1) * PX_PER_UNIT, h: (el.size?.y ?? 1) * PX_PER_UNIT };
  if (el.type === 'plane')
    return { w: (el.width ?? 10) * PX_PER_UNIT, h: (el.height ?? 10) * PX_PER_UNIT };
  if (el.type === 'sphere')
    return {
      w: (el.radius ?? 0.5) * 2 * PX_PER_UNIT,
      h: (el.radius ?? 0.5) * 2 * PX_PER_UNIT,
    };
  if (el.type === 'tilemap') {
    const cols = el.gridCols ?? 20;
    const rows = el.gridRows ?? 15;
    const renderSize = el.renderSize ?? 32;
    // Tilemap is rendered at renderSize px per tile.
    return { w: cols * renderSize, h: rows * renderSize };
  }
  return { w: PX_PER_UNIT, h: PX_PER_UNIT };
}

function aabbOverlap(a: LiveTransform, b: LiveTransform): boolean {
  return (
    Math.abs(a.x - b.x) < (a.w + b.w) / 2 &&
    Math.abs(a.y - b.y) < (a.h + b.h) / 2
  );
}

function rectOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return (
    Math.abs(a.x - b.x) < (a.w + b.w) / 2 &&
    Math.abs(a.y - b.y) < (a.h + b.h) / 2
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

export class BehaviorRuntime {
  private elements = new Map<string, LiveElement>();
  private keys = new Set<string>();
  private listeners: StateChangeListener[] = [];
  private elapsedSec = 0;
  private score = 0;
  private health = 0;
  private status: GameStatus = 'playing';
  private gameStateConfig: GameStateConfig;

  /** Templates referenced by spawners — kept aside, never simulated or rendered. */
  private templates = new Map<string, SceneElement>();
  /** Spawner element id → ids of currently-living clones. */
  private spawnerChildren = new Map<string, Set<string>>();

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

    // First pass: collect all template ids referenced by spawners so we can
    // skip them when populating the live element map.
    const templateIds = new Set<string>();
    for (const el of Object.values(scene.elements)) {
      const spawner = pickBehavior(el, 'spawner');
      if (spawner) templateIds.add(spawner.templateElementId);
    }

    for (const [id, el] of Object.entries(scene.elements)) {
      if (templateIds.has(id)) {
        this.templates.set(id, el);
        continue;
      }
      this.addElementInternal(id, el, el.transform.position.x, el.transform.position.y);
    }
  }

  private addElementInternal(
    id: string,
    el: SceneElement,
    x: number,
    y: number,
    opts: {
      vx?: number;
      vy?: number;
      lifetimeMs?: number;
    } = {},
  ): LiveElement {
    const { w, h } = elementSize(el);
    const live: LiveElement = {
      id,
      element: el,
      transform: {
        x,
        y,
        vx: opts.vx ?? 0,
        vy: opts.vy ?? 0,
        w,
        h,
        onGround: false,
        damageCooldowns: {},
      },
      alive: true,
      bornAtMs: Date.now(),
      lifetimeMs: opts.lifetimeMs,
      behaviorCooldowns: {},
      facing: { x: 1, y: 0 },
    };
    this.elements.set(id, live);
    return live;
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

  private paused = false;
  private pointerActive = false;

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  togglePause(): void {
    this.paused = !this.paused;
  }

  setPointerActive(active: boolean): void {
    this.pointerActive = active;
  }

  /** Step the simulation by `dt` seconds. */
  tick(dt: number): void {
    if (this.status !== 'playing') return;
    if (this.paused) {
      // Still emit state so the HUD updates (e.g. PAUSED overlay reacts).
      this.emitState();
      return;
    }
    dt = Math.min(dt, 1 / 30);

    this.elapsedSec += dt;
    const nowMs = Date.now();

    // Phase 1: input + behaviors that set velocity
    for (const live of this.elements.values()) {
      if (!live.alive) continue;
      this.applyControllerInput(live, dt);
      this.applyAutoMove(live);
      this.applyShootProjectile(live, nowMs);
      this.applySpawner(live, nowMs);
    }

    // Phase 2: integrate velocity, resolve collisions
    for (const live of this.elements.values()) {
      if (!live.alive) continue;
      this.integrateAndCollide(live, dt);

      // Track facing direction for "forward"-shot projectiles
      if (Math.abs(live.transform.vx) > 0.01 || Math.abs(live.transform.vy) > 0.01) {
        const len = Math.hypot(live.transform.vx, live.transform.vy);
        live.facing.x = live.transform.vx / len;
        live.facing.y = live.transform.vy / len;
      }
    }

    // Phase 3: trigger behaviors (pickup, damage)
    this.processTriggers();

    // Phase 4: lifetime expiry
    for (const live of this.elements.values()) {
      if (!live.alive || !live.lifetimeMs) continue;
      if (nowMs - live.bornAtMs >= live.lifetimeMs) {
        live.alive = false;
      }
    }

    // Phase 5: win/lose
    this.checkWinLose();

    this.emitState();
  }

  getState(): RuntimeState {
    const positions: RuntimeState['positions'] = {};
    for (const live of this.elements.values()) {
      positions[live.id] = {
        x: live.transform.x,
        y: live.transform.y,
        alive: live.alive,
      };
    }
    const spawned = this.drainSpawnedElements();
    const popups = this.scorePopups;
    this.scorePopups = [];
    return {
      status: this.status,
      score: this.score,
      health: this.health,
      elapsedSec: this.elapsedSec,
      paused: this.paused,
      positions,
      spawnedElements: spawned,
      scorePopups: popups,
    };
  }

  private scorePopups: ScorePopupEvent[] = [];

  // ─── Spawn helpers ─────────────────────────────────────────────────────

  private spawnedQueue: { id: string; element: SceneElement }[] = [];

  private drainSpawnedElements(): { id: string; element: SceneElement }[] {
    if (this.spawnedQueue.length === 0) return [];
    const out = this.spawnedQueue;
    this.spawnedQueue = [];
    return out;
  }

  // ─── Input ─────────────────────────────────────────────────────────────

  private handleKeyDown = (e: KeyboardEvent) => {
    this.keys.add(e.key.toLowerCase());
  };
  private handleKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
  };
  private isPressed(role: keyof typeof KEY_MAP): boolean {
    return KEY_MAP[role].some((k) => this.keys.has(k));
  }

  // ─── Behavior phases ───────────────────────────────────────────────────

  private applyControllerInput(live: LiveElement, dt: number) {
    const platformer = pickBehavior(live.element, 'platformer-controller');
    if (platformer) {
      const left = this.isPressed('left');
      const right = this.isPressed('right');
      const jump = this.isPressed('jump');

      // Horizontal — convert units/sec → px/sec
      if (left && !right) live.transform.vx = -platformer.speed * PX_PER_UNIT;
      else if (right && !left) live.transform.vx = platformer.speed * PX_PER_UNIT;
      else live.transform.vx = 0;

      // Jump only when grounded
      if (jump && live.transform.onGround) {
        live.transform.vy = platformer.jumpVelocity * PX_PER_UNIT;
        live.transform.onGround = false;
      }

      // Gravity (unit/s² → px/s²)
      live.transform.vy -= platformer.gravity * PX_PER_UNIT * dt;
      return;
    }

    const topDown = pickBehavior(live.element, 'top-down-controller');
    if (topDown) {
      let dx = 0;
      let dy = 0;
      if (this.isPressed('left')) dx -= 1;
      if (this.isPressed('right')) dx += 1;
      if (this.isPressed('up')) dy += 1;
      if (this.isPressed('down')) dy -= 1;
      const len = Math.hypot(dx, dy);
      if (len > 0) {
        dx /= len;
        dy /= len;
      }
      live.transform.vx = dx * topDown.speed * PX_PER_UNIT;
      live.transform.vy = dy * topDown.speed * PX_PER_UNIT;
    }
  }

  private applyShootProjectile(live: LiveElement, nowMs: number) {
    const shoot = pickBehavior(live.element, 'shoot-projectile');
    if (!shoot) return;

    const lastShot = live.behaviorCooldowns['shoot-projectile'] ?? 0;
    if (nowMs - lastShot < shoot.cooldownMs) return;

    let shouldFire = false;
    if (shoot.trigger === 'auto') shouldFire = true;
    if (shoot.trigger === 'space' && this.keys.has(' ')) shouldFire = true;
    if (shoot.trigger === 'click' && this.pointerActive) shouldFire = true;

    if (!shouldFire) return;
    live.behaviorCooldowns['shoot-projectile'] = nowMs;

    // Resolve direction vector
    let dx = 0;
    let dy = 0;
    switch (shoot.direction) {
      case 'up':
        dy = 1;
        break;
      case 'down':
        dy = -1;
        break;
      case 'left':
        dx = -1;
        break;
      case 'right':
        dx = 1;
        break;
      case 'forward':
        dx = live.facing.x;
        dy = live.facing.y;
        if (dx === 0 && dy === 0) dx = 1;
        break;
    }

    const speed = shoot.projectileSpeed;
    const projectileEl: SceneElement = {
      id: makeRuntimeId('proj'),
      name: 'Projectile',
      transform: {
        position: { x: live.transform.x, y: live.transform.y, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      visible: true,
      locked: false,
      tags: ['projectile'],
      type: 'sphere',
      radius: shoot.projectileSize / 2,
      material: { color: shoot.projectileColor, opacity: 1 },
      behaviors: [
        {
          type: 'damage-on-contact',
          victimTag: shoot.victimTag,
          damage: shoot.damage,
          destroySelfOnHit: true,
          cooldownMs: 100,
        },
      ],
    } as SceneElement;

    const live2 = this.addElementInternal(
      projectileEl.id,
      projectileEl,
      live.transform.x,
      live.transform.y,
      {
        vx: dx * speed * 50, // units → pixels/sec
        vy: dy * speed * 50,
        lifetimeMs: shoot.lifetimeMs,
      },
    );
    void live2;
    this.spawnedQueue.push({ id: projectileEl.id, element: projectileEl });
  }

  private applySpawner(live: LiveElement, nowMs: number) {
    const spawner = pickBehavior(live.element, 'spawner');
    if (!spawner) return;

    const lastSpawn = live.behaviorCooldowns['spawner'] ?? 0;
    if (nowMs - lastSpawn < spawner.intervalMs) return;

    // Count alive clones
    const childIds = this.spawnerChildren.get(live.id) ?? new Set();
    let aliveCount = 0;
    for (const cid of childIds) {
      const child = this.elements.get(cid);
      if (child?.alive) aliveCount += 1;
    }
    if (aliveCount >= spawner.maxConcurrent) {
      // Don't reset the cooldown — try again next frame
      return;
    }

    const template = this.templates.get(spawner.templateElementId);
    if (!template) return;

    live.behaviorCooldowns['spawner'] = nowMs;

    const newId = makeRuntimeId('spawn');
    const cloneEl: SceneElement = {
      ...template,
      id: newId,
      transform: {
        position: { x: 0, y: 0, z: 0 },
        rotation: { ...template.transform.rotation },
        scale: { ...template.transform.scale },
      },
    } as SceneElement;

    this.addElementInternal(
      newId,
      cloneEl,
      live.transform.x + spawner.offsetX,
      live.transform.y + spawner.offsetY,
      {
        vx: spawner.spawnVelocityX * 50,
        vy: spawner.spawnVelocityY * 50,
        lifetimeMs: spawner.cloneLifetimeMs > 0 ? spawner.cloneLifetimeMs : undefined,
      },
    );
    childIds.add(newId);
    this.spawnerChildren.set(live.id, childIds);
    this.spawnedQueue.push({ id: newId, element: cloneEl });
  }

  private applyAutoMove(live: LiveElement) {
    const auto = pickBehavior(live.element, 'auto-move');
    if (auto) {
      // Don't override: only set if no controller already drove velocity.
      const hasController =
        pickBehavior(live.element, 'platformer-controller') ||
        pickBehavior(live.element, 'top-down-controller');
      if (hasController) return;
      live.transform.vx = auto.velocityX * PX_PER_UNIT;
      live.transform.vy = auto.velocityY * PX_PER_UNIT;
    }
  }

  private integrateAndCollide(live: LiveElement, dt: number) {
    const t = live.transform;

    // Move horizontally
    t.x += t.vx * dt;
    this.resolveCollisionAxis(live, 'x');

    // Move vertically
    t.y += t.vy * dt;
    t.onGround = false;
    this.resolveCollisionAxis(live, 'y');
  }

  private resolveCollisionAxis(live: LiveElement, axis: 'x' | 'y') {
    const t = live.transform;
    for (const other of this.elements.values()) {
      if (other === live || !other.alive) continue;
      const isSolid = pickBehavior(other.element, 'solid');
      if (!isSolid) continue;

      if (other.element.type === 'tilemap') {
        this.resolveTilemapCollisionAxis(live, other.element, axis);
        continue;
      }

      if (!aabbOverlap(t, other.transform)) continue;

      if (axis === 'x') {
        if (t.x < other.transform.x) {
          t.x = other.transform.x - (t.w + other.transform.w) / 2;
        } else {
          t.x = other.transform.x + (t.w + other.transform.w) / 2;
        }
        const auto = pickBehavior(live.element, 'auto-move');
        if (auto?.reverseOnHit) t.vx = -t.vx;
        else t.vx = 0;
      } else {
        if (t.y < other.transform.y) {
          t.y = other.transform.y - (t.h + other.transform.h) / 2;
          t.vy = 0;
        } else {
          t.y = other.transform.y + (t.h + other.transform.h) / 2;
          t.vy = 0;
          t.onGround = true;
        }
      }
    }
  }

  /** Per-cell tile collision. Iterates only cells overlapping the entity AABB. */
  private resolveTilemapCollisionAxis(
    live: LiveElement,
    tm: SceneElement,
    axis: 'x' | 'y',
  ) {
    if (tm.type !== 'tilemap') return;
    const t = live.transform;

    const renderSize = tm.renderSize ?? 32;
    const cols = tm.gridCols ?? 20;
    const rows = tm.gridRows ?? 15;
    const tmX = tm.transform.position.x;
    const tmY = tm.transform.position.y;
    const halfW = (cols * renderSize) / 2;
    const halfH = (rows * renderSize) / 2;

    const eMinX = t.x - t.w / 2;
    const eMaxX = t.x + t.w / 2;
    const eMinY = t.y - t.h / 2;
    const eMaxY = t.y + t.h / 2;

    // Bail early if the entity is fully outside the tilemap bounds.
    if (
      eMaxX < tmX - halfW ||
      eMinX > tmX + halfW ||
      eMaxY < tmY - halfH ||
      eMinY > tmY + halfH
    ) {
      return;
    }

    const cMin = Math.max(0, Math.floor((eMinX - (tmX - halfW)) / renderSize));
    const cMax = Math.min(cols - 1, Math.ceil((eMaxX - (tmX - halfW)) / renderSize) - 1);
    // Row 0 is at the top of the tilemap (highest world y).
    const rMin = Math.max(0, Math.floor(((tmY + halfH) - eMaxY) / renderSize));
    const rMax = Math.min(rows - 1, Math.ceil(((tmY + halfH) - eMinY) / renderSize) - 1);

    const sparse = new Map<string, number>();
    for (const entry of tm.tiles ?? []) {
      const r = entry[0];
      const c = entry[1];
      const idx = entry[2];
      sparse.set(`${r},${c}`, idx);
    }
    const fillIdx = tm.fill ?? -1;

    for (let r = rMin; r <= rMax; r++) {
      for (let c = cMin; c <= cMax; c++) {
        const tileIdx = sparse.get(`${r},${c}`) ?? fillIdx;
        if (tileIdx < 0) continue; // empty cell

        const cellX = tmX - halfW + (c + 0.5) * renderSize;
        const cellY = tmY + halfH - (r + 0.5) * renderSize;
        const cell = { x: cellX, y: cellY, w: renderSize, h: renderSize };

        if (!rectOverlap({ x: t.x, y: t.y, w: t.w, h: t.h }, cell)) continue;

        if (axis === 'x') {
          if (t.x < cell.x) t.x = cell.x - (t.w + cell.w) / 2;
          else t.x = cell.x + (t.w + cell.w) / 2;
          const auto = pickBehavior(live.element, 'auto-move');
          if (auto?.reverseOnHit) t.vx = -t.vx;
          else t.vx = 0;
        } else {
          if (t.y < cell.y) {
            t.y = cell.y - (t.h + cell.h) / 2;
            t.vy = 0;
          } else {
            t.y = cell.y + (t.h + cell.h) / 2;
            t.vy = 0;
            t.onGround = true;
          }
        }
      }
    }
  }

  private processTriggers() {
    const live = Array.from(this.elements.values()).filter((e) => e.alive);
    const now = Date.now();

    for (const a of live) {
      const tagsA = a.element.tags ?? [];
      for (const b of live) {
        if (a === b) continue;
        if (!aabbOverlap(a.transform, b.transform)) continue;

        // Pickup: a is collector, b has pickup behavior
        const pickup = pickBehavior(b.element, 'pickup-on-contact');
        if (pickup && tagsA.includes(pickup.collectorTag)) {
          this.score += pickup.scoreDelta;
          if (pickup.healthDelta) this.health += pickup.healthDelta;
          if (pickup.scoreDelta !== 0) {
            this.scorePopups.push({
              x: b.transform.x,
              y: b.transform.y,
              delta: pickup.scoreDelta,
            });
          }
          if (pickup.destroyOnPickup) b.alive = false;
        }

        // Damage: a is victim, b has damage behavior
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

    // Win-on-tag-destroyed: scan elements for a behavior of this type, then
    // check that NO living element still carries the named tag.
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
