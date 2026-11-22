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
  /** Air reflex with no lean input: bike levelled under the body toward the slope this far ahead (s). */
  airLevelLookahead: 0.3,
  /** Largest bike-vs-body twist the rider uses for that (rad). */
  airLevelMax: 0.6,
  /** Deepest crouch: hip height above the bottom bracket where the knees bottom out (m). */
  minHipHeight: 0.42,
  /** Hip bob while sprinting (legs spring length modulated with the crank). */
  pedalBobAmount: 0.025, // m of hip bob while sprinting

  /** Tire squish: stiff, lightly damped spring on each wheel joint, relative to the whole bike + rider. */
  tireHz: 11,
  tireDamping: 0.35,

  /** Rear-wheel drive while pedalling (only with the rear wheel on the ground). */
  topSpeed: 17, // m/s on flat ground
  pedalTorque: 90, // N·m
  /** Pedal effort fades out between these nose-up angles (deg vs the ground). */
  pedalEaseFrom: 4,
  pedalEaseTo: 14,
  /** Rider shifts forward over the bars while sprinting (adds to lean, -1…1 scale). */
  sprintLean: 0.6,
  /** How fast the rider moves to a new lean position (1/s). */
  leanRate: 8,
  /** Crank spin rate when pedalling with the wheel off the ground (visual only). */
  airCrankRate: 9, // rad/s

  /**
   * Balance on the ground is the rider's own effort, never an outside force:
   * a weight-shift reflex (lean per radian of pitch vs the ground, and per rad/s)
   * plus arm torque on the bars (equal and opposite on rider and bike).
   */
  balanceLeanKp: 3,
  balanceLeanKd: 0.35,
  balanceKp: 520,
  balanceKd: 60,
  balanceMaxTorque: 420,
  /** Bar pull (lean back) / push (lean forward) torque while a lean button is held. */
  groundLeanTorque: 230,
  /** Air rotation control (whole bike + rider about the shared centre of mass; speed untouched). */
  airSpinRate: 7.2, // rad/s max ≈ 1.15 rotations per second
  airSpinAccel: 26, // rad/s²
  /** Released lean in the air: rotation keeps some momentum and bleeds off at this rate. */
  airAngularDamping: 1.6,

  /** Brake torque per wheel (after the finish line), N·m. */
  brakeTorque: 60,

  /**
   * Bunny hop: crouch while held, then on release the legs push the bike into the
   * ground (push) and the arms/legs lift it after the rider (pull). Internal forces, N.
   */
  hopChargeTime: 0.35,
  hopPushTime: 0.14,
  hopPullTime: 0.12,
  hopPushForce: 2600,
  hopPullForce: 1500,
  /** Share of the pull applied at the bars (lifts the front first, like a real hop). */
  hopBarsShare: 0,
  /** While hopping or pumping the legs stiffen by this factor and move at this rate (1/s). */
  legActionStiffness: 2,
  /** Hop legs snap (fast); pump legs extend over the hold so the push spans the trough. */
  hopLegRate: 16,
  pumpLegRate: 5,

  /** Pump: holding extends the legs (with a short push), releasing absorbs for a moment. */
  pumpForce: 900,
  pumpPushTime: 0.18,
  pumpAbsorbTime: 0.35,
  pumpAbsorbTuck: 0.8,
  /** Vertical speed that counts as "on the way down/up" for the PUMP feedback. */
  pumpMinDescent: 0.9,
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
  wobbleTime: 0.45,
  /** Impact speed perpendicular to the ground. Above `case`: hard landing (wobble). Above `crash`: crash. */
  caseImpactVelocity: 9,
  crashImpactVelocity: 18,
};

export const MANUAL = {
  /** Bike angle vs slope that counts as riding on one wheel. */
  minAngle: 8,
  /** Past these the rider steps off the back / goes over the bars. */
  wheelieTipAngle: 80,
  noseTipAngle: 70,
  /** Balance point shown on the meter. */
  wheelieBalanceAngle: 38,
  noseBalanceAngle: 28,
};

export const CRASH = {
  respawnDelay: 1.2,
  /** After this, pressing pedal or jump respawns immediately. */
  skipAfter: 0.35,
  fadeTime: 0.25,
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
