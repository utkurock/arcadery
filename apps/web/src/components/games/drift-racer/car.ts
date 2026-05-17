import * as THREE from 'three';

// Visual car: a stylized low-poly chassis built from primitive meshes.
// Returns the root group plus references to wheel meshes so the game loop
// can spin them and bank the chassis during drift.
interface CarVisual {
  root: THREE.Group;
  body: THREE.Mesh;
  wheels: THREE.Mesh[];
  /** Rear wheels rotate with the throttle direction; fronts also steer. */
  frontWheels: THREE.Mesh[];
  rearWheels: THREE.Mesh[];
  /** Two cone meshes anchored at the rear wheels — billowed during drift. */
  smokeLeft: THREE.Mesh;
  smokeRight: THREE.Mesh;
  taillights: THREE.Mesh[];
  brakelightMaterial: THREE.MeshStandardMaterial;
}

export function buildCar(bodyColor: number, accentColor: number): CarVisual {
  const root = new THREE.Group();

  // Lower chassis — flatter, wider — gives a stance.
  const chassisGeo = new THREE.BoxGeometry(2.0, 0.45, 4.0);
  const chassisMat = new THREE.MeshStandardMaterial({
    color: bodyColor,
    metalness: 0.7,
    roughness: 0.35,
  });
  const chassis = new THREE.Mesh(chassisGeo, chassisMat);
  chassis.position.y = 0.5;
  chassis.castShadow = true;
  chassis.receiveShadow = true;
  root.add(chassis);

  // Cabin — narrower box on top with raked windshield achieved by scaling/skewing.
  const cabinGeo = new THREE.BoxGeometry(1.6, 0.55, 2.1);
  const cabinMat = new THREE.MeshStandardMaterial({
    color: bodyColor,
    metalness: 0.7,
    roughness: 0.35,
  });
  const cabin = new THREE.Mesh(cabinGeo, cabinMat);
  cabin.position.set(0, 1.0, -0.1);
  cabin.castShadow = true;
  root.add(cabin);

  // Windshield + side glass.
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x0a0c12,
    metalness: 0.4,
    roughness: 0.15,
    transparent: true,
    opacity: 0.85,
  });
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.48, 0.05), glassMat);
  windshield.position.set(0, 1.05, 0.95);
  windshield.rotation.x = -0.5;
  root.add(windshield);
  const rearGlass = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.48, 0.05), glassMat);
  rearGlass.position.set(0, 1.05, -1.15);
  rearGlass.rotation.x = 0.5;
  root.add(rearGlass);

  // Accent stripe across the hood — classic muscle look.
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.46, 4.02),
    new THREE.MeshStandardMaterial({ color: accentColor, metalness: 0.6, roughness: 0.4 }),
  );
  stripe.position.set(0, 0.5, 0);
  root.add(stripe);

  // Headlights — emissive cylinders pointing forward.
  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffee,
    emissiveIntensity: 1.2,
  });
  for (const side of [-0.65, 0.65]) {
    const hl = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.1, 16), headlightMat);
    hl.rotation.x = Math.PI / 2;
    hl.position.set(side, 0.55, 2.0);
    root.add(hl);
  }

  // Brake lights — start dim, brighten when brake is pressed.
  const brakeMat = new THREE.MeshStandardMaterial({
    color: 0xff2222,
    emissive: 0x550000,
    emissiveIntensity: 0.4,
  });
  const taillights: THREE.Mesh[] = [];
  for (const side of [-0.65, 0.65]) {
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.05), brakeMat);
    tl.position.set(side, 0.55, -2.0);
    root.add(tl);
    taillights.push(tl);
  }

  // Wheels — cylinders rotated on Z. Front pair gets put in a steering pivot
  // group so we can rotate them visually with the steering input.
  const wheelMat = new THREE.MeshStandardMaterial({
    color: 0x111114,
    metalness: 0.2,
    roughness: 0.85,
  });
  const wheels: THREE.Mesh[] = [];
  const frontWheels: THREE.Mesh[] = [];
  const rearWheels: THREE.Mesh[] = [];
  const positions: [number, number, number, boolean][] = [
    [-1.0, 0.4, 1.4, true],
    [1.0, 0.4, 1.4, true],
    [-1.0, 0.4, -1.4, false],
    [1.0, 0.4, -1.4, false],
  ];
  for (const [x, y, z, isFront] of positions) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    const wheel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.42, 0.32, 18),
      wheelMat,
    );
    wheel.rotation.z = Math.PI / 2;
    wheel.castShadow = true;
    pivot.add(wheel);
    // Hub cap accent
    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 0.34, 12),
      new THREE.MeshStandardMaterial({ color: accentColor, metalness: 0.9, roughness: 0.2 }),
    );
    hub.rotation.z = Math.PI / 2;
    pivot.add(hub);
    root.add(pivot);
    wheels.push(wheel);
    if (isFront) frontWheels.push(wheel);
    else rearWheels.push(wheel);
    // Front wheels are stored in a pivot we can yaw for visual steering.
    if (isFront) (pivot.userData as { isSteerable?: boolean }).isSteerable = true;
  }

  // Tire-smoke puffs — small billboards behind the rear bumper so they don't
  // clip through the chassis when the per-frame `lookAt(camera)` flips them
  // upright.
  const smokeMat = new THREE.MeshBasicMaterial({
    color: 0xeeeeee,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const smokeGeo = new THREE.PlaneGeometry(1.4, 1.4);
  const smokeLeft = new THREE.Mesh(smokeGeo, smokeMat.clone());
  const smokeRight = new THREE.Mesh(smokeGeo, smokeMat.clone());
  for (const s of [smokeLeft, smokeRight]) {
    // No initial flat-on-ground rotation — the game loop billboards them.
    s.position.y = 0.6;
    s.renderOrder = 2; // draw after the car so transparency sorts cleanly
    root.add(s);
  }
  smokeLeft.position.z = -2.6;
  smokeLeft.position.x = -0.9;
  smokeRight.position.z = -2.6;
  smokeRight.position.x = 0.9;

  return {
    root,
    body: chassis,
    wheels,
    frontWheels,
    rearWheels,
    smokeLeft,
    smokeRight,
    taillights,
    brakelightMaterial: brakeMat,
  };
}

// ─── Physics state + step ───────────────────────────────────────────────
//
// The drift model is a "Mario-Kart-meets-arcade-sim" pseudo-physics:
//   - Forward force comes from throttle, scaled by current speed.
//   - Lateral velocity is bled off via grip. Grip drops sharply when the
//     handbrake is held → car keeps lateral momentum → slides sideways.
//   - Steering directly rotates the heading at low speed and is gated by
//     speed at high speed to prevent twitchy spinouts.
//
// This is intentionally not physically accurate — the goal is a satisfying,
// repeatable drift loop that's controllable on a keyboard.

export interface CarState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  heading: number;
  angularVelocity: number;
  /** 0..1 driver throttle */
  throttle: number;
  /** -1..1 driver steering */
  steer: number;
  /** true when handbrake is pressed */
  handbrake: boolean;
  /** true when foot brake is pressed */
  brake: boolean;
  /** computed each step: lateral slip in m/s, used for smoke + camera shake. */
  lateralSlip: number;
  /** off-road factor: 1 on road, 0 fully off-road. */
  surface: number;
  /** Accumulated drift score points. */
  driftScore: number;
  /** Current uninterrupted drift in seconds — resets when slip drops. */
  currentDriftSec: number;
  laps: number;
  lastCheckpointIndex: number;
  /** Race time elapsed since GO, in seconds. */
  raceTime: number;
}

export function createCarState(position: THREE.Vector3, heading: number): CarState {
  return {
    position: position.clone(),
    velocity: new THREE.Vector3(),
    heading,
    angularVelocity: 0,
    throttle: 0,
    steer: 0,
    handbrake: false,
    brake: false,
    lateralSlip: 0,
    surface: 1,
    driftScore: 0,
    currentDriftSec: 0,
    laps: 0,
    lastCheckpointIndex: -1,
    raceTime: 0,
  };
}

const MAX_SPEED = 48; // m/s ≈ 173 km/h
const ENGINE_FORCE = 38;
const BRAKE_FORCE = 70;
const ROLLING_DRAG = 0.55;
const AIR_DRAG = 0.022;
const STEER_RATE = 2.3;
const STEER_SPEED_DAMPING = 0.011;
const GRIP_NORMAL = 8.0;
const GRIP_HANDBRAKE = 1.2;
const GRIP_OFFROAD = 1.8;
// When the player isn't steering, kill residual yaw quickly so the car tracks straight.
const STRAIGHTEN_RATE = 6.0;

export function stepCar(
  car: CarState,
  dt: number,
  surfaceAt: (x: number, z: number) => number,
): void {
  // Body-relative velocity decomposition.
  const cosH = Math.cos(car.heading);
  const sinH = Math.sin(car.heading);
  // forward = (sinH, cosH) in our XZ frame (heading 0 → +Z).
  const forwardX = sinH;
  const forwardZ = cosH;
  const rightX = cosH;
  const rightZ = -sinH;

  const forwardSpeed = car.velocity.x * forwardX + car.velocity.z * forwardZ;
  const lateralSpeed = car.velocity.x * rightX + car.velocity.z * rightZ;

  car.surface = surfaceAt(car.position.x, car.position.z);

  // Throttle / brake along the body's forward axis.
  let longForce = 0;
  if (car.brake && forwardSpeed > 0.1) {
    longForce -= BRAKE_FORCE;
  } else {
    longForce += car.throttle * ENGINE_FORCE * (car.surface * 0.5 + 0.5);
  }
  // Reverse when no throttle and pressing brake while stationary.
  if (car.brake && forwardSpeed <= 0.1) {
    longForce -= ENGINE_FORCE * 0.6;
  }

  // Drag scales with current speed.
  const speed = car.velocity.length();
  longForce -= forwardSpeed * ROLLING_DRAG;
  // Quadratic air drag opposes velocity direction.
  car.velocity.x -= car.velocity.x * AIR_DRAG * speed * dt;
  car.velocity.z -= car.velocity.z * AIR_DRAG * speed * dt;

  // Apply longitudinal force.
  car.velocity.x += forwardX * longForce * dt;
  car.velocity.z += forwardZ * longForce * dt;

  // Grip bleeds the lateral component each frame. Lower grip while
  // handbraking or while off-road → the car slides.
  const grip = car.handbrake
    ? GRIP_HANDBRAKE
    : car.surface < 0.5
      ? GRIP_OFFROAD
      : GRIP_NORMAL;
  const gripFactor = 1 - Math.exp(-grip * dt);
  car.velocity.x -= rightX * lateralSpeed * gripFactor;
  car.velocity.z -= rightZ * lateralSpeed * gripFactor;

  car.lateralSlip = Math.abs(lateralSpeed);

  // Steering: more responsive at low speed, locks down at top speed.
  const speedFactor = 1 - Math.min(0.8, speed * STEER_SPEED_DAMPING);
  const targetAngVel = car.steer * STEER_RATE * speedFactor * Math.sign(forwardSpeed || 1);
  car.angularVelocity += (targetAngVel - car.angularVelocity) * Math.min(1, 12 * dt);
  // Auto-straighten when the driver isn't steering, so the car holds a line on
  // the straights without the player having to micro-correct.
  if (Math.abs(car.steer) < 0.05 && !car.handbrake) {
    car.angularVelocity *= Math.max(0, 1 - STRAIGHTEN_RATE * dt);
  }
  car.heading += car.angularVelocity * dt;

  // Speed cap — keep top end consistent so AI can keep up.
  const finalSpeed = car.velocity.length();
  if (finalSpeed > MAX_SPEED * (car.surface * 0.4 + 0.6)) {
    car.velocity.multiplyScalar((MAX_SPEED * (car.surface * 0.4 + 0.6)) / finalSpeed);
  }

  // Integrate position.
  car.position.x += car.velocity.x * dt;
  car.position.z += car.velocity.z * dt;

  // Drift scoring — lateral slip above a threshold while moving forward
  // accumulates points, with a streak multiplier for long slides.
  const driftEligible = car.lateralSlip > 3 && forwardSpeed > 6;
  if (driftEligible) {
    car.currentDriftSec += dt;
    const multiplier = 1 + Math.min(3, car.currentDriftSec * 0.6);
    car.driftScore += car.lateralSlip * dt * 12 * multiplier;
  } else {
    car.currentDriftSec = 0;
  }
}

export function carForwardSpeed(car: CarState): number {
  return car.velocity.x * Math.sin(car.heading) + car.velocity.z * Math.cos(car.heading);
}
