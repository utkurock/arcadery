import * as THREE from 'three';

interface MarqueeRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface CanvasSize {
  width: number;
  height: number;
}

/**
 * Phase 8 SELECT-03 — Pure-function marquee intersection math.
 *
 * For each id, project the element's world-space AABB to screen space and test
 * intersection against the marquee rect. Pure: no DOM, no R3F context, no
 * mutation of inputs. Suitable for a Vitest unit test with stub refs and an
 * OrthographicCamera created in-test.
 *
 * Algorithm (per UI-SPEC line 230-241 + RESEARCH.md "Marquee intersection algorithm"):
 *   1. Get world-space AABB via Box3.setFromObject(obj).
 *   2. Project all 8 AABB corners to NDC via Vector3.project(camera).
 *   3. Convert NDC to screen pixels: x = (v.x * 0.5 + 0.5) * width, y = (-v.y * 0.5 + 0.5) * height.
 *   4. Build screen-space AABB from the projected corners.
 *   5. Test intersection against marquee rect (Figma convention: partial overlap counts).
 *
 * Performance: ~8 matrix-multiplies per element per call. <100 elements typical
 * = invisible cost (~800 ops, well within Three.js's 1M-ops-in-16ms budget).
 *
 * @param marqueeRect - Screen-space rect with left/top/right/bottom in pixels
 * @param elementIds - Ids to test (typically Object.keys(scene.elements))
 * @param camera - THREE.Camera (orthographic for editor 2D, perspective for 3D)
 * @param canvasSize - Canvas pixel size for NDC→screen conversion
 * @param getRef - Lookup function: id → Object3D | null | undefined. Returning
 *                falsy skips that id (handles "element deleted between marquee
 *                start and now"; element-refs.ts returns Object3D | undefined
 *                so we accept both).
 * @returns Set of ids whose screen-space AABB intersects marqueeRect
 */
export function computeMarqueeHits(
  marqueeRect: MarqueeRect,
  elementIds: string[],
  camera: THREE.Camera,
  canvasSize: CanvasSize,
  getRef: (id: string) => THREE.Object3D | null | undefined,
): Set<string> {
  const hits = new Set<string>();
  const v = new THREE.Vector3();
  const box = new THREE.Box3();

  for (const id of elementIds) {
    const obj = getRef(id);
    if (!obj) continue;

    box.setFromObject(obj);
    if (box.isEmpty()) continue;

    let sLeft = Infinity;
    let sTop = Infinity;
    let sRight = -Infinity;
    let sBot = -Infinity;

    // Project all 8 AABB corners to screen space.
    for (let i = 0; i < 8; i++) {
      v.set(
        i & 1 ? box.max.x : box.min.x,
        i & 2 ? box.max.y : box.min.y,
        i & 4 ? box.max.z : box.min.z,
      ).project(camera);
      const sx = (v.x * 0.5 + 0.5) * canvasSize.width;
      const sy = (-v.y * 0.5 + 0.5) * canvasSize.height;
      if (sx < sLeft) sLeft = sx;
      if (sy < sTop) sTop = sy;
      if (sx > sRight) sRight = sx;
      if (sy > sBot) sBot = sy;
    }

    // Figma convention: AABB intersection (partial overlap counts).
    const intersects = !(
      sRight < marqueeRect.left ||
      sLeft > marqueeRect.right ||
      sBot < marqueeRect.top ||
      sTop > marqueeRect.bottom
    );
    if (intersects) hits.add(id);
  }

  return hits;
}
