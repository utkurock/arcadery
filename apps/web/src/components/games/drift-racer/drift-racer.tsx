'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { buildTrack, ROAD_HALF_WIDTH } from './track';
import {
  buildCar,
  createCarState,
  stepCar,
  carForwardSpeed,
  type CarState,
} from './car';
import { createAiState, updateAi, progressForPosition } from './ai';
import { SkidTrail } from './skid-trail';
import { gameAudio } from '@/components/games/_shared/audio';
import {
  MuteButton,
  PauseButton,
  PauseOverlay,
  usePauseKey,
} from '@/components/games/_shared/game-chrome';
import {
  DRIFT_REWARD_AMOUNTS,
  publicRewardMint,
} from '@/lib/drift-racer/config';

const TOTAL_LAPS = 3;

export interface DriftRaceContext {
  wallet: string;
  entrySignature: string | null;
}

interface LeaderboardEntry {
  id: string;
  wallet_address: string;
  display_name: string | null;
  best_lap_sec: number;
  total_time_sec: number;
  drift_score: number;
  won: boolean;
  created_at: string;
}

interface RaceUiState {
  status: 'countdown' | 'racing' | 'won' | 'lost' | 'idle';
  countdown: number;
  speedKmh: number;
  lap: number;
  raceTime: number;
  driftScore: number;
  currentDriftSec: number;
  positionLabel: '1st' | '2nd';
  bestLapSec: number | null;
  lapTimes: number[];
}

const INITIAL_UI: RaceUiState = {
  status: 'idle',
  countdown: 3,
  speedKmh: 0,
  lap: 0,
  raceTime: 0,
  driftScore: 0,
  currentDriftSec: 0,
  positionLabel: '1st',
  bestLapSec: null,
  lapTimes: [],
};

interface DriftRacerProps {
  raceContext?: DriftRaceContext;
  onExit?: () => void;
}

export function DriftRacer({ raceContext, onExit }: DriftRacerProps = {}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [ui, setUi] = useState<RaceUiState>(INITIAL_UI);
  const [runId, setRunId] = useState(0);
  const [touch, setTouch] = useState(false);
  const [scoreId, setScoreId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[] | null>(null);
  const submittedKeyRef = useRef<string | null>(null);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const statusRef = useRef<RaceUiState['status']>('idle');
  statusRef.current = ui.status;

  const setPausedBoth = useCallback((next: boolean) => {
    pausedRef.current = next;
    setPaused(next);
  }, []);

  // Esc/P toggles pause, but only mid-race — not during countdown or the
  // end screens. Race timing accumulates dt per frame, so frozen frames
  // simply don't count toward lap times.
  usePauseKey(
    useCallback(() => {
      if (statusRef.current !== 'racing') return;
      gameAudio.click();
      setPausedBoth(!pausedRef.current);
    }, [setPausedBoth]),
  );

  // Inputs live in a ref so the mobile touch UI can mutate them without
  // forcing a re-render of the canvas.
  const inputRef = useRef({
    throttle: 0,
    brake: 0,
    steerLeft: 0,
    steerRight: 0,
    handbrake: 0,
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setTouch('ontouchstart' in window && window.matchMedia('(pointer: coarse)').matches);
    }
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // ─── Renderer, scene, camera ────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a1424);
    scene.fog = new THREE.Fog(0x0a1424, 90, 220);

    const camera = new THREE.PerspectiveCamera(
      62,
      mount.clientWidth / mount.clientHeight,
      0.1,
      500,
    );
    camera.position.set(0, 8, -12);

    // ─── Lighting ───────────────────────────────────────────────────────
    const ambient = new THREE.AmbientLight(0x6677aa, 0.55);
    scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0x88aaff, 0x2a1f15, 0.7);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff2dd, 1.6);
    sun.position.set(60, 90, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 250;
    sun.shadow.camera.left = -120;
    sun.shadow.camera.right = 120;
    sun.shadow.camera.top = 120;
    sun.shadow.camera.bottom = -120;
    sun.shadow.bias = -0.0005;
    scene.add(sun);

    // ─── Ground (off-road) — large dark plane with a subtle vignette via fog ─
    const groundGeo = new THREE.PlaneGeometry(800, 800);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x10231a,
      roughness: 1.0,
      metalness: 0,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // ─── Track ──────────────────────────────────────────────────────────
    const track = buildTrack();
    scene.add(track.roadMesh);
    for (const k of track.kerbMeshes) scene.add(k);

    // Start/finish line — bright stripe perpendicular to start tangent.
    const lineGroup = new THREE.Group();
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(ROAD_HALF_WIDTH * 2, 0.04, 0.6),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.4 }),
    );
    lineGroup.add(stripe);
    lineGroup.position.copy(track.startPosition);
    lineGroup.position.y = 0.03;
    lineGroup.rotation.y = Math.atan2(track.finishLineDir.x, track.finishLineDir.z);
    scene.add(lineGroup);

    // Checkered banner above the line.
    const bannerMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
    const bannerGeo = new THREE.BoxGeometry(ROAD_HALF_WIDTH * 2 + 2, 0.3, 0.2);
    const bannerL = new THREE.Mesh(bannerGeo, bannerMat);
    bannerL.position.copy(track.startPosition);
    bannerL.position.y = 6;
    bannerL.rotation.y = lineGroup.rotation.y;
    scene.add(bannerL);
    // Vertical poles on either side.
    const poleGeo = new THREE.CylinderGeometry(0.15, 0.15, 6, 8);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.7, roughness: 0.4 });
    for (const side of [-1, 1]) {
      const pole = new THREE.Mesh(poleGeo, poleMat);
      const offset = new THREE.Vector3()
        .copy(track.finishLineDir)
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2)
        .multiplyScalar(side * (ROAD_HALF_WIDTH + 1));
      pole.position.copy(track.startPosition).add(offset);
      pole.position.y = 3;
      pole.castShadow = true;
      scene.add(pole);
    }

    // ─── Scenery — randomized rocks/cones outside the road for depth ────
    const decorationSeed = 1337;
    const rand = mulberry32(decorationSeed);
    const decorations = new THREE.Group();
    for (let i = 0; i < 80; i++) {
      const angle = rand() * Math.PI * 2;
      const radius = 110 + rand() * 90;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      if (track.surfaceAt(x, z) > 0) continue;
      const h = 2 + rand() * 8;
      const geo = new THREE.ConeGeometry(1.5 + rand() * 2, h, 7);
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(0.32 + rand() * 0.1, 0.4, 0.18 + rand() * 0.12),
        roughness: 1.0,
      });
      const tree = new THREE.Mesh(geo, mat);
      tree.position.set(x, h / 2, z);
      tree.castShadow = true;
      decorations.add(tree);
    }
    // Cones lining the track inside-edge of the first few corners.
    for (let i = 0; i < track.segmentCount; i += 25) {
      const p = track.centerline[i];
      const next = track.centerline[(i + 1) % track.segmentCount];
      const tangent = new THREE.Vector3().subVectors(next, p).normalize();
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
      const off = normal.multiplyScalar(ROAD_HALF_WIDTH + 1.2);
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(0.3, 0.7, 6),
        new THREE.MeshStandardMaterial({ color: 0xff6633, emissive: 0x661100, emissiveIntensity: 0.3 }),
      );
      cone.position.set(p.x + off.x, 0.35, p.z + off.z);
      cone.castShadow = true;
      decorations.add(cone);
    }
    scene.add(decorations);

    // ─── Cars ──────────────────────────────────────────────────────────
    const playerVisual = buildCar(0xe11d48, 0xfafafa); // red w/ white stripe
    const aiVisual = buildCar(0x2563eb, 0xfde047); // blue w/ yellow stripe
    scene.add(playerVisual.root);
    scene.add(aiVisual.root);

    const playerCar = createCarState(track.startPosition.clone(), track.startHeading);
    const aiCar = createCarState(
      track.startPosition.clone().add(
        new THREE.Vector3(-Math.cos(track.startHeading), 0, Math.sin(track.startHeading)).multiplyScalar(3),
      ),
      track.startHeading,
    );
    // Stagger them so they aren't overlapping.
    aiCar.position.x += 3.5;
    const ai = createAiState(0.94);

    // Player progress hint for the lap counter — index along centerline.
    let playerProgressHint = 0;

    // ─── Skid trails — one ring buffer per rear wheel, per car ──────────
    const playerTrailLeft = new SkidTrail();
    const playerTrailRight = new SkidTrail();
    const aiTrailLeft = new SkidTrail();
    const aiTrailRight = new SkidTrail();
    for (const t of [playerTrailLeft, playerTrailRight, aiTrailLeft, aiTrailRight]) {
      scene.add(t.mesh);
    }

    // ─── Camera state (chase rig) ───────────────────────────────────────
    const cameraTargetPos = new THREE.Vector3();
    const cameraLookAt = new THREE.Vector3();
    let cameraLean = 0;
    // Smoothed direction the camera sits opposite of. Filtering this damps
    // out the high-frequency velocity changes during a slide so the camera
    // doesn't whip around.
    let camBehindX = -Math.sin(track.startHeading);
    let camBehindZ = -Math.cos(track.startHeading);
    let lateralLeanSmoothed = 0;
    // Initialize look-at to a sensible spot so the first frame doesn't lerp
    // from world origin.
    cameraLookAt.set(
      track.startPosition.x + Math.sin(track.startHeading) * 6,
      1.2,
      track.startPosition.z + Math.cos(track.startHeading) * 6,
    );

    // ─── Input handling ─────────────────────────────────────────────────
    const keysDown = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Space'].includes(e.key) ||
        e.key === ' '
      ) {
        e.preventDefault();
      }
      gameAudio.unlock();
      keysDown.add(e.key.toLowerCase());
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysDown.delete(e.key.toLowerCase());
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    const onResize = () => {
      if (!mount) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);

    // ─── Game state machine ─────────────────────────────────────────────
    let raceStatus: 'countdown' | 'racing' | 'won' | 'lost' = 'countdown';
    let countdownRemaining = 3.5;
    let countdownDisplayed = Math.ceil(countdownRemaining);
    const lapTimes: number[] = [];
    let lastLapTime = 0;
    let lastScreechAt = 0;
    let lastUiPush = 0;
    let lastFrameTime = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dtRaw = (now - lastFrameTime) / 1000;
      lastFrameTime = now;
      // Clamp dt to keep the sim stable when the tab regains focus after a pause.
      const dt = Math.min(0.05, dtRaw);

      // Paused: render the frozen frame and skip all simulation. raceTime
      // accumulates dt per simulated frame, so skipped frames never count
      // toward lap times, and `lastFrameTime` keeps advancing so resume
      // doesn't produce a giant dt.
      if (pausedRef.current) {
        renderer.render(scene, camera);
        return;
      }

      // ─── Read inputs ────────────────────────────────────────────────
      const keys = inputRef.current;
      const throttle =
        Math.max(
          keys.throttle,
          keysDown.has('w') || keysDown.has('arrowup') ? 1 : 0,
        );
      const brake = Math.max(
        keys.brake,
        keysDown.has('s') || keysDown.has('arrowdown') ? 1 : 0,
      );
      const steerLeft = Math.max(
        keys.steerLeft,
        keysDown.has('a') || keysDown.has('arrowleft') ? 1 : 0,
      );
      const steerRight = Math.max(
        keys.steerRight,
        keysDown.has('d') || keysDown.has('arrowright') ? 1 : 0,
      );
      const handbrake =
        keys.handbrake > 0 || keysDown.has(' ') || keysDown.has('shift') || keysDown.has('space');

      if (raceStatus === 'racing') {
        playerCar.throttle = throttle;
        playerCar.brake = brake > 0;
        playerCar.handbrake = handbrake;
        playerCar.steer = -steerLeft + steerRight;
      } else {
        playerCar.throttle = 0;
        playerCar.brake = false;
        playerCar.handbrake = false;
        playerCar.steer = 0;
      }

      // ─── Countdown ──────────────────────────────────────────────────
      if (raceStatus === 'countdown') {
        countdownRemaining -= dt;
        const displayed = Math.max(0, Math.ceil(countdownRemaining));
        if (displayed < countdownDisplayed) {
          countdownDisplayed = displayed;
          if (displayed > 0) gameAudio.tick();
        }
        if (countdownRemaining <= 0) {
          raceStatus = 'racing';
          playerCar.raceTime = 0;
          aiCar.raceTime = 0;
          gameAudio.levelup();
        }
      }

      // ─── Physics step ────────────────────────────────────────────────
      stepCar(playerCar, dt, track.surfaceAt);
      if (raceStatus === 'racing') updateAi(ai, aiCar, track, dt);
      stepCar(aiCar, dt, track.surfaceAt);

      // ─── Lap tracking — player crosses finish line going in start dir ─
      const prevHint = playerProgressHint;
      playerProgressHint = progressForPosition(playerCar.position, prevHint, track);
      // Lap rollover: index wraps from near-end back to near-start.
      if (raceStatus === 'racing') {
        if (prevHint > track.segmentCount - 15 && playerProgressHint < 15) {
          const t = playerCar.raceTime;
          const lapTime = t - lastLapTime;
          const isBestLap = lapTimes.length > 0 && lapTime < Math.min(...lapTimes);
          lapTimes.push(lapTime);
          lastLapTime = t;
          playerCar.laps += 1;
          if (playerCar.laps >= TOTAL_LAPS) {
            // Determine win/loss by comparing total progress.
            const aiTotalProgress =
              aiCar.laps + ai.progressIndex / track.segmentCount;
            raceStatus = aiTotalProgress >= TOTAL_LAPS ? 'lost' : 'won';
            if (raceStatus === 'won') gameAudio.victory();
            else gameAudio.gameover();
          } else {
            gameAudio.levelup();
            if (isBestLap) gameAudio.coin();
          }
        }
        playerCar.raceTime += dt;

        // AI lap rollover (less rigorous — just tracked for UI position).
        const aiPrev = ai.progressIndex;
        // (updateAi already updated ai.progressIndex; check rollover.)
        if (aiPrev > track.segmentCount - 15 && ai.progressIndex < 15) {
          aiCar.laps += 1;
          if (aiCar.laps >= TOTAL_LAPS && raceStatus === 'racing') {
            raceStatus = 'lost';
            gameAudio.gameover();
          }
        }

        // Drift screech — short throttled noise bursts instead of a
        // per-frame loop so the mixer doesn't pile up sources.
        if (playerCar.currentDriftSec > 0.05 && now - lastScreechAt > 150) {
          lastScreechAt = now;
          gameAudio.noise({ duration: 0.2, volume: 0.07, filterFreq: 2600, filterTo: 1800 });
        }
      }

      // ─── Visual updates ──────────────────────────────────────────────
      playerVisual.root.position.set(playerCar.position.x, 0, playerCar.position.z);
      playerVisual.root.rotation.y = playerCar.heading;
      aiVisual.root.position.set(aiCar.position.x, 0, aiCar.position.z);
      aiVisual.root.rotation.y = aiCar.heading;

      // Body roll proportional to lateral slip.
      const playerRoll = THREE.MathUtils.clamp(playerCar.lateralSlip * 0.018, -0.15, 0.15);
      const lateralSign = Math.sign(
        playerCar.velocity.x * Math.cos(playerCar.heading) -
          playerCar.velocity.z * Math.sin(playerCar.heading),
      );
      playerVisual.root.rotation.z = -playerRoll * lateralSign;
      const aiRoll = THREE.MathUtils.clamp(aiCar.lateralSlip * 0.018, -0.15, 0.15);
      const aiLateralSign = Math.sign(
        aiCar.velocity.x * Math.cos(aiCar.heading) -
          aiCar.velocity.z * Math.sin(aiCar.heading),
      );
      aiVisual.root.rotation.z = -aiRoll * aiLateralSign;

      // Wheel spin — both cars.
      const wheelSpinPlayer = carForwardSpeed(playerCar) * 2.5;
      for (const w of playerVisual.wheels) w.rotation.y += wheelSpinPlayer * dt;
      // Front-wheel visual steer.
      const playerSteer = playerCar.steer * 0.4;
      for (const fw of playerVisual.frontWheels) {
        const pivot = fw.parent as THREE.Object3D | null;
        if (pivot) pivot.rotation.y = playerSteer;
      }
      const wheelSpinAi = carForwardSpeed(aiCar) * 2.5;
      for (const w of aiVisual.wheels) w.rotation.y += wheelSpinAi * dt;
      for (const fw of aiVisual.frontWheels) {
        const pivot = fw.parent as THREE.Object3D | null;
        if (pivot) pivot.rotation.y = aiCar.steer * 0.4;
      }

      // Tire smoke fade — only when on road and slipping hard.
      const smokeIntensity = playerCar.surface > 0.4 ? THREE.MathUtils.clamp(
        (playerCar.lateralSlip - 4) * 0.15,
        0,
        0.8,
      ) : 0;
      (playerVisual.smokeLeft.material as THREE.MeshBasicMaterial).opacity = smokeIntensity;
      (playerVisual.smokeRight.material as THREE.MeshBasicMaterial).opacity = smokeIntensity;
      // Smoke faces the camera for a billboard look.
      playerVisual.smokeLeft.lookAt(camera.position);
      playerVisual.smokeRight.lookAt(camera.position);

      // ─── Skid trails — lay down a mark when the rear is sliding ────
      const stepTrails = (
        car: CarState,
        trailL: SkidTrail,
        trailR: SkidTrail,
      ) => {
        const cosH = Math.cos(car.heading);
        const sinH = Math.sin(car.heading);
        // Rear wheel local positions: (±1.0, *, -1.4) → world.
        const rlX = car.position.x + cosH * -1.0 + sinH * -1.4;
        const rlZ = car.position.z - sinH * -1.0 + cosH * -1.4;
        const rrX = car.position.x + cosH * 1.0 + sinH * -1.4;
        const rrZ = car.position.z - sinH * 1.0 + cosH * -1.4;
        // Width direction = car's forward axis so the trail strip lies along
        // the wheel rather than across it.
        const tx = sinH;
        const tz = cosH;
        // Intensity rises with lateral slip; only on road.
        const onRoad = car.surface > 0.5 ? 1 : 0;
        const slipPart = THREE.MathUtils.clamp((car.lateralSlip - 2.5) * 0.35, 0, 1);
        // Burnouts under handbrake leave a mark even before the slide builds.
        const handbrakePart = car.handbrake && carForwardSpeed(car) > 4 ? 0.5 : 0;
        const intensity = onRoad * Math.max(slipPart, handbrakePart);
        trailL.step(dt, rlX, rlZ, tx, tz, intensity);
        trailR.step(dt, rrX, rrZ, tx, tz, intensity);
      };
      stepTrails(playerCar, playerTrailLeft, playerTrailRight);
      stepTrails(aiCar, aiTrailLeft, aiTrailRight);

      // Brake light brightness — flashes brighter when foot brake is on.
      playerVisual.brakelightMaterial.emissiveIntensity = playerCar.brake ? 2.0 : 0.4;
      aiVisual.brakelightMaterial.emissiveIntensity = aiCar.brake ? 2.0 : 0.4;

      // ─── Chase camera ───────────────────────────────────────────────
      const speed = playerCar.velocity.length();
      const followDist = 9.5 + Math.min(3.5, speed * 0.07);
      const followHeight = 4.5 + Math.min(1.0, speed * 0.018);
      // The camera sits behind a blend of the heading dir (stable) and the
      // velocity dir (the drift-feel angle). We cap the velocity contribution
      // and time-filter the resulting direction so quick slides don't whip
      // the rig around.
      const velLen = Math.max(1, speed);
      const velDirX = playerCar.velocity.x / velLen;
      const velDirZ = playerCar.velocity.z / velLen;
      const headingDirX = Math.sin(playerCar.heading);
      const headingDirZ = Math.cos(playerCar.heading);
      const blend = THREE.MathUtils.clamp(speed / 28, 0, 0.35);
      const rawBehindX = -(velDirX * blend + headingDirX * (1 - blend));
      const rawBehindZ = -(velDirZ * blend + headingDirZ * (1 - blend));
      const camFollowK = Math.min(1, 3.2 * dt);
      camBehindX += (rawBehindX - camBehindX) * camFollowK;
      camBehindZ += (rawBehindZ - camBehindZ) * camFollowK;
      const camBehindLen = Math.hypot(camBehindX, camBehindZ) || 1;
      const camBehindNX = camBehindX / camBehindLen;
      const camBehindNZ = camBehindZ / camBehindLen;
      cameraTargetPos.set(
        playerCar.position.x + camBehindNX * followDist,
        followHeight,
        playerCar.position.z + camBehindNZ * followDist,
      );
      camera.position.lerp(cameraTargetPos, Math.min(1, 4 * dt));

      // Lateral lean — slight roll opposite to the slide. Use the actual
      // lateral velocity rather than a discrete sign() so the lean doesn't
      // pop when slip switches direction.
      const lateralVel =
        playerCar.velocity.x * Math.cos(playerCar.heading) -
        playerCar.velocity.z * Math.sin(playerCar.heading);
      const targetLateralLean = THREE.MathUtils.clamp(lateralVel * 0.015, -0.18, 0.18);
      lateralLeanSmoothed += (targetLateralLean - lateralLeanSmoothed) * Math.min(1, 4 * dt);
      const targetLean = -lateralLeanSmoothed * 0.45;
      cameraLean += (targetLean - cameraLean) * Math.min(1, 4 * dt);

      const aheadX = playerCar.position.x + headingDirX * 6;
      const aheadZ = playerCar.position.z + headingDirZ * 6;
      // Lerp the look-at target so it doesn't jitter when the car spins.
      cameraLookAt.x += (aheadX - cameraLookAt.x) * Math.min(1, 5 * dt);
      cameraLookAt.z += (aheadZ - cameraLookAt.z) * Math.min(1, 5 * dt);
      cameraLookAt.y = 1.2;
      camera.lookAt(cameraLookAt);
      // rotateZ applies a roll around the camera's local look-axis after
      // lookAt set the orientation. Setting rotation.z directly would fight
      // the quaternion lookAt wrote.
      camera.rotateZ(cameraLean);

      // ─── Render ─────────────────────────────────────────────────────
      renderer.render(scene, camera);

      // ─── Push UI state ~10× per second to avoid React thrash. ───────
      if (now - lastUiPush > 90) {
        lastUiPush = now;
        const speedKmh = Math.max(0, carForwardSpeed(playerCar) * 3.6);
        const aiTotal = aiCar.laps + ai.progressIndex / track.segmentCount;
        const playerTotal = playerCar.laps + playerProgressHint / track.segmentCount;
        const positionLabel: '1st' | '2nd' = playerTotal >= aiTotal ? '1st' : '2nd';
        const bestLap = lapTimes.length > 0 ? Math.min(...lapTimes) : null;

        setUi({
          status:
            raceStatus === 'countdown'
              ? 'countdown'
              : raceStatus === 'racing'
                ? 'racing'
                : raceStatus,
          countdown: Math.max(0, Math.ceil(countdownRemaining)),
          speedKmh,
          lap: Math.min(TOTAL_LAPS, playerCar.laps + 1),
          raceTime: playerCar.raceTime,
          driftScore: Math.floor(playerCar.driftScore),
          currentDriftSec: playerCar.currentDriftSec,
          positionLabel,
          bestLapSec: bestLap,
          lapTimes: [...lapTimes],
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
      // Walk the scene and dispose geometries + materials.
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material as
          | THREE.Material
          | THREE.Material[]
          | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else if (mat) mat.dispose();
      });
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [runId]);

  const restart = () => {
    gameAudio.click();
    setUi(INITIAL_UI);
    setRunId((n) => n + 1);
    setScoreId(null);
    setSubmitError(null);
    setPausedBoth(false);
    submittedKeyRef.current = null;
  };

  // Submit the run to the leaderboard once the race resolves, then fetch the
  // updated top board. We key submissions by `${runId}:${status}` so each run
  // only POSTs once even if the effect retriggers.
  const submitScore = useCallback(async () => {
    if (!raceContext) return;
    if (ui.status !== 'won' && ui.status !== 'lost') return;
    const key = `${runId}:${ui.status}`;
    if (submittedKeyRef.current === key) return;
    submittedKeyRef.current = key;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/games/drift-racer/scores', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          wallet: raceContext.wallet,
          displayName: null,
          // Server requires positive numbers. If the player crashed out
          // before recording any lap, fall back to total time as best.
          bestLapSec: ui.bestLapSec ?? ui.raceTime,
          totalTimeSec: ui.raceTime,
          driftScore: ui.driftScore,
          lapsCompleted: ui.lap,
          won: ui.status === 'won',
          entrySignature: raceContext.entrySignature,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        id?: string;
        error?: string;
      };
      if (!res.ok || !payload.id) {
        throw new Error(payload.error || 'Score submit failed');
      }
      setScoreId(payload.id);
    } catch (err) {
      submittedKeyRef.current = null; // allow retry
      setSubmitError(err instanceof Error ? err.message : 'Score submit failed');
    } finally {
      setSubmitting(false);
    }
  }, [
    raceContext,
    runId,
    ui.bestLapSec,
    ui.driftScore,
    ui.lap,
    ui.raceTime,
    ui.status,
  ]);

  useEffect(() => {
    if (ui.status === 'won' || ui.status === 'lost') {
      void submitScore();
    }
  }, [ui.status, submitScore]);

  // Refresh the leaderboard view whenever the race ends OR a new score is
  // accepted by the server.
  useEffect(() => {
    if (ui.status !== 'won' && ui.status !== 'lost') return;
    let cancelled = false;
    fetch('/api/games/drift-racer/scores?limit=10')
      .then((r) => r.json())
      .then((j: { entries?: LeaderboardEntry[] }) => {
        if (!cancelled) setLeaderboard(j.entries ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ui.status, scoreId]);

  return (
    <div className="absolute inset-0 bg-[#06090f] overflow-hidden">
      <div ref={mountRef} className="absolute inset-0" />
      <Hud
        ui={ui}
        onRestart={restart}
        onExit={onExit}
        onPause={() => {
          gameAudio.unlock();
          gameAudio.click();
          setPausedBoth(true);
        }}
        raceContext={raceContext}
        scoreId={scoreId}
        submitting={submitting}
        submitError={submitError}
        leaderboard={leaderboard}
      />
      {touch && ui.status === 'racing' && (
        <MobileControls inputRef={inputRef} />
      )}
      <PauseOverlay
        open={paused && ui.status === 'racing'}
        onResume={() => setPausedBoth(false)}
        onRestart={restart}
        onExit={onExit}
        accentClass="bg-rose-600 hover:bg-rose-500"
        hint="WASD drive · Space = handbrake"
      />
    </div>
  );
}

// Hash-based PRNG for deterministic scenery placement.
function mulberry32(a: number): () => number {
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = (sec - m * 60).toFixed(2);
  return `${m}:${s.padStart(5, '0')}`;
}

function Hud({
  ui,
  onRestart,
  onExit,
  onPause,
  raceContext,
  scoreId,
  submitting,
  submitError,
  leaderboard,
}: {
  ui: RaceUiState;
  onRestart: () => void;
  onExit?: () => void;
  onPause: () => void;
  raceContext?: DriftRaceContext;
  scoreId: string | null;
  submitting: boolean;
  submitError: string | null;
  leaderboard: LeaderboardEntry[] | null;
}) {
  const chipClass =
    'pointer-events-auto inline-flex items-center justify-center rounded-md border border-white/15 bg-black/55 backdrop-blur p-1.5 text-white/80 hover:bg-white/15';
  return (
    <>
      {/* Top-right chrome: mute + pause */}
      <div className="pointer-events-none absolute top-3 right-3 z-20 flex items-center gap-2 font-mono">
        <MuteButton className={chipClass} />
        {ui.status === 'racing' && <PauseButton onClick={onPause} className={chipClass} />}
      </div>

      {/* Top-left: lap, time, position */}
      <div className="pointer-events-none absolute top-16 left-4 z-10 flex flex-col gap-2 font-mono text-white">
        <div className="rounded-lg bg-black/55 backdrop-blur px-3 py-2">
          <div className="text-[10px] uppercase tracking-widest text-white/50">Lap</div>
          <div className="text-2xl font-bold tabular-nums">
            {ui.lap}
            <span className="text-base text-white/40"> / {TOTAL_LAPS}</span>
          </div>
        </div>
        <div className="rounded-lg bg-black/55 backdrop-blur px-3 py-2">
          <div className="text-[10px] uppercase tracking-widest text-white/50">Time</div>
          <div className="text-lg font-bold tabular-nums">{formatTime(ui.raceTime)}</div>
        </div>
        <div className={`rounded-lg backdrop-blur px-3 py-2 ${
          ui.positionLabel === '1st' ? 'bg-emerald-500/25' : 'bg-rose-500/25'
        }`}>
          <div className="text-[10px] uppercase tracking-widest text-white/60">Position</div>
          <div className="text-xl font-bold">{ui.positionLabel}</div>
        </div>
      </div>

      {/* Top-right: speed + drift */}
      <div className="pointer-events-none absolute top-16 right-4 z-10 flex flex-col items-end gap-2 font-mono text-white">
        <div className="rounded-lg bg-black/55 backdrop-blur px-4 py-2 text-right">
          <div className="text-[10px] uppercase tracking-widest text-white/50">Speed</div>
          <div className="text-3xl font-bold tabular-nums text-yellow-300">
            {Math.round(ui.speedKmh)}
            <span className="ml-1 text-sm text-white/40">km/h</span>
          </div>
        </div>
        <div className="rounded-lg bg-black/55 backdrop-blur px-4 py-2 text-right min-w-[8rem]">
          <div className="text-[10px] uppercase tracking-widest text-white/50">Drift</div>
          <div className="text-xl font-bold tabular-nums text-fuchsia-300">
            {ui.driftScore.toLocaleString()}
          </div>
          {ui.currentDriftSec > 0.3 && (
            <div className="text-[10px] mt-0.5 text-fuchsia-200 animate-pulse">
              +{(1 + Math.min(3, ui.currentDriftSec * 0.6)).toFixed(1)}× combo
            </div>
          )}
        </div>
        {ui.bestLapSec != null && (
          <div className="rounded-lg bg-black/55 backdrop-blur px-3 py-1.5 text-right text-xs">
            <span className="text-white/40">Best lap </span>
            <span className="text-emerald-300 tabular-nums">{formatTime(ui.bestLapSec)}</span>
          </div>
        )}
      </div>

      {/* Countdown */}
      {ui.status === 'countdown' && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div className="text-center">
            <div
              key={ui.countdown}
              className="text-[10rem] font-black text-white drop-shadow-[0_0_40px_rgba(251,191,36,0.6)] animate-[ping_0.5s_cubic-bezier(0,0,0.2,1)_1]"
            >
              {ui.countdown > 0 ? ui.countdown : 'GO!'}
            </div>
            <div className="mt-2 text-xs uppercase tracking-[0.4em] text-white/50">
              WASD · Space = handbrake
            </div>
          </div>
        </div>
      )}

      {/* Win / Loss overlay */}
      {(ui.status === 'won' || ui.status === 'lost') && (
        <RaceEndOverlay
          ui={ui}
          raceContext={raceContext}
          scoreId={scoreId}
          submitting={submitting}
          submitError={submitError}
          leaderboard={leaderboard}
          onRestart={onRestart}
          onExit={onExit}
        />
      )}
    </>
  );
}

function RaceEndOverlay({
  ui,
  raceContext,
  scoreId,
  submitting,
  submitError,
  leaderboard,
  onRestart,
  onExit,
}: {
  ui: RaceUiState;
  raceContext?: DriftRaceContext;
  scoreId: string | null;
  submitting: boolean;
  submitError: string | null;
  leaderboard: LeaderboardEntry[] | null;
  onRestart: () => void;
  onExit?: () => void;
}) {
  const won = ui.status === 'won';
  return (
    <div className="absolute inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/75 backdrop-blur-sm py-12">
      <div className="rounded-2xl border border-white/10 bg-[#0e1218] p-7 text-center max-w-lg w-full mx-4 font-mono">
        <h2
          className={`text-4xl font-black mb-1 ${
            won ? 'text-emerald-400' : 'text-rose-400'
          }`}
        >
          {won ? 'VICTORY' : 'DEFEATED'}
        </h2>
        <p className="text-xs text-white/50 mb-5">
          {won ? 'You crossed the line first.' : 'The AI got there first.'}
        </p>

        <div className="grid grid-cols-3 gap-2 mb-5 text-left">
          <Stat
            label="Time"
            value={formatTime(ui.raceTime)}
            tone="white"
          />
          <Stat
            label="Best lap"
            value={ui.bestLapSec != null ? formatTime(ui.bestLapSec) : '—'}
            tone="emerald"
          />
          <Stat
            label="Drift"
            value={ui.driftScore.toLocaleString()}
            tone="fuchsia"
          />
        </div>

        {raceContext && (
          <ClaimSection
            won={won}
            scoreId={scoreId}
            wallet={raceContext.wallet}
            submitting={submitting}
            submitError={submitError}
          />
        )}

        {leaderboard && leaderboard.length > 0 && (
          <Leaderboard
            entries={leaderboard}
            highlightWallet={raceContext?.wallet ?? null}
          />
        )}

        <div className="flex gap-2 mt-6">
          <button
            onClick={onRestart}
            className="flex-1 rounded-full bg-[#8b7ec8] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#7a6db8] transition-colors"
          >
            Race again
          </button>
          {onExit && (
            <button
              onClick={onExit}
              className="rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white/80 hover:bg-white/10"
            >
              Exit
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'white' | 'emerald' | 'fuchsia';
}) {
  const color =
    tone === 'emerald' ? 'text-emerald-300' : tone === 'fuchsia' ? 'text-fuchsia-300' : 'text-white';
  return (
    <div className="rounded-lg bg-white/[0.04] border border-white/5 px-3 py-2">
      <div className="text-[9px] uppercase tracking-widest text-white/40">{label}</div>
      <div className={`text-base font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

function Leaderboard({
  entries,
  highlightWallet,
}: {
  entries: LeaderboardEntry[];
  highlightWallet: string | null;
}) {
  return (
    <div className="mt-5 text-left">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-widest text-white/40">
          Leaderboard · top 10
        </span>
        <span className="text-[10px] text-white/30">by best lap</span>
      </div>
      <div className="rounded-xl border border-white/5 bg-black/30 divide-y divide-white/5 overflow-hidden">
        {entries.map((e, i) => {
          const isMe = highlightWallet === e.wallet_address;
          return (
            <div
              key={e.id}
              className={`flex items-center justify-between px-3 py-2 text-xs ${
                isMe ? 'bg-emerald-500/15' : 'bg-transparent'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-5 text-white/40 tabular-nums text-right">{i + 1}</span>
                <span className="font-mono text-white/80 truncate">
                  {e.display_name || shortWallet(e.wallet_address)}
                </span>
                {isMe && (
                  <span className="text-[9px] uppercase tracking-wider text-emerald-300">
                    you
                  </span>
                )}
              </div>
              <span className="text-emerald-200 tabular-nums">
                {formatTime(Number(e.best_lap_sec))}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ClaimSection({
  won,
  scoreId,
  wallet,
  submitting,
  submitError,
}: {
  won: boolean;
  scoreId: string | null;
  wallet: string;
  submitting: boolean;
  submitError: string | null;
}) {
  const [claiming, setClaiming] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [alreadyClaimed, setAlreadyClaimed] = useState(false);
  const rewardAmount = won ? DRIFT_REWARD_AMOUNTS.win : DRIFT_REWARD_AMOUNTS.loss;
  const rewardConfigured = publicRewardMint() != null;

  const onClaim = async () => {
    if (!scoreId || claiming) return;
    gameAudio.click();
    setClaiming(true);
    setError(null);
    try {
      const res = await fetch('/api/games/drift-racer/claim', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ wallet, scoreId }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        signature?: string;
        alreadyClaimed?: boolean;
        error?: string;
        code?: string;
      };
      if (!res.ok || !json.ok) {
        if (json.code === 'reward_not_configured') {
          throw new Error(
            'Reward token is not configured on this server yet. Try again later.',
          );
        }
        throw new Error(json.error || 'Claim failed');
      }
      setSignature(json.signature ?? null);
      setAlreadyClaimed(!!json.alreadyClaimed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Claim failed');
    } finally {
      setClaiming(false);
    }
  };

  if (submitError) {
    return (
      <div className="text-xs text-rose-300 mb-4">
        Could not submit score: {submitError}
      </div>
    );
  }
  if (submitting || !scoreId) {
    return (
      <div className="text-[11px] text-white/50 mb-4 inline-flex items-center gap-2">
        <span className="h-3 w-3 inline-block animate-spin rounded-full border border-white/20 border-t-white/70" />
        Submitting to leaderboard…
      </div>
    );
  }
  if (!rewardConfigured) {
    return (
      <div className="text-[11px] text-white/40 mb-4">
        Score recorded · DRIFT token rewards coming soon
      </div>
    );
  }

  return (
    <div className="mb-2">
      {signature ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-left">
          <div className="text-[10px] uppercase tracking-widest text-emerald-300">
            {alreadyClaimed ? 'Already claimed' : 'Claimed!'} · {rewardAmount} DRIFT
          </div>
          <a
            href={`https://explorer.solana.com/tx/${signature}?cluster=devnet`}
            target="_blank"
            rel="noreferrer"
            className="mt-0.5 inline-block text-[11px] text-emerald-200 hover:text-emerald-100 underline truncate max-w-full"
          >
            {signature.slice(0, 10)}…{signature.slice(-10)}
          </a>
        </div>
      ) : (
        <button
          onClick={onClaim}
          disabled={claiming}
          className="w-full rounded-full bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-emerald-400 disabled:opacity-60 inline-flex items-center justify-center gap-2"
        >
          {claiming && (
            <span className="h-3.5 w-3.5 inline-block animate-spin rounded-full border-2 border-white/40 border-t-white" />
          )}
          {claiming ? 'Claiming…' : `Claim ${rewardAmount} DRIFT`}
        </button>
      )}
      {error && (
        <div className="mt-2 text-xs text-rose-300">{error}</div>
      )}
    </div>
  );
}

function shortWallet(addr: string): string {
  return addr.length > 8 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr;
}

function MobileControls({
  inputRef,
}: {
  inputRef: React.RefObject<{
    throttle: number;
    brake: number;
    steerLeft: number;
    steerRight: number;
    handbrake: number;
  } | null>;
}) {
  const press = (key: 'throttle' | 'brake' | 'steerLeft' | 'steerRight' | 'handbrake', v: number) => {
    if (v > 0) gameAudio.unlock();
    if (inputRef.current) inputRef.current[key] = v;
  };
  const Btn = ({
    label,
    onDown,
    onUp,
    className,
  }: {
    label: string;
    onDown: () => void;
    onUp: () => void;
    className?: string;
  }) => (
    <button
      type="button"
      onTouchStart={(e) => {
        e.preventDefault();
        onDown();
      }}
      onTouchEnd={(e) => {
        e.preventDefault();
        onUp();
      }}
      onTouchCancel={onUp}
      className={`select-none rounded-full bg-white/15 backdrop-blur active:bg-white/30 border border-white/20 flex items-center justify-center font-bold text-white touch-none ${className ?? ''}`}
    >
      {label}
    </button>
  );

  return (
    <div className="absolute inset-x-0 bottom-0 z-20 pb-6 px-6 pointer-events-none">
      <div className="flex justify-between items-end">
        <div className="flex gap-3 pointer-events-auto">
          <Btn
            label="◀"
            onDown={() => press('steerLeft', 1)}
            onUp={() => press('steerLeft', 0)}
            className="w-16 h-16 text-xl"
          />
          <Btn
            label="▶"
            onDown={() => press('steerRight', 1)}
            onUp={() => press('steerRight', 0)}
            className="w-16 h-16 text-xl"
          />
        </div>
        <div className="flex flex-col gap-2 items-end pointer-events-auto">
          <Btn
            label="DRIFT"
            onDown={() => press('handbrake', 1)}
            onUp={() => press('handbrake', 0)}
            className="w-20 h-12 text-xs bg-fuchsia-500/30 border-fuchsia-300/50"
          />
          <div className="flex gap-3">
            <Btn
              label="BRAKE"
              onDown={() => press('brake', 1)}
              onUp={() => press('brake', 0)}
              className="w-16 h-16 text-[10px]"
            />
            <Btn
              label="GAS"
              onDown={() => press('throttle', 1)}
              onUp={() => press('throttle', 0)}
              className="w-20 h-20 text-sm bg-emerald-500/30 border-emerald-300/50"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
