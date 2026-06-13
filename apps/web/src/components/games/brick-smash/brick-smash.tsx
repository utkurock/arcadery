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

// Modern 3D breakout. The play field is a flat box: paddle slides along -Z
// edge, ball bounces between walls and brick wall along +Z. Each level adds
// rows; brick HP is encoded in the row color.
//
// Coordinates:
//   X: -W/2 .. +W/2 (paddle horizontal axis)
//   Y: 0 (everything is on the floor plane)
//   Z: -D/2 (paddle) .. +D/2 (back wall)

const FIELD_W = 16;
const FIELD_D = 22;
const PADDLE_W = 3.0;
const PADDLE_H = 0.6;
const PADDLE_D = 0.6;
const BALL_R = 0.35;

interface GameUi {
  status: 'playing' | 'won' | 'lost';
  score: number;
  lives: number;
  level: number;
  bricksLeft: number;
  highScore: number;
  bricksDestroyed: number;
  /** Active power-up indicators: seconds remaining (or catches for sticky). */
  wideS: number;
  slowS: number;
  laserS: number;
  stickyN: number;
}

const INITIAL_UI: GameUi = {
  status: 'playing',
  score: 0,
  lives: 3,
  level: 1,
  bricksLeft: 0,
  highScore: 0,
  bricksDestroyed: 0,
  wideS: 0,
  slowS: 0,
  laserS: 0,
  stickyN: 0,
};

interface Brick {
  mesh: THREE.Mesh;
  /** Remaining hits before destruction. */
  hp: number;
  maxHp: number;
  scoreValue: number;
  /** World-space AABB cached for fast collision tests. */
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

interface Ball {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  /** When true the ball is glued to the paddle until launched. */
  stuck: boolean;
  /** Where on the paddle the ball sits while stuck (sticky catches keep it). */
  offsetX: number;
}

interface PowerUp {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  kind: 'wide' | 'multi' | 'slow' | 'laser' | 'sticky';
}

const BRICK_PALETTE: Array<[number, number, number]> = [
  // [color, hp, score]
  [0xff5577, 1, 10],
  [0xffaa33, 1, 10],
  [0xfde047, 2, 20],
  [0x4ade80, 2, 20],
  [0x60a5fa, 3, 40],
  [0xa78bfa, 3, 40],
];

interface BrickSmashProps {
  gameContext: GameContext;
  onExit?: () => void;
}

const LEADERBOARD_CONFIG: LeaderboardConfig = {
  gameKey: 'brick-smash',
  title: 'Brick Smash — top scores',
  primaryLabel: 'Score',
  primaryField: 'score',
  secondaryLabel: 'Level',
  secondaryField: 'level_reached',
};

export function BrickSmash({ gameContext, onExit }: BrickSmashProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [ui, setUi] = useState<GameUi>(INITIAL_UI);
  const [runId, setRunId] = useState(0);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const statusRef = useRef<GameUi['status']>('playing');
  statusRef.current = ui.status;
  const gameStartRef = useRef<number>(performance.now());
  const inputRef = useRef({ paddleX: 0, mouseControl: false, launch: 0 });

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
    if ((ui.status !== 'won' && ui.status !== 'lost') || submitted) return;
    setSubmitted(true);
    const durationSec = Math.max(0, (performance.now() - gameStartRef.current) / 1000);
    fetch('/api/games/brick-smash/scores', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        wallet: gameContext.wallet,
        score: ui.score,
        levelReached: ui.level,
        bricksDestroyed: ui.bricksDestroyed,
        durationSec,
        won: ui.status === 'won',
        entrySignature: gameContext.entrySignature,
      }),
    }).catch((err) => console.warn('brick-smash score submit failed', err));
  }, [ui.status, ui.score, ui.level, ui.bricksDestroyed, submitted, gameContext]);

  useEffect(() => {
    gameStartRef.current = performance.now();
    setSubmitted(false);
    pausedRef.current = false;
    setPaused(false);
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
    scene.background = new THREE.Color(0x07101c);
    scene.fog = new THREE.Fog(0x07101c, 28, 60);

    // Camera: slight tilt — straight-on enough to read brick layout, low
    // enough that you can see the ball curving in 3D.
    const camera = new THREE.PerspectiveCamera(
      50,
      mount.clientWidth / mount.clientHeight,
      0.1,
      100,
    );
    camera.position.set(0, 22, -18);
    camera.lookAt(0, 0, 4);

    // ─── Lights ─────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0x4a607a, 0.45));
    const hemi = new THREE.HemisphereLight(0x88bbff, 0x1a2030, 0.7);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2dd, 1.5);
    sun.position.set(8, 24, -6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -FIELD_W;
    sun.shadow.camera.right = FIELD_W;
    sun.shadow.camera.top = FIELD_D;
    sun.shadow.camera.bottom = -FIELD_D;
    sun.shadow.bias = -0.0005;
    scene.add(sun);

    // ─── Floor + walls ──────────────────────────────────────────────────
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0d1b2c,
      roughness: 0.95,
      metalness: 0.0,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(FIELD_W, FIELD_D), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = 0;
    floor.receiveShadow = true;
    scene.add(floor);

    // Grid texture for the floor — faint emissive lines that pulse subtly.
    const gridGroup = new THREE.Group();
    const gridMat = new THREE.MeshBasicMaterial({
      color: 0x2c5aa8,
      transparent: true,
      opacity: 0.25,
    });
    for (let i = -FIELD_W / 2; i <= FIELD_W / 2; i += 2) {
      const lineGeo = new THREE.BoxGeometry(0.04, 0.005, FIELD_D);
      const line = new THREE.Mesh(lineGeo, gridMat);
      line.position.x = i;
      line.position.y = 0.01;
      gridGroup.add(line);
    }
    for (let j = -FIELD_D / 2; j <= FIELD_D / 2; j += 2) {
      const lineGeo = new THREE.BoxGeometry(FIELD_W, 0.005, 0.04);
      const line = new THREE.Mesh(lineGeo, gridMat);
      line.position.z = j;
      line.position.y = 0.01;
      gridGroup.add(line);
    }
    scene.add(gridGroup);

    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x183558,
      emissive: 0x1d3a6d,
      emissiveIntensity: 0.6,
      metalness: 0.4,
      roughness: 0.5,
    });
    // Left, right, back walls (no front — that's where you lose the ball).
    const wallH = 0.8;
    const wallL = new THREE.Mesh(new THREE.BoxGeometry(0.4, wallH, FIELD_D), wallMat);
    wallL.position.set(-FIELD_W / 2 - 0.2, wallH / 2, 0);
    wallL.castShadow = true;
    wallL.receiveShadow = true;
    scene.add(wallL);
    const wallR = new THREE.Mesh(new THREE.BoxGeometry(0.4, wallH, FIELD_D), wallMat);
    wallR.position.set(FIELD_W / 2 + 0.2, wallH / 2, 0);
    wallR.castShadow = true;
    wallR.receiveShadow = true;
    scene.add(wallR);
    const wallB = new THREE.Mesh(new THREE.BoxGeometry(FIELD_W + 0.8, wallH, 0.4), wallMat);
    wallB.position.set(0, wallH / 2, FIELD_D / 2 + 0.2);
    wallB.castShadow = true;
    wallB.receiveShadow = true;
    scene.add(wallB);

    // ─── Paddle ─────────────────────────────────────────────────────────
    let paddleWidth = PADDLE_W;
    const paddleMat = new THREE.MeshStandardMaterial({
      color: 0x67e8f9,
      emissive: 0x0e7490,
      emissiveIntensity: 0.6,
      metalness: 0.4,
      roughness: 0.3,
    });
    const paddleGeo = new THREE.BoxGeometry(paddleWidth, PADDLE_H, PADDLE_D);
    const paddle = new THREE.Mesh(paddleGeo, paddleMat);
    paddle.position.set(0, PADDLE_H / 2, -FIELD_D / 2 + 1.5);
    paddle.castShadow = true;
    paddle.receiveShadow = true;
    scene.add(paddle);

    // ─── Bricks ─────────────────────────────────────────────────────────
    const bricks: Brick[] = [];
    const brickGeo = new THREE.BoxGeometry(1.4, 0.7, 0.8);

    const buildLevel = (level: number) => {
      // Clear existing.
      for (const b of bricks) scene.remove(b.mesh);
      bricks.length = 0;
      const rows = Math.min(BRICK_PALETTE.length, 3 + level);
      const cols = 10;
      const gridW = cols * 1.5; // 1.4 brick + 0.1 gap
      const startX = -gridW / 2 + 0.75;
      const startZ = FIELD_D / 2 - 2;
      for (let row = 0; row < rows; row++) {
        const [color, hp, scoreValue] = BRICK_PALETTE[
          (BRICK_PALETTE.length - rows + row) % BRICK_PALETTE.length
        ];
        const mat = new THREE.MeshStandardMaterial({
          color,
          emissive: new THREE.Color(color).multiplyScalar(0.18),
          metalness: 0.3,
          roughness: 0.4,
        });
        for (let col = 0; col < cols; col++) {
          const mesh = new THREE.Mesh(brickGeo, mat);
          const x = startX + col * 1.5;
          const z = startZ - row * 1.0;
          mesh.position.set(x, 0.35, z);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          scene.add(mesh);
          bricks.push({
            mesh,
            hp,
            maxHp: hp,
            scoreValue,
            minX: x - 0.7,
            maxX: x + 0.7,
            minZ: z - 0.4,
            maxZ: z + 0.4,
          });
        }
      }
    };

    let level = 1;
    buildLevel(level);

    // ─── Ball ───────────────────────────────────────────────────────────
    const ballGeo = new THREE.SphereGeometry(BALL_R, 22, 16);
    const ballMat = new THREE.MeshStandardMaterial({
      color: 0xfde047,
      emissive: 0xfacc15,
      emissiveIntensity: 0.9,
      metalness: 0.4,
      roughness: 0.2,
    });
    const balls: Ball[] = [];
    const ballMeshes: THREE.Mesh[] = [];

    const spawnBall = (stuck = true) => {
      const m = new THREE.Mesh(ballGeo, ballMat);
      m.castShadow = true;
      scene.add(m);
      ballMeshes.push(m);
      const startPos = new THREE.Vector3(paddle.position.x, BALL_R, paddle.position.z + 0.8);
      balls.push({
        pos: startPos,
        vel: new THREE.Vector3(0, 0, 0),
        stuck,
        offsetX: 0,
      });
    };

    spawnBall(true);

    // Power-ups occasionally drop from destroyed bricks.
    const powerUps: PowerUp[] = [];
    const powerUpMats = {
      wide: new THREE.MeshStandardMaterial({
        color: 0x60a5fa,
        emissive: 0x2563eb,
        emissiveIntensity: 1.0,
      }),
      multi: new THREE.MeshStandardMaterial({
        color: 0xf472b6,
        emissive: 0xdb2777,
        emissiveIntensity: 1.0,
      }),
      slow: new THREE.MeshStandardMaterial({
        color: 0x4ade80,
        emissive: 0x16a34a,
        emissiveIntensity: 1.0,
      }),
      laser: new THREE.MeshStandardMaterial({
        color: 0xf87171,
        emissive: 0xdc2626,
        emissiveIntensity: 1.0,
      }),
      sticky: new THREE.MeshStandardMaterial({
        color: 0xa3e635,
        emissive: 0x65a30d,
        emissiveIntensity: 1.0,
      }),
    };
    const powerUpGeo = new THREE.OctahedronGeometry(0.35, 0);

    // Laser bolts fired by the laser-paddle power-up.
    const bolts: { mesh: THREE.Mesh }[] = [];
    const boltGeo = new THREE.BoxGeometry(0.12, 0.12, 0.7);
    const boltMat = new THREE.MeshStandardMaterial({
      color: 0xff6b6b,
      emissive: 0xef4444,
      emissiveIntensity: 1.4,
    });

    // Particle pool for brick destruction.
    const particles: { mesh: THREE.Mesh; vel: THREE.Vector3; ttl: number; maxTtl: number }[] = [];

    // ─── Game state ─────────────────────────────────────────────────────
    let lives = 3;
    let score = 0;
    let status: 'playing' | 'won' | 'lost' = 'playing';
    let wideTimer = 0;
    let slowTimer = 0;
    let laserTimer = 0;
    let laserCooldown = 0;
    let stickyCatches = 0;
    let bricksDestroyed = 0;
    let bestScore = 0;
    try {
      bestScore = Number(localStorage.getItem('arcadery:brick-smash:hs') ?? 0);
    } catch {}

    // Sfx throttles — multi-ball chaos can hit dozens of bricks per second.
    let lastBrickSfx = 0;
    let lastBounceSfx = 0;
    const wallBounceSfx = (now: number) => {
      if (now - lastBounceSfx < 60) return;
      lastBounceSfx = now;
      gameAudio.tone({ freq: 240, type: 'triangle', duration: 0.05, volume: 0.07 });
    };

    /** Deal 1 HP of damage to bricks[i]; handles score, drops, sfx, particles. */
    const damageBrick = (i: number, now: number): boolean => {
      const br = bricks[i];
      br.hp -= 1;
      if (br.hp <= 0) {
        scene.remove(br.mesh);
        bricks.splice(i, 1);
        score += br.scoreValue;
        bricksDestroyed += 1;
        emitBurst(scene, particles, br.mesh.position, (br.mesh.material as THREE.MeshStandardMaterial).color);
        if (now - lastBrickSfx > 100) {
          lastBrickSfx = now;
          gameAudio.crumble();
        }
        // 12% chance to drop a power-up.
        if (Math.random() < 0.12) {
          const kinds: PowerUp['kind'][] = ['wide', 'multi', 'slow', 'laser', 'sticky'];
          const k = kinds[Math.floor(Math.random() * kinds.length)];
          const m = new THREE.Mesh(powerUpGeo, powerUpMats[k]);
          m.position.copy(br.mesh.position);
          m.castShadow = true;
          scene.add(m);
          powerUps.push({ mesh: m, pos: m.position.clone(), kind: k });
        }
        return true;
      }
      // Damage tint — darken the brick a bit so multi-hit shows.
      const mat = br.mesh.material as THREE.MeshStandardMaterial;
      mat.color.multiplyScalar(0.82);
      if (now - lastBrickSfx > 100) {
        lastBrickSfx = now;
        gameAudio.tick();
      }
      return false;
    };

    // ─── Inputs ─────────────────────────────────────────────────────────
    const keys = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      gameAudio.unlock();
      keys.add(e.key.toLowerCase());
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // Mouse — map cursor X within the canvas to paddle X. Falls back to
    // keyboard if the user doesn't move the mouse.
    let mouseX = 0;
    let mouseInside = false;
    const onMouseMove = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width;
      mouseX = (nx - 0.5) * FIELD_W;
      mouseInside = true;
      inputRef.current.mouseControl = true;
    };
    const onMouseDown = () => {
      gameAudio.unlock();
      inputRef.current.launch = 1;
    };
    renderer.domElement.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('mousedown', onMouseDown);

    const onResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);

    // ─── Loop ───────────────────────────────────────────────────────────
    let lastTime = performance.now();
    let lastUi = 0;
    let raf = 0;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      // Paused: keep rendering the frozen scene, skip all simulation.
      // `lastTime` keeps advancing so resume doesn't get a giant dt — and all
      // power-up timers are dt-accumulated, so they freeze too.
      if (pausedRef.current) {
        renderer.render(scene, camera);
        return;
      }

      const input = inputRef.current;
      // Paddle X: prefer mouse if it's been used; otherwise keyboard.
      const targetX = input.mouseControl
        ? THREE.MathUtils.clamp(mouseX, -FIELD_W / 2 + paddleWidth / 2, FIELD_W / 2 - paddleWidth / 2)
        : paddle.position.x +
          ((keys.has('arrowleft') || keys.has('a') ? -1 : 0) +
            (keys.has('arrowright') || keys.has('d') ? 1 : 0) +
            input.paddleX) *
            18 *
            dt;
      paddle.position.x = THREE.MathUtils.clamp(
        targetX,
        -FIELD_W / 2 + paddleWidth / 2,
        FIELD_W / 2 - paddleWidth / 2,
      );

      // Paddle width transitions for power-ups.
      const targetWidth = wideTimer > 0 ? PADDLE_W * 1.7 : PADDLE_W;
      if (Math.abs(paddleWidth - targetWidth) > 0.01) {
        paddleWidth += (targetWidth - paddleWidth) * Math.min(1, 6 * dt);
        paddle.scale.x = paddleWidth / PADDLE_W;
      }
      wideTimer = Math.max(0, wideTimer - dt);
      slowTimer = Math.max(0, slowTimer - dt);
      laserTimer = Math.max(0, laserTimer - dt);

      // Paddle accent reflects the active special: red for laser, green for sticky.
      const accentColor = laserTimer > 0 ? 0xf87171 : stickyCatches > 0 ? 0x4ade80 : 0x67e8f9;
      const accentEmissive = laserTimer > 0 ? 0xb91c1c : stickyCatches > 0 ? 0x15803d : 0x0e7490;
      paddleMat.color.setHex(accentColor);
      paddleMat.emissive.setHex(accentEmissive);

      const launchPressed = keys.has(' ') || keys.has('space') || input.launch > 0;
      input.launch = 0;

      if (status === 'playing') {
        // Ball step.
        const speedScale = slowTimer > 0 ? 0.65 : 1.0;
        for (let bi = balls.length - 1; bi >= 0; bi--) {
          const b = balls[bi];
          if (b.stuck) {
            b.pos.x =
              paddle.position.x +
              THREE.MathUtils.clamp(b.offsetX, -paddleWidth / 2, paddleWidth / 2);
            b.pos.z = paddle.position.z + 0.8;
            b.pos.y = BALL_R + 0.4;
            if (launchPressed) {
              b.stuck = false;
              const speed = 12;
              // Sticky catches keep the catch offset so the player can aim;
              // fresh serves get a slight random tilt instead.
              const tilt =
                b.offsetX !== 0
                  ? THREE.MathUtils.clamp((b.offsetX / (paddleWidth / 2)) * 0.8, -0.8, 0.8)
                  : (Math.random() - 0.5) * 0.4;
              b.vel.set(Math.sin(tilt) * speed, 0, Math.cos(tilt) * speed);
              b.offsetX = 0;
              gameAudio.tone({ freq: 440, freqTo: 700, type: 'square', duration: 0.1, volume: 0.12 });
            }
            continue;
          }

          // Sub-step the ball to avoid tunneling through bricks.
          const steps = 3;
          const sdt = (dt * speedScale) / steps;
          for (let s = 0; s < steps; s++) {
            b.pos.x += b.vel.x * sdt;
            b.pos.z += b.vel.z * sdt;

            // Wall bounces.
            if (b.pos.x < -FIELD_W / 2 + BALL_R) {
              b.pos.x = -FIELD_W / 2 + BALL_R;
              b.vel.x = Math.abs(b.vel.x);
              wallBounceSfx(now);
            } else if (b.pos.x > FIELD_W / 2 - BALL_R) {
              b.pos.x = FIELD_W / 2 - BALL_R;
              b.vel.x = -Math.abs(b.vel.x);
              wallBounceSfx(now);
            }
            if (b.pos.z > FIELD_D / 2 - BALL_R) {
              b.pos.z = FIELD_D / 2 - BALL_R;
              b.vel.z = -Math.abs(b.vel.z);
              wallBounceSfx(now);
            }

            // Paddle bounce — only when ball is travelling toward the paddle
            // (negative Z velocity) and overlapping it.
            const paddleMinX = paddle.position.x - paddleWidth / 2 - BALL_R;
            const paddleMaxX = paddle.position.x + paddleWidth / 2 + BALL_R;
            const paddleMinZ = paddle.position.z - PADDLE_D / 2 - BALL_R;
            const paddleMaxZ = paddle.position.z + PADDLE_D / 2 + BALL_R;
            if (
              b.vel.z < 0 &&
              b.pos.x > paddleMinX &&
              b.pos.x < paddleMaxX &&
              b.pos.z > paddleMinZ &&
              b.pos.z < paddleMaxZ
            ) {
              if (stickyCatches > 0) {
                // Sticky paddle: catch the ball; relaunch aims from the
                // catch offset (same input as the initial launch).
                stickyCatches -= 1;
                b.stuck = true;
                b.offsetX = THREE.MathUtils.clamp(
                  b.pos.x - paddle.position.x,
                  -paddleWidth / 2,
                  paddleWidth / 2,
                );
                b.vel.set(0, 0, 0);
                gameAudio.tone({ freq: 500, freqTo: 750, type: 'sine', duration: 0.1, volume: 0.12 });
                break;
              }
              b.pos.z = paddleMaxZ;
              const hitOffset = (b.pos.x - paddle.position.x) / (paddleWidth / 2);
              const speed = Math.max(12, b.vel.length());
              // Reflect with an angle determined by where it hit the paddle.
              const angle = THREE.MathUtils.clamp(hitOffset * 0.8, -0.8, 0.8);
              b.vel.x = Math.sin(angle) * speed;
              b.vel.z = Math.cos(angle) * speed;
              // Bounce pitch varies with the hit position — edges ring higher.
              gameAudio.tone({
                freq: 400 + THREE.MathUtils.clamp(hitOffset, -1, 1) * 100,
                type: 'square',
                duration: 0.06,
                volume: 0.12,
              });
            }

            // Brick collisions (AABB sweep — check each brick).
            for (let i = bricks.length - 1; i >= 0; i--) {
              const br = bricks[i];
              if (
                b.pos.x > br.minX - BALL_R &&
                b.pos.x < br.maxX + BALL_R &&
                b.pos.z > br.minZ - BALL_R &&
                b.pos.z < br.maxZ + BALL_R
              ) {
                // Determine which axis to reflect — pick the smaller penetration.
                const penX =
                  b.vel.x > 0
                    ? b.pos.x - (br.minX - BALL_R)
                    : br.maxX + BALL_R - b.pos.x;
                const penZ =
                  b.vel.z > 0
                    ? b.pos.z - (br.minZ - BALL_R)
                    : br.maxZ + BALL_R - b.pos.z;
                if (penX < penZ) {
                  b.vel.x = -b.vel.x;
                  b.pos.x +=
                    b.vel.x > 0 ? penX : -penX; // push out along reflected axis
                } else {
                  b.vel.z = -b.vel.z;
                  b.pos.z += b.vel.z > 0 ? penZ : -penZ;
                }
                damageBrick(i, now);
                break;
              }
            }
          }

          // Lost ball — ball fell behind paddle.
          if (b.pos.z < -FIELD_D / 2 - BALL_R) {
            scene.remove(ballMeshes[bi]);
            ballMeshes.splice(bi, 1);
            balls.splice(bi, 1);
            gameAudio.hit();
            if (balls.length === 0) {
              lives -= 1;
              if (lives <= 0) {
                status = 'lost';
                gameAudio.gameover();
                bestScore = Math.max(bestScore, score);
                try {
                  localStorage.setItem('arcadery:brick-smash:hs', String(bestScore));
                } catch {}
              } else {
                spawnBall(true);
              }
            }
            continue;
          }
        }

        // Power-ups drop down toward paddle; collect on contact.
        for (let i = powerUps.length - 1; i >= 0; i--) {
          const p = powerUps[i];
          p.pos.z -= 5 * dt;
          p.mesh.position.z = p.pos.z;
          p.mesh.rotation.x += dt * 3;
          p.mesh.rotation.y += dt * 2;
          if (
            p.pos.z < paddle.position.z + PADDLE_D / 2 &&
            p.pos.z > paddle.position.z - PADDLE_D / 2 &&
            Math.abs(p.pos.x - paddle.position.x) < paddleWidth / 2 + 0.4
          ) {
            applyPowerUp(p.kind);
            gameAudio.powerup();
            scene.remove(p.mesh);
            powerUps.splice(i, 1);
          } else if (p.pos.z < -FIELD_D / 2) {
            scene.remove(p.mesh);
            powerUps.splice(i, 1);
          }
        }

        function applyPowerUp(kind: PowerUp['kind']) {
          if (kind === 'wide') wideTimer = 12;
          else if (kind === 'slow') slowTimer = 8;
          else if (kind === 'laser') {
            laserTimer = 8;
            laserCooldown = 0;
          } else if (kind === 'sticky') stickyCatches = 3;
          else if (kind === 'multi') {
            // Split each ball in two.
            const existing = [...balls];
            for (const orig of existing) {
              if (orig.stuck) continue;
              for (let i = 0; i < 2; i++) {
                const newBall: Ball = {
                  pos: orig.pos.clone(),
                  vel: orig.vel.clone(),
                  stuck: false,
                  offsetX: 0,
                };
                const angle = (i === 0 ? 1 : -1) * 0.5;
                const speed = newBall.vel.length();
                const dirX = newBall.vel.x;
                const dirZ = newBall.vel.z;
                newBall.vel.x = (dirX * Math.cos(angle) - dirZ * Math.sin(angle));
                newBall.vel.z = (dirX * Math.sin(angle) + dirZ * Math.cos(angle));
                void speed;
                balls.push(newBall);
                const m = new THREE.Mesh(ballGeo, ballMat);
                m.castShadow = true;
                scene.add(m);
                ballMeshes.push(m);
              }
            }
          }
        }

        // Laser paddle — fire twin bolts on a fixed cadence while active.
        if (laserTimer > 0) {
          laserCooldown -= dt;
          if (laserCooldown <= 0) {
            laserCooldown = 0.5;
            for (const side of [-1, 1]) {
              const m = new THREE.Mesh(boltGeo, boltMat);
              m.position.set(
                paddle.position.x + side * (paddleWidth / 2 - 0.2),
                0.35,
                paddle.position.z + PADDLE_D,
              );
              scene.add(m);
              bolts.push({ mesh: m });
            }
            gameAudio.laser();
          }
        }
        for (let i = bolts.length - 1; i >= 0; i--) {
          const bolt = bolts[i];
          bolt.mesh.position.z += 26 * dt;
          let spent = bolt.mesh.position.z > FIELD_D / 2;
          // Destroy the first brick the bolt touches (1 HP damage).
          for (let j = bricks.length - 1; j >= 0; j--) {
            const br = bricks[j];
            if (
              bolt.mesh.position.x > br.minX &&
              bolt.mesh.position.x < br.maxX &&
              bolt.mesh.position.z > br.minZ &&
              bolt.mesh.position.z < br.maxZ
            ) {
              damageBrick(j, now);
              spent = true;
              break;
            }
          }
          if (spent) {
            scene.remove(bolt.mesh);
            bolts.splice(i, 1);
          }
        }

        // Level clear.
        if (bricks.length === 0 && status === 'playing') {
          level += 1;
          if (level > 6) {
            status = 'won';
            gameAudio.victory();
            bestScore = Math.max(bestScore, score);
            try {
              localStorage.setItem('arcadery:brick-smash:hs', String(bestScore));
            } catch {}
          } else {
            // Rebuild brick layer + reset ball to paddle.
            gameAudio.levelup();
            buildLevel(level);
            for (const m of ballMeshes) scene.remove(m);
            ballMeshes.length = 0;
            balls.length = 0;
            for (const bolt of bolts) scene.remove(bolt.mesh);
            bolts.length = 0;
            spawnBall(true);
          }
        }
      }

      // Sync ball meshes.
      for (let i = 0; i < balls.length; i++) {
        ballMeshes[i].position.copy(balls[i].pos);
        // Subtle spin.
        ballMeshes[i].rotation.y += dt * 4;
      }

      // Particle physics.
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.mesh.position.x += p.vel.x * dt;
        p.mesh.position.y += p.vel.y * dt;
        p.mesh.position.z += p.vel.z * dt;
        p.vel.y -= 14 * dt;
        p.vel.multiplyScalar(0.97);
        p.ttl -= dt;
        const mat = p.mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0, p.ttl / p.maxTtl);
        if (p.ttl <= 0) {
          scene.remove(p.mesh);
          particles.splice(i, 1);
        }
      }

      renderer.render(scene, camera);

      if (now - lastUi > 100) {
        lastUi = now;
        setUi({
          status,
          score,
          lives,
          level,
          bricksLeft: bricks.length,
          highScore: Math.max(bestScore, score),
          bricksDestroyed,
          wideS: wideTimer,
          slowS: slowTimer,
          laserS: laserTimer,
          stickyN: stickyCatches,
        });
      }
    };
    raf = requestAnimationFrame(tick);

    void mouseInside; // mouseInside is updated but only consulted via inputRef.mouseControl

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('mousemove', onMouseMove);
      renderer.domElement.removeEventListener('mousedown', onMouseDown);
      renderer.dispose();
      boltGeo.dispose();
      boltMat.dispose();
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
    <div className="absolute inset-0 bg-[#07101c] overflow-hidden">
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
        accentClass="bg-cyan-600 hover:bg-cyan-500"
        hint="Mouse or A · D · Space launches"
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

function emitBurst(
  scene: THREE.Scene,
  particles: { mesh: THREE.Mesh; vel: THREE.Vector3; ttl: number; maxTtl: number }[],
  origin: THREE.Vector3,
  color: THREE.Color,
): void {
  const count = 14;
  const geo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
  for (let i = 0; i < count; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: color.clone(),
      transparent: true,
      opacity: 1,
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(origin);
    scene.add(m);
    const angle = (i / count) * Math.PI * 2;
    const speed = 3 + Math.random() * 4;
    particles.push({
      mesh: m,
      vel: new THREE.Vector3(
        Math.cos(angle) * speed,
        2 + Math.random() * 3,
        Math.sin(angle) * speed,
      ),
      ttl: 0.7 + Math.random() * 0.3,
      maxTtl: 1.0,
    });
  }
}

function Hud({
  ui,
  onRestart,
  onOpenLeaderboard,
  onPause,
  onExit,
}: {
  ui: GameUi;
  onRestart: () => void;
  onOpenLeaderboard: () => void;
  onPause: () => void;
  onExit?: () => void;
}) {
  const chipClass =
    'pointer-events-auto inline-flex items-center justify-center rounded-md border border-cyan-300/30 bg-cyan-400/10 p-1.5 text-cyan-200 hover:bg-cyan-400/20';
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
        <MuteButton className={chipClass} />
        {ui.status === 'playing' && <PauseButton onClick={onPause} className={chipClass} />}
        {onExit && (
          <button
            type="button"
            onClick={() => {
              if (ui.status === 'playing' && ui.lives > 0) {
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
          <div className="text-[10px] uppercase tracking-widest text-cyan-200/60">Score</div>
          <div className="text-2xl font-bold tabular-nums text-cyan-100">
            {ui.score.toLocaleString()}
          </div>
        </div>
        <div className="rounded-lg bg-black/55 backdrop-blur px-3 py-2">
          <div className="text-[10px] uppercase tracking-widest text-amber-200/60">High</div>
          <div className="text-sm font-bold tabular-nums text-amber-200">
            {ui.highScore.toLocaleString()}
          </div>
        </div>
        {(ui.wideS > 0 || ui.slowS > 0 || ui.laserS > 0 || ui.stickyN > 0) && (
          <div className="rounded-lg bg-black/55 backdrop-blur px-3 py-2 flex flex-col gap-0.5 text-[11px] font-semibold tabular-nums">
            {ui.wideS > 0 && <span className="text-sky-300">WIDE {Math.ceil(ui.wideS)}s</span>}
            {ui.slowS > 0 && <span className="text-emerald-300">SLOW {Math.ceil(ui.slowS)}s</span>}
            {ui.laserS > 0 && <span className="text-red-400">LASER {Math.ceil(ui.laserS)}s</span>}
            {ui.stickyN > 0 && <span className="text-lime-300">STICKY ×{ui.stickyN}</span>}
          </div>
        )}
      </div>
      <div className="pointer-events-none absolute top-16 right-4 z-10 flex flex-col items-end gap-2 font-mono text-white">
        <div className="rounded-lg bg-black/55 backdrop-blur px-3 py-2 text-right">
          <div className="text-[10px] uppercase tracking-widest text-cyan-200/60">Level</div>
          <div className="text-xl font-bold tabular-nums">
            {ui.level}<span className="text-sm text-white/40"> / 6</span>
          </div>
        </div>
        <div className="rounded-lg bg-black/55 backdrop-blur px-3 py-2 text-right">
          <div className="text-[10px] uppercase tracking-widest text-rose-200/60">Lives</div>
          <div className="text-xl font-bold text-rose-200">
            {Array.from({ length: ui.lives }).map((_, i) => (
              <span key={i} className="mr-0.5">●</span>
            ))}
          </div>
        </div>
        <div className="rounded-lg bg-black/55 backdrop-blur px-3 py-1.5 text-right text-xs">
          <span className="text-white/40">Bricks </span>
          <span className="text-fuchsia-200 tabular-nums">{ui.bricksLeft}</span>
        </div>
      </div>
      {(ui.status === 'won' || ui.status === 'lost') && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="rounded-2xl border border-cyan-400/20 bg-[#07101c] p-8 text-center max-w-md font-mono">
            <h2 className={`text-4xl font-black mb-2 ${ui.status === 'won' ? 'text-emerald-400' : 'text-rose-400'}`}>
              {ui.status === 'won' ? 'CHAMPION' : 'GAME OVER'}
            </h2>
            <p className="text-sm text-white/50 mb-4">
              {ui.status === 'won' ? 'You smashed every brick.' : 'No balls left.'}
            </p>
            <div className="space-y-1 text-sm mb-6 text-white/80">
              <div>
                Score: <span className="text-cyan-200 font-bold tabular-nums">{ui.score.toLocaleString()}</span>
              </div>
              <div>
                High: <span className="text-amber-300 font-bold tabular-nums">{ui.highScore.toLocaleString()}</span>
              </div>
              <div>
                Level reached: <span className="text-white font-bold">{ui.level}</span>
              </div>
            </div>
            <button
              onClick={onRestart}
              className="rounded-full bg-cyan-500/80 hover:bg-cyan-400 px-6 py-2.5 text-sm font-semibold text-black transition-colors"
            >
              Play again
            </button>
          </div>
        </div>
      )}
      <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 z-10 text-[10px] uppercase tracking-[0.4em] text-white/30 font-mono">
        Mouse or A · D · Space launches
      </div>
    </>
  );
}

function MobileControls({
  inputRef,
  status,
}: {
  inputRef: React.RefObject<{ paddleX: number; mouseControl: boolean; launch: number } | null>;
  status: GameUi['status'];
}) {
  if (status !== 'playing') return null;
  const hold = (key: 'paddleX', v: number) => {
    if (v !== 0) gameAudio.unlock();
    if (inputRef.current) inputRef.current[key] = v;
  };
  return (
    <div className="md:hidden absolute inset-x-0 bottom-0 z-20 pb-6 px-4 pointer-events-none">
      <div className="flex justify-between items-end">
        <div className="flex gap-3 pointer-events-auto">
          <button
            type="button"
            onTouchStart={(e) => { e.preventDefault(); hold('paddleX', -1); }}
            onTouchEnd={() => hold('paddleX', 0)}
            onTouchCancel={() => hold('paddleX', 0)}
            className="select-none rounded-full bg-cyan-500/15 backdrop-blur active:bg-cyan-400/30 border border-cyan-300/30 flex items-center justify-center font-bold text-cyan-100 touch-none w-16 h-16 text-xl"
          >
            ◀
          </button>
          <button
            type="button"
            onTouchStart={(e) => { e.preventDefault(); hold('paddleX', 1); }}
            onTouchEnd={() => hold('paddleX', 0)}
            onTouchCancel={() => hold('paddleX', 0)}
            className="select-none rounded-full bg-cyan-500/15 backdrop-blur active:bg-cyan-400/30 border border-cyan-300/30 flex items-center justify-center font-bold text-cyan-100 touch-none w-16 h-16 text-xl"
          >
            ▶
          </button>
        </div>
        <button
          type="button"
          onTouchStart={(e) => {
            e.preventDefault();
            gameAudio.unlock();
            if (inputRef.current) inputRef.current.launch = 1;
          }}
          className="pointer-events-auto select-none rounded-full bg-amber-500/30 backdrop-blur active:bg-amber-400/50 border border-amber-300/40 flex items-center justify-center font-bold text-amber-100 touch-none w-24 h-16 text-sm"
        >
          LAUNCH
        </button>
      </div>
    </div>
  );
}
