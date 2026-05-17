'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Trophy, X } from 'lucide-react';
import {
  LeaderboardModal,
  type LeaderboardConfig,
} from '@/components/games/_shared/leaderboard-modal';
import type { GameContext } from '@/components/games/_shared/entry-gate';

// Endless 3D runner. Player auto-runs forward down a 3-lane road; left/right
// snaps between lanes, space hops. Obstacles, coin pickups, and gates spawn
// procedurally ahead and recycle when they fall behind the camera.
//
// Coordinate frame:
//   +Z is the running direction (the player accelerates +Z, so obstacles in
//   front have higher Z than the player).
//   Lanes are at X = -2.4, 0, +2.4.

const LANE_X = [-2.4, 0, 2.4];
const ROAD_WIDTH = 7;
const SPAWN_AHEAD = 80;
const DESPAWN_BEHIND = 12;

interface RunUi {
  status: 'playing' | 'lost';
  distanceM: number;
  coins: number;
  multiplier: number;
  bestM: number;
}

const INITIAL_UI: RunUi = {
  status: 'playing',
  distanceM: 0,
  coins: 0,
  multiplier: 1,
  bestM: 0,
};

interface Obstacle {
  mesh: THREE.Object3D;
  z: number;
  lane: number;
  kind: 'block' | 'gate' | 'coin';
  collected: boolean;
}

interface CubeRunnerProps {
  gameContext: GameContext;
  onExit?: () => void;
}

const LEADERBOARD_CONFIG: LeaderboardConfig = {
  gameKey: 'cube-runner',
  title: 'Cube Runner — top distances',
  primaryLabel: 'Distance',
  primaryField: 'distance_m',
  secondaryLabel: 'Coins',
  secondaryField: 'coins',
  formatPrimary: (v: number) => `${v.toLocaleString()}m`,
};

export function CubeRunner({ gameContext, onExit }: CubeRunnerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [ui, setUi] = useState<RunUi>(INITIAL_UI);
  const [runId, setRunId] = useState(0);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const gameStartRef = useRef<number>(performance.now());
  const inputRef = useRef({ left: 0, right: 0, jump: 0, slide: 0 });

  useEffect(() => {
    if (ui.status !== 'lost' || submitted) return;
    setSubmitted(true);
    const durationSec = Math.max(0, (performance.now() - gameStartRef.current) / 1000);
    fetch('/api/games/cube-runner/scores', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        wallet: gameContext.wallet,
        distanceM: ui.distanceM,
        coins: ui.coins,
        durationSec,
        entrySignature: gameContext.entrySignature,
      }),
    }).catch((err) => console.warn('cube-runner score submit failed', err));
  }, [ui.status, ui.distanceM, ui.coins, submitted, gameContext]);

  useEffect(() => {
    gameStartRef.current = performance.now();
    setSubmitted(false);
  }, [runId]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c0a1f);
    scene.fog = new THREE.Fog(0x0c0a1f, 30, 80);

    const camera = new THREE.PerspectiveCamera(
      62,
      mount.clientWidth / mount.clientHeight,
      0.1,
      200,
    );

    // ─── Lights — neon synthwave palette ───────────────────────────────
    scene.add(new THREE.AmbientLight(0x4a3da8, 0.5));
    const hemi = new THREE.HemisphereLight(0xff5ed1, 0x29208a, 0.6);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffd6f4, 1.3);
    sun.position.set(20, 40, -10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 80;
    sun.shadow.camera.left = -20;
    sun.shadow.camera.right = 20;
    sun.shadow.camera.top = 30;
    sun.shadow.camera.bottom = -10;
    scene.add(sun);

    // ─── Road — long flat strip we scroll under the player. ──────────────
    // We use one fixed-length plane and grid stripes that we re-position so
    // the world looks infinite without ever growing the geometry.
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x1d1438,
      metalness: 0.0,
      roughness: 0.9,
    });
    const roadGeo = new THREE.PlaneGeometry(ROAD_WIDTH, 200);
    const road = new THREE.Mesh(roadGeo, roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.z = 80;
    road.receiveShadow = true;
    scene.add(road);

    // Lane divider stripes — short emissive boxes spaced down the road.
    const stripeGroup = new THREE.Group();
    const stripeMat = new THREE.MeshStandardMaterial({
      color: 0xff5ed1,
      emissive: 0xff5ed1,
      emissiveIntensity: 0.7,
    });
    const stripeGeo = new THREE.BoxGeometry(0.1, 0.02, 1.2);
    for (let i = 0; i < 40; i++) {
      const left = new THREE.Mesh(stripeGeo, stripeMat);
      const right = new THREE.Mesh(stripeGeo, stripeMat);
      left.position.set(-LANE_X[0] / 2, 0.02, i * 4);
      right.position.set(LANE_X[0] / 2, 0.02, i * 4);
      stripeGroup.add(left);
      stripeGroup.add(right);
    }
    scene.add(stripeGroup);

    // Side rails — give a clear lane boundary and the rails glow.
    const railMat = new THREE.MeshStandardMaterial({
      color: 0x52e1ff,
      emissive: 0x1d7aff,
      emissiveIntensity: 0.7,
    });
    const railGeo = new THREE.BoxGeometry(0.2, 0.4, 200);
    const railL = new THREE.Mesh(railGeo, railMat);
    railL.position.set(-ROAD_WIDTH / 2, 0.2, 80);
    scene.add(railL);
    const railR = new THREE.Mesh(railGeo, railMat);
    railR.position.set(ROAD_WIDTH / 2, 0.2, 80);
    scene.add(railR);

    // Distant skyline — synthwave style. Two rows of low boxes that scroll
    // with us at half the player's speed for a parallax effect.
    const skylineGroup = new THREE.Group();
    const skyMat = new THREE.MeshStandardMaterial({
      color: 0x2b1d56,
      emissive: 0x4a2b8a,
      emissiveIntensity: 0.35,
    });
    for (let i = 0; i < 60; i++) {
      const h = 4 + Math.random() * 14;
      const w = 2 + Math.random() * 4;
      const side = i % 2 === 0 ? -1 : 1;
      const xJitter = side * (12 + Math.random() * 16);
      const z = (i / 60) * 180;
      const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), skyMat);
      box.position.set(xJitter, h / 2, z);
      skylineGroup.add(box);
    }
    scene.add(skylineGroup);

    // ─── Player — stylized capsule + visor that we lerp between lanes ───
    const playerGroup = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.4, 1.0, 6, 12),
      new THREE.MeshStandardMaterial({
        color: 0xf472b6,
        metalness: 0.3,
        roughness: 0.4,
        emissive: 0x3a1530,
        emissiveIntensity: 0.6,
      }),
    );
    body.castShadow = true;
    body.position.y = 0.7;
    playerGroup.add(body);
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.18, 0.45),
      new THREE.MeshStandardMaterial({
        color: 0x67e8f9,
        emissive: 0x67e8f9,
        emissiveIntensity: 1.4,
      }),
    );
    visor.position.set(0, 1.35, 0);
    playerGroup.add(visor);
    scene.add(playerGroup);

    // ─── Obstacle pool ─────────────────────────────────────────────────
    const obstacles: Obstacle[] = [];
    const blockMat = new THREE.MeshStandardMaterial({
      color: 0xff3366,
      emissive: 0x8b1d3a,
      emissiveIntensity: 0.6,
      metalness: 0.3,
      roughness: 0.4,
    });
    const gateMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0x6b3a08,
      emissiveIntensity: 0.5,
    });
    const coinMat = new THREE.MeshStandardMaterial({
      color: 0xfde047,
      emissive: 0xfacc15,
      emissiveIntensity: 1.3,
      metalness: 0.7,
      roughness: 0.2,
    });

    const makeBlock = (lane: number, z: number): Obstacle => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 1.6), blockMat);
      mesh.position.set(LANE_X[lane], 0.55, z);
      mesh.castShadow = true;
      scene.add(mesh);
      return { mesh, z, lane, kind: 'block', collected: false };
    };
    const makeGate = (lane: number, z: number): Obstacle => {
      // High beam you must slide under. Visualized as a wide flat box ~2m up.
      const group = new THREE.Group();
      const beam = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.3, 0.5), gateMat);
      beam.position.y = 2.1;
      beam.castShadow = true;
      group.add(beam);
      for (const side of [-1, 1]) {
        const pillar = new THREE.Mesh(
          new THREE.BoxGeometry(0.15, 2.4, 0.15),
          gateMat,
        );
        pillar.position.set(side * 1.1, 1.2, 0);
        group.add(pillar);
      }
      group.position.set(LANE_X[lane], 0, z);
      scene.add(group);
      return { mesh: group, z, lane, kind: 'gate', collected: false };
    };
    const makeCoin = (lane: number, z: number): Obstacle => {
      const mesh = new THREE.Mesh(
        new THREE.TorusGeometry(0.35, 0.1, 8, 14),
        coinMat,
      );
      mesh.position.set(LANE_X[lane], 1.1, z);
      mesh.rotation.y = Math.PI / 2;
      mesh.castShadow = true;
      scene.add(mesh);
      return { mesh, z, lane, kind: 'coin', collected: false };
    };

    // Procedural spawner — places a row of items every few meters ahead of
    // the player, leaving at least one safe lane open.
    let nextSpawnZ = 20;
    const spawnPattern = (z: number) => {
      const r = Math.random();
      if (r < 0.55) {
        // Block row: pick 1-2 lanes to block.
        const blocked = pickLanes(Math.random() < 0.45 ? 2 : 1);
        for (const lane of blocked) obstacles.push(makeBlock(lane, z));
        // Add coins in the open lanes.
        for (let lane = 0; lane < 3; lane++) {
          if (blocked.includes(lane)) continue;
          if (Math.random() < 0.5) obstacles.push(makeCoin(lane, z));
        }
      } else if (r < 0.8) {
        // Gate row — jump-over isn't possible, must slide.
        const lane = Math.floor(Math.random() * 3);
        obstacles.push(makeGate(lane, z));
        // Optional coin trail leading up to it.
        for (let i = 1; i <= 3; i++) {
          if (Math.random() < 0.6) obstacles.push(makeCoin(lane, z - i * 2.5));
        }
      } else {
        // Coin arch — three coins across all lanes.
        for (let lane = 0; lane < 3; lane++) {
          obstacles.push(makeCoin(lane, z));
        }
      }
    };

    // ─── Player state ───────────────────────────────────────────────────
    let targetLane = 1;
    let playerLaneX = LANE_X[1];
    let playerY = 0;
    let playerVy = 0;
    const GRAVITY = 28;
    const JUMP_SPEED = 9.2;
    let isSliding = false;
    let slideTimer = 0;
    let baseSpeed = 14;
    let distance = 0;
    let coinCount = 0;
    let multiplier = 1;
    let multiplierTimer = 0;
    let status: 'playing' | 'lost' = 'playing';
    let bestM = 0;
    try {
      bestM = Number(localStorage.getItem('arcadery:cube-runner:best') ?? 0);
    } catch {}

    // ─── Input handling ─────────────────────────────────────────────────
    let leftPressedLast = false;
    let rightPressedLast = false;
    let jumpPressedLast = false;
    let slidePressedLast = false;
    const keys = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
      }
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
    window.addEventListener('resize', onResize);

    // ─── Game loop ──────────────────────────────────────────────────────
    let lastTime = performance.now();
    let lastUi = 0;
    let raf = 0;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      // ─── Read inputs (edge-trigger for lane / jump / slide). ────────
      const input = inputRef.current;
      const leftPressed = keys.has('a') || keys.has('arrowleft') || input.left > 0;
      const rightPressed = keys.has('d') || keys.has('arrowright') || input.right > 0;
      const jumpPressed = keys.has('w') || keys.has('arrowup') || keys.has(' ') || input.jump > 0;
      const slidePressed = keys.has('s') || keys.has('arrowdown') || input.slide > 0;

      if (status === 'playing') {
        if (leftPressed && !leftPressedLast) targetLane = Math.max(0, targetLane - 1);
        if (rightPressed && !rightPressedLast) targetLane = Math.min(2, targetLane + 1);
        if (jumpPressed && !jumpPressedLast && playerY <= 0.01 && !isSliding) {
          playerVy = JUMP_SPEED;
        }
        if (slidePressed && !slidePressedLast && playerY <= 0.01 && !isSliding) {
          isSliding = true;
          slideTimer = 0.55;
        }
      }
      leftPressedLast = leftPressed;
      rightPressedLast = rightPressed;
      jumpPressedLast = jumpPressed;
      slidePressedLast = slidePressed;

      if (status === 'playing') {
        // Speed ramps up over time, capped.
        baseSpeed = Math.min(28, 14 + distance * 0.012);

        // Slide timer.
        if (isSliding) {
          slideTimer -= dt;
          if (slideTimer <= 0) isSliding = false;
        }

        // Vertical motion.
        playerVy -= GRAVITY * dt;
        playerY = Math.max(0, playerY + playerVy * dt);
        if (playerY <= 0 && playerVy < 0) playerVy = 0;

        // Lane lerp.
        playerLaneX += (LANE_X[targetLane] - playerLaneX) * Math.min(1, 12 * dt);

        // Scroll world toward us.
        const dz = baseSpeed * dt;
        distance += dz;
        road.position.z = 80; // The road plane is huge — we keep it static and move obstacles/stripes.
        // Recycle stripes — move them along -Z and wrap.
        for (const stripe of stripeGroup.children) {
          stripe.position.z -= dz;
          if (stripe.position.z < -DESPAWN_BEHIND) stripe.position.z += 160;
        }
        // Recycle skyline at half speed.
        for (const sky of skylineGroup.children) {
          sky.position.z -= dz * 0.5;
          if (sky.position.z < -30) sky.position.z += 180;
        }

        // Spawn ahead.
        while (nextSpawnZ - distance < SPAWN_AHEAD) {
          spawnPattern(nextSpawnZ - distance + 0); // place at world-space ahead
          // Spacing depends on speed for steady pacing.
          nextSpawnZ += 7 + Math.random() * 6;
        }

        // Move + recycle obstacles.
        multiplierTimer -= dt;
        if (multiplierTimer <= 0) multiplier = 1;
        for (let i = obstacles.length - 1; i >= 0; i--) {
          const o = obstacles[i];
          o.z -= dz;
          o.mesh.position.z = o.z;
          if (o.kind === 'coin') {
            // Spin coins.
            o.mesh.rotation.z += dt * 4;
          }
          // Collision with player. Player occupies lane targetLane (snapped X).
          if (
            !o.collected &&
            Math.abs(o.z) < 0.8 &&
            Math.abs(o.mesh.position.x - playerLaneX) < 1.0
          ) {
            if (o.kind === 'coin') {
              o.collected = true;
              scene.remove(o.mesh);
              coinCount += 1 * multiplier;
              multiplier = Math.min(5, multiplier + 1);
              multiplierTimer = 2.4;
            } else if (o.kind === 'block') {
              // Blocks: hit if not jumping over them.
              if (playerY < 0.9) {
                status = 'lost';
                bestM = Math.max(bestM, Math.floor(distance));
                try {
                  localStorage.setItem('arcadery:cube-runner:best', String(bestM));
                } catch {}
              }
            } else if (o.kind === 'gate') {
              // Gates: only safe if sliding.
              if (!isSliding) {
                status = 'lost';
                bestM = Math.max(bestM, Math.floor(distance));
                try {
                  localStorage.setItem('arcadery:cube-runner:best', String(bestM));
                } catch {}
              }
            }
          }
          if (o.z < -DESPAWN_BEHIND) {
            scene.remove(o.mesh);
            obstacles.splice(i, 1);
          }
        }
      }

      // Visuals.
      playerGroup.position.x = playerLaneX;
      playerGroup.position.y = playerY;
      // Slide squashes the player.
      const targetScaleY = isSliding ? 0.4 : 1;
      body.scale.y += (targetScaleY - body.scale.y) * Math.min(1, 14 * dt);
      body.position.y = isSliding ? 0.3 : 0.7;
      visor.position.y = isSliding ? 0.55 : 1.35;
      // Bob while running.
      const bob = Math.sin(distance * 4) * 0.05 * (1 - Math.min(1, playerY * 2));
      playerGroup.position.y += bob;
      // Tilt during lane change.
      const tilt = (LANE_X[targetLane] - playerLaneX) * 0.15;
      playerGroup.rotation.z = -tilt;
      playerGroup.rotation.y = tilt * 0.5;

      // Camera — fixed chase relative to player.
      camera.position.set(playerLaneX * 0.4, 3.6, playerGroup.position.z - 6.5);
      camera.lookAt(playerLaneX * 0.1, 1.0, playerGroup.position.z + 8);

      renderer.render(scene, camera);

      if (now - lastUi > 100) {
        lastUi = now;
        setUi({
          status,
          distanceM: Math.floor(distance),
          coins: coinCount,
          multiplier,
          bestM,
        });
      }
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else if (mat) mat.dispose();
      });
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [runId]);

  return (
    <div className="absolute inset-0 bg-[#0c0a1f] overflow-hidden">
      <div ref={mountRef} className="absolute inset-0" />
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

function pickLanes(count: number): number[] {
  const lanes = [0, 1, 2];
  // Fisher-Yates to keep lane choice unbiased.
  for (let i = lanes.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
  }
  return lanes.slice(0, count);
}

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
              if (ui.status === 'playing') {
                if (!confirm('Quit now? Your run won\'t be recorded.')) return;
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
        <div className="rounded-lg bg-black/55 backdrop-blur px-3 py-2">
          <div className="text-[10px] uppercase tracking-widest text-fuchsia-200/60">Distance</div>
          <div className="text-2xl font-bold tabular-nums text-fuchsia-100">
            {ui.distanceM.toLocaleString()}
            <span className="text-sm ml-1 text-white/40">m</span>
          </div>
        </div>
        <div className="rounded-lg bg-black/55 backdrop-blur px-3 py-2">
          <div className="text-[10px] uppercase tracking-widest text-amber-200/60">Best</div>
          <div className="text-sm font-bold tabular-nums text-amber-200">
            {ui.bestM.toLocaleString()}m
          </div>
        </div>
      </div>
      <div className="pointer-events-none absolute top-16 right-4 z-10 flex flex-col items-end gap-2 font-mono text-white">
        <div className="rounded-lg bg-black/55 backdrop-blur px-3 py-2 text-right">
          <div className="text-[10px] uppercase tracking-widest text-yellow-200/60">Coins</div>
          <div className="text-2xl font-bold tabular-nums text-yellow-200">
            {ui.coins.toLocaleString()}
          </div>
        </div>
        {ui.multiplier > 1 && (
          <div className="rounded-lg bg-yellow-400/30 backdrop-blur px-3 py-1 text-right animate-pulse">
            <span className="text-sm font-bold text-yellow-100">{ui.multiplier}× combo</span>
          </div>
        )}
      </div>
      {ui.status === 'lost' && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="rounded-2xl border border-fuchsia-400/20 bg-[#0c0a1f] p-8 text-center max-w-md font-mono">
            <h2 className="text-4xl font-black mb-2 text-rose-400">WIPEOUT</h2>
            <p className="text-sm text-white/50 mb-4">You hit something.</p>
            <div className="space-y-1 text-sm mb-6 text-white/80">
              <div>
                Distance:{' '}
                <span className="text-fuchsia-200 font-bold tabular-nums">
                  {ui.distanceM.toLocaleString()}m
                </span>
              </div>
              <div>
                Coins:{' '}
                <span className="text-yellow-200 font-bold tabular-nums">{ui.coins.toLocaleString()}</span>
              </div>
              <div>
                Best:{' '}
                <span className="text-amber-300 font-bold tabular-nums">{ui.bestM.toLocaleString()}m</span>
              </div>
            </div>
            <button
              onClick={onRestart}
              className="rounded-full bg-fuchsia-500/80 hover:bg-fuchsia-400 px-6 py-2.5 text-sm font-semibold text-black transition-colors"
            >
              Run again
            </button>
          </div>
        </div>
      )}
      <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 z-10 text-[10px] uppercase tracking-[0.4em] text-white/30 font-mono">
        A · D lane · W/Space jump · S slide
      </div>
    </>
  );
}

function MobileControls({
  inputRef,
  status,
}: {
  inputRef: React.RefObject<{ left: number; right: number; jump: number; slide: number } | null>;
  status: RunUi['status'];
}) {
  if (status !== 'playing') return null;
  const press = (key: 'left' | 'right' | 'jump' | 'slide', v: number) => {
    if (inputRef.current) inputRef.current[key] = v;
  };
  // Lane changes are edge-triggered in the loop, so a tap (down→up) registers
  // exactly one shift. Hold time doesn't matter.
  const tap = (key: 'left' | 'right' | 'jump' | 'slide') => {
    press(key, 1);
    setTimeout(() => press(key, 0), 80);
  };
  const Btn = ({
    label,
    onTap,
    cls,
  }: {
    label: string;
    onTap: () => void;
    cls?: string;
  }) => (
    <button
      type="button"
      onTouchStart={(e) => {
        e.preventDefault();
        onTap();
      }}
      className={`select-none rounded-full bg-fuchsia-500/15 backdrop-blur active:bg-fuchsia-400/30 border border-fuchsia-300/30 flex items-center justify-center font-bold text-fuchsia-100 touch-none ${cls ?? ''}`}
    >
      {label}
    </button>
  );
  return (
    <div className="md:hidden absolute inset-x-0 bottom-0 z-20 pb-6 px-4 pointer-events-none">
      <div className="flex justify-between items-end">
        <div className="flex gap-3 pointer-events-auto">
          <Btn label="◀" onTap={() => tap('left')} cls="w-16 h-16 text-xl" />
          <Btn label="▶" onTap={() => tap('right')} cls="w-16 h-16 text-xl" />
        </div>
        <div className="flex flex-col gap-2 pointer-events-auto">
          <Btn label="JUMP" onTap={() => tap('jump')} cls="w-20 h-14 text-xs" />
          <Btn label="SLIDE" onTap={() => tap('slide')} cls="w-20 h-14 text-xs bg-cyan-500/20 border-cyan-300/30 text-cyan-100" />
        </div>
      </div>
    </div>
  );
}
