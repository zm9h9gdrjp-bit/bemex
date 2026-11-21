import { World, Vec2, Box, Circle, Polygon, WheelJoint, type Body, type Fixture } from 'planck';
import { BIKE, LANDING, CRASH } from '../config/physics';
import { CAT, MASK } from './collision';
import { SURFACE_DRAG, type Terrain, type Vec, type FixtureTag } from './terrain';
import { classifyLanding, wrapAngle, type LandingQuality } from './landing';
import { GEOM, localPose, poseToWorld, type RiderPose } from './riderPose';
import { Ragdoll } from './ragdoll';

export interface BikeControls {
  pedal: boolean;
  leanBack: boolean;
  leanForward: boolean;
  jump: boolean;
  pump: boolean;
}

export const NO_CONTROLS: BikeControls = { pedal: false, leanBack: false, leanForward: false, jump: false, pump: false };

/** Multipliers applied on top of BIKE defaults (bike model, upgrades, dev sliders). */
export interface BikeTuning {
  topSpeed: number;
  pedalTorque: number;
  spinRate: number;
  grip: number;
  landingForgiveness: number;
}

export const DEFAULT_TUNING: BikeTuning = { topSpeed: 1, pedalTorque: 1, spinRate: 1, grip: 1, landingForgiveness: 1 };

export type BikeEvent =
  | { type: 'landing'; quality: LandingQuality; airtime: number; rotation: number; angleDiffDeg: number }
  | { type: 'pump' }
  | { type: 'hop'; charge: number }
  | { type: 'crash'; reason: 'landing' | 'head' | 'pit' }
  | { type: 'respawn'; checkpoint: number }
  | { type: 'checkpoint'; index: number };

export interface LandingDebug {
  airtime: number;
  rotation: number;
  lastAngleDiffDeg: number;
  lastQuality: LandingQuality | null;
}

/**
 * One rider + bike. Frame and rider share a body while riding (rider mass sits
 * in hip/head fixtures, which keeps the stack stable at 120 Hz); on a crash the
 * rider fixtures are removed and replaced by a separate ragdoll.
 */
export class Bike {
  frame!: Body;
  rearWheel!: Body;
  frontWheel!: Body;
  private rearJoint!: WheelJoint;
  private frontJoint!: WheelJoint;
  private riderFixtures: Fixture[] = [];

  state: 'riding' | 'crashed' = 'riding';
  ragdoll: Ragdoll | null = null;
  tuning: BikeTuning = { ...DEFAULT_TUNING };
  godMode = false;

  // Contact bookkeeping (updated by the world contact router).
  private contacts = { rear: 0, front: 0 };
  private pendingCrash: 'landing' | 'head' | 'pit' | null = null;

  // Air state.
  airtime = 0;
  airRotation = 0;
  private lastAngle = 0;
  private groundedTime = 0;
  private landing: { t: number; angleDiff: number; first: 'rear' | 'front'; airtime: number; rotation: number } | null = null;

  // Control state.
  lean = 0;
  tuck = 0;
  crank = 0;
  wobble = 0;
  private hopCharge = 0;
  private prevJump = false;
  private prevPump = false;
  private fwdArmed = true;
  private pumpCooldown = 0;
  private crashTimer = 0;
  time = 0;

  checkpointIndex = 0;
  readonly events: BikeEvent[] = [];
  readonly debug: LandingDebug = { airtime: 0, rotation: 0, lastAngleDiffDeg: 0, lastQuality: null };
  /** Set by the trick system (milestone 2): true while a trick is still being held. */
  midTrick = () => false;

  constructor(private world: World, private terrain: Terrain, readonly id: number) {
    this.build(terrain.startX, (terrain.heightAt(terrain.startX) ?? 0) + BIKE.wheelRadius + 0.05, 0);
  }

  // ---------------------------------------------------------------- building

  private build(x: number, y: number, speed: number): void {
    const w = this.world;
    const tag = (kind: FixtureTag['kind'], wheel?: 'rear' | 'front'): FixtureTag => ({ kind, wheel, owner: this.id });
    const filter = { filterCategoryBits: CAT.BIKE, filterMaskBits: MASK.BIKE };

    this.frame = w.createDynamicBody({ position: new Vec2(x, y), angularDamping: 0 });
    this.frame.createFixture({
      shape: new Polygon([new Vec2(-0.5, 0.06), new Vec2(0.46, 0.18), new Vec2(0.38, 0.46), new Vec2(-0.32, 0.46)]),
      density: BIKE.frameDensity, friction: 0.4, ...filter, userData: tag('frame'),
    });
    this.addRiderFixtures();

    const wheel = (lx: number, side: 'rear' | 'front') => {
      const b = w.createDynamicBody({ position: new Vec2(x + lx, y), bullet: true });
      b.createFixture({
        shape: new Circle(BIKE.wheelRadius),
        density: BIKE.wheelDensity, friction: BIKE.wheelFriction * this.tuning.grip, restitution: 0,
        ...filter, userData: tag('wheel', side),
      });
      return b;
    };
    this.rearWheel = wheel(-BIKE.halfWheelbase, 'rear');
    this.frontWheel = wheel(BIKE.halfWheelbase, 'front');

    // Planck's spring uses the effective mass along the axis (≈ the wheel), so
    // convert the desired sprung-mass feel into equivalent joint parameters.
    const mWheel = this.rearWheel.getMass(), mFrame = this.frame.getMass();
    const mEff = 1 / (1 / mWheel + 1 / mFrame);
    const mSprung = mFrame / 2;
    const omega = 2 * Math.PI * BIKE.suspensionHz;
    const k = mSprung * omega * omega;
    const c = 2 * mSprung * BIKE.suspensionDamping * omega;
    const omegaEff = Math.sqrt(k / mEff);
    const jointOpt = {
      frequencyHz: omegaEff / (2 * Math.PI), dampingRatio: c / (2 * mEff * omegaEff),
      enableMotor: false, maxMotorTorque: BIKE.pedalTorque, motorSpeed: 0,
    };
    const axis = new Vec2(0, 1);
    this.rearJoint = w.createJoint(new WheelJoint(jointOpt, this.frame, this.rearWheel, this.rearWheel.getPosition(), axis))!;
    this.frontJoint = w.createJoint(new WheelJoint(jointOpt, this.frame, this.frontWheel, this.frontWheel.getPosition(), axis))!;

    for (const b of this.bodies()) b.setLinearVelocity(new Vec2(speed, 0));
    this.contacts.rear = this.contacts.front = 0;
    this.lastAngle = 0;
    this.airtime = 0;
    this.airRotation = 0;
    this.landing = null;
  }

  private addRiderFixtures(): void {
    const filter = { filterCategoryBits: CAT.BIKE, filterMaskBits: MASK.BIKE };
    const tag: FixtureTag = { kind: 'rider', owner: this.id };
    this.riderFixtures = [
      this.frame.createFixture({
        shape: new Box(BIKE.hipHalfSize.x, BIKE.hipHalfSize.y, new Vec2(BIKE.hipOffset.x, BIKE.hipOffset.y), -0.5),
        density: BIKE.hipDensity, friction: 0.5, ...filter, userData: tag,
      }),
      this.frame.createFixture({
        shape: new Circle(new Vec2(BIKE.headOffset.x, BIKE.headOffset.y), BIKE.headRadius),
        density: BIKE.headDensity, friction: 0.5, ...filter, userData: tag,
      }),
    ];
  }

  private bodies(): Body[] { return [this.frame, this.rearWheel, this.frontWheel]; }

  private destroyBike(): void {
    for (const b of this.bodies()) this.world.destroyBody(b);
  }

  // ---------------------------------------------------------------- contacts

  /** Called by the contact router with +1 on begin, -1 on end. */
  onContact(mine: FixtureTag, other: FixtureTag, delta: 1 | -1): void {
    if (this.state !== 'riding') return;
    if (mine.kind === 'wheel' && mine.wheel) {
      if (other.kind === 'pit' && delta > 0) { this.requestCrash('pit'); return; }
      this.contacts[mine.wheel] = Math.max(0, this.contacts[mine.wheel] + delta);
      if (delta > 0) this.onWheelTouch(mine.wheel);
    } else if (mine.kind === 'rider' && delta > 0) {
      this.requestCrash(other.kind === 'pit' ? 'pit' : 'head');
    } else if (mine.kind === 'frame' && other.kind === 'pit' && delta > 0) {
      this.requestCrash('pit');
    }
  }

  private requestCrash(reason: 'landing' | 'head' | 'pit'): void {
    if (this.godMode && reason !== 'pit') return;
    if (!this.pendingCrash) this.pendingCrash = reason;
  }

  get grounded(): boolean { return this.contacts.rear > 0 || this.contacts.front > 0; }
  get bothWheelsDown(): boolean { return this.contacts.rear > 0 && this.contacts.front > 0; }

  private onWheelTouch(wheel: 'rear' | 'front'): void {
    if (this.landing) {
      if (wheel !== this.landing.first) this.finishLanding(this.time - this.landing.t);
      return;
    }
    if (this.airtime < LANDING.minAirtime) return;
    const wp = (wheel === 'rear' ? this.rearWheel : this.frontWheel).getPosition();
    const mid = (this.rearWheel.getPosition().x + this.frontWheel.getPosition().x) / 2;
    const slope = this.terrain.slopeAt((wp.x + mid) / 2);
    this.landing = {
      t: this.time,
      angleDiff: wrapAngle(this.frame.getAngle() - slope),
      first: wheel,
      airtime: this.airtime,
      rotation: this.airRotation,
    };
  }

  private finishLanding(wheelGap: number): void {
    const l = this.landing!;
    this.landing = null;
    const forgiveness = this.tuning.landingForgiveness;
    const quality = classifyLanding({ angleDiff: l.angleDiff / forgiveness, wheelGap, midTrick: this.midTrick() });
    const deg = (l.angleDiff * 180) / Math.PI;
    this.debug.lastAngleDiffDeg = deg;
    this.debug.lastQuality = quality;
    this.events.push({ type: 'landing', quality, airtime: l.airtime, rotation: l.rotation, angleDiffDeg: deg });

    const slope = this.terrain.slopeAt(this.frame.getPosition().x);
    if (quality === 'perfect') {
      this.addVelocity(Math.cos(slope) * LANDING.perfectBoost, Math.sin(slope) * LANDING.perfectBoost);
    } else if (quality === 'sloppy') {
      for (const b of this.bodies()) b.setLinearVelocity(b.getLinearVelocity().clone().mul(LANDING.sloppySpeedKeep));
      this.wobble = 1;
    } else if (quality === 'crash') {
      this.requestCrash('landing');
    }
  }

  private addVelocity(dx: number, dy: number): void {
    for (const b of this.bodies()) {
      const v = b.getLinearVelocity();
      b.setLinearVelocity(new Vec2(v.x + dx, v.y + dy));
    }
  }

  // ---------------------------------------------------------------- update

  get position(): Vec { return this.state === 'crashed' && this.ragdoll ? this.ragdoll.torso.getPosition() : this.frame.getPosition(); }
  get velocity(): Vec { return this.state === 'crashed' && this.ragdoll ? this.ragdoll.torso.getLinearVelocity() : this.frame.getLinearVelocity(); }
  get speed(): number { const v = this.frame.getLinearVelocity(); return Math.hypot(v.x, v.y); }

  /** Before world.step. */
  preStep(dt: number, c: BikeControls): void {
    this.time += dt;
    if (this.state === 'crashed') {
      this.rearJoint.enableMotor(false);
      return;
    }
    const t = this.tuning;
    const grounded = this.grounded;
    const omega = this.frame.getAngularVelocity();

    // Pedal: motor on the rear wheel. Released = freewheel.
    if (c.pedal) {
      this.rearJoint.enableMotor(true);
      this.rearJoint.setMaxMotorTorque(BIKE.pedalTorque * t.pedalTorque);
      this.rearJoint.setMotorSpeed(-(BIKE.topSpeed * t.topSpeed) / BIKE.wheelRadius);
      this.crank -= (this.rearWheel.getAngularVelocity() / 2.75) * dt;
    } else {
      this.rearJoint.enableMotor(false);
    }

    // On the ground, "forward" while pedalling is just pedalling (keyboard → does both);
    // a dedicated forward lean (touch button / gamepad) shifts weight onto the nose.
    // In the air, forward lean needs a fresh press after takeoff: holding the
    // pedal key through a roller must not start a front flip on its own.
    if (grounded) this.fwdArmed = !c.leanForward;
    else if (!c.leanForward) this.fwdArmed = true;
    const fwd = grounded ? c.leanForward && !c.pedal : c.leanForward && this.fwdArmed;
    const leanInput = (fwd ? 1 : 0) - (c.leanBack ? 1 : 0);
    this.lean += (leanInput - this.lean) * Math.min(1, dt * 10);

    if (grounded) {
      // Weight shift: lean back lifts the front (positive torque in y-up space).
      if (leanInput !== 0) {
        this.frame.applyTorque(-leanInput * BIKE.groundLeanTorque, true);
      } else {
        // Rider balance: keeps pedalling from looping the bike and settles bumps.
        const err = wrapAngle(this.frame.getAngle() - this.terrain.slopeAt(this.frame.getPosition().x));
        const tq = -(BIKE.balanceKp * err + BIKE.balanceKd * omega);
        this.frame.applyTorque(Math.max(-BIKE.balanceMaxTorque, Math.min(BIKE.balanceMaxTorque, tq)), true);
      }
      this.frame.setAngularDamping(0);
    } else {
      // Air: steer angular velocity toward a target spin rate.
      const target = -leanInput * BIKE.airSpinRate * t.spinRate;
      if (leanInput !== 0) {
        const next = omega + Math.sign(target - omega) * Math.min(Math.abs(target - omega), BIKE.airSpinAccel * dt);
        this.frame.setAngularVelocity(next);
        this.frame.setAngularDamping(0);
      } else {
        this.frame.setAngularDamping(BIKE.airAngularDamping);
      }
    }

    // Hop: hold to charge, release to pop. Coyote time of 0.1 s after leaving the ground.
    const canHop = this.groundedTime > -0.1;
    if (c.jump && canHop) this.hopCharge = Math.min(BIKE.hopChargeTime, this.hopCharge + dt);
    if (!c.jump && this.prevJump && this.hopCharge > 0 && canHop) {
      const k = this.hopCharge / BIKE.hopChargeTime;
      const sp = BIKE.hopMinSpeed + (BIKE.hopMaxSpeed - BIKE.hopMinSpeed) * k;
      const slope = this.terrain.slopeAt(this.frame.getPosition().x);
      this.addVelocity(-Math.sin(slope) * sp, Math.cos(slope) * sp);
      this.events.push({ type: 'hop', charge: k });
      this.groundedTime = -1;
    }
    if (!c.jump) this.hopCharge = 0;
    this.prevJump = c.jump;

    // Pump: a press while rolling downhill turns the drop into speed.
    this.pumpCooldown = Math.max(0, this.pumpCooldown - dt);
    const v = this.frame.getLinearVelocity();
    if (c.pump && grounded) {
      const slope = this.terrain.slopeAt(this.frame.getPosition().x);
      this.frame.applyForceToCenter(new Vec2(Math.sin(slope) * BIKE.pumpDownForce, -Math.cos(slope) * BIKE.pumpDownForce), true);
      if (!this.prevPump && this.pumpCooldown === 0 && v.y < -BIKE.pumpMinDescent && v.x > 0) {
        const s = Math.hypot(v.x, v.y);
        this.addVelocity((v.x / s) * BIKE.pumpImpulse, (v.y / s) * BIKE.pumpImpulse);
        this.pumpCooldown = BIKE.pumpCooldown;
        this.events.push({ type: 'pump' });
      }
    }
    this.prevPump = c.pump;
    const tuckTarget = c.pump ? 1 : this.hopCharge / BIKE.hopChargeTime * 0.8;
    this.tuck += (tuckTarget - this.tuck) * Math.min(1, dt * 12);

    // Rolling resistance depends on the surface under the bike.
    if (grounded && v.x > 0.5) {
      const drag = SURFACE_DRAG[this.terrain.surfaceAt(this.frame.getPosition().x)];
      const mass = this.frame.getMass() + this.rearWheel.getMass() + this.frontWheel.getMass();
      this.frame.applyForceToCenter(new Vec2(-drag * mass * Math.sign(v.x), 0), true);
    }

    this.wobble = Math.max(0, this.wobble - dt / LANDING.wobbleTime);
  }

  /** After world.step: air tracking, landings, crashes, checkpoints. */
  postStep(dt: number): void {
    if (this.state === 'crashed') {
      this.crashTimer += dt;
      if (this.crashTimer >= CRASH.respawnDelay) this.respawn();
      return;
    }

    if (this.pendingCrash) { this.crash(this.pendingCrash); return; }

    const angle = this.frame.getAngle();
    if (this.grounded) {
      this.groundedTime = Math.max(0, this.groundedTime) + dt;
      if (!this.landing) { this.airtime = 0; this.airRotation = 0; }
    } else {
      this.groundedTime = Math.min(0, this.groundedTime) - dt;
      this.airtime += dt;
      this.airRotation += wrapAngle(angle - this.lastAngle);
    }
    this.lastAngle = angle;

    // A single-wheel touchdown that never gets the second wheel is still a landing.
    if (this.landing && this.time - this.landing.t > LANDING.bothWheelsWindow) this.finishLanding(Infinity);

    this.debug.airtime = this.airtime;
    this.debug.rotation = this.airRotation;

    const x = this.frame.getPosition().x;
    const cps = this.terrain.checkpoints;
    while (this.checkpointIndex + 1 < cps.length && x >= cps[this.checkpointIndex + 1]) {
      this.checkpointIndex++;
      this.events.push({ type: 'checkpoint', index: this.checkpointIndex });
    }
  }

  // ---------------------------------------------------------------- crash & respawn

  pose(): RiderPose {
    const p = localPose({ lean: this.lean, tuck: this.tuck, crank: this.crank, wobble: this.wobble, time: this.time });
    return poseToWorld(p, this.frame.getPosition(), this.frame.getAngle());
  }

  crash(reason: 'landing' | 'head' | 'pit'): void {
    if (this.state === 'crashed') return;
    const pose = this.pose();
    for (const f of this.riderFixtures) this.frame.destroyFixture(f);
    this.riderFixtures = [];
    this.ragdoll = new Ragdoll(this.world, pose, this.frame.getLinearVelocity(), this.frame.getAngularVelocity(), this.id);
    this.state = 'crashed';
    this.crashTimer = 0;
    this.pendingCrash = null;
    this.landing = null;
    this.events.push({ type: 'crash', reason });
  }

  respawn(index = this.checkpointIndex): void {
    this.ragdoll?.destroy();
    this.ragdoll = null;
    this.destroyBike();
    const x = this.terrain.checkpoints[index];
    this.checkpointIndex = index;
    this.build(x, (this.terrain.heightAt(x) ?? 0) + BIKE.wheelRadius + 0.08, CRASH.respawnSpeed);
    this.state = 'riding';
    this.lean = this.tuck = this.wobble = 0;
    this.hopCharge = 0;
    this.pendingCrash = null;
    this.events.push({ type: 'respawn', checkpoint: index });
  }

  /** Wheel world transforms for rendering. */
  wheels(): { rear: { p: Vec; a: number }; front: { p: Vec; a: number } } {
    return {
      rear: { p: this.rearWheel.getPosition(), a: this.rearWheel.getAngle() },
      front: { p: this.frontWheel.getPosition(), a: this.frontWheel.getAngle() },
    };
  }

  /** Suspension compression of each wheel in meters (debug readout). */
  suspension(): { rear: number; front: number } {
    return { rear: this.rearJoint.getJointTranslation(), front: this.frontJoint.getJointTranslation() };
  }

  static readonly geom = GEOM;
}
