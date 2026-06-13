'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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

// Vector-style top-down arcade shooter. Render path:
//   - Black background with a slow-moving parallax starfield.
//   - Ship and asteroids are drawn as glowing line-polygons using shadowBlur
//     for a faux-bloom effect that holds up at any resolution.
//   - Particles for thrust, bullets, and explosion debris.
//
// Coordinate frame is a virtual 1280x720 canvas — we letterbox/scale via the
// CSS canvas size so the gameplay area is consistent across screen sizes.

const VIRT_W = 1280;
const VIRT_H = 720;

interface Vec2 {
  x: number;
  y: number;
}

interface Ship {
  pos: Vec2;
  vel: Vec2;
  angle: number;
  angVel: number;
  thrusting: boolean;
  cooldown: number;
  invuln: number;
  alive: boolean;
}

interface Asteroid {
  pos: Vec2;
  vel: Vec2;
  angle: number;
  spin: number;
  /** 3 = large, 2 = medium, 1 = small. */
  size: 1 | 2 | 3;
  /** Pre-baked polygon offsets so the shape stays consistent across frames. */
  shape: number[];
  hue: number;
}

interface Bullet {
  pos: Vec2;
  vel: Vec2;
  ttl: number;
}

type PowerUpKind = 'shield' | 'spread' | 'rapid';

interface PowerUp {
  pos: Vec2;
  vel: Vec2;
  kind: PowerUpKind;
  ttl: number;
}

interface Ufo {
  pos: Vec2;
  vel: Vec2;
  fireTimer: number;
  wobble: number;
}

interface EnemyBullet {
  pos: Vec2;
  vel: Vec2;
  ttl: number;
}

interface Particle {
  pos: Vec2;
  vel: Vec2;
  ttl: number;
  maxTtl: number;
  hue: number;
  size: number;
}

interface Star {
  x: number;
  y: number;
  brightness: number;
  parallax: number;
}

interface GameUi {
  status: 'playing' | 'won' | 'lost';
  score: number;
  lives: number;
  wave: number;
  highScore: number;
  combo: number;
  shieldT: number;
  spreadT: number;
  rapidT: number;
}

const INITIAL_UI: GameUi = {
  status: 'playing',
  score: 0,
  lives: 3,
  wave: 1,
  highScore: 0,
  combo: 0,
  shieldT: 0,
  spreadT: 0,
  rapidT: 0,
};

interface NeonAsteroidsProps {
  gameContext: GameContext;
  onExit?: () => void;
}

const LEADERBOARD_CONFIG: LeaderboardConfig = {
  gameKey: 'neon-asteroids',
  title: 'Neon Asteroids — top pilots',
  primaryLabel: 'Score',
  primaryField: 'score',
  secondaryLabel: 'Wave',
  secondaryField: 'wave_reached',
};

export function NeonAsteroids({ gameContext, onExit }: NeonAsteroidsProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ui, setUi] = useState<GameUi>(INITIAL_UI);
  const [runId, setRunId] = useState(0);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const statusRef = useRef<GameUi['status']>('playing');
  statusRef.current = ui.status;
  const gameStartRef = useRef<number>(performance.now());
  const inputRef = useRef({
    left: 0,
    right: 0,
    thrust: 0,
    shoot: 0,
  });

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

  // Submit score once the run ends. Only one submission per entry.
  useEffect(() => {
    if (ui.status !== 'lost' || submitted) return;
    setSubmitted(true);
    const durationSec = Math.max(0, (performance.now() - gameStartRef.current) / 1000);
    fetch('/api/games/neon-asteroids/scores', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        wallet: gameContext.wallet,
        score: ui.score,
        waveReached: ui.wave,
        durationSec,
        entrySignature: gameContext.entrySignature,
      }),
    }).catch((err) => console.warn('neon-asteroids score submit failed', err));
  }, [ui.status, ui.score, ui.wave, submitted, gameContext]);

  // Reset start clock + submission flag on each restart.
  useEffect(() => {
    gameStartRef.current = performance.now();
    setSubmitted(false);
    pausedRef.current = false;
    setPaused(false);
  }, [runId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // ─── Resize handler — keeps the virtual coordinate frame stable. ────
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
    };
    resize();
    window.addEventListener('resize', resize);

    // ─── State ──────────────────────────────────────────────────────────
    const ship: Ship = {
      pos: { x: VIRT_W / 2, y: VIRT_H / 2 },
      vel: { x: 0, y: 0 },
      angle: -Math.PI / 2,
      angVel: 0,
      thrusting: false,
      cooldown: 0,
      invuln: 2,
      alive: true,
    };
    const asteroids: Asteroid[] = [];
    const bullets: Bullet[] = [];
    const particles: Particle[] = [];
    const stars: Star[] = [];
    const powerUps: PowerUp[] = [];
    const enemyBullets: EnemyBullet[] = [];

    for (let i = 0; i < 160; i++) {
      stars.push({
        x: Math.random() * VIRT_W,
        y: Math.random() * VIRT_H,
        brightness: 0.3 + Math.random() * 0.7,
        parallax: 0.1 + Math.random() * 0.6,
      });
    }

    let wave = 1;
    let score = 0;
    let lives = 3;
    let highScore = 0;
    try {
      highScore = Number(localStorage.getItem('arcadery:neon-asteroids:hs') ?? 0);
    } catch {}
    let status: 'playing' | 'won' | 'lost' = 'playing';
    let comboCount = 0;
    let comboDecay = 0;
    let shake = 0;
    // Power-up effect timers (seconds remaining).
    let shieldTime = 0;
    let spreadTime = 0;
    let rapidTime = 0;
    // Ship respawn countdown — dt-driven so pausing doesn't fast-forward it.
    let respawnTimer = 0;
    // Throttles the shoot sfx so rapid fire doesn't get grating.
    let shootSfxCd = 0;
    // UFO hunter — one scheduled appearance per wave starting at wave 3.
    let ufo: Ufo | null = null;
    let ufoSpawnAt = -1;
    let waveClock = 0;

    const comboMult = () => Math.min(5, 1 + Math.floor(comboCount / 4));

    const spawnWave = (w: number) => {
      waveClock = 0;
      ufoSpawnAt = w >= 3 ? 3 + Math.random() * 9 : -1;
      const count = 3 + w;
      for (let i = 0; i < count; i++) {
        let x: number;
        let y: number;
        // Keep asteroids from spawning on top of the player.
        do {
          x = Math.random() * VIRT_W;
          y = Math.random() * VIRT_H;
        } while (
          Math.hypot(x - ship.pos.x, y - ship.pos.y) < 200
        );
        const angle = Math.random() * Math.PI * 2;
        const speed = 25 + Math.random() * 30 + w * 4;
        asteroids.push(makeAsteroid({ x, y }, 3, angle, speed));
      }
    };
    spawnWave(wave);

    // Resolves a ship hit from any source (asteroid, UFO body, UFO bullet).
    // A shield absorbs one collision; otherwise it costs a life.
    const hitShip = () => {
      if (!ship.alive || ship.invuln > 0) return;
      if (shieldTime > 0) {
        shieldTime = 0;
        ship.invuln = 1.2;
        shake = Math.max(shake, 10);
        gameAudio.hit();
        emitExplosion(particles, ship.pos, 190, 10);
        return;
      }
      emitExplosion(particles, ship.pos, 200, 18);
      shake = 18;
      ship.alive = false;
      lives -= 1;
      comboCount = 0;
      gameAudio.explosionBig();
      if (lives > 0) {
        gameAudio.hit();
        respawnTimer = 0.9;
      } else {
        status = 'lost';
        gameAudio.gameover();
        highScore = Math.max(highScore, score);
        try {
          localStorage.setItem('arcadery:neon-asteroids:hs', String(highScore));
        } catch {}
      }
    };

    // ─── Inputs ─────────────────────────────────────────────────────────
    const keys = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
      }
      gameAudio.unlock();
      keys.add(e.key.toLowerCase());
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys.delete(e.key.toLowerCase());
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // ─── Loop ───────────────────────────────────────────────────────────
    let lastTime = performance.now();
    let lastUi = 0;
    let raf = 0;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      // Paused: leave the last rendered frame on screen and skip all
      // simulation. `lastTime` keeps advancing so resume doesn't get a giant
      // dt, and all timers are dt-driven so nothing fast-forwards.
      if (pausedRef.current) return;

      const input = inputRef.current;
      const turnLeft = (keys.has('a') || keys.has('arrowleft') ? 1 : 0) + input.left;
      const turnRight = (keys.has('d') || keys.has('arrowright') ? 1 : 0) + input.right;
      const thrust = (keys.has('w') || keys.has('arrowup') ? 1 : 0) + input.thrust;
      const shoot = (keys.has(' ') || keys.has('space') ? 1 : 0) + input.shoot;

      // ─── Respawn countdown ───────────────────────────────────────────
      if (!ship.alive && status === 'playing' && lives > 0) {
        respawnTimer -= dt;
        if (respawnTimer <= 0) {
          ship.pos = { x: VIRT_W / 2, y: VIRT_H / 2 };
          ship.vel = { x: 0, y: 0 };
          ship.angle = -Math.PI / 2;
          ship.angVel = 0;
          ship.invuln = 2;
          ship.alive = true;
        }
      }

      // ─── Ship physics ────────────────────────────────────────────────
      if (ship.alive && status === 'playing') {
        const turnAccel = 11;
        ship.angVel += (-turnLeft + turnRight) * turnAccel * dt;
        ship.angVel *= 0.92;
        ship.angle += ship.angVel * dt;

        const thrustAccel = 380;
        ship.thrusting = thrust > 0.1;
        if (ship.thrusting) {
          ship.vel.x += Math.cos(ship.angle) * thrustAccel * dt;
          ship.vel.y += Math.sin(ship.angle) * thrustAccel * dt;
          // Thrust particles streaming out of the back of the ship.
          for (let i = 0; i < 2; i++) {
            const back = ship.angle + Math.PI + (Math.random() - 0.5) * 0.4;
            particles.push({
              pos: {
                x: ship.pos.x + Math.cos(back) * 14,
                y: ship.pos.y + Math.sin(back) * 14,
              },
              vel: {
                x: ship.vel.x * 0.3 + Math.cos(back) * (60 + Math.random() * 60),
                y: ship.vel.y * 0.3 + Math.sin(back) * (60 + Math.random() * 60),
              },
              ttl: 0.4 + Math.random() * 0.3,
              maxTtl: 0.7,
              hue: 30 + Math.random() * 30,
              size: 2,
            });
          }
        }
        // Slight drag so the ship is controllable without infinite acceleration.
        const speed = Math.hypot(ship.vel.x, ship.vel.y);
        const maxSpeed = 360;
        if (speed > maxSpeed) {
          ship.vel.x *= maxSpeed / speed;
          ship.vel.y *= maxSpeed / speed;
        }
        ship.vel.x *= 0.998;
        ship.vel.y *= 0.998;

        ship.pos.x = wrap(ship.pos.x + ship.vel.x * dt, VIRT_W);
        ship.pos.y = wrap(ship.pos.y + ship.vel.y * dt, VIRT_H);

        ship.cooldown -= dt;
        shootSfxCd -= dt;
        if (shoot > 0.1 && ship.cooldown <= 0) {
          ship.cooldown = rapidTime > 0 ? 0.09 : 0.18;
          const angles = spreadTime > 0 ? [-0.22, 0, 0.22] : [0];
          for (const off of angles) {
            const ang = ship.angle + off;
            bullets.push({
              pos: {
                x: ship.pos.x + Math.cos(ang) * 18,
                y: ship.pos.y + Math.sin(ang) * 18,
              },
              vel: {
                x: ship.vel.x + Math.cos(ang) * 620,
                y: ship.vel.y + Math.sin(ang) * 620,
              },
              ttl: 1.1,
            });
          }
          // Throttle the sfx to ~8/sec so rapid fire doesn't get grating.
          if (shootSfxCd <= 0) {
            shootSfxCd = 0.13;
            gameAudio.shoot();
          }
        }
        ship.invuln = Math.max(0, ship.invuln - dt);
      }

      // ─── Power-up effect timers ──────────────────────────────────────
      shieldTime = Math.max(0, shieldTime - dt);
      spreadTime = Math.max(0, spreadTime - dt);
      rapidTime = Math.max(0, rapidTime - dt);

      // ─── Bullets ─────────────────────────────────────────────────────
      for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.pos.x = wrap(b.pos.x + b.vel.x * dt, VIRT_W);
        b.pos.y = wrap(b.pos.y + b.vel.y * dt, VIRT_H);
        b.ttl -= dt;
        if (b.ttl <= 0) bullets.splice(i, 1);
      }

      // ─── Asteroids + collisions ─────────────────────────────────────
      for (let i = asteroids.length - 1; i >= 0; i--) {
        const a = asteroids[i];
        a.pos.x = wrap(a.pos.x + a.vel.x * dt, VIRT_W);
        a.pos.y = wrap(a.pos.y + a.vel.y * dt, VIRT_H);
        a.angle += a.spin * dt;
        const r = asteroidRadius(a.size);

        // Bullet hit test.
        let killed = false;
        for (let j = bullets.length - 1; j >= 0; j--) {
          const b = bullets[j];
          if (toroidalDist2(a.pos, b.pos) < (r + 3) ** 2) {
            bullets.splice(j, 1);
            emitExplosion(particles, a.pos, a.hue, r);
            shake = Math.max(shake, r * 0.4);
            gameAudio.explosionSmall();
            const prevMult = comboMult();
            comboCount += 1;
            comboDecay = 2;
            if (comboMult() > prevMult) gameAudio.combo(comboMult());
            const baseScore = a.size === 3 ? 20 : a.size === 2 ? 50 : 100;
            score += baseScore * comboMult();
            asteroids.splice(i, 1);
            if (a.size > 1) {
              const newSize = (a.size - 1) as 1 | 2;
              const speed = 60 + Math.random() * 60 + wave * 4;
              for (let k = 0; k < 2; k++) {
                const angle = Math.random() * Math.PI * 2;
                asteroids.push(makeAsteroid({ ...a.pos }, newSize, angle, speed));
              }
            }
            // Occasional power-up drop — drifts slowly and expires.
            if (Math.random() < 0.09 && powerUps.length < 3) {
              const kinds: PowerUpKind[] = ['shield', 'spread', 'rapid'];
              const driftAng = Math.random() * Math.PI * 2;
              powerUps.push({
                pos: { ...a.pos },
                vel: {
                  x: Math.cos(driftAng) * (15 + Math.random() * 20),
                  y: Math.sin(driftAng) * (15 + Math.random() * 20),
                },
                kind: kinds[Math.floor(Math.random() * kinds.length)],
                ttl: 8,
              });
            }
            killed = true;
            break;
          }
        }
        if (killed) continue;

        // Ship collision.
        if (
          ship.alive &&
          ship.invuln <= 0 &&
          toroidalDist2(a.pos, ship.pos) < (r + 12) ** 2
        ) {
          hitShip();
        }
      }

      // Wave clear.
      if (asteroids.length === 0 && status === 'playing') {
        wave += 1;
        gameAudio.levelup();
        // Reward a life every 3 waves, capped at 5.
        if (wave % 3 === 0 && lives < 5) lives += 1;
        spawnWave(wave);
      }

      // ─── Power-up pickups ───────────────────────────────────────────
      for (let i = powerUps.length - 1; i >= 0; i--) {
        const p = powerUps[i];
        p.pos.x = wrap(p.pos.x + p.vel.x * dt, VIRT_W);
        p.pos.y = wrap(p.pos.y + p.vel.y * dt, VIRT_H);
        p.ttl -= dt;
        if (p.ttl <= 0) {
          powerUps.splice(i, 1);
          continue;
        }
        if (
          ship.alive &&
          status === 'playing' &&
          toroidalDist2(p.pos, ship.pos) < (12 + 14) ** 2
        ) {
          if (p.kind === 'shield') shieldTime = 12;
          else if (p.kind === 'spread') spreadTime = 10;
          else rapidTime = 10;
          gameAudio.powerup();
          emitExplosion(
            particles,
            p.pos,
            p.kind === 'shield' ? 190 : p.kind === 'spread' ? 300 : 45,
            8,
          );
          powerUps.splice(i, 1);
        }
      }

      // ─── UFO hunter ─────────────────────────────────────────────────
      waveClock += dt;
      if (!ufo && ufoSpawnAt > 0 && waveClock >= ufoSpawnAt && status === 'playing') {
        ufoSpawnAt = -1;
        const fromLeft = Math.random() < 0.5;
        ufo = {
          pos: {
            x: fromLeft ? -50 : VIRT_W + 50,
            y: 80 + Math.random() * (VIRT_H - 160),
          },
          vel: { x: (fromLeft ? 1 : -1) * (85 + wave * 5), y: 0 },
          fireTimer: 1.2,
          wobble: Math.random() * Math.PI * 2,
        };
        gameAudio.alarm();
      }
      if (ufo) {
        ufo.wobble += dt * 2;
        ufo.pos.x += ufo.vel.x * dt;
        ufo.pos.y += Math.sin(ufo.wobble) * 40 * dt;
        // Despawn once it has crossed the field.
        if (ufo.pos.x < -80 || ufo.pos.x > VIRT_W + 80) ufo = null;
      }
      if (ufo && ship.alive && status === 'playing') {
        // Aimed (slightly inaccurate) shots at the player.
        ufo.fireTimer -= dt;
        if (ufo.fireTimer <= 0) {
          ufo.fireTimer = 1.5 + Math.random() * 0.8;
          const aim =
            Math.atan2(ship.pos.y - ufo.pos.y, ship.pos.x - ufo.pos.x) +
            (Math.random() - 0.5) * 0.45;
          enemyBullets.push({
            pos: { ...ufo.pos },
            vel: { x: Math.cos(aim) * 250, y: Math.sin(aim) * 250 },
            ttl: 3,
          });
          gameAudio.laser();
        }
      }
      if (ufo) {
        // Player bullets vs UFO — big points scaled by the combo multiplier.
        for (let j = bullets.length - 1; j >= 0; j--) {
          if (toroidalDist2(ufo.pos, bullets[j].pos) < (20 + 3) ** 2) {
            bullets.splice(j, 1);
            emitExplosion(particles, ufo.pos, 350, 24);
            shake = Math.max(shake, 16);
            score += 500 * comboMult();
            comboCount += 1;
            comboDecay = 2;
            gameAudio.explosionBig();
            ufo = null;
            break;
          }
        }
      }
      if (
        ufo &&
        ship.alive &&
        ship.invuln <= 0 &&
        toroidalDist2(ufo.pos, ship.pos) < (20 + 12) ** 2
      ) {
        hitShip();
      }

      // ─── UFO bullets ────────────────────────────────────────────────
      for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const b = enemyBullets[i];
        b.pos.x += b.vel.x * dt;
        b.pos.y += b.vel.y * dt;
        b.ttl -= dt;
        if (
          b.ttl <= 0 ||
          b.pos.x < -40 ||
          b.pos.x > VIRT_W + 40 ||
          b.pos.y < -40 ||
          b.pos.y > VIRT_H + 40
        ) {
          enemyBullets.splice(i, 1);
          continue;
        }
        // Player bullets can intercept UFO shots.
        let blocked = false;
        for (let j = bullets.length - 1; j >= 0; j--) {
          if (toroidalDist2(b.pos, bullets[j].pos) < 8 ** 2) {
            bullets.splice(j, 1);
            enemyBullets.splice(i, 1);
            emitExplosion(particles, b.pos, 0, 5);
            blocked = true;
            break;
          }
        }
        if (blocked) continue;
        if (
          ship.alive &&
          ship.invuln <= 0 &&
          toroidalDist2(b.pos, ship.pos) < (4 + 12) ** 2
        ) {
          enemyBullets.splice(i, 1);
          hitShip();
        }
      }

      // ─── Particles ───────────────────────────────────────────────────
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.pos.x += p.vel.x * dt;
        p.pos.y += p.vel.y * dt;
        p.vel.x *= 0.96;
        p.vel.y *= 0.96;
        p.ttl -= dt;
        if (p.ttl <= 0) particles.splice(i, 1);
      }

      // ─── Combo decay ────────────────────────────────────────────────
      comboDecay -= dt;
      if (comboDecay <= 0) comboCount = 0;

      // ─── Render ──────────────────────────────────────────────────────
      const w = canvas.width;
      const h = canvas.height;
      const scale = Math.min(w / VIRT_W, h / VIRT_H);
      const offX = (w - VIRT_W * scale) / 2;
      const offY = (h - VIRT_H * scale) / 2;

      ctx.fillStyle = '#04060c';
      ctx.fillRect(0, 0, w, h);

      // Screen-shake offset.
      shake *= 0.85;
      const sx = (Math.random() - 0.5) * shake;
      const sy = (Math.random() - 0.5) * shake;

      ctx.save();
      ctx.translate(offX + sx, offY + sy);
      ctx.scale(scale, scale);

      // Letterbox boundary glow.
      ctx.strokeStyle = 'rgba(120, 100, 255, 0.15)';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, VIRT_W, VIRT_H);

      // Starfield. We pseudo-scroll based on the ship's velocity to give a
      // sense of motion without actually moving the camera.
      for (const s of stars) {
        const offsetX = ((-ship.pos.x * s.parallax * 0.03) % VIRT_W + VIRT_W) % VIRT_W;
        const offsetY = ((-ship.pos.y * s.parallax * 0.03) % VIRT_H + VIRT_H) % VIRT_H;
        const x = wrap(s.x + offsetX, VIRT_W);
        const y = wrap(s.y + offsetY, VIRT_H);
        ctx.fillStyle = `rgba(255, 255, 255, ${s.brightness * 0.6})`;
        ctx.fillRect(x, y, 1.5, 1.5);
      }

      // Asteroids — line polygons with a glowing stroke.
      for (const a of asteroids) {
        drawWrapped(ctx, a.pos, (px, py) => {
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(a.angle);
          ctx.shadowColor = `hsl(${a.hue}, 90%, 60%)`;
          ctx.shadowBlur = 18;
          ctx.strokeStyle = `hsl(${a.hue}, 80%, 65%)`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          const r = asteroidRadius(a.size);
          for (let k = 0; k < a.shape.length; k++) {
            const ang = (k / a.shape.length) * Math.PI * 2;
            const radius = r * (0.75 + a.shape[k] * 0.45);
            const x = Math.cos(ang) * radius;
            const y = Math.sin(ang) * radius;
            if (k === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.stroke();
          ctx.restore();
        });
      }

      // Power-up pickups — small glowing vector glyphs, blink near expiry.
      for (const p of powerUps) {
        const blink = p.ttl < 2 && Math.floor(p.ttl * 8) % 2 === 0;
        if (blink) continue;
        drawWrapped(ctx, p.pos, (px, py) => {
          ctx.save();
          ctx.translate(px, py);
          const pulse = 1 + Math.sin(now / 180) * 0.12;
          ctx.scale(pulse, pulse);
          ctx.lineWidth = 2;
          ctx.shadowBlur = 16;
          if (p.kind === 'shield') {
            ctx.shadowColor = '#22d3ee';
            ctx.strokeStyle = '#67e8f9';
            ctx.beginPath();
            ctx.arc(0, 0, 9, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(0, 0, 4, 0, Math.PI * 2);
            ctx.stroke();
          } else if (p.kind === 'spread') {
            ctx.shadowColor = '#e879f9';
            ctx.strokeStyle = '#f0abfc';
            ctx.beginPath();
            for (const off of [-0.5, 0, 0.5]) {
              ctx.moveTo(0, 5);
              ctx.lineTo(Math.sin(off) * 9, -8);
            }
            ctx.stroke();
          } else {
            // Rapid fire — lightning bolt.
            ctx.shadowColor = '#fbbf24';
            ctx.strokeStyle = '#fde047';
            ctx.beginPath();
            ctx.moveTo(3, -9);
            ctx.lineTo(-3, 1);
            ctx.lineTo(2, 1);
            ctx.lineTo(-3, 9);
            ctx.stroke();
          }
          ctx.restore();
        });
      }

      // UFO — classic saucer in hostile neon rose.
      if (ufo) {
        const u = ufo;
        ctx.save();
        ctx.translate(u.pos.x, u.pos.y);
        ctx.shadowColor = '#fb7185';
        ctx.shadowBlur = 18;
        ctx.strokeStyle = '#fda4af';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(-20, 0);
        ctx.lineTo(-8, -7);
        ctx.lineTo(8, -7);
        ctx.lineTo(20, 0);
        ctx.lineTo(8, 7);
        ctx.lineTo(-8, 7);
        ctx.closePath();
        ctx.stroke();
        // Dome.
        ctx.beginPath();
        ctx.arc(0, -7, 6, Math.PI, 0);
        ctx.stroke();
        // Belly lights.
        ctx.fillStyle = '#fecdd3';
        for (const lx of [-12, 0, 12]) ctx.fillRect(lx - 1, -1, 2, 2);
        ctx.restore();
      }

      // UFO bullets — hostile red streaks.
      ctx.shadowColor = '#f87171';
      ctx.shadowBlur = 14;
      ctx.strokeStyle = '#fca5a5';
      ctx.lineWidth = 2.5;
      for (const b of enemyBullets) {
        const trail = 6;
        ctx.beginPath();
        ctx.moveTo(b.pos.x - (b.vel.x / 250) * trail, b.pos.y - (b.vel.y / 250) * trail);
        ctx.lineTo(b.pos.x, b.pos.y);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;

      // Bullets — tiny streaks.
      ctx.shadowColor = '#fbbf24';
      ctx.shadowBlur = 14;
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 2.5;
      for (const b of bullets) {
        drawWrapped(ctx, b.pos, (px, py) => {
          const trail = 6;
          ctx.beginPath();
          ctx.moveTo(px - (b.vel.x / 620) * trail, py - (b.vel.y / 620) * trail);
          ctx.lineTo(px, py);
          ctx.stroke();
        });
      }
      ctx.shadowBlur = 0;

      // Particles.
      for (const p of particles) {
        const alpha = Math.max(0, p.ttl / p.maxTtl);
        ctx.fillStyle = `hsla(${p.hue}, 90%, 65%, ${alpha})`;
        ctx.fillRect(p.pos.x - p.size / 2, p.pos.y - p.size / 2, p.size, p.size);
      }

      // Ship.
      if (ship.alive) {
        drawWrapped(ctx, ship.pos, (px, py) => {
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(ship.angle);
          const blink = ship.invuln > 0 && Math.floor(ship.invuln * 12) % 2 === 0;
          if (!blink) {
            ctx.shadowColor = '#67e8f9';
            ctx.shadowBlur = 16;
            ctx.strokeStyle = '#a5f3fc';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(16, 0);
            ctx.lineTo(-10, 9);
            ctx.lineTo(-5, 0);
            ctx.lineTo(-10, -9);
            ctx.closePath();
            ctx.stroke();
            if (ship.thrusting && Math.random() > 0.3) {
              ctx.strokeStyle = '#fbbf24';
              ctx.shadowColor = '#fbbf24';
              ctx.beginPath();
              ctx.moveTo(-6, 4);
              ctx.lineTo(-14 - Math.random() * 4, 0);
              ctx.lineTo(-6, -4);
              ctx.stroke();
            }
          }
          // Shield bubble — absorbs one collision, blinks near expiry.
          if (shieldTime > 0) {
            const fade =
              shieldTime < 3 && Math.floor(shieldTime * 8) % 2 === 0 ? 0.25 : 0.9;
            ctx.shadowColor = '#22d3ee';
            ctx.shadowBlur = 14;
            ctx.strokeStyle = `rgba(103, 232, 249, ${fade})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, 22, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.restore();
        });
      }

      ctx.restore();

      // ─── UI push ─────────────────────────────────────────────────────
      if (now - lastUi > 90) {
        lastUi = now;
        setUi({
          status,
          score,
          lives,
          wave,
          highScore: Math.max(highScore, score),
          combo: comboMult(),
          shieldT: shieldTime,
          spreadT: spreadTime,
          rapidT: rapidTime,
        });
      }
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', resize);
    };
  }, [runId]);

  return (
    <div className="absolute inset-0 bg-[#04060c] overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
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
        accentClass="bg-cyan-500 hover:bg-cyan-400"
        hint="A · D rotate · W thrust · Space fire"
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

// ─── Helpers ───────────────────────────────────────────────────────────

function asteroidRadius(size: 1 | 2 | 3): number {
  return size === 3 ? 45 : size === 2 ? 26 : 14;
}

function makeAsteroid(pos: Vec2, size: 1 | 2 | 3, angle: number, speed: number): Asteroid {
  const verts = 8 + Math.floor(Math.random() * 4);
  const shape: number[] = [];
  for (let i = 0; i < verts; i++) shape.push(Math.random());
  return {
    pos,
    vel: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
    angle: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 1.2,
    size,
    shape,
    hue: 250 + Math.random() * 80,
  };
}

function wrap(v: number, max: number): number {
  return ((v % max) + max) % max;
}

function toroidalDist2(a: Vec2, b: Vec2): number {
  let dx = Math.abs(a.x - b.x);
  let dy = Math.abs(a.y - b.y);
  if (dx > VIRT_W / 2) dx = VIRT_W - dx;
  if (dy > VIRT_H / 2) dy = VIRT_H - dy;
  return dx * dx + dy * dy;
}

// Draws something at every wrap-around copy of its position that's visible
// within the play area, so objects crossing edges show on both sides.
function drawWrapped(
  ctx: CanvasRenderingContext2D,
  pos: Vec2,
  draw: (x: number, y: number) => void,
): void {
  const margin = 60;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const x = pos.x + dx * VIRT_W;
      const y = pos.y + dy * VIRT_H;
      if (x < -margin || x > VIRT_W + margin) continue;
      if (y < -margin || y > VIRT_H + margin) continue;
      draw(x, y);
    }
  }
}

function emitExplosion(particles: Particle[], pos: Vec2, hue: number, radius: number): void {
  const count = Math.floor(radius * 1.5);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 40 + Math.random() * radius * 6;
    particles.push({
      pos: { ...pos },
      vel: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
      ttl: 0.6 + Math.random() * 0.6,
      maxTtl: 1.2,
      hue: hue + (Math.random() - 0.5) * 40,
      size: 1 + Math.random() * 2.5,
    });
  }
}

// ─── HUD + Mobile controls ─────────────────────────────────────────────

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
                if (!confirm('Quit now? Your score for this run won\'t be recorded.')) return;
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
          <div className="text-[10px] uppercase tracking-widest text-cyan-200/60">Score</div>
          <div className="text-2xl font-bold tabular-nums text-cyan-100">
            {ui.score.toLocaleString()}
          </div>
        </div>
        <div className="rounded-lg bg-black/60 backdrop-blur px-3 py-2">
          <div className="text-[10px] uppercase tracking-widest text-cyan-200/60">High</div>
          <div className="text-sm font-bold tabular-nums text-amber-200">
            {ui.highScore.toLocaleString()}
          </div>
        </div>
        {ui.shieldT > 0 && (
          <PowerChip label="SHIELD" t={ui.shieldT} max={12} barClass="bg-cyan-400" textClass="text-cyan-200" />
        )}
        {ui.spreadT > 0 && (
          <PowerChip label="SPREAD" t={ui.spreadT} max={10} barClass="bg-fuchsia-400" textClass="text-fuchsia-200" />
        )}
        {ui.rapidT > 0 && (
          <PowerChip label="RAPID" t={ui.rapidT} max={10} barClass="bg-amber-400" textClass="text-amber-200" />
        )}
      </div>
      <div className="pointer-events-none absolute top-16 right-4 z-10 flex flex-col items-end gap-2 font-mono text-white">
        <div className="rounded-lg bg-black/60 backdrop-blur px-3 py-2 text-right">
          <div className="text-[10px] uppercase tracking-widest text-cyan-200/60">Wave</div>
          <div className="text-xl font-bold tabular-nums">{ui.wave}</div>
        </div>
        <div className="rounded-lg bg-black/60 backdrop-blur px-3 py-2 text-right">
          <div className="text-[10px] uppercase tracking-widest text-cyan-200/60">Ships</div>
          <div className="text-xl font-bold tabular-nums text-cyan-100">
            {Array.from({ length: ui.lives }).map((_, i) => (
              <span key={i} className="mr-0.5">◢</span>
            ))}
            {ui.lives === 0 && <span className="text-rose-400 text-sm">—</span>}
          </div>
        </div>
        {ui.combo > 1 && (
          <div className="rounded-lg bg-fuchsia-500/30 backdrop-blur px-3 py-1.5 text-right animate-pulse">
            <span className="text-sm font-bold text-fuchsia-100">{ui.combo}× COMBO</span>
          </div>
        )}
      </div>
      {ui.status === 'lost' && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="rounded-2xl border border-cyan-400/20 bg-[#06090f] p-8 text-center max-w-md font-mono">
            <h2 className="text-4xl font-black mb-2 text-rose-400">GAME OVER</h2>
            <p className="text-sm text-white/50 mb-4">Your ship was atomized.</p>
            <div className="space-y-1 text-sm mb-6 text-white/80">
              <div>
                Score: <span className="text-cyan-200 font-bold tabular-nums">{ui.score.toLocaleString()}</span>
              </div>
              <div>
                High score: <span className="text-amber-300 font-bold tabular-nums">{ui.highScore.toLocaleString()}</span>
              </div>
              <div>
                Wave reached: <span className="text-white font-bold">{ui.wave}</span>
              </div>
            </div>
            <button
              onClick={onRestart}
              className="rounded-full bg-cyan-500/80 hover:bg-cyan-400 px-6 py-2.5 text-sm font-semibold text-black transition-colors"
            >
              Launch again
            </button>
          </div>
        </div>
      )}
      <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 z-10 text-[10px] uppercase tracking-[0.4em] text-white/30 font-mono">
        A · D rotate · W thrust · Space fire
      </div>
    </>
  );
}

function PowerChip({
  label,
  t,
  max,
  barClass,
  textClass,
}: {
  label: string;
  t: number;
  max: number;
  barClass: string;
  textClass: string;
}) {
  return (
    <div className="w-28 rounded-lg bg-black/60 backdrop-blur px-2.5 py-1.5">
      <div className={`text-[9px] font-bold tracking-widest ${textClass}`}>{label}</div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full ${barClass}`}
          style={{ width: `${Math.max(0, Math.min(100, (t / max) * 100))}%` }}
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
    thrust: number;
    shoot: number;
  } | null>;
  status: GameUi['status'];
}) {
  if (status !== 'playing') return null;
  const press = (key: 'left' | 'right' | 'thrust' | 'shoot', v: number) => {
    if (v > 0) gameAudio.unlock();
    if (inputRef.current) inputRef.current[key] = v;
  };
  const Btn = ({
    label,
    k,
    cls,
  }: {
    label: string;
    k: 'left' | 'right' | 'thrust' | 'shoot';
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
        <div className="flex gap-3 pointer-events-auto">
          <Btn label="↺" k="left" cls="w-14 h-14 text-xl" />
          <Btn label="↻" k="right" cls="w-14 h-14 text-xl" />
        </div>
        <div className="flex flex-col items-end gap-2 pointer-events-auto">
          <Btn label="THRUST" k="thrust" cls="w-20 h-12 text-[10px]" />
          <Btn label="FIRE" k="shoot" cls="w-20 h-16 text-sm bg-amber-500/30 border-amber-300/40 text-amber-100" />
        </div>
      </div>
    </div>
  );
}
