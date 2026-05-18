'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Trophy, X } from 'lucide-react';
import {
  LeaderboardModal,
  type LeaderboardConfig,
} from '@/components/games/_shared/leaderboard-modal';
import type { GameContext } from '@/components/games/_shared/entry-gate';

// Drone Arena — third-person mech wave combat in a holographic colosseum.
//
// Movement: WASD strafe in world XZ.
// Combat:
//   • Space = blaster (auto-aims at the nearest enemy inside cone, short cd).
//   • Shift = dash (i-frames + impulse in current move direction).
//   • F or RMB = lock-on missile (slow-fire homing rocket — chooses the
//     enemy with the highest "threat" = closest-and-most-HP).
// Camera: orbits slightly behind the player at a high pitch, locked to the
// arena center on yaw so the player can read the whole battle.
// Survival: 3 HP. When all enemies in the wave are dead the next wave spawns
// with +2 enemies and a difficulty ramp.

const ARENA_R = 28;
const PLAYER_R = 0.7;
const PLAYER_HP_MAX = 3;
const PLAYER_SPEED = 12;
const DASH_VEL = 32;
const DASH_DUR = 0.18;
const DASH_CD = 1.2;
const BLAST_CD = 0.18;
const BLAST_SPEED = 60;
const MISSILE_CD = 1.8;
const MISSILE_SPEED = 22;
const MISSILE_TURN = 2.5;
const AIM_CONE = Math.PI; // 360° auto-aim (player just faces nearest enemy).
const WAVE_HP_RAMP = 0.18;
const WAVE_SPEED_RAMP = 0.08;

interface RunUi {
  status: 'playing' | 'lost';
  score: number;
  hp: number;
  wave: number;
  waveProgress: number;
  bestScore: number;
  dashCd: number;
  missileCd: number;
}

const INITIAL_UI: RunUi = {
  status: 'playing',
  score: 0,
  hp: PLAYER_HP_MAX,
  wave: 1,
  waveProgress: 1,
  bestScore: 0,
  dashCd: 0,
  missileCd: 0,
};

type EnemyKind = 'grunt' | 'striker' | 'tank';
interface Enemy {
  mesh: THREE.Object3D;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  hp: number;
  maxHp: number;
  kind: EnemyKind;
  fireCd: number;
  speed: number;
  reward: number;
}

interface Bullet {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  ttl: number;
  enemy: boolean;
  damage: number;
}

interface Missile {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  target: Enemy | null;
  ttl: number;
}

interface Pulse {
  mesh: THREE.Mesh;
  ttl: number;
  maxTtl: number;
  expand: number;
}

interface DroneArenaProps {
  gameContext: GameContext;
  onExit?: () => void;
}

const LEADERBOARD_CONFIG: LeaderboardConfig = {
  gameKey: 'drone-arena',
  title: 'Drone Arena — top pilots',
  primaryLabel: 'Score',
  primaryField: 'score',
  secondaryLabel: 'Wave',
  secondaryField: 'wave_reached',
};

export function DroneArena({ gameContext, onExit }: DroneArenaProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [ui, setUi] = useState<RunUi>(INITIAL_UI);
  const [runId, setRunId] = useState(0);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const gameStartRef = useRef<number>(performance.now());
  const inputRef = useRef({
    left: 0,
    right: 0,
    fwd: 0,
    back: 0,
    fire: 0,
    dash: 0,
    missile: 0,
  });

  useEffect(() => {
    if (ui.status !== 'lost' || submitted) return;
    setSubmitted(true);
    const durationSec = Math.max(0, (performance.now() - gameStartRef.current) / 1000);
    fetch('/api/games/drone-arena/scores', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        wallet: gameContext.wallet,
        score: ui.score,
        waveReached: ui.wave,
        durationSec,
        entrySignature: gameContext.entrySignature,
      }),
    }).catch((err) => console.warn('drone-arena score submit failed', err));
  }, [ui.status, ui.score, ui.wave, submitted, gameContext]);

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
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05060f);
    scene.fog = new THREE.FogExp2(0x0a0e25, 0.018);

    const camera = new THREE.PerspectiveCamera(
      55,
      mount.clientWidth / mount.clientHeight,
      0.1,
      300,
    );

    // ─── Lights ──────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0x6e7bb8, 0.5));
    const hemi = new THREE.HemisphereLight(0xa5b4fc, 0x312e81, 0.55);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(15, 35, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 80;
    sun.shadow.camera.left = -30;
    sun.shadow.camera.right = 30;
    sun.shadow.camera.top = 30;
    sun.shadow.camera.bottom = -30;
    sun.shadow.bias = -0.0005;
    scene.add(sun);

    // Rim light for the holographic edge of the arena.
    const rim = new THREE.PointLight(0x22d3ee, 1.4, 60, 1.6);
    rim.position.set(0, 6, 0);
    scene.add(rim);

    // ─── Arena floor (holographic grid via emissive checker) ─────────
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0c1340,
      emissive: 0x1e3a8a,
      emissiveIntensity: 0.25,
      metalness: 0.4,
      roughness: 0.5,
    });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(ARENA_R, 64), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Holographic grid lines — concentric rings + radial spokes.
    const gridMat = new THREE.LineBasicMaterial({
      color: 0x67e8f9,
      transparent: true,
      opacity: 0.4,
    });
    for (let r = 4; r < ARENA_R; r += 4) {
      const segs = 64;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * r, 0.02, Math.sin(a) * r));
      }
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
    }
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const pts = [
        new THREE.Vector3(0, 0.02, 0),
        new THREE.Vector3(Math.cos(a) * ARENA_R, 0.02, Math.sin(a) * ARENA_R),
      ];
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
    }
    // Glowing outer ring.
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0x22d3ee,
      emissive: 0x22d3ee,
      emissiveIntensity: 2.5,
    });
    const arenaRing = new THREE.Mesh(
      new THREE.TorusGeometry(ARENA_R, 0.25, 8, 64),
      rimMat,
    );
    arenaRing.rotation.x = Math.PI / 2;
    arenaRing.position.y = 0.1;
    scene.add(arenaRing);

    // Distant column pillars on the perimeter.
    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0x1e1b4b,
      emissive: 0x6366f1,
      emissiveIntensity: 0.4,
      metalness: 0.55,
      roughness: 0.4,
    });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const x = Math.cos(a) * (ARENA_R + 2);
      const z = Math.sin(a) * (ARENA_R + 2);
      const p = new THREE.Mesh(new THREE.BoxGeometry(2, 12, 2), pillarMat);
      p.position.set(x, 6, z);
      p.castShadow = true;
      scene.add(p);
    }

    // ─── Player drone ────────────────────────────────────────────────
    const droneGroup = new THREE.Group();
    const drone = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.7, 1),
      new THREE.MeshStandardMaterial({
        color: 0x67e8f9,
        emissive: 0x0e7490,
        emissiveIntensity: 0.6,
        metalness: 0.6,
        roughness: 0.3,
      }),
    );
    drone.castShadow = true;
    droneGroup.add(drone);
    // Rotor halo.
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(1.2, 0.07, 8, 24),
      new THREE.MeshStandardMaterial({
        color: 0xa5f3fc,
        emissive: 0x22d3ee,
        emissiveIntensity: 1.2,
      }),
    );
    halo.rotation.x = Math.PI / 2;
    droneGroup.add(halo);
    // Forward indicator.
    const noseInd = new THREE.Mesh(
      new THREE.ConeGeometry(0.18, 0.6, 8),
      new THREE.MeshStandardMaterial({
        color: 0xfde047,
        emissive: 0xf59e0b,
        emissiveIntensity: 1.1,
      }),
    );
    noseInd.rotation.x = Math.PI / 2;
    noseInd.position.z = 0.9;
    droneGroup.add(noseInd);
    droneGroup.position.y = 1.4;
    scene.add(droneGroup);

    // ─── Enemy templates ────────────────────────────────────────────
    const enemyMats: Record<EnemyKind, THREE.MeshStandardMaterial> = {
      grunt: new THREE.MeshStandardMaterial({
        color: 0xef4444,
        emissive: 0x991b1b,
        emissiveIntensity: 0.4,
        metalness: 0.4,
        roughness: 0.45,
      }),
      striker: new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        emissive: 0xb45309,
        emissiveIntensity: 0.45,
        metalness: 0.4,
        roughness: 0.4,
      }),
      tank: new THREE.MeshStandardMaterial({
        color: 0xa855f7,
        emissive: 0x6d28d9,
        emissiveIntensity: 0.55,
        metalness: 0.5,
        roughness: 0.35,
      }),
    };
    const enemyStats: Record<
      EnemyKind,
      { hp: number; speed: number; reward: number; size: number }
    > = {
      grunt: { hp: 2, speed: 4.5, reward: 50, size: 0.7 },
      striker: { hp: 3, speed: 3.5, reward: 100, size: 0.9 },
      tank: { hp: 7, speed: 2.5, reward: 220, size: 1.2 },
    };

    // ─── Pools ──────────────────────────────────────────────────────
    const enemies: Enemy[] = [];
    const bullets: Bullet[] = [];
    const missiles: Missile[] = [];
    const pulses: Pulse[] = [];

    const blasterGeo = new THREE.SphereGeometry(0.18, 6, 6);
    const blasterMat = new THREE.MeshBasicMaterial({ color: 0xfde047 });
    const enemyBulletMat = new THREE.MeshBasicMaterial({ color: 0xfca5a5 });
    const missileGeo = new THREE.ConeGeometry(0.18, 0.8, 6);
    const missileMat = new THREE.MeshStandardMaterial({
      color: 0xfdf2f8,
      emissive: 0xf472b6,
      emissiveIntensity: 1.4,
    });

    const spawnEnemy = (kind: EnemyKind, wave: number) => {
      const stats = enemyStats[kind];
      const mesh = new THREE.Mesh(
        kind === 'tank'
          ? new THREE.BoxGeometry(stats.size * 1.5, stats.size * 1.5, stats.size * 1.5)
          : new THREE.OctahedronGeometry(stats.size, 0),
        enemyMats[kind],
      );
      const a = Math.random() * Math.PI * 2;
      const dist = ARENA_R * 0.85;
      mesh.position.set(Math.cos(a) * dist, 1.2, Math.sin(a) * dist);
      mesh.castShadow = true;
      scene.add(mesh);
      const ramp = 1 + (wave - 1) * WAVE_HP_RAMP;
      enemies.push({
        mesh,
        pos: mesh.position,
        vel: new THREE.Vector3(),
        hp: Math.round(stats.hp * ramp),
        maxHp: Math.round(stats.hp * ramp),
        kind,
        fireCd: 1 + Math.random() * 2,
        speed: stats.speed * (1 + (wave - 1) * WAVE_SPEED_RAMP),
        reward: stats.reward,
      });
    };

    const spawnPulse = (
      x: number,
      y: number,
      z: number,
      color: number,
      size: number,
    ) => {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 12, 12),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.95,
          blending: THREE.AdditiveBlending,
        }),
      );
      m.position.set(x, y, z);
      scene.add(m);
      pulses.push({ mesh: m, ttl: 0.55, maxTtl: 0.55, expand: size });
    };

    // ─── State ──────────────────────────────────────────────────────
    const player = {
      pos: new THREE.Vector3(0, 1.4, 0),
      vel: new THREE.Vector3(),
      facing: new THREE.Vector3(0, 0, 1),
      hp: PLAYER_HP_MAX,
      blastCd: 0,
      missileCd: 0,
      dashCd: 0,
      dashTimer: 0,
      invuln: 0,
    };
    let score = 0;
    let wave = 1;
    let bestScore = 0;
    try {
      bestScore = Number(localStorage.getItem('arcadery:drone-arena:best') ?? 0);
    } catch {}
    let status: 'playing' | 'lost' = 'playing';
    let shake = 0;
    let waveCooldown = 1.5;
    let waveActive = false;

    const startWave = (w: number) => {
      const grunts = 2 + Math.floor(w * 0.8);
      const strikers = Math.max(0, Math.floor((w - 1) * 0.7));
      const tanks = Math.max(0, Math.floor((w - 2) * 0.5));
      for (let i = 0; i < grunts; i++) spawnEnemy('grunt', w);
      for (let i = 0; i < strikers; i++) spawnEnemy('striker', w);
      for (let i = 0; i < tanks; i++) spawnEnemy('tank', w);
      waveActive = true;
    };

    // ─── Input ──────────────────────────────────────────────────────
    const keys = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        [
          'ArrowUp',
          'ArrowDown',
          'ArrowLeft',
          'ArrowRight',
          ' ',
          'Shift',
        ].includes(e.key)
      ) {
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
    onResize();
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    // ─── Helpers ─────────────────────────────────────────────────────
    const nearestEnemy = (
      from: THREE.Vector3,
      facing: THREE.Vector3,
      maxAngle: number,
    ): Enemy | null => {
      let best: Enemy | null = null;
      let bestScoreVal = Infinity;
      for (const e of enemies) {
        const dx = e.pos.x - from.x;
        const dz = e.pos.z - from.z;
        const distSq = dx * dx + dz * dz;
        if (maxAngle < Math.PI) {
          const dot = (dx * facing.x + dz * facing.z) / Math.sqrt(distSq || 1);
          if (Math.acos(Math.min(1, Math.max(-1, dot))) > maxAngle) continue;
        }
        if (distSq < bestScoreVal) {
          bestScoreVal = distSq;
          best = e;
        }
      }
      return best;
    };

    const threatTarget = (from: THREE.Vector3): Enemy | null => {
      let best: Enemy | null = null;
      let bestScoreVal = -Infinity;
      for (const e of enemies) {
        const d = Math.hypot(e.pos.x - from.x, e.pos.z - from.z);
        // Prefer high-HP, close enemies.
        const sc = e.hp * 4 - d * 0.6;
        if (sc > bestScoreVal) {
          bestScoreVal = sc;
          best = e;
        }
      }
      return best;
    };

    const fireBlaster = () => {
      if (player.blastCd > 0) return;
      const target = nearestEnemy(player.pos, player.facing, AIM_CONE);
      if (!target) return;
      const dir = new THREE.Vector3()
        .subVectors(target.pos, player.pos)
        .setY(0)
        .normalize();
      player.facing.copy(dir);
      player.blastCd = BLAST_CD;
      const b = new THREE.Mesh(blasterGeo, blasterMat);
      b.position.copy(player.pos).addScaledVector(dir, 1.0);
      scene.add(b);
      bullets.push({
        mesh: b,
        pos: b.position,
        vel: dir.clone().multiplyScalar(BLAST_SPEED),
        ttl: 1.3,
        enemy: false,
        damage: 1,
      });
    };

    const fireMissile = () => {
      if (player.missileCd > 0) return;
      const target = threatTarget(player.pos);
      if (!target) return;
      player.missileCd = MISSILE_CD;
      const m = new THREE.Mesh(missileGeo, missileMat);
      m.position.copy(player.pos);
      scene.add(m);
      missiles.push({
        mesh: m,
        pos: m.position,
        vel: new THREE.Vector3(0, 0, 1).applyEuler(
          new THREE.Euler(0, Math.atan2(player.facing.x, player.facing.z), 0),
        ).multiplyScalar(MISSILE_SPEED * 0.4),
        target,
        ttl: 3.5,
      });
    };

    // ─── Loop ────────────────────────────────────────────────────────
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
      const fwd = (keys.has('w') || keys.has('arrowup') ? 1 : 0) + input.fwd;
      const back = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) + input.back;
      const fire = (keys.has(' ') ? 1 : 0) + input.fire;
      const dash = (keys.has('shift') ? 1 : 0) + input.dash;
      const missile = (keys.has('f') ? 1 : 0) + input.missile;

      if (status === 'playing') {
        // ── Move ───────────────────────────────────────────────────
        const moveDir = new THREE.Vector3(right - left, 0, fwd - back);
        if (moveDir.lengthSq() > 0.01) {
          moveDir.normalize();
          // Drone always faces the nearest enemy (auto-aim); if none, faces
          // movement direction.
          const aimTarget = nearestEnemy(player.pos, player.facing, AIM_CONE);
          if (aimTarget) {
            player.facing.copy(
              new THREE.Vector3()
                .subVectors(aimTarget.pos, player.pos)
                .setY(0)
                .normalize(),
            );
          } else {
            player.facing.copy(moveDir);
          }
        } else {
          const aimTarget = nearestEnemy(player.pos, player.facing, AIM_CONE);
          if (aimTarget) {
            player.facing.copy(
              new THREE.Vector3()
                .subVectors(aimTarget.pos, player.pos)
                .setY(0)
                .normalize(),
            );
          }
        }

        // Dash impulse.
        if (dash > 0.5 && player.dashCd <= 0 && moveDir.lengthSq() > 0) {
          player.dashCd = DASH_CD;
          player.dashTimer = DASH_DUR;
          player.invuln = DASH_DUR;
          player.vel.copy(moveDir).multiplyScalar(DASH_VEL);
        } else if (player.dashTimer > 0) {
          player.dashTimer -= dt;
        } else {
          player.vel.copy(moveDir).multiplyScalar(PLAYER_SPEED);
        }
        player.pos.add(player.vel.clone().multiplyScalar(dt));
        // Arena containment.
        const distFromCenter = Math.hypot(player.pos.x, player.pos.z);
        if (distFromCenter > ARENA_R - 1.5) {
          const scale = (ARENA_R - 1.5) / distFromCenter;
          player.pos.x *= scale;
          player.pos.z *= scale;
        }

        // ── Cooldowns ───────────────────────────────────────────────
        player.blastCd = Math.max(0, player.blastCd - dt);
        player.missileCd = Math.max(0, player.missileCd - dt);
        player.dashCd = Math.max(0, player.dashCd - dt);
        player.invuln = Math.max(0, player.invuln - dt);

        // ── Fire ────────────────────────────────────────────────────
        if (fire > 0.5) fireBlaster();
        if (missile > 0.5) fireMissile();

        // ── Enemies ─────────────────────────────────────────────────
        for (let i = enemies.length - 1; i >= 0; i--) {
          const e = enemies[i];
          // Movement: home in on player, but strikers + tanks keep their
          // distance.
          const toPlayer = new THREE.Vector3().subVectors(player.pos, e.pos).setY(0);
          const dist = toPlayer.length();
          toPlayer.normalize();
          const preferredDist =
            e.kind === 'striker' ? 9 : e.kind === 'tank' ? 6 : 1.6;
          const adjustment = dist - preferredDist;
          const move = toPlayer.multiplyScalar(
            e.speed * Math.sign(adjustment) * Math.min(1, Math.abs(adjustment) * 0.5),
          );
          e.pos.add(move.multiplyScalar(dt));
          e.mesh.rotation.y += dt * 1.5;
          // Soft separation: nudge away from other enemies that are too close.
          for (const o of enemies) {
            if (o === e) continue;
            const dx = e.pos.x - o.pos.x;
            const dz = e.pos.z - o.pos.z;
            const d = Math.hypot(dx, dz);
            if (d > 0 && d < 2) {
              const push = ((2 - d) / 2) * 6 * dt;
              e.pos.x += (dx / d) * push;
              e.pos.z += (dz / d) * push;
            }
          }

          // Fire.
          e.fireCd -= dt;
          if (e.kind === 'striker' && e.fireCd <= 0 && dist < 18) {
            e.fireCd = 1.6;
            const b = new THREE.Mesh(blasterGeo, enemyBulletMat);
            b.position.copy(e.pos);
            scene.add(b);
            const dir = new THREE.Vector3().subVectors(player.pos, e.pos).setY(0).normalize();
            bullets.push({
              mesh: b,
              pos: b.position,
              vel: dir.multiplyScalar(28),
              ttl: 1.6,
              enemy: true,
              damage: 1,
            });
          }

          // Melee touch.
          if (dist < PLAYER_R + 1.2 && player.invuln <= 0 && e.kind === 'grunt') {
            player.hp -= 1;
            player.invuln = 1;
            shake = 22;
            spawnPulse(player.pos.x, player.pos.y, player.pos.z, 0xf43f5e, 2.5);
            if (player.hp <= 0) status = 'lost';
          }
        }

        // ── Bullets ─────────────────────────────────────────────────
        for (let i = bullets.length - 1; i >= 0; i--) {
          const b = bullets[i];
          b.pos.add(b.vel.clone().multiplyScalar(dt));
          b.ttl -= dt;
          let consumed = false;
          // Out of arena.
          if (Math.hypot(b.pos.x, b.pos.z) > ARENA_R + 1) consumed = true;
          if (!consumed && !b.enemy) {
            for (let j = enemies.length - 1; j >= 0; j--) {
              const e = enemies[j];
              const dx = e.pos.x - b.pos.x;
              const dz = e.pos.z - b.pos.z;
              if (dx * dx + dz * dz < 1.1 * 1.1) {
                e.hp -= b.damage;
                spawnPulse(e.pos.x, e.pos.y, e.pos.z, 0xfde047, 1.2);
                consumed = true;
                if (e.hp <= 0) {
                  score += e.reward;
                  shake = Math.min(20, shake + 4);
                  spawnPulse(e.pos.x, e.pos.y, e.pos.z, 0xff8a00, 3);
                  scene.remove(e.mesh);
                  enemies.splice(j, 1);
                }
                break;
              }
            }
          }
          if (!consumed && b.enemy) {
            const dx = b.pos.x - player.pos.x;
            const dz = b.pos.z - player.pos.z;
            if (dx * dx + dz * dz < 0.9 * 0.9 && player.invuln <= 0) {
              player.hp -= b.damage;
              player.invuln = 0.6;
              shake = Math.max(shake, 18);
              spawnPulse(player.pos.x, player.pos.y, player.pos.z, 0xf43f5e, 2);
              consumed = true;
              if (player.hp <= 0) status = 'lost';
            }
          }
          if (consumed || b.ttl <= 0) {
            scene.remove(b.mesh);
            bullets.splice(i, 1);
          }
        }

        // ── Missiles ────────────────────────────────────────────────
        for (let i = missiles.length - 1; i >= 0; i--) {
          const m = missiles[i];
          if (!m.target || !enemies.includes(m.target)) m.target = threatTarget(m.pos);
          if (m.target) {
            const desired = new THREE.Vector3()
              .subVectors(m.target.pos, m.pos)
              .setY(0)
              .normalize();
            const cur = m.vel.clone().setY(0).normalize();
            const blended = cur.lerp(desired, MISSILE_TURN * dt).normalize();
            m.vel.copy(blended).multiplyScalar(MISSILE_SPEED);
          }
          m.pos.add(m.vel.clone().multiplyScalar(dt));
          m.mesh.rotation.set(0, Math.atan2(m.vel.x, m.vel.z), 0);
          m.mesh.rotateX(Math.PI / 2);
          m.ttl -= dt;
          let consumed = false;
          for (let j = enemies.length - 1; j >= 0; j--) {
            const e = enemies[j];
            const dx = e.pos.x - m.pos.x;
            const dz = e.pos.z - m.pos.z;
            if (dx * dx + dz * dz < 1.6 * 1.6) {
              e.hp -= 4;
              spawnPulse(e.pos.x, e.pos.y, e.pos.z, 0xfde047, 3.5);
              shake = Math.min(28, shake + 8);
              if (e.hp <= 0) {
                score += e.reward + 50;
                spawnPulse(e.pos.x, e.pos.y, e.pos.z, 0xff8a00, 4.5);
                scene.remove(e.mesh);
                enemies.splice(j, 1);
              }
              consumed = true;
              break;
            }
          }
          if (consumed || m.ttl <= 0) {
            scene.remove(m.mesh);
            missiles.splice(i, 1);
          }
        }

        // ── Wave management ─────────────────────────────────────────
        if (waveActive && enemies.length === 0) {
          waveActive = false;
          waveCooldown = 1.8;
          // Heal a bit between waves.
          if (player.hp < PLAYER_HP_MAX) player.hp += 1;
        } else if (!waveActive) {
          waveCooldown -= dt;
          if (waveCooldown <= 0) {
            wave += 1;
            startWave(wave);
          }
        }

        // ── Pulses ──────────────────────────────────────────────────
        for (let i = pulses.length - 1; i >= 0; i--) {
          const p = pulses[i];
          p.ttl -= dt;
          const t = 1 - p.ttl / p.maxTtl;
          const mat = p.mesh.material as THREE.MeshBasicMaterial;
          mat.opacity = Math.max(0, 1 - t);
          p.mesh.scale.setScalar(1 + t * p.expand);
          if (p.ttl <= 0) {
            scene.remove(p.mesh);
            pulses.splice(i, 1);
          }
        }
      }

      // First-wave kick-off (only once).
      if (wave === 1 && enemies.length === 0 && !waveActive && waveCooldown > 0) {
        waveCooldown -= dt;
        if (waveCooldown <= 0) startWave(1);
      }

      // ── Player + camera transforms ────────────────────────────────
      droneGroup.position.copy(player.pos);
      droneGroup.rotation.y = Math.atan2(player.facing.x, player.facing.z);
      halo.rotation.z += dt * 6;
      // Blink during i-frames.
      if (player.invuln > 0) {
        drone.visible = Math.floor(player.invuln * 14) % 2 === 0;
      } else {
        drone.visible = true;
      }

      // High orbital camera tracking the player.
      const camTargetPos = new THREE.Vector3(
        player.pos.x - player.facing.x * 8,
        player.pos.y + 13,
        player.pos.z - player.facing.z * 8,
      );
      camera.position.lerp(camTargetPos, 0.08);
      camera.lookAt(
        player.pos.x + player.facing.x * 4,
        player.pos.y,
        player.pos.z + player.facing.z * 4,
      );
      if (shake > 0) {
        camera.position.x += (Math.random() - 0.5) * shake * 0.04;
        camera.position.y += (Math.random() - 0.5) * shake * 0.04;
      }
      shake *= 0.88;

      // Persist best on game over.
      if (status === 'lost' && score > bestScore) {
        bestScore = score;
        try {
          localStorage.setItem('arcadery:drone-arena:best', String(bestScore));
        } catch {}
      }

      renderer.render(scene, camera);

      if (now - lastUi > 90) {
        lastUi = now;
        setUi({
          status,
          score,
          hp: Math.max(0, player.hp),
          wave,
          waveProgress: enemies.length,
          bestScore: Math.max(bestScore, score),
          dashCd: player.dashCd,
          missileCd: player.missileCd,
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
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
      // Dispose all dynamic geometries (template materials are reused).
      for (const e of enemies) scene.remove(e.mesh);
      for (const b of bullets) scene.remove(b.mesh);
      for (const m of missiles) scene.remove(m.mesh);
      for (const p of pulses) scene.remove(p.mesh);
    };
  }, [runId]);

  return (
    <div className="absolute inset-0 bg-[#05060f] overflow-hidden">
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

// ─── HUD ───────────────────────────────────────────────────────────

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
              if (ui.status === 'playing' && ui.hp > 0) {
                if (!confirm("Quit now? Your score for this run won't be recorded."))
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
            Score
          </div>
          <div className="text-2xl font-bold tabular-nums text-cyan-100">
            {ui.score.toLocaleString()}
          </div>
        </div>
        <div className="rounded-lg bg-black/60 backdrop-blur px-3 py-2">
          <div className="text-[10px] uppercase tracking-widest text-cyan-200/60">
            Best
          </div>
          <div className="text-sm font-bold tabular-nums text-amber-200">
            {ui.bestScore.toLocaleString()}
          </div>
        </div>
      </div>
      <div className="pointer-events-none absolute top-16 right-4 z-10 flex flex-col items-end gap-2 font-mono text-white">
        <div className="rounded-lg bg-black/60 backdrop-blur px-3 py-2 text-right">
          <div className="text-[10px] uppercase tracking-widest text-cyan-200/60">
            Wave
          </div>
          <div className="text-xl font-bold tabular-nums">{ui.wave}</div>
        </div>
        <div className="rounded-lg bg-black/60 backdrop-blur px-3 py-2 text-right">
          <div className="text-[10px] uppercase tracking-widest text-cyan-200/60">
            Drones
          </div>
          <div className="text-xl font-bold tabular-nums text-cyan-100">
            {Array.from({ length: ui.hp }).map((_, i) => (
              <span key={i} className="mr-0.5">
                ◆
              </span>
            ))}
            {ui.hp === 0 && <span className="text-rose-400 text-sm">—</span>}
          </div>
        </div>
        <div className="rounded-lg bg-black/60 backdrop-blur px-3 py-2 text-right">
          <div className="text-[10px] uppercase tracking-widest text-cyan-200/60">
            Threats
          </div>
          <div className="text-xl font-bold tabular-nums text-rose-300">
            {ui.waveProgress}
          </div>
        </div>
      </div>
      <div className="pointer-events-none absolute left-4 bottom-4 z-10 flex gap-3 font-mono text-white">
        <Cooldown label="Dash" cd={ui.dashCd} maxCd={1.2} color="from-cyan-400 to-cyan-200" />
        <Cooldown
          label="Missile"
          cd={ui.missileCd}
          maxCd={1.8}
          color="from-fuchsia-400 to-rose-300"
        />
      </div>
      {ui.status === 'lost' && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="rounded-2xl border border-cyan-400/20 bg-[#06090f] p-8 text-center max-w-md font-mono">
            <h2 className="text-4xl font-black mb-2 text-rose-400">DRONE DOWN</h2>
            <p className="text-sm text-white/50 mb-4">The arena consumed your hull.</p>
            <div className="space-y-1 text-sm mb-6 text-white/80">
              <div>
                Score:{' '}
                <span className="text-cyan-200 font-bold tabular-nums">
                  {ui.score.toLocaleString()}
                </span>
              </div>
              <div>
                Best score:{' '}
                <span className="text-amber-300 font-bold tabular-nums">
                  {ui.bestScore.toLocaleString()}
                </span>
              </div>
              <div>
                Wave reached: <span className="text-white font-bold">{ui.wave}</span>
              </div>
            </div>
            <button
              onClick={onRestart}
              className="rounded-full bg-cyan-500/80 hover:bg-cyan-400 px-6 py-2.5 text-sm font-semibold text-black transition-colors"
            >
              Redeploy
            </button>
          </div>
        </div>
      )}
      <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 z-10 text-[10px] uppercase tracking-[0.4em] text-white/30 font-mono">
        WASD move · Space blaster · F missile · Shift dash
      </div>
    </>
  );
}

function Cooldown({
  label,
  cd,
  maxCd,
  color,
}: {
  label: string;
  cd: number;
  maxCd: number;
  color: string;
}) {
  const filled = cd <= 0;
  const pct = Math.max(0, Math.min(1, 1 - cd / maxCd));
  return (
    <div className="w-32">
      <div className="text-[10px] uppercase tracking-widest text-cyan-200/60 mb-1">
        {label}
        {filled && <span className="ml-1 text-emerald-300">●</span>}
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${color}`}
          style={{ width: `${Math.round(pct * 100)}%` }}
        />
      </div>
    </div>
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
    fire: number;
    dash: number;
    missile: number;
  } | null>;
  status: RunUi['status'];
}) {
  if (status !== 'playing') return null;
  const press = (
    k: 'left' | 'right' | 'fwd' | 'back' | 'fire' | 'dash' | 'missile',
    v: number,
  ) => {
    if (inputRef.current) inputRef.current[k] = v;
  };
  const Btn = ({
    label,
    k,
    cls,
  }: {
    label: string;
    k: 'left' | 'right' | 'fwd' | 'back' | 'fire' | 'dash' | 'missile';
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
          <Btn label="▲" k="fwd" cls="w-12 h-12" />
          <span />
          <Btn label="◀" k="left" cls="w-12 h-12" />
          <span />
          <Btn label="▶" k="right" cls="w-12 h-12" />
          <span />
          <Btn label="▼" k="back" cls="w-12 h-12" />
          <span />
        </div>
        <div className="flex flex-col gap-2 pointer-events-auto">
          <Btn
            label="FIRE"
            k="fire"
            cls="w-20 h-14 bg-amber-500/30 border-amber-300/40 text-amber-100 text-xs"
          />
          <Btn
            label="MISL"
            k="missile"
            cls="w-20 h-12 bg-rose-500/30 border-rose-300/40 text-rose-100 text-xs"
          />
          <Btn
            label="DASH"
            k="dash"
            cls="w-20 h-10 bg-cyan-500/30 border-cyan-300/40 text-xs"
          />
        </div>
      </div>
    </div>
  );
}
