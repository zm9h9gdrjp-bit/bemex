/**
 * Physics and handling tuning. Every number that changes how the bike feels
 * lives here, so balancing never requires touching gameplay code.
 *
 * Units: meters, kilograms, seconds, radians. World is y-up (Planck).
 */
export const PHYSICS = {
  /** Fixed simulation step. 120 Hz keeps small wheels from tunnelling at speed. */
  stepHz: 120,
  velocityIterations: 8,
  positionIterations: 3,
  /** Max sim steps per rendered frame (prevents the spiral of death on hitches). */
  maxStepsPerFrame: 6,
  gravity: -14,
};

export const BIKE = {
  wheelRadius: 0.27,
  /** Distance from the frame origin to each axle along x. */
  halfWheelbase: 0.52,
  wheelDensity: 9,
  wheelFriction: 1.35,
  frameDensity: 25,

  /** Rider mass is carried by these fixtures on the frame while riding. */
  hipOffset: { x: 0.0, y: 0.9 },
  hipHalfSize: { x: 0.15, y: 0.22 },
  hipDensity: 400,
  headOffset: { x: 0.3, y: 1.4 },
  headRadius: 0.13,
  headDensity: 120,

  /**
   * Suspension feel as seen by the rider: natural frequency and damping of the
   * rider+frame mass on each wheel. Converted to Planck's wheel-joint values
   * (which are relative to the wheel's much smaller effective mass) in bike.ts.
   */
  suspensionHz: 3.2,
  suspensionDamping: 0.55,

  /** Rear-wheel motor while pedalling. */
  topSpeed: 17, // m/s on flat ground
  pedalTorque: 100, // N·m (above ~140 the reaction torque loops the bike over backwards)

  /** Rider's own balance on the ground when not leaning: PD pull toward the slope angle. */
  balanceKp: 420,
  balanceKd: 45,
  balanceMaxTorque: 320,
  /** Ground weight shift (manual / nose manual). */
  groundLeanTorque: 210,
  /** Air rotation control: angular velocity target and how fast it is reached. */
  airSpinRate: 7.2, // rad/s ≈ 1.15 rotations per second
  airSpinAccel: 30, // rad/s²
  airAngularDamping: 2.2, // no input: rotation bleeds off so a neutral rider stays readable

  /** Bunny hop: impulse along the ground normal, scaled by charge. */
  hopMinSpeed: 3.2,
  hopMaxSpeed: 6.2,
  hopChargeTime: 0.35,

  /** Pump: pressing down while rolling downhill. */
  pumpImpulse: 1.6, // m/s added along travel direction
  pumpCooldown: 0.45,
  pumpMinDescent: 0.9, // m/s of downward velocity needed
  pumpDownForce: 380, // N pressed into the ground while holding down
};

export const LANDING = {
  /** Minimum airtime before a touchdown counts as a landing. */
  minAirtime: 0.18,
  /** Both wheels must touch within this window for a perfect landing. */
  bothWheelsWindow: 0.08,
  perfectAngle: 10, // degrees
  goodAngle: 25,
  sloppyAngle: 45,
  perfectBoost: 2.6, // m/s along the ground
  sloppySpeedKeep: 0.78,
  wobbleTime: 0.45,
};

export const CRASH = {
  respawnDelay: 1.5,
  /** Speed given to the rider when respawning at a checkpoint. */
  respawnSpeed: 9,
  /** Checkpoint spacing as a fraction of track length. */
  checkpointEvery: 0.15,
};

export const CAMERA = {
  /** World meters visible vertically at rest. Rider ≈ 1/12 of screen height. */
  baseViewHeight: 21,
  maxZoomOut: 1.45,
  speedForMaxZoom: 19,
  airZoomPerMeter: 0.025,
  lookAheadSeconds: 0.38,
  maxLookAhead: 7,
  /** Rider sits in the left third: offset of the camera center ahead of the rider, as a fraction of view width. */
  riderScreenX: 0.3,
  riderScreenY: 0.58,
  followLerp: 7,
  zoomLerp: 2.2,
  shakeDecay: 6,
};
