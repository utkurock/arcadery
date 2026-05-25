import { describe, it, expect } from 'vitest';
import { BehaviorRuntime3D } from '../behavior-runtime-3d';

// Minimal element/scene builders — we only populate the fields the 3D runtime
// reads, and cast to the GameScene shape the constructor expects.
function el(over: Record<string, unknown>): any {
  return {
    visible: true,
    locked: false,
    tags: [],
    behaviors: [],
    transform: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    ...over,
  };
}

function scene(elements: Record<string, any>, gameState?: any): any {
  return {
    schemaVersion: 1,
    id: 's',
    name: 'test',
    elements,
    layers: [],
    settings: { renderEngine: 'three' },
    gameState,
  };
}

function tick(rt: BehaviorRuntime3D, frames: number, dt = 1 / 60) {
  for (let i = 0; i < frames; i++) rt.tick(dt);
}

const floor = el({
  id: 'floor',
  type: 'box',
  size: { x: 40, y: 1, z: 40 },
  transform: {
    position: { x: 0, y: -0.5, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  },
  tags: ['solid'],
  behaviors: [{ type: 'solid', surfaceTag: 'solid' }],
});

function playerEl(extra: Record<string, unknown> = {}) {
  return el({
    id: 'player',
    type: 'box',
    size: { x: 1, y: 1, z: 1 },
    transform: {
      position: { x: 0, y: 5, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    tags: ['player'],
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
    ...extra,
  });
}

describe('BehaviorRuntime3D', () => {
  it('applies gravity and lands the player on a solid floor', () => {
    const rt = new BehaviorRuntime3D(scene({ floor, player: playerEl() }));
    tick(rt, 240); // ~4s — plenty to fall from y=5 and settle
    const y1 = rt.getState().positions.player.y;
    // Floor top = -0.5 + 0.5 = 0; player half-height 0.5 → center settles ~0.5.
    expect(y1).toBeGreaterThan(0.3);
    expect(y1).toBeLessThan(0.7);
    // Grounded → stable across more frames (doesn't sink through the floor).
    tick(rt, 60);
    expect(Math.abs(rt.getState().positions.player.y - y1)).toBeLessThan(0.05);
  });

  it('moves on the XZ plane: D → +x, W → -z', () => {
    const rt = new BehaviorRuntime3D(scene({ floor, player: playerEl() }));
    tick(rt, 120); // land first
    const start = rt.getState().positions.player;

    rt.setKey('d', true);
    tick(rt, 30);
    rt.setKey('d', false);
    const afterRight = rt.getState().positions.player;
    expect(afterRight.x).toBeGreaterThan(start.x + 0.5);

    rt.setKey('w', true);
    tick(rt, 30);
    rt.setKey('w', false);
    expect(rt.getState().positions.player.z).toBeLessThan(afterRight.z - 0.5);
  });

  it('collects an overlapping pickup and wins on reaching winScore', () => {
    const gem = el({
      id: 'gem',
      type: 'sphere',
      radius: 0.6,
      transform: {
        position: { x: 0, y: 0.5, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      tags: ['pickup'],
      behaviors: [
        { type: 'pickup-on-contact', collectorTag: 'player', scoreDelta: 20, healthDelta: 0, destroyOnPickup: true },
      ],
    });
    // Player starts already on the floor, overlapping the gem.
    const player = playerEl({
      transform: {
        position: { x: 0, y: 0.5, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
    });
    const rt = new BehaviorRuntime3D(
      scene({ floor, gem, player }, { initialScore: 0, initialHealth: 3, winScore: 20, winSurviveSec: 0, cameraFollowId: 'player' }),
    );
    tick(rt, 2);
    const s = rt.getState();
    expect(s.score).toBe(20);
    expect(s.positions.gem.alive).toBe(false);
    expect(s.status).toBe('won');
  });

  it('loses when an enemy drains health to zero', () => {
    const enemy = el({
      id: 'enemy',
      type: 'box',
      size: { x: 1, y: 1, z: 1 },
      transform: {
        position: { x: 0, y: 0.5, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      tags: ['enemy'],
      behaviors: [
        { type: 'damage-on-contact', victimTag: 'player', damage: 1, destroySelfOnHit: false, cooldownMs: 0 },
      ],
    });
    const player = playerEl({
      transform: {
        position: { x: 0, y: 0.5, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
    });
    const rt = new BehaviorRuntime3D(
      scene({ floor, enemy, player }, { initialScore: 0, initialHealth: 1, winScore: 0, winSurviveSec: 0 }),
    );
    tick(rt, 2);
    expect(rt.getState().status).toBe('lost');
  });

  it('exposes a follow camera config from the controller', () => {
    const rt = new BehaviorRuntime3D(scene({ floor, player: playerEl() }, { initialScore: 0, initialHealth: 3, winScore: 0, winSurviveSec: 0, cameraFollowId: 'player' }));
    const cam = rt.getCameraConfig();
    expect(cam?.followId).toBe('player');
    expect(cam?.distance).toBe(10);
    expect(cam?.height).toBe(6);
  });
});
