import * as THREE from 'three';

// The track is a closed Catmull-Rom curve of waypoints on the XZ plane.
// Each waypoint has a (x, z) position and an outward normal that defines the
// road width at that segment — letting us widen sweeping corners and choke
// hairpins. The curve is sampled densely once at build time to produce both
// the visible road mesh and a centerline polyline used by the AI driver.

const ROAD_WIDTH = 12;

const CONTROL_POINTS: ReadonlyArray<readonly [number, number]> = [
  [0, 80],
  [40, 70],
  [70, 40],
  [85, 0],
  [70, -40],
  [40, -65],
  [0, -75],
  [-30, -60],
  [-55, -30],
  [-70, 10],
  [-90, 40],
  [-80, 70],
  [-40, 80],
];

export interface TrackData {
  curve: THREE.CatmullRomCurve3;
  centerline: THREE.Vector3[];
  roadMesh: THREE.Mesh;
  kerbMeshes: THREE.Mesh[];
  startPosition: THREE.Vector3;
  startHeading: number;
  finishLineZ: number;
  finishLineDir: THREE.Vector3;
  segmentCount: number;
  checkpoints: { position: THREE.Vector3; index: number }[];
  /** Returns 1 if point is on road surface, 0 if off-road. Falls off smoothly at the edges. */
  surfaceAt: (x: number, z: number) => number;
}

export function buildTrack(): TrackData {
  const points = CONTROL_POINTS.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const curve = new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.5);

  const segments = 400;
  const samples = curve.getSpacedPoints(segments);
  // getSpacedPoints on a closed curve duplicates the last == first point.
  const centerline = samples.slice(0, segments);

  // Build road geometry by extruding the curve laterally.
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < segments; i++) {
    const p = centerline[i];
    const next = centerline[(i + 1) % segments];
    const tangent = new THREE.Vector3().subVectors(next, p).normalize();
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);

    const left = new THREE.Vector3().copy(p).addScaledVector(normal, ROAD_WIDTH / 2);
    const right = new THREE.Vector3().copy(p).addScaledVector(normal, -ROAD_WIDTH / 2);

    positions.push(left.x, 0.01, left.z, right.x, 0.01, right.z);
    uvs.push(0, i / segments, 1, i / segments);
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    const b = i * 2 + 1;
    const c = ((i + 1) % segments) * 2;
    const d = ((i + 1) % segments) * 2 + 1;
    indices.push(a, c, b, b, c, d);
  }

  const roadGeo = new THREE.BufferGeometry();
  roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  roadGeo.setIndex(indices);
  roadGeo.computeVertexNormals();

  const roadMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a1f,
    roughness: 0.95,
    metalness: 0.0,
  });
  const roadMesh = new THREE.Mesh(roadGeo, roadMat);
  roadMesh.receiveShadow = true;

  // Painted lane stripe down the middle — a slim mesh sitting just above the road.
  const stripePositions: number[] = [];
  const stripeIndices: number[] = [];
  const stripeWidth = 0.15;
  for (let i = 0; i < segments; i++) {
    const p = centerline[i];
    const next = centerline[(i + 1) % segments];
    const tangent = new THREE.Vector3().subVectors(next, p).normalize();
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
    const left = new THREE.Vector3().copy(p).addScaledVector(normal, stripeWidth);
    const right = new THREE.Vector3().copy(p).addScaledVector(normal, -stripeWidth);
    stripePositions.push(left.x, 0.02, left.z, right.x, 0.02, right.z);
  }
  // Dashed: include every other segment quad.
  for (let i = 0; i < segments; i += 2) {
    const a = i * 2;
    const b = i * 2 + 1;
    const c = ((i + 1) % segments) * 2;
    const d = ((i + 1) % segments) * 2 + 1;
    stripeIndices.push(a, c, b, b, c, d);
  }
  const stripeGeo = new THREE.BufferGeometry();
  stripeGeo.setAttribute('position', new THREE.Float32BufferAttribute(stripePositions, 3));
  stripeGeo.setIndex(stripeIndices);
  stripeGeo.computeVertexNormals();
  const stripeMesh = new THREE.Mesh(
    stripeGeo,
    new THREE.MeshBasicMaterial({ color: 0xfbbf24 }),
  );
  roadMesh.add(stripeMesh);

  // Red/white kerbs hug the inner and outer edges of every corner.
  const kerbMeshes: THREE.Mesh[] = [];
  for (let side = -1; side <= 1; side += 2) {
    const kerbPositions: number[] = [];
    const kerbColors: number[] = [];
    const kerbIndices: number[] = [];
    for (let i = 0; i < segments; i++) {
      const p = centerline[i];
      const next = centerline[(i + 1) % segments];
      const tangent = new THREE.Vector3().subVectors(next, p).normalize();
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
      const inner = new THREE.Vector3().copy(p).addScaledVector(normal, (side * ROAD_WIDTH) / 2);
      const outer = new THREE.Vector3()
        .copy(p)
        .addScaledVector(normal, (side * (ROAD_WIDTH / 2 + 0.5)));
      kerbPositions.push(inner.x, 0.05, inner.z, outer.x, 0.05, outer.z);
      const isRed = Math.floor(i / 6) % 2 === 0;
      const r = isRed ? 1.0 : 1.0;
      const g = isRed ? 0.15 : 1.0;
      const b = isRed ? 0.2 : 1.0;
      kerbColors.push(r, g, b, r, g, b);
    }
    for (let i = 0; i < segments; i++) {
      const a = i * 2;
      const b = i * 2 + 1;
      const c = ((i + 1) % segments) * 2;
      const d = ((i + 1) % segments) * 2 + 1;
      kerbIndices.push(a, c, b, b, c, d);
    }
    const kerbGeo = new THREE.BufferGeometry();
    kerbGeo.setAttribute('position', new THREE.Float32BufferAttribute(kerbPositions, 3));
    kerbGeo.setAttribute('color', new THREE.Float32BufferAttribute(kerbColors, 3));
    kerbGeo.setIndex(kerbIndices);
    kerbGeo.computeVertexNormals();
    const kerbMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.7,
      metalness: 0.0,
    });
    const kerb = new THREE.Mesh(kerbGeo, kerbMat);
    kerb.receiveShadow = true;
    kerbMeshes.push(kerb);
  }

  // Race start is at centerline[0]; heading is along the tangent there.
  const startPos = centerline[0].clone();
  const startTangent = new THREE.Vector3()
    .subVectors(centerline[1], centerline[0])
    .normalize();
  const startHeading = Math.atan2(startTangent.x, startTangent.z);

  const checkpoints = [];
  const checkpointEvery = 40;
  for (let i = 0; i < segments; i += checkpointEvery) {
    checkpoints.push({ position: centerline[i].clone(), index: i });
  }

  // Fast off-road test: walk every centerline sample, find the closest one,
  // then check perpendicular distance. We pre-bucket points into a coarse
  // hash grid so the per-frame query is O(1) rather than O(segments).
  const cellSize = 20;
  const grid = new Map<string, number[]>();
  const key = (x: number, z: number) =>
    `${Math.floor(x / cellSize)}:${Math.floor(z / cellSize)}`;
  centerline.forEach((p, i) => {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const k = key(p.x + dx * cellSize, p.z + dz * cellSize);
        const bucket = grid.get(k) ?? [];
        bucket.push(i);
        grid.set(k, bucket);
      }
    }
  });

  const surfaceAt = (x: number, z: number): number => {
    const bucket = grid.get(key(x, z));
    if (!bucket) return 0;
    let best = Infinity;
    for (const i of bucket) {
      const p = centerline[i];
      const dx = p.x - x;
      const dz = p.z - z;
      const d = dx * dx + dz * dz;
      if (d < best) best = d;
    }
    const dist = Math.sqrt(best);
    // Smooth falloff over the last 1m of the road so the edge isn't a hard step.
    if (dist <= ROAD_WIDTH / 2 - 0.5) return 1;
    if (dist >= ROAD_WIDTH / 2 + 0.5) return 0;
    return 1 - (dist - (ROAD_WIDTH / 2 - 0.5)) / 1.0;
  };

  return {
    curve,
    centerline,
    roadMesh,
    kerbMeshes,
    startPosition: startPos,
    startHeading,
    finishLineZ: startPos.z,
    finishLineDir: startTangent,
    segmentCount: segments,
    checkpoints,
    surfaceAt,
  };
}

export const ROAD_HALF_WIDTH = ROAD_WIDTH / 2;
