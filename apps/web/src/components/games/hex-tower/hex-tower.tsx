'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Trophy, X } from 'lucide-react';
import {
  LeaderboardModal,
  type LeaderboardConfig,
} from '@/components/games/_shared/leaderboard-modal';
import type { GameContext } from '@/components/games/_shared/entry-gate';
import { gameAudio } from '@/components/games/_shared/audio';
import {
  MuteButton,
  PauseButton,
  PauseOverlay,
  usePauseKey,
} from '@/components/games/_shared/game-chrome';

// Hex Tower — pastel-isometric vertical platformer.
//
// Concept:
//   The player stands on hexagonal tiles arranged in concentric rings around
//   a central spire. Tiles spawn at increasing Y. They are colored by kind:
//     • normal (cream)         — solid, persists.
//     • combo  (mint)          — +1 combo on land + small boost.
//     • boost  (peach)         — launches the player upward (super jump).
//     • brittle (rose)         — crumbles ~0.5s after the first landing.
//     • phase  (sky)           — blinks in and out; only solid while lit.
//   Gravity always pulls down. Goal is to climb as high as possible without
//   falling off the tower (you die if your Y drops more than DROP_DEATH below
//   your best Y so far).
//
// Coordinate frame: world space, +Y up. Camera orbits at a fixed offset.
//
// Render path:
//   Tile pool of N tiles re-used as the player rises. When a tile drops below
//   player.y - PRUNE_BELOW we move it to the next spawn band above. Camera
//   yaws slowly to give Monument-Valley parallax without needing post-FX.

const HEX_R = 1.4; // tile radius (flat-top hex)
const HEX_GAP = 0.18; // gap between tiles in a ring
const RING_RADIUS = 6.5; // distance from spire to center of a tile ring
const RING_COUNT = 8; // tiles per ring
const RING_VERTICAL_STEP = 2.4; // Y step between ring bands
const PRUNE_BELOW = 30;
const SPAWN_AHEAD = 24;
const GRAVITY = 28;
const JUMP_VEL = 11;
const BOOST_JUMP_VEL = 18;
const MOVE_ACCEL = 28;
const MAX_HORIZ_SPEED = 9;
const DROP_DEATH = 9;

interface RunUi {
  status: 'playing' | 'lost';
  heightM: number;
  combo: number;
  comboMax: number;
  bestM: number;
  speedKmh: number;
}

const INITIAL_UI: RunUi = {
  status: 'playing',
  heightM: 0,
  combo: 0,
  comboMax: 0,
  bestM: 0,
  speedKmh: 0,
};

type TileKind = 'normal' | 'combo' | 'boost' | 'brittle' | 'phase';

interface Tile {
  mesh: THREE.Mesh;
  position: THREE.Vector3;
  kind: TileKind;
  landedAt: number; // -1 if not yet landed
  spawned: boolean;
  ring: number;
  slot: number;
  solid: boolean; // phase tiles toggle this; everything else stays true
}

interface HexTowerProps {
  gameContext: GameContext;
  onExit?: () => void;
}

const LEADERBOARD_CONFIG: LeaderboardConfig = {
  gameKey: 'hex-tower',
  title: 'Hex Tower — top climbers',
  primaryLabel: 'Height',
  primaryField: 'height_m',
  secondaryLabel: 'Best combo',
  secondaryField: 'combo_max',
  formatPrimary: (v: number) => `${v.toLocaleString()}m`,
};

export function HexTower({ gameContext, onExit }: HexTowerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [ui, setUi] = useState<RunUi>(INITIAL_UI);
  const [runId, setRunId] = useState(0);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const statusRef = useRef<RunUi['status']>('playing');
  statusRef.current = ui.status;
  const gameStartRef = useRef<number>(performance.now());
  const inputRef = useRef({ left: 0, right: 0, fwd: 0, back: 0, jump: 0 });

  const setPausedBoth = useCallback((next: boolean) => {
    pausedRef.current = next;
    setPaused(next);
  }, []);

  usePauseKey(
    useCallback(() => {
      if (statusRef.current !== 'playing') return;
      gameAudio.click();
      setPausedBoth(!pausedRef.current);
    }, [setPausedBoth]),
  );

  useEffect(() => {
    if (ui.status !== 'lost' || submitted) return;
    setSubmitted(true);
    const durationSec = Math.max(0, (performance.now() - gameStartRef.current) / 1000);
    fetch('/api/games/hex-tower/scores', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        wallet: gameContext.wallet,
        heightM: ui.bestM,
        comboMax: ui.comboMax,
        durationSec,
        entrySignature: gameContext.entrySignature,
      }),
    }).catch((err) => console.warn('hex-tower score submit failed', err));
  }, [ui.status, ui.bestM, ui.comboMax, submitted, gameContext]);

  useEffect(() => {
    gameStartRef.current = performance.now();
    setSubmitted(false);
    pausedRef.current = false;
    setPaused(false);
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
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xfde6d0);
    scene.fog = new THREE.Fog(0xfde6d0, 40, 110);

    const camera = new THREE.PerspectiveCamera(
      48,
      mount.clientWidth / mount.clientHeight,
      0.1,
      300,
    );

    // ─── Lighting — soft pastel sunset ───────────────────────────────
    scene.add(new THREE.AmbientLight(0xfff0d6, 0.55));
    const hemi = new THREE.HemisphereLight(0xff9cb6, 0x5d3a78, 0.65);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffd6a0, 1.2);
    sun.position.set(20, 50, 14);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 200;
    sun.shadow.camera.left = -25;
    sun.shadow.camera.right = 25;
    sun.shadow.camera.top = 25;
    sun.shadow.camera.bottom = -25;
    sun.shadow.bias = -0.0005;
    scene.add(sun);

    // ─── Central spire ──────────────────────────────────────────────
    const spireMat = new THREE.MeshStandardMaterial({
      color: 0xc1a9d8,
      metalness: 0.2,
      roughness: 0.55,
    });
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.6, 600, 12), spireMat);
    spire.position.y = 300;
    spire.castShadow = true;
    spire.receiveShadow = true;
    scene.add(spire);

    // Decorative bands of glowing rings down the spire — emissive accents.
    const bandMat = new THREE.MeshStandardMaterial({
      color: 0xa78bfa,
      emissive: 0x7c3aed,
      emissiveIntensity: 0.75,
    });
    for (let i = 0; i < 200; i++) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.06, 6, 16), bandMat);
      band.position.y = i * 3 + 1;
      band.rotation.x = Math.PI / 2;
      scene.add(band);
    }

    // ─── Floating background islands (parallax) ─────────────────────
    const islandMat = new THREE.MeshStandardMaterial({
      color: 0xfca5a5,
      roughness: 0.7,
      flatShading: true,
    });
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xfff7ed,
      emissive: 0xfff7ed,
      emissiveIntensity: 0.15,
      transparent: true,
      opacity: 0.85,
    });
    for (let i = 0; i < 30; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 40 + Math.random() * 30;
      const y = -10 + Math.random() * 60;
      const island = new THREE.Mesh(
        new THREE.IcosahedronGeometry(2 + Math.random() * 3, 0),
        i % 2 === 0 ? islandMat : cloudMat,
      );
      island.position.set(Math.cos(angle) * dist, y, Math.sin(angle) * dist);
      island.castShadow = false;
      scene.add(island);
    }

    // ─── Tile materials ─────────────────────────────────────────────
    const tileMats: Record<TileKind, THREE.MeshStandardMaterial> = {
      normal: new THREE.MeshStandardMaterial({
        color: 0xfff7ed,
        roughness: 0.5,
        metalness: 0.1,
      }),
      combo: new THREE.MeshStandardMaterial({
        color: 0x86efac,
        emissive: 0x16a34a,
        emissiveIntensity: 0.55,
        roughness: 0.4,
      }),
      boost: new THREE.MeshStandardMaterial({
        color: 0xfdba74,
        emissive: 0xea580c,
        emissiveIntensity: 0.7,
        roughness: 0.4,
      }),
      brittle: new THREE.MeshStandardMaterial({
        color: 0xfda4af,
        emissive: 0xe11d48,
        emissiveIntensity: 0.45,
        roughness: 0.5,
      }),
      phase: new THREE.MeshStandardMaterial({
        color: 0x93c5fd,
        emissive: 0x3b82f6,
        emissiveIntensity: 0.6,
        roughness: 0.4,
        transparent: true,
        opacity: 0.95,
      }),
    };
    const tileGeometry = new THREE.CylinderGeometry(HEX_R, HEX_R, 0.45, 6, 1, false);

    // ─── Tile pool ──────────────────────────────────────────────────
    const tiles: Tile[] = [];
    let nextBandY = 0;
    const seededRand = (n: number) => {
      // Simple xorshift to keep platforms deterministic for a given ring index.
      let x = (n + 1234567) | 0;
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      return ((x >>> 0) % 1000) / 1000;
    };

    const spawnRing = (bandIdx: number, y: number) => {
      // Difficulty ramps with height: more brittle tiles, wider gaps, and
      // phase tiles from band 12 (~29m) upward.
      const diff = Math.min(1, bandIdx / 40);
      for (let i = 0; i < RING_COUNT; i++) {
        const angle = (i / RING_COUNT) * Math.PI * 2 + bandIdx * 0.18;
        const px = Math.cos(angle) * RING_RADIUS;
        const pz = Math.sin(angle) * RING_RADIUS;
        // Decide tile kind from a seeded roll so the pattern feels designed.
        const roll = seededRand(bandIdx * 7 + i * 13);
        let kind: TileKind = 'normal';
        if (roll < 0.05 && bandIdx > 1) kind = 'boost';
        else if (roll < 0.22) kind = 'combo';
        else if (roll < 0.38 + diff * 0.1 && bandIdx > 0) kind = 'brittle';
        else if (roll < 0.52 + diff * 0.06 && bandIdx > 12) kind = 'phase';
        // Skip some normals to create gaps that demand jumps — more with height.
        if (kind === 'normal' && roll > 0.85 - diff * 0.1) continue;
        const tile = new THREE.Mesh(
          tileGeometry,
          // Phase tiles animate opacity individually, so each needs its own material.
          kind === 'phase' ? tileMats.phase.clone() : tileMats[kind],
        );
        tile.rotation.y = Math.PI / 6; // flat-top hex
        tile.position.set(px, y, pz);
        tile.castShadow = true;
        tile.receiveShadow = true;
        scene.add(tile);
        tiles.push({
          mesh: tile,
          position: tile.position,
          kind,
          landedAt: -1,
          spawned: true,
          ring: bandIdx,
          slot: i,
          solid: true,
        });
      }
    };
    // Seed the first few bands so the player has something to start on.
    for (let b = 0; b < 4; b++) {
      spawnRing(b, b * RING_VERTICAL_STEP);
      nextBandY = (b + 1) * RING_VERTICAL_STEP;
    }
    // A starter platform exactly under the player (always solid, larger).
    const starter = new THREE.Mesh(
      new THREE.CylinderGeometry(RING_RADIUS + HEX_R, RING_RADIUS + HEX_R, 0.5, 32),
      tileMats.normal,
    );
    starter.position.set(0, -0.5, 0);
    starter.receiveShadow = true;
    scene.add(starter);

    // ─── Player ─────────────────────────────────────────────────────
    const playerGroup = new THREE.Group();
    const playerBody = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.42, 0.7, 6, 12),
      new THREE.MeshStandardMaterial({
        color: 0xa78bfa,
        emissive: 0x4c1d95,
        emissiveIntensity: 0.4,
        metalness: 0.2,
        roughness: 0.4,
      }),
    );
    playerBody.castShadow = true;
    playerBody.position.y = 0.7;
    playerGroup.add(playerBody);
    const playerCrest = new THREE.Mesh(
      new THREE.ConeGeometry(0.18, 0.32, 6),
      new THREE.MeshStandardMaterial({
        color: 0xfde68a,
        emissive: 0xfacc15,
        emissiveIntensity: 1,
      }),
    );
    playerCrest.position.y = 1.3;
    playerGroup.add(playerCrest);
    scene.add(playerGroup);

    // ─── State ──────────────────────────────────────────────────────
    const player = {
      x: 0,
      y: 1.2,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      onGround: false,
      groundTile: null as Tile | null,
    };
    let bestY = 0;
    let lastMilestone = 0;
    let combo = 0;
    let comboMax = 0;
    let comboDecay = 0;
    let status: 'playing' | 'lost' = 'playing';
    let camYaw = 0;
    let shake = 0;
    let bestStored = 0;
    try {
      bestStored = Number(localStorage.getItem('arcadery:hex-tower:best') ?? 0);
    } catch {}

    // ─── Particle system (debris when tiles crumble) ───────────────
    interface Debris {
      mesh: THREE.Mesh;
      vel: THREE.Vector3;
      ttl: number;
    }
    const debris: Debris[] = [];
    const spawnDebris = (
      pos: THREE.Vector3,
      mat: THREE.MeshStandardMaterial,
    ) => {
      for (let i = 0; i < 6; i++) {
        const m = new THREE.Mesh(
          new THREE.TetrahedronGeometry(0.25 + Math.random() * 0.15),
          mat,
        );
        m.position.copy(pos);
        m.castShadow = false;
        scene.add(m);
        debris.push({
          mesh: m,
          vel: new THREE.Vector3(
            (Math.random() - 0.5) * 5,
            2 + Math.random() * 3,
            (Math.random() - 0.5) * 5,
          ),
          ttl: 1.2,
        });
      }
    };

    // Soft puffs for landings and sparkles for combo/boost tiles. Reuses the
    // debris updater — only geometry, spread, and lifetime differ.
    const dustMat = new THREE.MeshStandardMaterial({
      color: 0xfff7ed,
      emissive: 0xfde68a,
      emissiveIntensity: 0.4,
      transparent: true,
      opacity: 0.85,
    });
    const sparkMat = new THREE.MeshStandardMaterial({
      color: 0x86efac,
      emissive: 0x22c55e,
      emissiveIntensity: 1.2,
    });
    const spawnPuff = (
      pos: THREE.Vector3,
      mat: THREE.MeshStandardMaterial,
      count: number,
      up: number,
    ) => {
      for (let i = 0; i < count; i++) {
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09 + Math.random() * 0.08, 0), mat);
        m.position.set(
          pos.x + (Math.random() - 0.5) * 0.9,
          pos.y + TILE_HALF_HEIGHT + 0.05,
          pos.z + (Math.random() - 0.5) * 0.9,
        );
        m.castShadow = false;
        scene.add(m);
        debris.push({
          mesh: m,
          vel: new THREE.Vector3(
            (Math.random() - 0.5) * 2.5,
            up + Math.random() * up,
            (Math.random() - 0.5) * 2.5,
          ),
          ttl: 0.5 + Math.random() * 0.3,
        });
      }
    };

    // ─── Input ──────────────────────────────────────────────────────
    const keys = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)
      ) {
        e.preventDefault();
      }
      gameAudio.unlock();
      keys.add(e.key.toLowerCase());
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

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

    // ─── Tile under player (hex foot-print) ─────────────────────────
    const TILE_HALF_HEIGHT = 0.225;
    const tileUnder = (px: number, py: number, pz: number): Tile | null => {
      let best: Tile | null = null;
      let bestDy = Infinity;
      for (const t of tiles) {
        if (!t.solid) continue; // phase tiles pass through while faded out
        const tp = t.position;
        const top = tp.y + TILE_HALF_HEIGHT;
        const dy = py - top;
        // The player has a small radius; treat the tile as a circle slightly
        // smaller than its bounding circle so dead-zone landings don't stick.
        const distXZ = Math.hypot(px - tp.x, pz - tp.z);
        if (distXZ < HEX_R * 0.95 && dy >= -0.05 && dy < 0.4 && dy < bestDy) {
          best = t;
          bestDy = dy;
        }
      }
      // Starter pad covers a wide radius near Y=0.
      if (!best && Math.hypot(px, pz) < RING_RADIUS + HEX_R - 0.2 && py < 0.6) {
        return {
          mesh: starter,
          position: starter.position,
          kind: 'normal',
          landedAt: -2,
          spawned: true,
          ring: -1,
          slot: -1,
          solid: true,
        };
      }
      return best;
    };

    // ─── Loop ───────────────────────────────────────────────────────
    let last = performance.now();
    let lastUi = 0;
    let raf = 0;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      // Paused: keep rendering the frozen scene, skip all simulation. `last`
      // keeps advancing so resume doesn't get a giant dt.
      if (pausedRef.current) {
        renderer.render(scene, camera);
        return;
      }

      const input = inputRef.current;
      const left = (keys.has('a') || keys.has('arrowleft') ? 1 : 0) + input.left;
      const right = (keys.has('d') || keys.has('arrowright') ? 1 : 0) + input.right;
      const fwd = (keys.has('w') || keys.has('arrowup') ? 1 : 0) + input.fwd;
      const back = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) + input.back;
      const jump = (keys.has(' ') ? 1 : 0) + input.jump;

      if (status === 'playing') {
        // ── Phase tiles blink in/out on a per-tile clock ────────────
        for (const t of tiles) {
          if (t.kind !== 'phase') continue;
          const ph = Math.sin(now / 1000 * 1.8 + t.ring * 1.3 + t.slot * 0.9);
          t.solid = ph > -0.2;
          const mat = t.mesh.material as THREE.MeshStandardMaterial;
          mat.opacity = t.solid ? 0.95 : 0.15;
          mat.emissiveIntensity = t.solid ? 0.6 : 0.1;
        }

        // ── Camera-relative move axes ───────────────────────────────
        const cosY = Math.cos(camYaw);
        const sinY = Math.sin(camYaw);
        const forward = new THREE.Vector3(sinY, 0, cosY);
        const rightV = new THREE.Vector3(cosY, 0, -sinY);
        const moveDir = new THREE.Vector3()
          .addScaledVector(forward, fwd - back)
          .addScaledVector(rightV, right - left);
        if (moveDir.lengthSq() > 0.01) moveDir.normalize();
        player.vx = THREE.MathUtils.damp(player.vx, moveDir.x * MAX_HORIZ_SPEED, 6, dt);
        player.vz = THREE.MathUtils.damp(player.vz, moveDir.z * MAX_HORIZ_SPEED, 6, dt);
        // Bonus combo speed.
        const comboMult = 1 + Math.min(1, combo * 0.06);
        player.vx *= comboMult;
        player.vz *= comboMult;

        // ── Vertical physics ────────────────────────────────────────
        player.vy -= GRAVITY * dt;
        const newY = player.y + player.vy * dt;
        const newX = player.x + player.vx * dt;
        const newZ = player.z + player.vz * dt;

        // ── Ground check at the new position (only when falling). ──
        let onGround = false;
        let groundTile: Tile | null = null;
        if (player.vy <= 0) {
          const t = tileUnder(newX, newY, newZ);
          if (t) {
            const top = t.position.y + TILE_HALF_HEIGHT;
            // Snap to top + reset vertical velocity.
            player.y = top;
            player.vy = 0;
            onGround = true;
            groundTile = t;
            // Landed effects — only once per land.
            if (!player.onGround) {
              const wasNewTile = t.landedAt < 0;
              if (t.kind === 'combo') {
                combo += 1;
                comboMax = Math.max(comboMax, combo);
                comboDecay = 4;
                shake = Math.max(shake, 4);
                gameAudio.combo(combo);
                spawnPuff(t.position, sparkMat, 8, 3);
              } else if (t.kind === 'boost') {
                player.vy = BOOST_JUMP_VEL;
                onGround = false;
                shake = Math.max(shake, 6);
                combo += 1;
                comboMax = Math.max(comboMax, combo);
                comboDecay = 4;
                gameAudio.boost();
                spawnPuff(t.position, tileMats.boost, 10, 4);
              } else if (t.kind === 'brittle') {
                t.landedAt = now;
                gameAudio.tick();
                spawnPuff(t.position, dustMat, 4, 1.5);
              } else {
                gameAudio.land();
                spawnPuff(t.position, dustMat, 4, 1.5);
              }
              if (wasNewTile && t.kind !== 'brittle') {
                t.landedAt = now;
              }
            }
          }
        }
        if (!onGround) {
          player.x = newX;
          player.y = newY;
          player.z = newZ;
        } else {
          player.x = newX;
          player.z = newZ;
        }
        player.onGround = onGround;
        player.groundTile = groundTile;

        // ── Jump ───────────────────────────────────────────────────
        if (jump > 0.5 && onGround) {
          player.vy = JUMP_VEL;
          player.onGround = false;
          gameAudio.jump();
        }

        // ── Brittle tile crumble ────────────────────────────────────
        const CRUMBLE_DELAY = 0.45;
        for (let i = tiles.length - 1; i >= 0; i--) {
          const t = tiles[i];
          if (t.kind === 'brittle' && t.landedAt > 0) {
            const elapsed = (now - t.landedAt) / 1000;
            if (elapsed >= 0) {
              // Wobble + sink visual.
              t.mesh.position.y = t.position.y - Math.min(0.3, elapsed * 0.6);
              const sx = 1 - Math.min(0.4, elapsed * 0.6);
              t.mesh.scale.set(sx, 1, sx);
            }
            if (elapsed >= CRUMBLE_DELAY) {
              spawnDebris(t.position, tileMats.brittle);
              gameAudio.crumble();
              scene.remove(t.mesh);
              tiles.splice(i, 1);
            }
          }
        }

        // ── Combo decay ────────────────────────────────────────────
        comboDecay -= dt;
        if (comboDecay <= 0) combo = 0;

        // ── Spawn ahead + prune below ───────────────────────────────
        while (player.y + SPAWN_AHEAD > nextBandY) {
          spawnRing(nextBandY / RING_VERTICAL_STEP, nextBandY);
          nextBandY += RING_VERTICAL_STEP;
        }
        for (let i = tiles.length - 1; i >= 0; i--) {
          const t = tiles[i];
          if (t.position.y < player.y - PRUNE_BELOW) {
            scene.remove(t.mesh);
            tiles.splice(i, 1);
          }
        }

        // ── Best Y + death check ───────────────────────────────────
        if (player.y > bestY) bestY = player.y;
        // Celebrate every 50m climbed.
        if (Math.floor(bestY / 50) > Math.floor(lastMilestone / 50)) {
          gameAudio.levelup();
          shake = Math.max(shake, 5);
        }
        lastMilestone = bestY;
        if (player.y < bestY - DROP_DEATH) {
          status = 'lost';
          gameAudio.gameover();
          bestStored = Math.max(bestStored, Math.floor(bestY));
          try {
            localStorage.setItem('arcadery:hex-tower:best', String(bestStored));
          } catch {}
        }
      }

      // ── Player transform ────────────────────────────────────────
      playerGroup.position.set(player.x, player.y, player.z);
      // Squash + stretch.
      const squash = player.onGround ? 1 : Math.max(0.6, 1 - Math.abs(player.vy) * 0.02);
      playerGroup.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));

      // ── Camera ─────────────────────────────────────────────────
      camYaw += dt * 0.08;
      const camDist = 16;
      const camHeight = 8;
      const camTargetY = player.y + 2;
      const cx = Math.sin(camYaw) * camDist;
      const cz = Math.cos(camYaw) * camDist;
      camera.position.lerp(new THREE.Vector3(cx, camTargetY + camHeight, cz), 0.05);
      camera.lookAt(0, player.y - 1, 0);
      if (shake > 0) {
        camera.position.x += (Math.random() - 0.5) * shake * 0.04;
        camera.position.y += (Math.random() - 0.5) * shake * 0.04;
      }
      shake *= 0.86;

      // ── Debris physics ─────────────────────────────────────────
      for (let i = debris.length - 1; i >= 0; i--) {
        const d = debris[i];
        d.vel.y -= GRAVITY * dt;
        d.mesh.position.x += d.vel.x * dt;
        d.mesh.position.y += d.vel.y * dt;
        d.mesh.position.z += d.vel.z * dt;
        d.mesh.rotation.x += dt * 4;
        d.mesh.rotation.z += dt * 5;
        d.ttl -= dt;
        if (d.ttl <= 0) {
          scene.remove(d.mesh);
          debris.splice(i, 1);
        }
      }

      // ── Render ──────────────────────────────────────────────────
      renderer.render(scene, camera);

      // ── UI throttle ─────────────────────────────────────────────
      if (now - lastUi > 90) {
        lastUi = now;
        const speed = Math.hypot(player.vx, player.vy, player.vz);
        setUi({
          status,
          heightM: Math.floor(player.y),
          combo,
          comboMax,
          bestM: Math.max(bestStored, Math.floor(bestY)),
          speedKmh: Math.round(speed * 3.6),
        });
      }
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      ro.disconnect();
      renderer.dispose();
      tileGeometry.dispose();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
      for (const t of tiles) scene.remove(t.mesh);
    };
  }, [runId]);

  return (
    <div className="absolute inset-0 bg-[#fde6d0] overflow-hidden">
      <div ref={mountRef} className="absolute inset-0" />
      <Hud
        ui={ui}
        onRestart={() => {
          setUi(INITIAL_UI);
          setRunId((n) => n + 1);
        }}
        onOpenLeaderboard={() => setShowLeaderboard(true)}
        onPause={() => setPausedBoth(true)}
        onExit={onExit}
      />
      <MobileControls inputRef={inputRef} status={ui.status} />
      <PauseOverlay
        open={paused && ui.status === 'playing'}
        onResume={() => setPausedBoth(false)}
        onRestart={() => {
          setUi(INITIAL_UI);
          setRunId((n) => n + 1);
        }}
        onExit={onExit}
        accentClass="bg-rose-500 hover:bg-rose-600"
        hint="WASD move · Space jump"
      />
      <LeaderboardModal
        open={showLeaderboard}
        onClose={() => setShowLeaderboard(false)}
        config={LEADERBOARD_CONFIG}
        highlightWallet={gameContext.wallet}
      />
    </div>
  );
}

// ─── HUD ───────────────────────────────────────────────────────────

function Hud({
  ui,
  onRestart,
  onOpenLeaderboard,
  onPause,
  onExit,
}: {
  ui: RunUi;
  onRestart: () => void;
  onOpenLeaderboard: () => void;
  onPause: () => void;
  onExit?: () => void;
}) {
  const chipClass =
    'pointer-events-auto inline-flex items-center justify-center rounded-md border border-rose-300/40 bg-rose-300/20 p-1.5 text-rose-800 hover:bg-rose-300/40';
  return (
    <>
      <div className="pointer-events-none absolute top-3 right-3 z-20 flex items-center gap-2 font-mono">
        <button
          type="button"
          onClick={onOpenLeaderboard}
          className="pointer-events-auto inline-flex items-center gap-1 rounded-md border border-rose-300/40 bg-rose-300/20 px-2.5 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-300/40"
        >
          <Trophy className="h-3.5 w-3.5" /> Leaderboard
        </button>
        <MuteButton className={chipClass} />
        {ui.status === 'playing' && <PauseButton onClick={onPause} className={chipClass} />}
        {onExit && (
          <button
            type="button"
            onClick={() => {
              if (ui.status === 'playing') {
                if (
                  !confirm("Quit now? Your height for this run won't be recorded.")
                )
                  return;
              }
              onExit();
            }}
            className="pointer-events-auto inline-flex items-center gap-1 rounded-md border border-stone-700/20 bg-white/40 px-2 py-1.5 text-xs text-stone-700 hover:bg-white/60"
            aria-label="Exit"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="pointer-events-none absolute top-16 left-4 z-10 flex flex-col gap-2 font-mono text-stone-800">
        <div className="rounded-lg bg-white/70 backdrop-blur px-3 py-2 shadow">
          <div className="text-[10px] uppercase tracking-widest text-stone-500">
            Height
          </div>
          <div className="text-2xl font-bold tabular-nums text-stone-900">
            {ui.heightM.toLocaleString()}
            <span className="text-sm text-stone-500">m</span>
          </div>
        </div>
        <div className="rounded-lg bg-white/70 backdrop-blur px-3 py-2 shadow">
          <div className="text-[10px] uppercase tracking-widest text-stone-500">
            Best
          </div>
          <div className="text-sm font-bold tabular-nums text-rose-600">
            {ui.bestM.toLocaleString()}m
          </div>
        </div>
      </div>
      <div className="pointer-events-none absolute top-16 right-4 z-10 flex flex-col items-end gap-2 font-mono">
        {ui.combo > 1 && (
          <div className="rounded-lg bg-emerald-400/80 backdrop-blur px-3 py-1.5 text-right animate-pulse shadow">
            <span className="text-sm font-bold text-white">{ui.combo}× COMBO</span>
          </div>
        )}
      </div>
      {ui.status === 'lost' && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-stone-900/60 backdrop-blur-sm">
          <div className="rounded-2xl border border-rose-300/50 bg-[#fff7ed] p-8 text-center max-w-md font-mono">
            <h2 className="text-4xl font-black mb-2 text-rose-500">FELL OFF</h2>
            <p className="text-sm text-stone-500 mb-4">Gravity always wins.</p>
            <div className="space-y-1 text-sm mb-6 text-stone-700">
              <div>
                Height:{' '}
                <span className="text-stone-900 font-bold tabular-nums">
                  {ui.bestM.toLocaleString()}m
                </span>
              </div>
              <div>
                Best combo:{' '}
                <span className="text-emerald-600 font-bold">{ui.comboMax}×</span>
              </div>
            </div>
            <button
              onClick={onRestart}
              className="rounded-full bg-rose-500 hover:bg-rose-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors"
            >
              Climb again
            </button>
          </div>
        </div>
      )}
      <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 z-10 text-[10px] uppercase tracking-[0.4em] text-stone-700/50 font-mono">
        WASD move · Space jump · Mint = combo · Peach = launch · Rose = crumble · Sky = blinks
      </div>
    </>
  );
}

function MobileControls({
  inputRef,
  status,
}: {
  inputRef: React.RefObject<{
    left: number;
    right: number;
    fwd: number;
    back: number;
    jump: number;
  } | null>;
  status: RunUi['status'];
}) {
  if (status !== 'playing') return null;
  const press = (k: 'left' | 'right' | 'fwd' | 'back' | 'jump', v: number) => {
    if (v > 0) gameAudio.unlock();
    if (inputRef.current) inputRef.current[k] = v;
  };
  const Btn = ({
    label,
    k,
    cls,
  }: {
    label: string;
    k: 'left' | 'right' | 'fwd' | 'back' | 'jump';
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
      className={`select-none rounded-full bg-rose-300/40 backdrop-blur active:bg-rose-400/60 border border-rose-400/40 flex items-center justify-center font-bold text-rose-900 touch-none ${cls ?? ''}`}
    >
      {label}
    </button>
  );
  return (
    <div className="md:hidden absolute inset-x-0 bottom-0 z-20 pb-6 px-4 pointer-events-none">
      <div className="flex justify-between items-end">
        <div className="grid grid-cols-3 gap-2 pointer-events-auto">
          <span />
          <Btn label="▲" k="fwd" cls="w-12 h-12" />
          <span />
          <Btn label="◀" k="left" cls="w-12 h-12" />
          <span />
          <Btn label="▶" k="right" cls="w-12 h-12" />
          <span />
          <Btn label="▼" k="back" cls="w-12 h-12" />
          <span />
        </div>
        <div className="pointer-events-auto">
          <Btn
            label="JUMP"
            k="jump"
            cls="w-20 h-20 bg-emerald-400/60 border-emerald-500/40 text-emerald-950 text-sm"
          />
        </div>
      </div>
    </div>
  );
}
