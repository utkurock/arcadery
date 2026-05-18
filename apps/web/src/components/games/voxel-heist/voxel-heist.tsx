'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Trophy, X } from 'lucide-react';
import {
  LeaderboardModal,
  type LeaderboardConfig,
} from '@/components/games/_shared/leaderboard-modal';
import type { GameContext } from '@/components/games/_shared/entry-gate';

// Voxel Heist — speedrun a voxel vault complex before the alarm clock zeroes.
//
// World:
//   A single 50x50 unit hall divided into a voxel grid (1u cubes). Procedural
//   pillars and walls block sight, vaults are scattered through the room and
//   glow gold. Three sweeping laser planes patrol the hall — touching one
//   costs HP. Stand inside a vault's interact radius and hold E (or the
//   interact button) to crack it; +score + clock bonus.
//
// Survival rules:
//   • Timer starts at TIME_START; ticks down every second.
//   • Hitting a laser costs 1 HP (3 HP max), gives 0.8s i-frames.
//   • Game ends when timer ≤ 0 OR HP ≤ 0. Score is recorded either way.
//
// Coordinate frame: world space, +Y up. The player auto-aligns to the move
// direction (no mouse), keeping the game one-hand friendly.

const HALL_HALF = 24;
const PILLAR_GRID = 4; // pillar spacing
const VAULT_COUNT = 8;
const VAULT_RADIUS = 2.4;
const VAULT_CRACK_TIME = 1.4;
const VAULT_SCORE = 250;
const VAULT_TIME_BONUS = 14;
const TIME_START = 60;
const HP_MAX = 3;
const PLAYER_SPEED = 7;
const SPRINT_MULT = 1.6;
const LASER_COUNT = 3;

interface RunUi {
  status: 'playing' | 'lost';
  score: number;
  hp: number;
  timeLeft: number;
  vaultsCracked: number;
  bestScore: number;
  cracking: number; // 0..1 progress on current vault
}

const INITIAL_UI: RunUi = {
  status: 'playing',
  score: 0,
  hp: HP_MAX,
  timeLeft: TIME_START,
  vaultsCracked: 0,
  bestScore: 0,
  cracking: 0,
};

interface Vault {
  group: THREE.Group;
  pos: THREE.Vector3;
  cracked: boolean;
  progress: number; // 0..1
  pointLight: THREE.PointLight;
}

interface Laser {
  group: THREE.Group;
  beam: THREE.Mesh;
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  angle: number;
  speed: number;
  length: number;
}

interface VoxelHeistProps {
  gameContext: GameContext;
  onExit?: () => void;
}

const LEADERBOARD_CONFIG: LeaderboardConfig = {
  gameKey: 'voxel-heist',
  title: 'Voxel Heist — top thieves',
  primaryLabel: 'Score',
  primaryField: 'score',
  secondaryLabel: 'Vaults',
  secondaryField: 'vaults_cracked',
};

export function VoxelHeist({ gameContext, onExit }: VoxelHeistProps) {
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
    sprint: 0,
    interact: 0,
  });

  useEffect(() => {
    if (ui.status !== 'lost' || submitted) return;
    setSubmitted(true);
    const durationSec = Math.max(0, (performance.now() - gameStartRef.current) / 1000);
    fetch('/api/games/voxel-heist/scores', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        wallet: gameContext.wallet,
        score: ui.score,
        vaultsCracked: ui.vaultsCracked,
        durationSec,
        entrySignature: gameContext.entrySignature,
      }),
    }).catch((err) => console.warn('voxel-heist score submit failed', err));
  }, [ui.status, ui.score, ui.vaultsCracked, submitted, gameContext]);

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
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x06080d);
    scene.fog = new THREE.FogExp2(0x070a14, 0.024);

    const camera = new THREE.PerspectiveCamera(
      55,
      mount.clientWidth / mount.clientHeight,
      0.1,
      200,
    );

    // ─── Lighting (mostly dark; vaults glow with point lights) ─────────
    scene.add(new THREE.AmbientLight(0x1a2240, 0.45));
    const moon = new THREE.DirectionalLight(0xbbd5ff, 0.45);
    moon.position.set(10, 25, 12);
    moon.castShadow = true;
    moon.shadow.mapSize.set(1024, 1024);
    moon.shadow.camera.near = 1;
    moon.shadow.camera.far = 80;
    moon.shadow.camera.left = -28;
    moon.shadow.camera.right = 28;
    moon.shadow.camera.top = 28;
    moon.shadow.camera.bottom = -28;
    scene.add(moon);

    // ─── Floor + walls (voxel-style) ────────────────────────────────
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x1a1f33,
      roughness: 0.85,
      metalness: 0.1,
    });
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(HALL_HALF * 2, 0.6, HALL_HALF * 2),
      floorMat,
    );
    floor.position.y = -0.3;
    floor.receiveShadow = true;
    scene.add(floor);

    // Voxel ceiling — chunky boxes overhead, leaves room for laser planes.
    const ceilMat = new THREE.MeshStandardMaterial({
      color: 0x0d111d,
      roughness: 0.9,
    });
    for (let cx = -HALL_HALF; cx <= HALL_HALF; cx += 2) {
      for (let cz = -HALL_HALF; cz <= HALL_HALF; cz += 2) {
        if (Math.random() > 0.65) continue;
        const c = new THREE.Mesh(new THREE.BoxGeometry(2, 0.6, 2), ceilMat);
        c.position.set(cx, 9 + Math.random() * 0.4, cz);
        scene.add(c);
      }
    }

    // Voxel perimeter walls — staggered cubes.
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x141b2e,
      roughness: 0.9,
      flatShading: true,
    });
    const buildWall = (offsetX: number, offsetZ: number, axis: 'x' | 'z') => {
      const len = HALL_HALF * 2;
      for (let i = -HALL_HALF; i <= HALL_HALF; i += 1.5) {
        const h = 3 + Math.random() * 4;
        const w = new THREE.Mesh(new THREE.BoxGeometry(1.5, h, 1.5), wallMat);
        if (axis === 'x') w.position.set(i, h / 2, offsetZ);
        else w.position.set(offsetX, h / 2, i);
        w.castShadow = true;
        w.receiveShadow = true;
        scene.add(w);
      }
    };
    buildWall(0, -HALL_HALF, 'x');
    buildWall(0, HALL_HALF, 'x');
    buildWall(-HALL_HALF, 0, 'z');
    buildWall(HALL_HALF, 0, 'z');

    // Interior pillars on a coarse grid, each rotated/scaled differently to
    // give the hall variety. Player can hide behind them.
    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0x1f2942,
      roughness: 0.85,
      metalness: 0.15,
    });
    const pillarCells: { x: number; z: number }[] = [];
    for (let x = -HALL_HALF + PILLAR_GRID; x < HALL_HALF; x += PILLAR_GRID) {
      for (let z = -HALL_HALF + PILLAR_GRID; z < HALL_HALF; z += PILLAR_GRID) {
        if (Math.random() < 0.55) continue;
        pillarCells.push({ x, z });
        const w = 1.0 + Math.random() * 0.6;
        const h = 3 + Math.random() * 3;
        const px = x + (Math.random() - 0.5) * 0.6;
        const pz = z + (Math.random() - 0.5) * 0.6;
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), pillarMat);
        pillar.position.set(px, h / 2, pz);
        pillar.castShadow = true;
        pillar.receiveShadow = true;
        scene.add(pillar);
      }
    }

    // ─── Vaults ──────────────────────────────────────────────────────
    const vaults: Vault[] = [];
    const vaultBodyMat = new THREE.MeshStandardMaterial({
      color: 0x312e81,
      emissive: 0xfde047,
      emissiveIntensity: 0.4,
      metalness: 0.6,
      roughness: 0.35,
    });
    const vaultGlowMat = new THREE.MeshStandardMaterial({
      color: 0xfde047,
      emissive: 0xfacc15,
      emissiveIntensity: 1.4,
      metalness: 0.7,
      roughness: 0.2,
    });
    const placedXZ = new Set<string>();
    for (let i = 0; i < VAULT_COUNT; i++) {
      let attempts = 0;
      let vx = 0;
      let vz = 0;
      // Find a spot at least N units from spawn (0,0) and from other vaults.
      while (attempts++ < 200) {
        vx = (Math.random() - 0.5) * (HALL_HALF * 2 - 6);
        vz = (Math.random() - 0.5) * (HALL_HALF * 2 - 6);
        if (Math.hypot(vx, vz) < 6) continue;
        const k = `${Math.round(vx / 4)},${Math.round(vz / 4)}`;
        if (placedXZ.has(k)) continue;
        placedXZ.add(k);
        break;
      }
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.8, 1.2), vaultBodyMat);
      body.castShadow = true;
      body.receiveShadow = true;
      g.add(body);
      const glow = new THREE.Mesh(
        new THREE.TorusGeometry(0.55, 0.07, 6, 24),
        vaultGlowMat,
      );
      glow.position.z = 0.65;
      g.add(glow);
      g.position.set(vx, 0.95, vz);
      g.rotation.y = Math.random() * Math.PI * 2;
      scene.add(g);
      const pl = new THREE.PointLight(0xfde047, 0.8, 8, 1.5);
      pl.position.set(vx, 1.5, vz);
      scene.add(pl);
      vaults.push({
        group: g,
        pos: g.position,
        cracked: false,
        progress: 0,
        pointLight: pl,
      });
    }

    // ─── Lasers (sweeping vertical planes) ──────────────────────────
    const lasers: Laser[] = [];
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xf43f5e,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    for (let i = 0; i < LASER_COUNT; i++) {
      const g = new THREE.Group();
      const length = 16 + Math.random() * 8;
      const beam = new THREE.Mesh(new THREE.PlaneGeometry(length, 7), beamMat);
      beam.position.y = 3.5;
      beam.rotation.y = Math.PI / 2;
      g.add(beam);
      // Edge bars for visibility.
      const barMat = new THREE.MeshStandardMaterial({
        color: 0xf43f5e,
        emissive: 0xf43f5e,
        emissiveIntensity: 1.5,
      });
      const barTop = new THREE.Mesh(
        new THREE.BoxGeometry(length, 0.1, 0.12),
        barMat,
      );
      barTop.position.set(0, 7, 0);
      const barBot = new THREE.Mesh(
        new THREE.BoxGeometry(length, 0.1, 0.12),
        barMat,
      );
      barBot.position.set(0, 0.05, 0);
      g.add(barTop);
      g.add(barBot);
      const angle = Math.random() * Math.PI * 2;
      g.position.set(Math.cos(angle) * 6, 0, Math.sin(angle) * 6);
      g.rotation.y = angle;
      scene.add(g);
      lasers.push({
        group: g,
        beam,
        pos: g.position,
        dir: new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)),
        angle: Math.random() * Math.PI * 2,
        speed: 0.6 + Math.random() * 0.6,
        length,
      });
    }

    // ─── Player ─────────────────────────────────────────────────────
    const playerGroup = new THREE.Group();
    const playerBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 1.6, 0.7),
      new THREE.MeshStandardMaterial({
        color: 0x0ea5e9,
        emissive: 0x0c4a6e,
        emissiveIntensity: 0.6,
        metalness: 0.4,
        roughness: 0.35,
      }),
    );
    playerBody.castShadow = true;
    playerBody.position.y = 0.8;
    playerGroup.add(playerBody);
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.18, 0.4),
      new THREE.MeshStandardMaterial({
        color: 0xfde047,
        emissive: 0xfacc15,
        emissiveIntensity: 1.5,
      }),
    );
    visor.position.set(0, 1.5, 0.18);
    playerGroup.add(visor);
    scene.add(playerGroup);

    const playerLamp = new THREE.PointLight(0xa5f3fc, 0.7, 6, 1.5);
    playerLamp.position.y = 2;
    playerGroup.add(playerLamp);

    // ─── State ──────────────────────────────────────────────────────
    const player = {
      pos: new THREE.Vector3(0, 0, 0),
      vel: new THREE.Vector3(),
      facing: 0,
      hp: HP_MAX,
      invuln: 0,
    };
    let score = 0;
    let timeLeft = TIME_START;
    let vaultsCracked = 0;
    let crackingVault: Vault | null = null;
    let status: 'playing' | 'lost' = 'playing';
    let shake = 0;
    let bestScore = 0;
    try {
      bestScore = Number(localStorage.getItem('arcadery:voxel-heist:best') ?? 0);
    } catch {}

    // ─── Input ──────────────────────────────────────────────────────
    const keys = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)
      )
        e.preventDefault();
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

    // ─── Pulses ─────────────────────────────────────────────────────
    interface Pulse {
      mesh: THREE.Mesh;
      ttl: number;
      maxTtl: number;
      expand: number;
    }
    const pulses: Pulse[] = [];
    const spawnPulse = (
      x: number,
      y: number,
      z: number,
      color: number,
      expand: number,
    ) => {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.6, 12, 12),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.9,
          blending: THREE.AdditiveBlending,
        }),
      );
      m.position.set(x, y, z);
      scene.add(m);
      pulses.push({ mesh: m, ttl: 0.6, maxTtl: 0.6, expand });
    };

    // ─── Loop ───────────────────────────────────────────────────────
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
      const sprint = (keys.has('shift') ? 1 : 0) + input.sprint;
      const interact = (keys.has('e') || keys.has(' ') ? 1 : 0) + input.interact;

      if (status === 'playing') {
        // Time tick.
        timeLeft -= dt;
        if (timeLeft <= 0) {
          timeLeft = 0;
          status = 'lost';
        }

        // ── Move ───────────────────────────────────────────────────
        const moveDir = new THREE.Vector3(right - left, 0, fwd - back);
        if (moveDir.lengthSq() > 0.01) {
          moveDir.normalize();
          const speed = PLAYER_SPEED * (sprint > 0.5 ? SPRINT_MULT : 1);
          player.vel.copy(moveDir).multiplyScalar(speed);
          player.facing = Math.atan2(moveDir.x, moveDir.z);
        } else {
          player.vel.set(0, 0, 0);
        }
        // Integrate, then clamp to hall + reject pillar overlap (super-simple
        // circle reject against each pillar cell).
        const nextX = player.pos.x + player.vel.x * dt;
        const nextZ = player.pos.z + player.vel.z * dt;
        const tryPos = new THREE.Vector3(nextX, 0, nextZ);
        if (Math.abs(tryPos.x) < HALL_HALF - 1) player.pos.x = tryPos.x;
        if (Math.abs(tryPos.z) < HALL_HALF - 1) player.pos.z = tryPos.z;
        for (const cell of pillarCells) {
          const dx = player.pos.x - cell.x;
          const dz = player.pos.z - cell.z;
          const d = Math.hypot(dx, dz);
          if (d < 1.1) {
            // Push out.
            const push = (1.1 - d) || 0.05;
            player.pos.x += (dx / (d || 1)) * push;
            player.pos.z += (dz / (d || 1)) * push;
          }
        }

        // ── Lasers ─────────────────────────────────────────────────
        for (const L of lasers) {
          // Sweep in a slow circle around their anchor.
          L.angle += L.speed * dt;
          const r = 7 + Math.sin(L.angle * 0.4) * 3;
          L.pos.x += Math.cos(L.angle) * dt * L.speed * 2;
          L.pos.z += Math.sin(L.angle * 1.1) * dt * L.speed * 2;
          // Containment.
          const lr = Math.hypot(L.pos.x, L.pos.z);
          if (lr > HALL_HALF - 4) {
            L.pos.x *= (HALL_HALF - 4) / lr;
            L.pos.z *= (HALL_HALF - 4) / lr;
          }
          L.group.position.copy(L.pos);
          L.group.rotation.y = L.angle * 0.9;
          // Hit test — the laser is a beam (PlaneGeometry length × 7 height).
          // We treat it as a 2D segment from -length/2..+length/2 along the
          // local X after the y-rotation. Compute the player's distance to
          // that segment in world XZ.
          const cos = Math.cos(L.group.rotation.y);
          const sin = Math.sin(L.group.rotation.y);
          const dx = player.pos.x - L.pos.x;
          const dz = player.pos.z - L.pos.z;
          // Rotate into laser-local frame.
          const localX = dx * cos + dz * sin;
          const localZ = -dx * sin + dz * cos;
          const clampedX = Math.max(-L.length / 2, Math.min(L.length / 2, localX));
          const distToBeam = Math.hypot(localX - clampedX, localZ);
          if (distToBeam < 0.6 && player.invuln <= 0) {
            player.hp -= 1;
            player.invuln = 0.8;
            shake = 22;
            spawnPulse(player.pos.x, 1, player.pos.z, 0xf43f5e, 2.5);
            if (player.hp <= 0) status = 'lost';
          }
        }

        // ── Vault interaction ───────────────────────────────────────
        const nearest: { vault: Vault | null; dist: number } = {
          vault: null,
          dist: Infinity,
        };
        for (const v of vaults) {
          if (v.cracked) continue;
          const dx = v.pos.x - player.pos.x;
          const dz = v.pos.z - player.pos.z;
          const d = Math.hypot(dx, dz);
          if (d < VAULT_RADIUS && d < nearest.dist) {
            nearest.vault = v;
            nearest.dist = d;
          }
        }
        if (nearest.vault && interact > 0.5) {
          crackingVault = nearest.vault;
          nearest.vault.progress = Math.min(
            1,
            nearest.vault.progress + dt / VAULT_CRACK_TIME,
          );
          // Pulse the vault as it cracks.
          const s = 1 + Math.sin(now * 0.02) * 0.05 * nearest.vault.progress;
          nearest.vault.group.scale.set(s, s, s);
          if (nearest.vault.progress >= 1) {
            nearest.vault.cracked = true;
            vaultsCracked += 1;
            const timeBonus = Math.max(2, VAULT_TIME_BONUS - vaultsCracked);
            timeLeft += timeBonus;
            score += VAULT_SCORE + Math.round(timeLeft) * 10;
            spawnPulse(nearest.vault.pos.x, 1.5, nearest.vault.pos.z, 0xfde047, 5);
            shake = Math.max(shake, 12);
            // Hide the vault — replace mat with a faded one.
            (nearest.vault.group.children[0] as THREE.Mesh).material =
              new THREE.MeshStandardMaterial({
                color: 0x312e81,
                emissive: 0x16a34a,
                emissiveIntensity: 0.4,
              });
            (nearest.vault.group.children[1] as THREE.Mesh).material =
              new THREE.MeshStandardMaterial({
                color: 0x16a34a,
                emissive: 0x16a34a,
                emissiveIntensity: 0.5,
                transparent: true,
                opacity: 0.5,
              });
            nearest.vault.pointLight.intensity = 0.2;
            nearest.vault.pointLight.color = new THREE.Color(0x16a34a);
            // All vaults cracked? Time bonus + scaling rewards.
            if (vaultsCracked === VAULT_COUNT) {
              score += 1000;
              status = 'lost'; // Heist complete — end the run.
            }
            crackingVault = null;
          }
        } else {
          // Decay cracking progress when player walks away.
          for (const v of vaults) {
            if (v.cracked) continue;
            if (v !== nearest.vault) v.progress = Math.max(0, v.progress - dt * 0.5);
            else if (interact <= 0.5) v.progress = Math.max(0, v.progress - dt * 0.7);
          }
          crackingVault = null;
        }

        // ── Pulses ──────────────────────────────────────────────────
        for (let i = pulses.length - 1; i >= 0; i--) {
          const p = pulses[i];
          p.ttl -= dt;
          const t = 1 - p.ttl / p.maxTtl;
          (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(
            0,
            1 - t,
          );
          p.mesh.scale.setScalar(1 + t * p.expand);
          if (p.ttl <= 0) {
            scene.remove(p.mesh);
            pulses.splice(i, 1);
          }
        }

        player.invuln = Math.max(0, player.invuln - dt);
      }

      // ── Transforms ──────────────────────────────────────────────
      playerGroup.position.set(player.pos.x, 0, player.pos.z);
      playerGroup.rotation.y = player.facing;
      if (player.invuln > 0) {
        playerBody.visible = Math.floor(player.invuln * 12) % 2 === 0;
      } else {
        playerBody.visible = true;
      }
      // Vault idle bob.
      for (const v of vaults) {
        if (!v.cracked) {
          v.group.rotation.y += 0.6 * (1 / 60);
          v.pointLight.intensity = 0.6 + Math.sin(now * 0.005) * 0.3;
        }
      }
      // Laser pulse.
      for (const L of lasers) {
        (L.beam.material as THREE.MeshBasicMaterial).opacity =
          0.4 + Math.sin(now * 0.01 + L.angle) * 0.18;
      }

      // ── Camera (3rd-person follow with low pitch + slight tilt) ──
      const camTarget = new THREE.Vector3(
        player.pos.x - Math.sin(player.facing) * 6,
        player.pos.y + 4.5,
        player.pos.z - Math.cos(player.facing) * 6,
      );
      camera.position.lerp(camTarget, 0.12);
      camera.lookAt(player.pos.x, 1.2, player.pos.z);
      if (shake > 0) {
        camera.position.x += (Math.random() - 0.5) * shake * 0.04;
        camera.position.y += (Math.random() - 0.5) * shake * 0.04;
      }
      shake *= 0.86;

      // Persist best.
      if (status === 'lost' && score > bestScore) {
        bestScore = score;
        try {
          localStorage.setItem('arcadery:voxel-heist:best', String(bestScore));
        } catch {}
      }

      renderer.render(scene, camera);

      if (now - lastUi > 90) {
        lastUi = now;
        setUi({
          status,
          score,
          hp: Math.max(0, player.hp),
          timeLeft: Math.max(0, timeLeft),
          vaultsCracked,
          bestScore: Math.max(bestScore, score),
          cracking: crackingVault ? crackingVault.progress : 0,
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
    };
  }, [runId]);

  return (
    <div className="absolute inset-0 bg-[#06080d] overflow-hidden">
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
          <div className="text-[10px] uppercase tracking-widest text-amber-200/60">
            Score
          </div>
          <div className="text-2xl font-bold tabular-nums text-amber-100">
            {ui.score.toLocaleString()}
          </div>
        </div>
        <div className="rounded-lg bg-black/60 backdrop-blur px-3 py-2">
          <div className="text-[10px] uppercase tracking-widest text-amber-200/60">
            Best
          </div>
          <div className="text-sm font-bold tabular-nums text-amber-200">
            {ui.bestScore.toLocaleString()}
          </div>
        </div>
      </div>
      <div className="pointer-events-none absolute top-16 right-4 z-10 flex flex-col items-end gap-2 font-mono text-white">
        <div
          className={`rounded-lg backdrop-blur px-3 py-2 text-right tabular-nums ${
            ui.timeLeft < 10 ? 'bg-rose-500/40 animate-pulse' : 'bg-black/60'
          }`}
        >
          <div className="text-[10px] uppercase tracking-widest text-rose-200/70">
            Time
          </div>
          <div className="text-2xl font-bold text-white">
            {ui.timeLeft.toFixed(1)}s
          </div>
        </div>
        <div className="rounded-lg bg-black/60 backdrop-blur px-3 py-2 text-right">
          <div className="text-[10px] uppercase tracking-widest text-amber-200/60">
            Vaults
          </div>
          <div className="text-xl font-bold tabular-nums text-amber-100">
            {ui.vaultsCracked}
          </div>
        </div>
        <div className="rounded-lg bg-black/60 backdrop-blur px-3 py-2 text-right">
          <div className="text-[10px] uppercase tracking-widest text-amber-200/60">
            HP
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
      </div>
      {ui.cracking > 0 && (
        <div className="pointer-events-none absolute bottom-20 left-1/2 -translate-x-1/2 z-10 w-56 font-mono">
          <div className="text-[10px] uppercase tracking-widest text-amber-200/80 mb-1 text-center">
            Cracking vault…
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-300 to-amber-500 transition-[width] duration-75"
              style={{ width: `${Math.round(ui.cracking * 100)}%` }}
            />
          </div>
        </div>
      )}
      {ui.status === 'lost' && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="rounded-2xl border border-amber-400/20 bg-[#0c0a18] p-8 text-center max-w-md font-mono">
            <h2 className="text-4xl font-black mb-2 text-amber-300">
              {ui.vaultsCracked >= VAULT_COUNT ? 'CLEAN GET' : 'ALARM'}
            </h2>
            <p className="text-sm text-white/50 mb-4">
              {ui.vaultsCracked >= VAULT_COUNT
                ? 'Every vault cracked. You vanished into the night.'
                : ui.hp === 0
                  ? 'Lasers got you before the loot did.'
                  : 'The clock ran out.'}
            </p>
            <div className="space-y-1 text-sm mb-6 text-white/80">
              <div>
                Score:{' '}
                <span className="text-amber-300 font-bold tabular-nums">
                  {ui.score.toLocaleString()}
                </span>
              </div>
              <div>
                Best:{' '}
                <span className="text-amber-200 font-bold tabular-nums">
                  {ui.bestScore.toLocaleString()}
                </span>
              </div>
              <div>
                Vaults cracked:{' '}
                <span className="text-white font-bold">{ui.vaultsCracked}</span>
              </div>
            </div>
            <button
              onClick={onRestart}
              className="rounded-full bg-amber-400 hover:bg-amber-300 px-6 py-2.5 text-sm font-semibold text-stone-900 transition-colors"
            >
              Another job
            </button>
          </div>
        </div>
      )}
      <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 z-10 text-[10px] uppercase tracking-[0.4em] text-white/30 font-mono">
        WASD move · Shift sprint · E crack vault · Dodge red lasers
      </div>
    </>
  );
}

const VAULT_COUNT_DISPLAY = 8;

function MobileControls({
  inputRef,
  status,
}: {
  inputRef: React.RefObject<{
    left: number;
    right: number;
    fwd: number;
    back: number;
    sprint: number;
    interact: number;
  } | null>;
  status: RunUi['status'];
}) {
  if (status !== 'playing') return null;
  const press = (
    k: 'left' | 'right' | 'fwd' | 'back' | 'sprint' | 'interact',
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
    k: 'left' | 'right' | 'fwd' | 'back' | 'sprint' | 'interact';
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
      className={`select-none rounded-full bg-amber-500/15 backdrop-blur active:bg-amber-400/30 border border-amber-300/30 flex items-center justify-center font-bold text-amber-100 touch-none ${cls ?? ''}`}
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
            label="CRACK"
            k="interact"
            cls="w-20 h-16 bg-amber-500/30 border-amber-300/40 text-amber-100 text-xs"
          />
          <Btn
            label="SPRINT"
            k="sprint"
            cls="w-20 h-10 bg-cyan-500/30 border-cyan-300/40 text-xs"
          />
        </div>
      </div>
    </div>
  );
}

// Silence unused-var warning — VAULT_COUNT_DISPLAY documents the gameplay
// constant for HUD copy and may be referenced by future tutorial UI.
void VAULT_COUNT_DISPLAY;
