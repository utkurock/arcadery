import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { computeMarqueeHits } from '../marquee-math';

/**
 * Phase 8 SELECT-03 — pure-function marquee math tests.
 *
 * Test setup: orthographic camera at (0, 0, 5) looking at origin, canvas 800×600.
 * Three boxes at known positions: at origin, off to the +x, far away.
 *
 * Marquee rect coordinate system: pixel space, top-left origin. left < right,
 * top < bottom (i.e., top is the smaller y in DOM convention).
 */

function makeCamera(): THREE.OrthographicCamera {
  // Orthographic frustum 10 units wide × 7.5 units tall (matches editor default ratio).
  const cam = new THREE.OrthographicCamera(-5, 5, 3.75, -3.75, 0.1, 100);
  cam.position.set(0, 0, 5);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  return cam;
}

function makeBoxAt(x: number, y: number, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial(),
  );
  mesh.position.set(x, y, z);
  mesh.updateMatrixWorld(true);
  return mesh;
}

describe('Phase 8 — SELECT-03 marquee math (computeMarqueeHits)', () => {
  it('returns ids whose screen AABB intersects the marquee rect', () => {
    const camera = makeCamera();
    const a = makeBoxAt(0, 0); // center of canvas
    const b = makeBoxAt(4, 0); // far right of canvas
    const refs = new Map<string, THREE.Object3D>([
      ['a', a],
      ['b', b],
    ]);
    const getRef = (id: string) => refs.get(id) ?? null;

    // Marquee in the center: 350-450 px wide, 250-350 px tall (canvas 800x600).
    const hits = computeMarqueeHits(
      { left: 350, top: 250, right: 450, bottom: 350 },
      ['a', 'b'],
      camera,
      { width: 800, height: 600 },
      getRef,
    );

    expect(hits.has('a')).toBe(true);
    expect(hits.has('b')).toBe(false);
  });

  it('returns empty set when no element is inside the rect', () => {
    const camera = makeCamera();
    const a = makeBoxAt(0, 0);
    const refs = new Map([['a', a]]);
    const getRef = (id: string) => refs.get(id) ?? null;

    // Marquee in the top-left corner, far from the centered box.
    const hits = computeMarqueeHits(
      { left: 0, top: 0, right: 50, bottom: 50 },
      ['a'],
      camera,
      { width: 800, height: 600 },
      getRef,
    );

    expect(hits.size).toBe(0);
  });

  it('returns ALL ids when the rect covers the whole canvas', () => {
    const camera = makeCamera();
    const a = makeBoxAt(0, 0);
    const b = makeBoxAt(2, 1);
    const c = makeBoxAt(-2, -1);
    const refs = new Map<string, THREE.Object3D>([
      ['a', a],
      ['b', b],
      ['c', c],
    ]);
    const getRef = (id: string) => refs.get(id) ?? null;

    const hits = computeMarqueeHits(
      { left: 0, top: 0, right: 800, bottom: 600 },
      ['a', 'b', 'c'],
      camera,
      { width: 800, height: 600 },
      getRef,
    );

    expect(hits.size).toBe(3);
  });

  it('intersection (not containment): ids whose box only partially overlaps the rect ARE included', () => {
    const camera = makeCamera();
    const a = makeBoxAt(0, 0); // box AABB spans roughly x=[-0.5..0.5], y=[-0.5..0.5]
    const refs = new Map([['a', a]]);
    const getRef = (id: string) => refs.get(id) ?? null;

    // Marquee that clips through the box's right edge (covers only the right half).
    // The box projects to roughly screen-x 360-440 at center y 270-330.
    // A marquee from 410-700, 100-500 partially overlaps.
    const hits = computeMarqueeHits(
      { left: 410, top: 100, right: 700, bottom: 500 },
      ['a'],
      camera,
      { width: 800, height: 600 },
      getRef,
    );

    // Figma convention: partial overlap counts.
    expect(hits.has('a')).toBe(true);
  });

  it('skips ids whose getRef returns null (deleted between marquee start and now)', () => {
    const camera = makeCamera();
    const a = makeBoxAt(0, 0);
    const refs = new Map<string, THREE.Object3D>([['a', a]]);
    // 'b' has no ref — simulates an element deleted mid-marquee.
    const getRef = (id: string) => refs.get(id) ?? null;

    const hits = computeMarqueeHits(
      { left: 0, top: 0, right: 800, bottom: 600 },
      ['a', 'b'],
      camera,
      { width: 800, height: 600 },
      getRef,
    );

    expect(hits.has('a')).toBe(true);
    expect(hits.has('b')).toBe(false); // gracefully skipped, not crashed
  });
});
