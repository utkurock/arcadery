import * as THREE from 'three';

// Persistent tire skid marks behind a rear wheel.
//
// Implementation: a fixed-capacity ring of vertex pairs (left/right edge of
// the tire's strip). Each frame the renderer calls `step(...)` with the
// current world-space wheel position and a 0..1 intensity. The vertex's alpha
// attribute is written from intensity, and all alphas decay over time so old
// marks gracefully fade out. When intensity is 0 (not drifting / off-road),
// the alpha sinks immediately, which breaks the visual line between drift
// sessions without any extra session-tracking bookkeeping.
//
// The ring's "wrap" segment (last → first) is intentionally omitted from the
// index buffer, so when the head pointer rolls over there is no long phantom
// line drawn back across the trail.

export class SkidTrail {
  private readonly capacity: number;
  private readonly width: number;
  private head = 0;
  private readonly positions: Float32Array;
  private readonly alphas: Float32Array;
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.ShaderMaterial;
  readonly mesh: THREE.Mesh;

  constructor(capacity = 220, width = 0.45) {
    this.width = width;
    this.capacity = capacity;
    // 2 vertices per ring slot — the left and right edge of the tire mark.
    this.positions = new Float32Array(capacity * 2 * 3);
    this.alphas = new Float32Array(capacity * 2);

    // Two triangles per segment, segments 0..capacity-2 (skip wrap).
    const indices = new Uint16Array((capacity - 1) * 6);
    for (let i = 0; i < capacity - 1; i++) {
      const a = i * 2;
      const b = i * 2 + 1;
      const c = (i + 1) * 2;
      const d = (i + 1) * 2 + 1;
      indices[i * 6 + 0] = a;
      indices[i * 6 + 1] = b;
      indices[i * 6 + 2] = c;
      indices[i * 6 + 3] = b;
      indices[i * 6 + 4] = d;
      indices[i * 6 + 5] = c;
    }

    this.geometry = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(this.positions, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position', posAttr);
    const alphaAttr = new THREE.BufferAttribute(this.alphas, 1);
    alphaAttr.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('alpha', alphaAttr);
    this.geometry.setIndex(new THREE.BufferAttribute(indices, 1));

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader: `
        attribute float alpha;
        varying float vAlpha;
        void main() {
          vAlpha = alpha;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        void main() {
          if (vAlpha < 0.02) discard;
          gl_FragColor = vec4(0.03, 0.03, 0.04, vAlpha * 0.6);
        }
      `,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1; // Draw above the road but below the cars.
  }

  step(
    dt: number,
    cx: number,
    cz: number,
    tangentX: number,
    tangentZ: number,
    intensity: number,
  ): void {
    // Decay all alphas — chosen so a fully-bright mark fades out over ~2.2s,
    // which is shorter than the ring period (220 slots / 60fps ≈ 3.7s) so the
    // oldest data is already invisible by the time we overwrite it.
    const decay = Math.exp(-1.4 * dt);
    for (let i = 0; i < this.alphas.length; i++) this.alphas[i] *= decay;

    // Lateral offset for the trail edges (perpendicular to motion tangent).
    // Tangent is (tangentX, tangentZ); perpendicular in XZ is (-tangentZ, tangentX).
    const nx = -tangentZ * this.width;
    const nz = tangentX * this.width;

    const off = this.head * 6;
    this.positions[off + 0] = cx + nx;
    this.positions[off + 1] = 0.025;
    this.positions[off + 2] = cz + nz;
    this.positions[off + 3] = cx - nx;
    this.positions[off + 4] = 0.025;
    this.positions[off + 5] = cz - nz;

    const clamped = intensity < 0 ? 0 : intensity > 1 ? 1 : intensity;
    this.alphas[this.head * 2] = clamped;
    this.alphas[this.head * 2 + 1] = clamped;

    this.head = (this.head + 1) % this.capacity;

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.alpha.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
