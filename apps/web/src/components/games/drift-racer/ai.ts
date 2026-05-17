import * as THREE from 'three';
import type { CarState } from './car';
import type { TrackData } from './track';

// AI drives toward a "lookahead" point on the centerline a few segments
// ahead of its current progress. Steering is computed as the signed angle
// between the car's heading and the lookahead direction; throttle is full
// when the steering correction is small, eased when it's large (so the AI
// slows for corners). It also lightly triggers the handbrake when the
// corner angle is sharp, which produces visible AI drift.

const LOOKAHEAD_SEGMENTS = 18;
const SHARP_CORNER_THRESHOLD = 0.55; // radians

interface AiState {
  /** Closest centerline index updated each frame for lookahead. */
  progressIndex: number;
  /** Per-AI skill knob — 1 = parity with player, <1 = easier. */
  skill: number;
}

export function createAiState(skill = 0.95): AiState {
  return { progressIndex: 0, skill };
}

export function updateAi(
  ai: AiState,
  car: CarState,
  track: TrackData,
  dt: number,
): void {
  // Find the centerline index closest to the AI car. Walk forward from the
  // last progress index for cheap continuity rather than scanning the whole
  // ring every frame.
  const seg = track.segmentCount;
  let best = ai.progressIndex;
  let bestDist = Infinity;
  for (let offset = -4; offset < 10; offset++) {
    const i = (ai.progressIndex + offset + seg) % seg;
    const p = track.centerline[i];
    const dx = p.x - car.position.x;
    const dz = p.z - car.position.z;
    const d = dx * dx + dz * dz;
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  ai.progressIndex = best;

  const lookIndex = (best + LOOKAHEAD_SEGMENTS) % seg;
  const look = track.centerline[lookIndex];
  const toX = look.x - car.position.x;
  const toZ = look.z - car.position.z;
  const targetHeading = Math.atan2(toX, toZ);

  // Signed shortest angle delta in [-PI, PI].
  let delta = targetHeading - car.heading;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;

  // Smooth steer command — clamp to [-1, 1] and avoid jitter at small angles.
  const steerRaw = Math.max(-1, Math.min(1, delta * 1.8));
  car.steer += (steerRaw - car.steer) * Math.min(1, 12 * dt);

  // Throttle eases off when correcting hard.
  const absDelta = Math.abs(delta);
  const corneringEase = 1 - Math.min(0.7, absDelta * 1.1);
  car.throttle = corneringEase * ai.skill;

  // Trigger handbrake for visible drift on sharp corners — but only when
  // moving fast enough that a slide is plausible.
  const speed = car.velocity.length();
  car.handbrake = absDelta > SHARP_CORNER_THRESHOLD && speed > 14;

  car.brake = false;
  // AI doesn't reverse — if it spins out badly, it'll just nose forward.
}

// Wraps a polyline-progress estimate for the player car given its position.
// Cheaper-but-accurate-enough: snap to nearest centerline index using a
// stored hint to avoid walking the whole ring.
export function progressForPosition(
  position: THREE.Vector3,
  hint: number,
  track: TrackData,
): number {
  const seg = track.segmentCount;
  let best = hint;
  let bestDist = Infinity;
  for (let offset = -6; offset < 30; offset++) {
    const i = (hint + offset + seg) % seg;
    const p = track.centerline[i];
    const dx = p.x - position.x;
    const dz = p.z - position.z;
    const d = dx * dx + dz * dz;
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}
