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
  /** 20" BMX wheel. Must match GEOM.wheelRadius in riderPose.ts. */
  wheelRadius: 0.258,
  wheelMass: 1.0, // kg each; inertia set as a thin rim (m·r²·0.85)
  wheelFriction: 1.35,
  frameMass: 11, // kg, frame + fork + bars

  /** Rider body (separate, spring-mounted). */
  riderMass: 65,
  /**
   * Arms and legs are the suspension: three soft distance springs hold the rider
   * body (legs: bottom bracket → hip, core: head tube → hip, arms: grips →
   * shoulder). Values describe the feel against the rider's own mass.
   */
  legHz: 3.2,
  legDamping: 0.55,
  armHz: 3.8,
  armDamping: 0.6,
  coreHz: 4.2,
  coreDamping: 0.65,
  /** Torso posture: rotational spring between rider body and frame (N·m/rad, N·m·s/rad). */
  postureStiffness: 2600,
  postureDamping: 120,
  /** Hip bob while sprinting (legs spring length modulated with the crank). */
  pedalBobAmount: 0.025, // m of hip bob while sprinting

  /** Tire squish: stiff, lightly damped spring on each wheel joint, relative to the whole bike + rider. */
  tireHz: 11,
  tireDamping: 0.35,

  /** Rear-wheel drive while pedalling (only with the rear wheel on the ground). */
  topSpeed: 17, // m/s on flat ground
  pedalTorque: 90, // N·m
  /** Rider shifts forward over the bars while sprinting (adds to lean, -1…1 scale). */
  sprintLean: 0.45,
  /** Crank spin rate when pedalling with the wheel off the ground (visual only). */
  airCrankRate: 9, // rad/s

  /** Rider's own balance on the ground when not leaning: PD pull toward the slope angle. */
  balanceKp: 520,
  balanceKd: 60,
  balanceMaxTorque: 420,
  /** Ground weight shift (manual / nose manual): bar pull torque on top of moving the rider body. */
  groundLeanTorque: 230,
  /** Air rotation control (applied to the whole bike + rider about the shared centre of mass). */
  airSpinRate: 7.2, // rad/s max ≈ 1.15 rotations per second
  airSpinAccel: 26, // rad/s²
  /** Released lean in the air: rotation keeps some momentum and bleeds off at this rate. */
  airAngularDamping: 1.6,
  /** Aerodynamic drag coefficient: F = k·v². ~0.3 m/s² deceleration at top speed. */
  airDrag: 0.08,

  /** Brake torque per wheel (after the finish line), N·m. */
  brakeTorque: 60,

  /** Bunny hop: impulse along the ground normal, scaled by charge. */
  hopMinSpeed: 3.2,
  hopMaxSpeed: 6.2,
  hopChargeTime: 0.35,

  /** Pump: down on the back side of a roller adds speed, on the up side costs speed. */
  pumpImpulse: 1.6, // m/s along travel
  pumpPenalty: 0.6, // m/s lost when pumping uphill
  pumpCooldown: 0.45,
  pumpMinDescent: 0.9, // m/s of vertical speed that counts as "downhill"/"uphill"
  pumpDownForce: 380, // N pressed into the ground while holding down
};

export const LANDING = {
  /** Minimum airtime before a touchdown counts as a landing. */
  minAirtime: 0.18,
  /** Both wheels must touch within this window for a perfect landing. */
  bothWheelsWindow: 0.08,
  perfectAngle: 10, // degrees from slope
  goodAngle: 25,
  /** Beyond this angle at touchdown the bike is upside down / vertical: crash. */
  maxLandingAngle: 75,
  perfectBoost: 2.6, // m/s along the ground
  goodBoost: 0.8,
  sloppySpeedKeep: 0.8,
  wobbleTime: 0.45,
  /** Impact speed perpendicular to the ground. Above `case`: hard thud and speed loss. Above `crash`: crash. */
  caseImpactVelocity: 9,
  crashImpactVelocity: 18,
  caseSpeedKeep: 0.7,
};

export const MANUAL = {
  /** Bike angle vs slope that counts as riding on one wheel. */
  minAngle: 8,
  /** Past these the rider steps off the back / goes over the bars. */
  wheelieTipAngle: 80,
  noseTipAngle: 70,
  /** Share of gravity's tipping moment cancelled while on one wheel (1 = fully, arcade manual). */
  gravityAssist: 1,
  /** Share of pitch rate removed when touching down on one wheel. */
  landingSpinAbsorb: 0.9,
  /** Then for this long the rider keeps damping pitch at this rate (1/s). */
  absorbTime: 0.3,
  absorbRate: 14,
  /** With no input, extra pull toward both wheels per radian of manual angle (N·m/rad). */
  settleStiffness: 450,
  /** Extra pitch damping while on one wheel. */
  dampingScale: 3,
  /** Balance point shown on the meter. */
  wheelieBalanceAngle: 38,
  noseBalanceAngle: 28,
};

export const CRASH = {
  respawnDelay: 1.2,
  /** After this, pressing pedal or jump respawns immediately. */
  skipAfter: 0.35,
  fadeTime: 0.25,
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
  /** Short landscape phone screens: tighter view, rider raised above the thumb buttons. */
  compactBelowPx: 520,
  compactViewHeight: 15.5,
  compactRiderScreenY: 0.47,
  followLerp: 7,
  zoomLerp: 2.2,
  shakeDecay: 6,
};
