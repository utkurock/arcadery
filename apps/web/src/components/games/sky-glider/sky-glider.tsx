'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Trophy, X } from 'lucide-react';
import {
  LeaderboardModal,
  type LeaderboardConfig,
} from '@/components/games/_shared/leaderboard-modal';
import type { GameContext } from '@/components/games/_shared/entry-gate';

// Sky Glider — Tron-style wingsuit through a procedural neon canyon.
//
// Coordinate frame:
//   +Z is forward; the glider auto-advances in +Z and its world position is
//   what scrolls obstacles past the camera. Up is +Y. The canyon centerline
//   sways gently in X via low-frequency noise so the world isn't a tunnel.
//
// Render strategy:
//   We never grow the world — ridge walls are two `Mesh`es with vertex Z
//   running 0..CANYON_LEN; we recycle ring/spike/current props in a single
//   pool that gets re-seeded ahead of the player when it falls behind.
//
// Mechanics:
//   - banking (A/D) yaws + rolls the glider, pitch (W/S) climbs/dives.
//   - holding Space burns BOOST_STAMINA for extra forward velocity; regen
//     when not boosting.
//   - flying through a glowing ring = +ring score + combo, current combo
//     multiplies the per-meter distance score and gives a small boost.
//   - clipping a wall or a spike pillar = lose health (3 hits) + reset combo.

const CANYON_LEN = 600;
const RING_GAP = 22;
const SPIKE_GAP = 60;
const CURRENT_GAP = 90;
const RING_RADIUS = 4.4;
const PLAYER_LOCK_RADIUS = 0.55;
const BASE_SPEED = 32;
const MAX_SPEED = 78;
const BOOST_DRAIN = 0.55;
const BOOST_REGEN = 0.32;

interface RunUi {
  status: 'playing' | 'lost';
  distanceM: number;
  combo: number;
  comboMax: number;
  bestM: number;
  health: number;
  boost: number;
  speedKmh: number;
}

const INITIAL_UI: RunUi = {
  status: 'playing',
  distanceM: 0,
  combo: 0,
  comboMax: 0,
  bestM: 0,
  health: 3,
  boost: 1,
  speedKmh: 0,
};

interface Prop {
  mesh: THREE.Mesh;
  z: number;
  kind: 'ring' | 'spike' | 'current';
  scored: boolean;
}

interface SkyGliderProps {
  gameContext: GameContext;
  onExit?: () => void;
}

const LEADERBOARD_CONFIG: LeaderboardConfig = {
  gameKey: 'sky-glider',
  title: 'Sky Glider — top pilots',
  primaryLabel: 'Distance',
  primaryField: 'distance_m',
  secondaryLabel: 'Best combo',
  secondaryField: 'combo_max',
  formatPrimary: (v: number) => `${v.toLocaleString()}m`,
};

export function SkyGlider({ gameContext, onExit }: SkyGliderProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [ui, setUi] = useState<RunUi>(INITIAL_UI);
  const [runId, setRunId] = useState(0);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const gameStartRef = useRef<number>(performance.now());
  const inputRef = useRef({ left: 0, right: 0, up: 0, down: 0, boost: 0 });

  useEffect(() => {
    if (ui.status !== 'lost' || submitted) return;
    setSubmitted(true);
    const durationSec = Math.max(0, (performance.now() - gameStartRef.current) / 1000);
    fetch('/api/games/sky-glider/scores', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        wallet: gameContext.wallet,
        distanceM: ui.distanceM,
        comboMax: ui.comboMax,
        durationSec,
        entrySignature: gameContext.entrySignature,
      }),
    }).catch((err) => console.warn('sky-glider score submit failed', err));
  }, [ui.status, ui.distanceM, ui.comboMax, submitted, gameContext]);

  useEffect(() => {
    gameStartRef.current = performance.now();
    setSubmitted(false);
  }, [runId]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05070f);
    // Distance fog blends ridges into the void — gives the canyon depth and
    // hides ring/spike spawning at the seam.
    scene.fog = new THREE.FogExp2(0x0a1130, 0.012);

    const camera = new THREE.PerspectiveCamera(
      72,
      mount.clientWidth / mount.clientHeight,
      0.1,
      400,
    );

    // ─── Lights ─────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0x404a8a, 0.55));
    const hemi = new THREE.HemisphereLight(0x8be9ff, 0x301a6a, 0.55);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff0e6, 0.95);
    sun.position.set(40, 70, -30);
    scene.add(sun);

    // ─── Canyon walls ────────────────────────────────────────────────────
    // Two long ridge meshes, one per side. We push vertices outward in X by a
    // procedural noise so each side has unique silhouettes. The Z extent runs
    // 0..CANYON_LEN; we shift the meshes along Z whenever the player crosses
    // a multiple of CANYON_LEN — the world wraps.
    const wallGeometry = (sign: 1 | -1): THREE.BufferGeometry => {
      const segmentsZ = 200;
      const segmentsY = 12;
      const geo = new THREE.PlaneGeometry(CANYON_LEN, 28, segmentsZ, segmentsY);
      geo.rotateY(sign === 1 ? -Math.PI / 2 : Math.PI / 2);
      const pos = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const z = pos.getZ(i);
        const y = pos.getY(i);
        // Low-frequency canyon width sway + jagged ridge edge.
        const sway = Math.sin(z * 0.05) * 1.6 + Math.sin(z * 0.013) * 3.2;
        const ridge = Math.sin(z * 0.31 + sign * 1.7) * 1.1 + Math.cos(z * 0.17) * 0.8;
        const heightFactor = 1 - Math.abs(y) / 14;
        const x = sign * (9 + sway + ridge * heightFactor);
        pos.setX(i, x);
      }
      geo.computeVertexNormals();
      return geo;
    };
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x140a3a,
      emissive: 0x3a1d8a,
      emissiveIntensity: 0.55,
      metalness: 0.1,
      roughness: 0.65,
      side: THREE.DoubleSide,
      flatShading: true,
    });
    const leftWall = new THREE.Mesh(wallGeometry(-1), wallMat);
    const rightWall = new THREE.Mesh(wallGeometry(1), wallMat);
    leftWall.position.z = CANYON_LEN / 2;
    rightWall.position.z = CANYON_LEN / 2;
    scene.add(leftWall, rightWall);

    // Glowing grid lines down each ridge edge — fakes a Tron grid effect
    // without paying for a custom shader.
    const ridgeLineMat = new THREE.LineBasicMaterial({
      color: 0x67e8f9,
      transparent: true,
      opacity: 0.75,
    });
    const makeRidgeLine = (sign: 1 | -1, yOffset: number) => {
      const pts: THREE.Vector3[] = [];
      const stepZ = 4;
      for (let z = 0; z <= CANYON_LEN; z += stepZ) {
        const sway = Math.sin(z * 0.05) * 1.6 + Math.sin(z * 0.013) * 3.2;
        const ridge = Math.sin(z * 0.31 + sign * 1.7) * 1.1;
        pts.push(new THREE.Vector3(sign * (9 + sway + ridge), yOffset, z));
      }
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.Line(g, ridgeLineMat);
      return line;
    };
    const ridges: THREE.Line[] = [
      makeRidgeLine(-1, 9),
      makeRidgeLine(-1, -6),
      makeRidgeLine(1, 9),
      makeRidgeLine(1, -6),
    ];
    ridges.forEach((r) => scene.add(r));

    // Floor — a strip of ground a few meters below the canyon centerline so
    // dives feel risky; we use simple tinted plane with horizontal scrolling
    // emissive lines.
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x080419,
      emissive: 0x1a1145,
      emissiveIntensity: 0.4,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, CANYON_LEN), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -8;
    floor.position.z = CANYON_LEN / 2;
    scene.add(floor);

    // Sky — pure void, but we add some distant point-lights as fake stars.
    for (let i = 0; i < 80; i++) {
      const star = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 4, 4),
        new THREE.MeshBasicMaterial({ color: 0xc7d2fe }),
      );
      star.position.set(
        (Math.random() - 0.5) * 120,
        18 + Math.random() * 50,
        Math.random() * CANYON_LEN,
      );
      scene.add(star);
    }

    // ─── Glider ──────────────────────────────────────────────────────────
    const gliderGroup = new THREE.Group();
    // Body — flattened diamond.
    const bodyGeo = new THREE.ConeGeometry(0.6, 2.2, 4);
    bodyGeo.rotateX(Math.PI / 2);
    bodyGeo.scale(1, 0.4, 1);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x67e8f9,
      emissive: 0x0e7490,
      emissiveIntensity: 0.9,
      metalness: 0.6,
      roughness: 0.25,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    gliderGroup.add(body);
    // Wings — thin extruded triangles.
    const wingGeo = new THREE.BufferGeometry();
    const wingVerts = new Float32Array([
      0, 0, 0,
      2.4, 0, -0.7,
      0.8, 0, -1.2,
      0, 0, 0,
      -2.4, 0, -0.7,
      -0.8, 0, -1.2,
    ]);
    wingGeo.setAttribute('position', new THREE.BufferAttribute(wingVerts, 3));
    wingGeo.computeVertexNormals();
    const wingMat = new THREE.MeshStandardMaterial({
      color: 0x312e81,
      emissive: 0x6366f1,
      emissiveIntensity: 1.1,
      metalness: 0.4,
      roughness: 0.3,
      side: THREE.DoubleSide,
    });
    const wings = new THREE.Mesh(wingGeo, wingMat);
    gliderGroup.add(wings);
    // Tail flare.
    const flare = new THREE.Mesh(
      new THREE.ConeGeometry(0.3, 1.4, 12),
      new THREE.MeshBasicMaterial({ color: 0xfde047, transparent: true, opacity: 0.95 }),
    );
    flare.rotation.x = -Math.PI / 2;
    flare.position.z = -1.6;
    gliderGroup.add(flare);
    scene.add(gliderGroup);

    // ─── Materials for spawned props ────────────────────────────────────
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0xfde047,
      emissive: 0xfde047,
      emissiveIntensity: 1.6,
      metalness: 0.6,
      roughness: 0.2,
    });
    const ringMatScored = new THREE.MeshStandardMaterial({
      color: 0x86efac,
      emissive: 0x16a34a,
      emissiveIntensity: 0.7,
      transparent: true,
      opacity: 0.4,
    });
    const spikeMat = new THREE.MeshStandardMaterial({
      color: 0xf43f5e,
      emissive: 0x9f1239,
      emissiveIntensity: 1.0,
      metalness: 0.4,
      roughness: 0.3,
    });
    const currentMat = new THREE.MeshStandardMaterial({
      color: 0x22d3ee,
      emissive: 0x0ea5b7,
      emissiveIntensity: 0.9,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
    });

    // ─── Prop spawning ──────────────────────────────────────────────────
    const props: Prop[] = [];

    // The world's centerline X position at a given z (drives where rings spawn).
    const centerlineX = (z: number): number => {
      return Math.sin(z * 0.03) * 1.6 + Math.sin(z * 0.011) * 2.6;
    };

    const makeRing = (z: number): Prop => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(RING_RADIUS, 0.18, 8, 28),
        ringMat,
      );
      ring.position.set(centerlineX(z), 1.5 + Math.sin(z * 0.07) * 1.2, z);
      ring.rotation.y = Math.PI / 2;
      scene.add(ring);
      return { mesh: ring, z, kind: 'ring', scored: false };
    };
    const makeSpike = (z: number): Prop => {
      const spike = new THREE.Mesh(
        new THREE.ConeGeometry(0.8, 6 + Math.random() * 4, 8),
        spikeMat,
      );
      const fromCeiling = Math.random() < 0.45;
      const side = Math.sign(Math.random() - 0.5) || 1;
      const x = centerlineX(z) + side * (2 + Math.random() * 2);
      spike.position.set(x, fromCeiling ? 7 : -3, z);
      spike.rotation.x = fromCeiling ? Math.PI : 0;
      spike.userData.fromCeiling = fromCeiling;
      scene.add(spike);
      return { mesh: spike, z, kind: 'spike', scored: false };
    };
    const makeCurrent = (z: number): Prop => {
      const current = new THREE.Mesh(
        new THREE.CylinderGeometry(2.2, 2.2, 14, 16, 1, true),
        currentMat,
      );
      current.rotation.x = Math.PI / 2;
      current.position.set(centerlineX(z), 1.0, z);
      scene.add(current);
      return { mesh: current, z, kind: 'current', scored: false };
    };

    let nextRingZ = 40;
    let nextSpikeZ = 80;
    let nextCurrentZ = 130;
    const spawnAhead = (untilZ: number) => {
      while (nextRingZ < untilZ) {
        props.push(makeRing(nextRingZ));
        nextRingZ += RING_GAP + Math.random() * 8;
      }
      while (nextSpikeZ < untilZ) {
        props.push(makeSpike(nextSpikeZ));
        nextSpikeZ += SPIKE_GAP + Math.random() * 30;
      }
      while (nextCurrentZ < untilZ) {
        props.push(makeCurrent(nextCurrentZ));
        nextCurrentZ += CURRENT_GAP + Math.random() * 40;
      }
    };

    // ─── Particle trail ──────────────────────────────────────────────────
    const trailCount = 80;
    const trailGeo = new THREE.BufferGeometry();
    const trailPos = new Float32Array(trailCount * 3);
    const trailAlpha = new Float32Array(trailCount);
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
    trailGeo.setAttribute('alpha', new THREE.BufferAttribute(trailAlpha, 1));
    const trailMat = new THREE.PointsMaterial({
      color: 0xfde047,
      size: 0.35,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const trail = new THREE.Points(trailGeo, trailMat);
    scene.add(trail);
    let trailHead = 0;
    const pushTrail = (x: number, y: number, z: number) => {
      const i = trailHead;
      trailPos[i * 3] = x;
      trailPos[i * 3 + 1] = y;
      trailPos[i * 3 + 2] = z;
      trailAlpha[i] = 1;
      trailHead = (trailHead + 1) % trailCount;
      trailGeo.attributes.position.needsUpdate = true;
    };

    // ─── State ──────────────────────────────────────────────────────────
    const player = {
      x: 0,
      y: 1,
      z: 8,
      vx: 0,
      vy: 0,
      vz: BASE_SPEED,
      roll: 0,
      pitch: 0,
      yaw: 0,
    };
    let health = 3;
    let boost = 1;
    let speed = BASE_SPEED;
    let distance = 0;
    let combo = 0;
    let comboMax = 0;
    let comboDecay = 0;
    let invuln = 0;
    let bestM = 0;
    try {
      bestM = Number(localStorage.getItem('arcadery:sky-glider:best') ?? 0);
    } catch {}
    let status: 'playing' | 'lost' = 'playing';
    let shake = 0;
    let worldWraps = 0;

    spawnAhead(player.z + 220);

    // ─── Input ──────────────────────────────────────────────────────────
    const keys = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)
      ) {
        e.preventDefault();
      }
      keys.add(e.key.toLowerCase());
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // ─── Resize ─────────────────────────────────────────────────────────
    const onResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    onResize();
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    // ─── Loop ───────────────────────────────────────────────────────────
    let last = performance.now();
    let lastUi = 0;
    let raf = 0;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      const input = inputRef.current;
      const left = (keys.has('a') || keys.has('arrowleft') ? 1 : 0) + input.left;
      const right = (keys.has('d') || keys.has('arrowright') ? 1 : 0) + input.right;
      const up = (keys.has('w') || keys.has('arrowup') ? 1 : 0) + input.up;
      const down = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) + input.down;
      const boostBtn =
        (keys.has(' ') || keys.has('shift') ? 1 : 0) + input.boost;

      if (status === 'playing') {
        // ── Steering ───────────────────────────────────────────────────
        const lateralAccel = 32;
        const verticalAccel = 26;
        player.vx += (-left + right) * lateralAccel * dt;
        player.vy += (-down + up) * verticalAccel * dt;
        player.vx *= 0.94;
        player.vy *= 0.92;
        player.roll = THREE.MathUtils.lerp(player.roll, (right - left) * 0.6, 0.1);
        player.pitch = THREE.MathUtils.lerp(player.pitch, (down - up) * 0.4, 0.12);

        // ── Boost ──────────────────────────────────────────────────────
        const wantBoost = boostBtn > 0.1 && boost > 0.05;
        if (wantBoost) {
          boost = Math.max(0, boost - BOOST_DRAIN * dt);
          speed = THREE.MathUtils.damp(speed, MAX_SPEED, 4.5, dt);
        } else {
          boost = Math.min(1, boost + BOOST_REGEN * dt);
          speed = THREE.MathUtils.damp(speed, BASE_SPEED + combo * 1.2, 3, dt);
        }
        player.vz = speed;

        // ── Integrate ──────────────────────────────────────────────────
        player.x += player.vx * dt;
        player.y += player.vy * dt;
        player.z += player.vz * dt;
        distance += player.vz * dt;

        // Soft canyon containment — push the glider back if it wanders too
        // far from the centerline. Past CRASH_RADIUS we count it as a wall.
        const cx = centerlineX(player.z);
        const dx = player.x - cx;
        const SOFT = 7;
        const CRASH = 9.2;
        if (Math.abs(dx) > SOFT) {
          const push = (Math.abs(dx) - SOFT) * 9;
          player.vx -= Math.sign(dx) * push * dt;
        }
        if (Math.abs(dx) > CRASH || player.y > 9 || player.y < -7) {
          // Wall slam.
          if (invuln <= 0) {
            health -= 1;
            invuln = 1.5;
            shake = 26;
            combo = 0;
            // Push the glider back toward center.
            player.vx += -Math.sign(dx) * 30;
            if (player.y > 9) player.vy -= 25;
            if (player.y < -7) player.vy += 25;
            if (health <= 0) status = 'lost';
          }
        }

        // ── Combo decay ────────────────────────────────────────────────
        comboDecay -= dt;
        if (comboDecay <= 0) combo = 0;
        invuln = Math.max(0, invuln - dt);

        // ── Spawn / despawn props ──────────────────────────────────────
        spawnAhead(player.z + 220);
        for (let i = props.length - 1; i >= 0; i--) {
          const p = props[i];
          if (p.z < player.z - 30) {
            scene.remove(p.mesh);
            props.splice(i, 1);
            continue;
          }
          // Idle motion: rings + currents spin.
          if (p.kind === 'ring') {
            p.mesh.rotation.z += dt * 0.6;
          } else if (p.kind === 'current') {
            (p.mesh.material as THREE.Material).opacity =
              0.28 + Math.sin(now * 0.004 + p.z) * 0.08;
          }
          // Hit testing.
          if (!p.scored && Math.abs(p.z - player.z) < 1.4) {
            if (p.kind === 'ring') {
              const ringPos = (p.mesh.position as THREE.Vector3);
              const rdx = player.x - ringPos.x;
              const rdy = player.y - ringPos.y;
              const r = Math.hypot(rdx, rdy);
              if (r < RING_RADIUS - PLAYER_LOCK_RADIUS) {
                p.scored = true;
                p.mesh.material = ringMatScored;
                combo += 1;
                comboMax = Math.max(comboMax, combo);
                comboDecay = 4;
                shake = Math.min(8, shake + 3);
                boost = Math.min(1, boost + 0.12);
                // Score burst — render a quick expanding hoop.
                spawnRingPulse(ringPos.x, ringPos.y, ringPos.z);
              } else if (r < RING_RADIUS + 0.8) {
                // Clipped the rim — tiny shake + minor combo break.
                shake = Math.min(12, shake + 6);
                if (combo > 0) combo = Math.max(0, combo - 1);
              }
            } else if (p.kind === 'spike') {
              const sp = p.mesh.position as THREE.Vector3;
              const sdx = player.x - sp.x;
              const sdy = player.y - sp.y;
              const r = Math.hypot(sdx, sdy);
              const verticalHit = p.mesh.userData.fromCeiling
                ? player.y > sp.y - 4
                : player.y < sp.y + 4;
              if (r < 1.4 && verticalHit && invuln <= 0) {
                p.scored = true;
                health -= 1;
                invuln = 1.5;
                shake = 28;
                combo = 0;
                spawnDebris(sp.x, sp.y, sp.z);
                if (health <= 0) status = 'lost';
              }
            } else if (p.kind === 'current') {
              const sp = p.mesh.position as THREE.Vector3;
              const cdx = player.x - sp.x;
              const cdy = player.y - sp.y;
              if (Math.hypot(cdx, cdy) < 2.4) {
                p.scored = true;
                boost = Math.min(1, boost + 0.25);
                speed = Math.min(MAX_SPEED, speed + 8);
                spawnGlow(sp.x, sp.y, sp.z);
              }
            }
          }
        }

        // ── Trail ──────────────────────────────────────────────────────
        pushTrail(player.x, player.y, player.z - 1.2);
        // Decay alphas (we render with depthWrite false so head + tail blend).
        for (let i = 0; i < trailCount; i++) trailAlpha[i] *= 0.9;

        // ── World wrap ─────────────────────────────────────────────────
        // When the glider crosses CANYON_LEN, we shift the wall meshes and the
        // floor forward — but every other prop carries its own absolute z, so
        // we just translate the long meshes.
        if (player.z > (worldWraps + 1) * CANYON_LEN - 100) {
          // Move walls + floor forward another CANYON_LEN.
          worldWraps += 1;
          leftWall.position.z += CANYON_LEN;
          rightWall.position.z += CANYON_LEN;
          floor.position.z += CANYON_LEN;
          ridges.forEach((r) => (r.position.z += CANYON_LEN));
        }

        if (status === 'lost') {
          bestM = Math.max(bestM, Math.floor(distance));
          try {
            localStorage.setItem('arcadery:sky-glider:best', String(bestM));
          } catch {}
        }
      }

      // ── Glider transform ─────────────────────────────────────────────
      gliderGroup.position.set(player.x, player.y, player.z);
      gliderGroup.rotation.set(player.pitch, 0, -player.roll);

      // ── Camera follow (behind + above, with subtle bank) ────────────
      const targetCamPos = new THREE.Vector3(
        player.x - player.roll * 1.8,
        player.y + 3.4,
        player.z - 9,
      );
      camera.position.lerp(targetCamPos, 0.12);
      camera.lookAt(player.x + player.vx * 0.05, player.y + 0.5, player.z + 16);
      // Apply screen shake by jittering the camera target.
      if (shake > 0) {
        camera.position.x += (Math.random() - 0.5) * shake * 0.04;
        camera.position.y += (Math.random() - 0.5) * shake * 0.04;
      }
      shake *= 0.88;

      // ── Render ──────────────────────────────────────────────────────
      renderer.render(scene, camera);

      // ── UI throttle ─────────────────────────────────────────────────
      if (now - lastUi > 90) {
        lastUi = now;
        const speedKmh = Math.round(speed * 3.6);
        setUi({
          status,
          distanceM: Math.floor(distance),
          combo,
          comboMax,
          bestM: Math.max(bestM, Math.floor(distance)),
          health: Math.max(0, health),
          boost,
          speedKmh,
        });
      }
    };
    raf = requestAnimationFrame(tick);

    // ─── Pulse / debris helpers ─────────────────────────────────────────
    interface Pulse {
      mesh: THREE.Mesh;
      ttl: number;
      maxTtl: number;
    }
    const pulses: Pulse[] = [];
    const spawnRingPulse = (x: number, y: number, z: number) => {
      const m = new THREE.Mesh(
        new THREE.TorusGeometry(RING_RADIUS, 0.08, 6, 24),
        new THREE.MeshBasicMaterial({
          color: 0xfde047,
          transparent: true,
          opacity: 0.9,
          blending: THREE.AdditiveBlending,
        }),
      );
      m.position.set(x, y, z);
      m.rotation.y = Math.PI / 2;
      scene.add(m);
      pulses.push({ mesh: m, ttl: 0.5, maxTtl: 0.5 });
    };
    const spawnDebris = (x: number, y: number, z: number) => {
      for (let i = 0; i < 8; i++) {
        const d = new THREE.Mesh(
          new THREE.TetrahedronGeometry(0.25),
          new THREE.MeshBasicMaterial({ color: 0xf43f5e }),
        );
        d.position.set(
          x + (Math.random() - 0.5) * 1.2,
          y + (Math.random() - 0.5) * 1.2,
          z + (Math.random() - 0.5) * 1.2,
        );
        scene.add(d);
        pulses.push({ mesh: d, ttl: 0.9, maxTtl: 0.9 });
      }
    };
    const spawnGlow = (x: number, y: number, z: number) => {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.6, 8, 8),
        new THREE.MeshBasicMaterial({
          color: 0x22d3ee,
          transparent: true,
          opacity: 0.85,
          blending: THREE.AdditiveBlending,
        }),
      );
      m.position.set(x, y, z);
      scene.add(m);
      pulses.push({ mesh: m, ttl: 0.5, maxTtl: 0.5 });
    };

    // Pulse decay tick — patched into the main loop via setInterval is
    // wasteful; instead piggyback on rAF via a second hook.
    const pulseRaf = () => {
      requestAnimationFrame(pulseRaf);
      for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i];
        p.ttl -= 1 / 60;
        const t = 1 - p.ttl / p.maxTtl;
        const mat = p.mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0, 1 - t);
        p.mesh.scale.setScalar(1 + t * 1.6);
        if (p.ttl <= 0) {
          scene.remove(p.mesh);
          pulses.splice(i, 1);
        }
      }
    };
    pulseRaf();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      ro.disconnect();
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
      // Dispose props.
      for (const p of props) {
        scene.remove(p.mesh);
        if ((p.mesh as THREE.Mesh).geometry)
          (p.mesh as THREE.Mesh).geometry.dispose();
      }
    };
  }, [runId]);

  return (
    <div className="absolute inset-0 bg-[#05070f] overflow-hidden">
      <div ref={mountRef} className="absolute inset-0" />
      <SpeedVignette boost={ui.boost} speedKmh={ui.speedKmh} status={ui.status} />
      <Hud
        ui={ui}
        onRestart={() => {
          setUi(INITIAL_UI);
          setRunId((n) => n + 1);
        }}
        onOpenLeaderboard={() => setShowLeaderboard(true)}
        onExit={onExit}
      />
      <MobileControls inputRef={inputRef} status={ui.status} />
      <LeaderboardModal
        open={showLeaderboard}
        onClose={() => setShowLeaderboard(false)}
        config={LEADERBOARD_CONFIG}
        highlightWallet={gameContext.wallet}
      />
    </div>
  );
}

// ─── HUD ───────────────────────────────────────────────────────────────

function Hud({
  ui,
  onRestart,
  onOpenLeaderboard,
  onExit,
}: {
  ui: RunUi;
  onRestart: () => void;
  onOpenLeaderboard: () => void;
  onExit?: () => void;
}) {
  return (
    <>
      <div className="pointer-events-none absolute top-3 right-3 z-20 flex items-center gap-2 font-mono">
        <button
          type="button"
          onClick={onOpenLeaderboard}
          className="pointer-events-auto inline-flex items-center gap-1 rounded-md border border-amber-300/30 bg-amber-400/10 px-2.5 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-400/20"
        >
          <Trophy className="h-3.5 w-3.5" /> Leaderboard
        </button>
        {onExit && (
          <button
            type="button"
            onClick={() => {
              if (ui.status === 'playing' && ui.health > 0) {
                if (
                  !confirm("Quit now? Your distance for this run won't be recorded.")
                )
                  return;
              }
              onExit();
            }}
            className="pointer-events-auto inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/5 px-2 py-1.5 text-xs text-white/70 hover:bg-white/10"
            aria-label="Exit"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="pointer-events-none absolute top-16 left-4 z-10 flex flex-col gap-2 font-mono text-white">
        <div className="rounded-lg bg-black/60 backdrop-blur px-3 py-2">
          <div className="text-[10px] uppercase tracking-widest text-cyan-200/60">
            Distance
          </div>
          <div className="text-2xl font-bold tabular-nums text-cyan-100">
            {ui.distanceM.toLocaleString()}
            <span className="text-sm text-cyan-200/40">m</span>
          </div>
        </div>
        <div className="rounded-lg bg-black/60 backdrop-blur px-3 py-2">
          <div className="text-[10px] uppercase tracking-widest text-cyan-200/60">
            Best
          </div>
          <div className="text-sm font-bold tabular-nums text-amber-200">
            {ui.bestM.toLocaleString()}m
          </div>
        </div>
      </div>
      <div className="pointer-events-none absolute top-16 right-4 z-10 flex flex-col items-end gap-2 font-mono text-white">
        <div className="rounded-lg bg-black/60 backdrop-blur px-3 py-2 text-right">
          <div className="text-[10px] uppercase tracking-widest text-cyan-200/60">
            Speed
          </div>
          <div className="text-xl font-bold tabular-nums">{ui.speedKmh} km/h</div>
        </div>
        <div className="rounded-lg bg-black/60 backdrop-blur px-3 py-2 text-right">
          <div className="text-[10px] uppercase tracking-widest text-cyan-200/60">
            Wings
          </div>
          <div className="text-xl font-bold tabular-nums text-cyan-100">
            {Array.from({ length: ui.health }).map((_, i) => (
              <span key={i} className="mr-0.5">
                ◆
              </span>
            ))}
            {ui.health === 0 && (
              <span className="text-rose-400 text-sm">—</span>
            )}
          </div>
        </div>
        {ui.combo > 1 && (
          <div className="rounded-lg bg-fuchsia-500/30 backdrop-blur px-3 py-1.5 text-right animate-pulse">
            <span className="text-sm font-bold text-fuchsia-100">{ui.combo}× COMBO</span>
          </div>
        )}
      </div>
      <div className="pointer-events-none absolute left-4 bottom-4 z-10 w-40 font-mono">
        <div className="text-[10px] uppercase tracking-widest text-cyan-200/60 mb-1">
          Boost
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-300 via-rose-400 to-fuchsia-500 transition-[width] duration-100"
            style={{ width: `${Math.round(ui.boost * 100)}%` }}
          />
        </div>
      </div>
      {ui.status === 'lost' && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="rounded-2xl border border-cyan-400/20 bg-[#06090f] p-8 text-center max-w-md font-mono">
            <h2 className="text-4xl font-black mb-2 text-rose-400">SKY DOWN</h2>
            <p className="text-sm text-white/50 mb-4">The canyon won this round.</p>
            <div className="space-y-1 text-sm mb-6 text-white/80">
              <div>
                Distance:{' '}
                <span className="text-cyan-200 font-bold tabular-nums">
                  {ui.distanceM.toLocaleString()}m
                </span>
              </div>
              <div>
                Best run:{' '}
                <span className="text-amber-300 font-bold tabular-nums">
                  {ui.bestM.toLocaleString()}m
                </span>
              </div>
              <div>
                Best combo:{' '}
                <span className="text-white font-bold">{ui.comboMax}×</span>
              </div>
            </div>
            <button
              onClick={onRestart}
              className="rounded-full bg-cyan-500/80 hover:bg-cyan-400 px-6 py-2.5 text-sm font-semibold text-black transition-colors"
            >
              Drop again
            </button>
          </div>
        </div>
      )}
      <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 z-10 text-[10px] uppercase tracking-[0.4em] text-white/30 font-mono">
        WASD steer · Space boost · Ring = combo
      </div>
    </>
  );
}

// Vignette + speedline overlay — pure CSS, no extra render passes.
function SpeedVignette({
  speedKmh,
  boost,
  status,
}: {
  speedKmh: number;
  boost: number;
  status: RunUi['status'];
}) {
  if (status === 'lost') return null;
  // Faster = stronger vignette + radial speed lines.
  const intensity = Math.min(1, Math.max(0, (speedKmh - 100) / 200));
  return (
    <div
      className="pointer-events-none absolute inset-0 z-[5]"
      style={{
        background: `radial-gradient(circle at center, transparent 35%, rgba(0,0,0,${
          0.25 + intensity * 0.45
        }) 100%)`,
        opacity: 1 - boost * 0.05,
      }}
    />
  );
}

function MobileControls({
  inputRef,
  status,
}: {
  inputRef: React.RefObject<{
    left: number;
    right: number;
    up: number;
    down: number;
    boost: number;
  } | null>;
  status: RunUi['status'];
}) {
  if (status !== 'playing') return null;
  const press = (k: 'left' | 'right' | 'up' | 'down' | 'boost', v: number) => {
    if (inputRef.current) inputRef.current[k] = v;
  };
  const Btn = ({
    label,
    k,
    cls,
  }: {
    label: string;
    k: 'left' | 'right' | 'up' | 'down' | 'boost';
    cls?: string;
  }) => (
    <button
      type="button"
      onTouchStart={(e) => {
        e.preventDefault();
        press(k, 1);
      }}
      onTouchEnd={(e) => {
        e.preventDefault();
        press(k, 0);
      }}
      onTouchCancel={() => press(k, 0)}
      className={`select-none rounded-full bg-cyan-500/15 backdrop-blur active:bg-cyan-400/30 border border-cyan-300/30 flex items-center justify-center font-bold text-cyan-100 touch-none ${cls ?? ''}`}
    >
      {label}
    </button>
  );
  return (
    <div className="md:hidden absolute inset-x-0 bottom-0 z-20 pb-6 px-4 pointer-events-none">
      <div className="flex justify-between items-end">
        <div className="grid grid-cols-3 gap-2 pointer-events-auto">
          <span />
          <Btn label="▲" k="up" cls="w-12 h-12" />
          <span />
          <Btn label="◀" k="left" cls="w-12 h-12" />
          <span />
          <Btn label="▶" k="right" cls="w-12 h-12" />
          <span />
          <Btn label="▼" k="down" cls="w-12 h-12" />
          <span />
        </div>
        <div className="pointer-events-auto">
          <Btn
            label="BOOST"
            k="boost"
            cls="w-20 h-20 bg-amber-500/30 border-amber-300/40 text-amber-100 text-sm"
          />
        </div>
      </div>
    </div>
  );
}
