import { World, Vec2, Box, Circle, Polygon, WheelJoint, DistanceJoint, type Body } from 'planck';
import { BIKE, LANDING, CRASH, MANUAL } from '../config/physics';
import { CAT, MASK } from './collision';
import { SURFACE_DRAG, type Terrain, type Vec, type FixtureTag, type BodyPart } from './terrain';
import { classifyLanding, wrapAngle, type LandingQuality, type CrashCause } from './landing';
import { GEOM, GEAR_RATIO, buildPose, riderTarget, toWorld, type RiderPose, type Xf } from './riderPose';
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

/** Why a run ended. Shown in the crash banner and the debug readout. */
export type CrashReason =
  | { kind: 'body'; part: BodyPart }
  | { kind: 'landing'; cause: CrashCause; impact: number; angleDeg: number }
  | { kind: 'tipBack'; angleDeg: number }
  | { kind: 'tipForward'; angleDeg: number }
  | { kind: 'pit' };

export type BikeEvent =
  | { type: 'landing'; quality: LandingQuality; airtime: number; rotation: number; angleDiffDeg: number; impact: number; cased: boolean }
  | { type: 'pump'; good: boolean }
  | { type: 'hop'; charge: number }
  | { type: 'crash'; reason: CrashReason }
  | { type: 'respawn'; checkpoint: number }
  | { type: 'checkpoint'; index: number };

export interface BikeDebug {
  airtime: number;
  rotation: number;
  lastAngleDiffDeg: number;
  lastImpact: number;
  lastQuality: LandingQuality | null;
  lastCrash: CrashReason | null;
}

/** Riding on one wheel: which one, and the angle vs the slope in degrees (signed, + = nose up). */
export interface ManualState { wheel: 'rear' | 'front'; angleDeg: number }

/**
 * One rider + bike.
 *
 * Bodies: frame (11 kg), two wheels (1 kg, rim inertia) on stiff wheel joints
 * that model tire squish, and a separate 65 kg rider body held by three soft
 * distance springs (legs and core triangulate the hip from the bottom bracket
 * and head tube, arms hold the shoulder from the grips). Leaning and tucking change the spring
 * rest lengths, so the rider's mass really moves over the bike and the legs and
 * arms absorb landings. On a crash the rider body becomes a ragdoll.
 */
export class Bike {
  frame!: Body;
  rearWheel!: Body;
  frontWheel!: Body;
  rider!: Body;
  private rearJoint!: WheelJoint;
  private frontJoint!: WheelJoint;
  private legs!: DistanceJoint;
  private arms!: DistanceJoint;
  private core!: DistanceJoint;

  state: 'riding' | 'crashed' = 'riding';
  ragdoll: Ragdoll | null = null;
  tuning: BikeTuning = { ...DEFAULT_TUNING };
  godMode = false;

  private contacts = { rear: 0, front: 0 };
  private pendingCrash: CrashReason | null = null;

  airtime = 0;
  airRotation = 0;
  private lastAngle = 0;
  private groundedTime = 0;
  private landing: { t: number; angleDiff: number; first: 'rear' | 'front'; airtime: number; rotation: number; impact: number } | null = null;

  lean = 0;
  tuck = 0;
  /** Crank angle (radians, y-up). Decreasing = pedalling forward = clockwise on screen. */
  crank = 0;
  pedalling = false;
  wobble = 0;
  manual: ManualState | null = null;
  private hopCharge = 0;
  private prevJump = false;
  private prevPump = false;
  /** Remaining time of the current leg push (pump) and hop push+pull. */
  private pumpPhase = 0;
  private hopPhase = 0;
  private hopPower = 0;
  private absorbPhase = 0;
  /** Planck distance-joint frequency scale for the rider's mass (see build). */
  private limbScale = 1;
  private braking = false;
  crashTimer = 0;
  crashes = 0;
  time = 0;

  checkpointIndex = 0;
  readonly events: BikeEvent[] = [];
  readonly debug: BikeDebug = { airtime: 0, rotation: 0, lastAngleDiffDeg: 0, lastImpact: 0, lastQuality: null, lastCrash: null };
  /** Set by the trick system (milestone 2): true while a trick is still being held. */
  midTrick = () => false;

  constructor(private world: World, private terrain: Terrain, readonly id: number) {
    this.build(terrain.startX, (terrain.heightAt(terrain.startX) ?? 0) + BIKE.wheelRadius + 0.03, 0);
  }

  // ---------------------------------------------------------------- building

  private build(x: number, y: number, speed: number): void {
    const w = this.world;
    const tag = (kind: FixtureTag['kind'], extra: Partial<FixtureTag> = {}): FixtureTag => ({ kind, owner: this.id, ...extra });
    const filter = { filterCategoryBits: CAT.BIKE, filterMaskBits: MASK.BIKE };
    // Body parts carry the rider's mass but never collide (mask 0): their ground contact
    // is checked geometrically each step in checkBodyContact().
    const sensor = { filterCategoryBits: CAT.BIKE, filterMaskBits: 0, isSensor: true, density: 0 };

    // Frame: a slim polygon from the rear axle to the head tube.
    this.frame = w.createDynamicBody({ position: new Vec2(x, y) });
    const framePoly = [new Vec2(-0.48, 0.04), new Vec2(0.42, 0.22), new Vec2(0.36, 0.46), new Vec2(-0.26, 0.34)];
    const f = this.frame.createFixture({ shape: new Polygon(framePoly), density: 1, friction: 0.4, ...filter, userData: tag('frame') });
    f.setDensity(BIKE.frameMass / polygonArea(framePoly));
    // Hands and knees ride with the bike: sensors at the grips and in front of the frame.
    this.frame.createFixture({ shape: new Circle(new Vec2(GEOM.grips.x, GEOM.grips.y), 0.07), ...sensor, userData: tag('rider', { part: 'hands' }) });
    this.frame.createFixture({ shape: new Circle(new Vec2(0.06, 0.44), 0.07), ...sensor, userData: tag('rider', { part: 'knees' }) });
    this.frame.resetMassData();

    const wheel = (lx: number, side: 'rear' | 'front') => {
      const b = w.createDynamicBody({ position: new Vec2(x + lx, y), bullet: true });
      b.createFixture({
        shape: new Circle(BIKE.wheelRadius), density: 1,
        friction: BIKE.wheelFriction * this.tuning.grip, restitution: 0,
        ...filter, userData: tag('wheel', { wheel: side }),
      });
      b.setMassData({ mass: BIKE.wheelMass, center: new Vec2(0, 0), I: BIKE.wheelMass * BIKE.wheelRadius ** 2 * 0.85 });
      return b;
    };
    this.rearWheel = wheel(GEOM.rearAxle.x, 'rear');
    this.frontWheel = wheel(GEOM.frontAxle.x, 'front');

    // Rider body: origin at the hip, x axis along the bike. Head/torso/hips are crash sensors that carry the mass.
    const tgt = riderTarget(0, 0, 0);
    const hipW = toWorld(tgt.hip, { p: { x, y }, a: 0 });
    this.rider = w.createDynamicBody({ position: new Vec2(hipW.x, hipW.y) });
    const sh = GEOM.shoulderLocal;
    const torsoAngle = Math.atan2(sh.y, sh.x);
    const riderParts: [BodyPart, Box | Circle, number][] = [
      ['torso', new Box(GEOM.torso / 2, 0.13, new Vec2(sh.x / 2, sh.y / 2), torsoAngle), 0.62],
      ['hips', new Circle(new Vec2(0, 0), 0.13), 0.3],
      ['head', new Circle(new Vec2(sh.x + 0.07, sh.y + 0.2), GEOM.headRadius + 0.02), 0.08],
    ];
    for (const [part, shape, share] of riderParts) {
      const fx = this.rider.createFixture({ shape, ...sensor, density: 1, userData: tag('rider', { part }) });
      fx.setDensity((BIKE.riderMass * share) / shapeArea(shape));
    }
    this.rider.resetMassData();

    // Tire squish: wheel joints tuned against the whole sprung mass (bike + rider).
    const mWheel = BIKE.wheelMass, mSprung = (this.frame.getMass() + this.rider.getMass()) / 2;
    const mEff = 1 / (1 / mWheel + 1 / this.frame.getMass());
    const omega = 2 * Math.PI * BIKE.tireHz;
    const k = mSprung * omega * omega, c = 2 * mSprung * BIKE.tireDamping * omega;
    const omegaEff = Math.sqrt(k / mEff);
    const jointOpt = {
      frequencyHz: omegaEff / (2 * Math.PI), dampingRatio: c / (2 * mEff * omegaEff),
      enableMotor: false, maxMotorTorque: BIKE.pedalTorque, motorSpeed: 0,
    };
    const axis = new Vec2(0, 1);
    this.rearJoint = w.createJoint(new WheelJoint(jointOpt, this.frame, this.rearWheel, this.rearWheel.getPosition(), axis))!;
    this.frontJoint = w.createJoint(new WheelJoint(jointOpt, this.frame, this.frontWheel, this.frontWheel.getPosition(), axis))!;

    // Limbs as springs.
    const fw = (p: Vec) => { const q = toWorld(p, { p: { x, y }, a: 0 }); return new Vec2(q.x, q.y); };
    const shW = toWorld(sh, { p: hipW, a: 0 });
    // Spring feel is specified against the rider's mass; Planck measures it against the
    // reduced mass of the two bodies, so scale frequency and damping to match.
    const mR = this.rider.getMass(), mF = this.frame.getMass();
    const mRed = 1 / (1 / mR + 1 / mF);
    const scale = Math.sqrt(mR / mRed);
    this.limbScale = scale;
    const limb = (anchorFrame: Vec, anchorRider: Vec, hz: number, damping: number) =>
      w.createJoint(new DistanceJoint(
        { frequencyHz: hz * scale, dampingRatio: damping * scale },
        this.frame, this.rider, fw(anchorFrame), new Vec2(anchorRider.x, anchorRider.y),
      ))!;
    this.legs = limb(GEOM.bottomBracket, hipW, BIKE.legHz, BIKE.legDamping);
    this.arms = limb(GEOM.grips, shW, BIKE.armHz, BIKE.armDamping);
    this.core = limb(GEOM.headTubeTop, hipW, BIKE.coreHz, BIKE.coreDamping);

    for (const b of this.bodies()) b.setLinearVelocity(new Vec2(speed, 0));
    this.contacts.rear = this.contacts.front = 0;
    this.lastAngle = 0;
    this.airtime = 0;
    this.airRotation = 0;
    this.landing = null;
    this.manual = null;
  }

  private bodies(): Body[] { return [this.frame, this.rearWheel, this.frontWheel, this.rider]; }

  private destroyBike(): void {
    for (const b of [this.frame, this.rearWheel, this.frontWheel]) this.world.destroyBody(b);
    if (this.state === 'riding') this.world.destroyBody(this.rider);
  }

  // ---------------------------------------------------------------- contacts

  /** Called by the contact router with +1 on begin, -1 on end. */
  onContact(mine: FixtureTag, other: FixtureTag, delta: 1 | -1): void {
    if (this.state !== 'riding') return;
    if (mine.kind === 'wheel' && mine.wheel) {
      if (other.kind === 'pit' && delta > 0) { this.requestCrash({ kind: 'pit' }); return; }
      // Contact state is re-read from the wheel each step (refreshContacts); begin events only trigger landings.
      if (delta > 0) { this.contacts[mine.wheel] = Math.max(1, this.contacts[mine.wheel]); this.onWheelTouch(mine.wheel); }
    } else if (mine.kind === 'rider' && mine.part && delta > 0) {
      this.requestCrash(other.kind === 'pit' ? { kind: 'pit' } : { kind: 'body', part: mine.part });
    } else if (mine.kind === 'frame' && other.kind === 'pit' && delta > 0) {
      this.requestCrash({ kind: 'pit' });
    }
  }

  private requestCrash(reason: CrashReason): void {
    if (this.godMode && reason.kind !== 'pit') return;
    if (!this.pendingCrash) this.pendingCrash = reason;
  }

  /** Head, torso, hips, hands or knees touching the ground (or pit) ends the run. */
  private checkBodyContact(): void {
    for (const body of [this.rider, this.frame]) {
      for (let f = body.getFixtureList(); f; f = f.getNext()) {
        const tag = f.getUserData() as FixtureTag | null;
        if (!tag?.part) continue;
        const shape = f.getShape();
        if (shape instanceof Circle) {
          const c = body.getWorldPoint(shape.getCenter());
          if (this.terrain.touches(c, shape.getRadius())) { this.bodyHit(tag.part, c); return; }
        } else {
          const verts = (shape as unknown as { m_vertices: Vec2[]; m_count: number });
          for (let i = 0; i < verts.m_count; i++) {
            const a = body.getWorldPoint(verts.m_vertices[i]);
            const b = body.getWorldPoint(verts.m_vertices[(i + 1) % verts.m_count]);
            for (const t of [0, 0.5]) {
              const q = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
              if (this.terrain.touches(q, 0.01)) { this.bodyHit(tag.part, q); return; }
            }
          }
        }
      }
    }
  }

  private bodyHit(part: BodyPart, at: Vec): void {
    this.requestCrash(at.y <= this.terrain.pitY + 0.3 ? { kind: 'pit' } : { kind: 'body', part });
  }

  /** Recounts touching ground contacts per wheel straight from Planck (no drift from missed events). */
  private refreshContacts(): void {
    const count = (b: Body) => {
      let n = 0;
      for (let e = b.getContactList(); e; e = e.next ?? null) {
        const c = e.contact;
        if (!c.isTouching()) continue;
        const other = (c.getFixtureA().getBody() === b ? c.getFixtureB() : c.getFixtureA()).getUserData() as FixtureTag | null;
        if (other?.kind === 'ground') n++;
      }
      return n;
    };
    this.contacts.rear = count(this.rearWheel);
    this.contacts.front = count(this.frontWheel);
  }

  get grounded(): boolean { return this.contacts.rear > 0 || this.contacts.front > 0; }
  get bothWheelsDown(): boolean { return this.contacts.rear > 0 && this.contacts.front > 0; }

  private slopeUnderBike(): number {
    return this.terrain.slopeAt((this.rearWheel.getPosition().x + this.frontWheel.getPosition().x) / 2);
  }

  private onWheelTouch(wheel: 'rear' | 'front'): void {
    if (this.landing) {
      if (wheel !== this.landing.first) this.finishLanding(this.time - this.landing.t);
      return;
    }
    if (this.airtime < LANDING.minAirtime) return;
    const wb = wheel === 'rear' ? this.rearWheel : this.frontWheel;
    const slope = this.terrain.slopeAt(wb.getPosition().x);
    // Impact = velocity component into the ground (normal = (-sin, cos) of the slope).
    const v = this.frame.getLinearVelocity();
    const impact = -(-Math.sin(slope) * v.x + Math.cos(slope) * v.y);
    const angleDiff = wrapAngle(this.frame.getAngle() - slope);
    this.landing = {
      t: this.time,
      angleDiff,
      first: wheel,
      airtime: this.airtime,
      rotation: this.airRotation,
      impact,
    };
  }

  private finishLanding(wheelGap: number): void {
    const l = this.landing!;
    this.landing = null;
    // The landing is consumed: the other wheel coming down later is not a second landing.
    this.airtime = 0;
    this.airRotation = 0;
    const res = classifyLanding({
      angleDiff: l.angleDiff, wheelGap, first: l.first, impact: l.impact,
      midTrick: this.midTrick(), forgiveness: this.tuning.landingForgiveness,
    });
    const deg = (l.angleDiff * 180) / Math.PI;
    this.debug.lastAngleDiffDeg = deg;
    this.debug.lastImpact = l.impact;
    this.debug.lastQuality = res.quality;
    this.events.push({ type: 'landing', quality: res.quality, airtime: l.airtime, rotation: l.rotation, angleDiffDeg: deg, impact: l.impact, cased: res.cased });

    // No speed is added or removed here: what a landing costs or keeps is decided by the
    // contact physics (angle vs slope, impact absorbed by tires and legs).
    if (res.quality === 'crash') {
      this.requestCrash({ kind: 'landing', cause: res.cause!, impact: l.impact, angleDeg: deg });
      return;
    }
    if (res.quality === 'sloppy' || res.cased) this.wobble = 1;
  }

  /**
   * Internal "muscle" force between rider and bike, acting along the leg line
   * (rider's centre of mass ↔ bottom bracket), or the arm line (↔ grips) for
   * `barsShare`. Positive pushes them apart (legs extending), negative pulls the
   * bike up toward the rider. Equal, opposite and collinear: no net force and no
   * net torque on the system; any speed or height comes from the ground pushing back.
   */
  private muscle(force: number, barsShare = 0): void {
    const rc = this.rider.getWorldCenter();
    const apply = (localPt: Vec, f: number) => {
      if (f === 0) return;
      const pt = this.frame.getWorldPoint(new Vec2(localPt.x, localPt.y));
      const d = new Vec2(rc.x - pt.x, rc.y - pt.y);
      const len = d.length() || 1;
      d.mul(1 / len);
      this.rider.applyForceToCenter(d.clone().mul(f), true);
      this.frame.applyForce(d.clone().mul(-f), pt, true);
    };
    apply(GEOM.bottomBracket, force * (1 - barsShare));
    apply(GEOM.grips, force * barsShare);
  }

  /** Rider pulling (+) or pushing (-) on the bars: equal and opposite torque on bike and rider. */
  private barTorque(tq: number): void {
    this.frame.applyTorque(tq, true);
    this.rider.applyTorque(-tq, true);
  }

  private bottomOut(): void {
    const hipLocal = this.frame.getLocalPoint(this.rider.getPosition());
    const minHip = GEOM.bottomBracket.y + BIKE.minHipHeight;
    if (hipLocal.y > minHip) return;
    const a = this.frame.getAngle();
    const up = new Vec2(-Math.sin(a), Math.cos(a));
    const vr = Vec2.dot(this.rider.getLinearVelocity(), up);
    const vf = Vec2.dot(this.frame.getLinearVelocityFromWorldPoint(this.rider.getPosition()), up);
    const closing = vf - vr; // > 0 when the rider is still sinking into the bike
    if (closing <= 0) return;
    const mR = this.rider.getMass(), mF = this.frame.getMass();
    const j = closing * (mR * mF) / (mR + mF);
    this.rider.applyLinearImpulse(up.clone().mul(j), this.rider.getWorldCenter(), true);
    this.frame.applyLinearImpulse(up.clone().mul(-j), this.rider.getPosition(), true);
  }


  /** Total mass and centre of mass of bike + rider. */
  private system(): { mass: number; com: Vec } {
    let m = 0, x = 0, y = 0;
    for (const b of this.bodies()) {
      const bm = b.getMass(), c = b.getWorldCenter();
      m += bm; x += c.x * bm; y += c.y * bm;
    }
    return { mass: m, com: { x: x / m, y: y / m } };
  }

  /**
   * Adds a rigid rotation increment to the whole bike + rider about the shared
   * centre of mass. This is how air spin is controlled: angular momentum moves
   * as one, so the rider doesn't lag behind the frame.
   */
  private addSpin(dw: number): void {
    const { com } = this.system();
    for (const b of this.bodies()) {
      const c = b.getWorldCenter(), v = b.getLinearVelocity();
      b.setLinearVelocity(new Vec2(v.x - dw * (c.y - com.y), v.y + dw * (c.x - com.x)));
      if (b !== this.rearWheel && b !== this.frontWheel) b.setAngularVelocity(b.getAngularVelocity() + dw);
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
    this.refreshContacts();
    const grounded = this.grounded;
    const rearDown = this.contacts.rear > 0;
    const omega = this.frame.getAngularVelocity();

    // ---- Pedalling. Drive only reaches the ground through the rear tire.
    this.pedalling = c.pedal;
    if (this.braking) {
      // handled below
    } else if (c.pedal && rearDown) {
      // A rider eases off the pedals as the front comes up (unless they're pulling a
      // manual on purpose), the same way you stop pushing when a sprint starts to wheelie.
      const nose = (wrapAngle(this.frame.getAngle() - this.slopeUnderBike()) * 180) / Math.PI;
      const ease = c.leanBack ? 1 : Math.max(0, Math.min(1, 1 - (nose - BIKE.pedalEaseFrom) / (BIKE.pedalEaseTo - BIKE.pedalEaseFrom)));
      this.rearJoint.enableMotor(ease > 0);
      this.rearJoint.setMaxMotorTorque(BIKE.pedalTorque * t.pedalTorque * ease);
      this.rearJoint.setMotorSpeed(-(BIKE.topSpeed * t.topSpeed) / BIKE.wheelRadius);
    } else {
      this.rearJoint.enableMotor(false);
    }
    if (c.pedal) {
      // Cranks follow the rear wheel through the gears (wheel ω < 0 when rolling forward).
      const wheelW = this.rearWheel.getAngularVelocity() - omega;
      const crankW = rearDown ? Math.min(wheelW / GEAR_RATIO, -2) : -BIKE.airCrankRate;
      this.crank += crankW * dt;
    } else {
      // Freewheel: cranks settle level, near-side foot forward (BMX ready position).
      const target = Math.round(this.crank / Math.PI) * Math.PI;
      this.crank += (target - this.crank) * Math.min(1, dt * 6);
    }

    // ---- Lean: the rider moves over the bike (limb springs) and works the bars.
    // Everything on the ground is internal rider-vs-bike effort: the bike only pitches
    // because the rider's mass moves and the ground pushes back.
    const leanInput = (c.leanForward ? 1 : 0) - (c.leanBack ? 1 : 0);
    const slopeNow = this.slopeUnderBike();
    const pitch = wrapAngle(this.frame.getAngle() - slopeNow); // + = nose up vs ground
    let leanGoal: number;
    if (leanInput !== 0) {
      leanGoal = leanInput;
    } else if (grounded) {
      // Balance reflex: shift weight against the pitch (front up → move forward), and
      // over the front while sprinting so the drive doesn't loop the bike.
      const reflex = BIKE.balanceLeanKp * pitch + BIKE.balanceLeanKd * omega;
      leanGoal = Math.max(-1, Math.min(1, reflex + (c.pedal && rearDown ? BIKE.sprintLean : 0)));
    } else {
      leanGoal = 0;
    }
    this.lean += (leanGoal - this.lean) * Math.min(1, dt * BIKE.leanRate);

    if (grounded) {
      if (leanInput !== 0) {
        // Pull up on the bars (lean back) or press them down (lean forward).
        this.barTorque(-leanInput * BIKE.groundLeanTorque);
      } else {
        // Arms steady the bike against the ground slope (limited by the rider's strength).
        const tq = -(BIKE.balanceKp * pitch + BIKE.balanceKd * omega);
        this.barTorque(Math.max(-BIKE.balanceMaxTorque, Math.min(BIKE.balanceMaxTorque, tq)));
      }
    } else {
      // Air: rotation control toward a target spin rate (about the shared centre of
      // mass, so the bike's speed and path are untouched). Released = it bleeds off.
      const sysW = omega;
      if (leanInput !== 0) {
        const target = -leanInput * BIKE.airSpinRate * t.spinRate;
        const dw = Math.sign(target - sysW) * Math.min(Math.abs(target - sysW), BIKE.airSpinAccel * dt);
        this.addSpin(dw);
      } else {
        this.addSpin(-sysW * Math.min(1, BIKE.airAngularDamping * dt));
      }
    }

    if (this.braking) {
      // Rim brakes: each wheel joint's motor holds zero spin relative to the frame,
      // up to the brake's torque. Solved implicitly, so it also holds on a slope.
      for (const j of [this.rearJoint, this.frontJoint]) {
        j.enableMotor(true);
        j.setMotorSpeed(0);
        j.setMaxMotorTorque(BIKE.brakeTorque);
      }
    } else {
      this.frontJoint.enableMotor(false);
    }

    // ---- Bunny hop: hold to crouch, release to spring up (legs drive the bike into the
    // ground), then pull the bike up after you, bars first. Height comes from the ground.
    const canHop = this.groundedTime > -0.1;
    if (c.jump && canHop && this.hopPhase === 0) this.hopCharge = Math.min(BIKE.hopChargeTime, this.hopCharge + dt);
    if (!c.jump && this.prevJump && this.hopCharge > 0 && canHop && this.hopPhase === 0) {
      this.hopPower = this.hopCharge / BIKE.hopChargeTime;
      this.hopPhase = BIKE.hopPushTime + BIKE.hopPullTime;
      this.events.push({ type: 'hop', charge: this.hopPower });
    }
    let legGoal: number | null = null; // tuck override: -1 legs extended … +1 crouched
    if (this.hopPhase > 0) {
      const k = 0.45 + 0.55 * this.hopPower;
      if (this.hopPhase > BIKE.hopPullTime) {
        legGoal = -1;
        this.muscle(BIKE.hopPushForce * k);
      } else {
        legGoal = 1;
        this.muscle(-BIKE.hopPullForce * k, BIKE.hopBarsShare);
        this.groundedTime = -1;
      }
      this.hopPhase = Math.max(0, this.hopPhase - dt);
    }
    if (!c.jump) this.hopCharge = 0;
    this.prevJump = c.jump;

    // ---- Pump: holding down extends the legs (driving the bike into the ground), letting
    // go absorbs (legs fold, bike comes up). Extend in the trough / back side and absorb over
    // the crest: the ground reaction does positive work and the bike speeds up. Wrong timing
    // costs speed. No velocity is ever added directly.
    const v = this.frame.getLinearVelocity();
    if (c.pump && !this.prevPump && grounded) {
      this.pumpPhase = BIKE.pumpPushTime;
      if (v.y < -BIKE.pumpMinDescent) this.events.push({ type: 'pump', good: true });
      else if (v.y > BIKE.pumpMinDescent) this.events.push({ type: 'pump', good: false });
    }
    if (!c.pump && this.prevPump) this.absorbPhase = BIKE.pumpAbsorbTime;
    if (c.pump && !grounded) {
      // Holding down in the air: crouch, ready to push the bike into the landing.
      legGoal ??= BIKE.pumpAbsorbTuck;
    } else if (c.pump) {
      legGoal ??= -1;
      if (this.pumpPhase > 0 && grounded) this.muscle(BIKE.pumpForce);
      this.pumpPhase = Math.max(0, this.pumpPhase - dt);
    } else if (this.absorbPhase > 0) {
      legGoal ??= BIKE.pumpAbsorbTuck;
      this.absorbPhase = Math.max(0, this.absorbPhase - dt);
    }
    this.prevPump = c.pump;
    const tuckTarget = legGoal ?? (this.hopCharge / BIKE.hopChargeTime) * 0.8;
    // Legs move fast when working (hop / pump), slower when just settling.
    const legRate = this.hopPhase > 0 ? BIKE.hopLegRate : legGoal !== null ? BIKE.pumpLegRate : 12;
    this.tuck += (tuckTarget - this.tuck) * Math.min(1, dt * legRate);
    const working = legGoal !== null;
    this.legs.setFrequency(BIKE.legHz * this.limbScale * (working ? BIKE.legActionStiffness : 1));
    this.core.setFrequency(BIKE.coreHz * this.limbScale * (working ? BIKE.legActionStiffness : 1));

    // ---- Limb springs follow lean / tuck, with a hip bob while sprinting.
    const bob = c.pedal && rearDown ? Math.abs(Math.sin(this.crank)) * BIKE.pedalBobAmount : 0;
    const tgt = riderTarget(this.lean, this.tuck, bob);
    this.legs.setLength(dist(GEOM.bottomBracket, tgt.hip));
    this.arms.setLength(dist(GEOM.grips, tgt.shoulder));
    this.core.setLength(dist(GEOM.headTubeTop, tgt.hip));

    // ---- Knee stop: legs can only fold so far. Past that the rider and bike move together
    // along the bike's up axis (an inelastic internal impulse, momentum conserved).
    this.bottomOut();

    // ---- Posture: the torso holds its angle relative to the bike (reaction goes into the frame).
    const torsoTarget = Math.atan2(tgt.shoulder.y - tgt.hip.y, tgt.shoulder.x - tgt.hip.x) - Math.atan2(GEOM.shoulderLocal.y, GEOM.shoulderLocal.x);
    let err = wrapAngle(this.frame.getAngle() + torsoTarget - this.rider.getAngle());
    if (!grounded && leanInput === 0 && this.hopPhase === 0) {
      // In the air the rider levels the bike under them toward the landing slope ahead,
      // turning the bike relative to their body (internal: the bike turns a lot, the
      // heavier body a little, total spin unchanged).
      const ahead = this.frame.getPosition().x + this.frame.getLinearVelocity().x * BIKE.airLevelLookahead;
      const off = wrapAngle(this.frame.getAngle() - this.terrain.slopeAt(ahead));
      err += Math.max(-BIKE.airLevelMax, Math.min(BIKE.airLevelMax, off));
    }
    const posture = BIKE.postureStiffness * err + BIKE.postureDamping * (omega - this.rider.getAngularVelocity());
    this.rider.applyTorque(posture, true);
    this.frame.applyTorque(-posture, true);

    // ---- Rolling resistance: a friction torque at each wheel on the ground (tire on
    // surface), with the reaction into the frame. No air drag.
    const mass = this.system().mass;
    const drag = SURFACE_DRAG[this.terrain.surfaceAt(this.frame.getPosition().x)];
    for (const [w, n] of [[this.rearWheel, this.contacts.rear], [this.frontWheel, this.contacts.front]] as const) {
      if (n === 0) continue;
      const rel = w.getAngularVelocity() - omega;
      const max = (drag * mass * 0.5) * BIKE.wheelRadius;
      const tq = Math.max(-max, Math.min(max, (-rel * w.getInertia()) / dt));
      w.applyTorque(tq, true);
      this.frame.applyTorque(-tq, true);
    }

    this.wobble = Math.max(0, this.wobble - dt / LANDING.wobbleTime);
  }

  /** After world.step: air tracking, landings, manuals, crashes, checkpoints. */
  postStep(dt: number): void {
    if (this.state === 'crashed') {
      this.crashTimer += dt;
      if (this.crashTimer >= CRASH.respawnDelay) this.respawn();
      return;
    }
    this.checkBodyContact();
    if (this.pendingCrash) { this.crash(this.pendingCrash); return; }
    this.refreshContacts();

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

    // A one-wheel touchdown whose second wheel doesn't follow in time is still a landing.
    if (this.landing && this.time - this.landing.t > LANDING.bothWheelsWindow) this.finishLanding(Infinity);

    // Manual / nose manual: on one wheel, nose up or down. Tipping past the limit is a crash.
    const onlyRear = this.contacts.rear > 0 && this.contacts.front === 0;
    const onlyFront = this.contacts.front > 0 && this.contacts.rear === 0;
    const diff = (wrapAngle(angle - this.slopeUnderBike()) * 180) / Math.PI;
    if (onlyRear && diff > MANUAL.minAngle) this.manual = { wheel: 'rear', angleDeg: diff };
    else if (onlyFront && diff < -MANUAL.minAngle) this.manual = { wheel: 'front', angleDeg: diff };
    else if (this.bothWheelsDown || !this.grounded) this.manual = null;
    if (this.manual && !this.landing) {
      if (this.manual.wheel === 'rear' && diff > MANUAL.wheelieTipAngle) this.requestCrash({ kind: 'tipBack', angleDeg: diff });
      if (this.manual.wheel === 'front' && diff < -MANUAL.noseTipAngle) this.requestCrash({ kind: 'tipForward', angleDeg: diff });
    }

    this.debug.airtime = this.airtime;
    this.debug.rotation = this.airRotation;

    const x = this.frame.getPosition().x;
    const cps = this.terrain.checkpoints;
    while (this.checkpointIndex + 1 < cps.length && x >= cps[this.checkpointIndex + 1]) {
      this.checkpointIndex++;
      this.events.push({ type: 'checkpoint', index: this.checkpointIndex });
    }
  }

  // ---------------------------------------------------------------- pose, crash, respawn

  /** Skeleton from body transforms (pass interpolated transforms when rendering). */
  pose(frame: Xf = xf(this.frame), rider: Xf = xf(this.rider)): RiderPose {
    return buildPose(frame, rider, this.crank);
  }

  crash(reason: CrashReason): void {
    if (this.state === 'crashed') return;
    const pose = this.pose();
    const v = this.rider.getLinearVelocity();
    const w = this.rider.getAngularVelocity();
    this.world.destroyBody(this.rider); // also removes the limb joints
    this.ragdoll = new Ragdoll(this.world, pose, v, w, this.id);
    this.rearJoint.enableMotor(false);
    this.state = 'crashed';
    this.crashTimer = 0;
    this.crashes++;
    this.pendingCrash = null;
    this.landing = null;
    this.manual = null;
    this.debug.lastCrash = reason;
    this.events.push({ type: 'crash', reason });
  }

  /** Skip the rest of the crash wait (tap to respawn). */
  skipCrash(): void {
    if (this.state === 'crashed' && this.crashTimer >= CRASH.skipAfter) this.respawn();
  }

  respawn(index = this.checkpointIndex): void {
    this.ragdoll?.destroy();
    this.ragdoll = null;
    this.destroyBike();
    const x = this.terrain.checkpoints[index];
    this.checkpointIndex = index;
    this.state = 'riding';
    this.build(x, (this.terrain.heightAt(x) ?? 0) + BIKE.wheelRadius + 0.05, 0);
    this.lean = this.tuck = this.wobble = 0;
    this.hopCharge = 0;
    this.hopPhase = this.pumpPhase = 0;
    this.pendingCrash = null;
    this.events.push({ type: 'respawn', checkpoint: index });
  }

  /** Rim brakes (used after the finish line). */
  brake(on: boolean): void { this.braking = on; }

  /** Suspension compression of each tire in meters (debug readout). */
  suspension(): { rear: number; front: number } {
    return { rear: this.rearJoint.getJointTranslation(), front: this.frontJoint.getJointTranslation() };
  }

  /** Current rider body offset from its target, in cm (shows how much the limbs are absorbing). */
  limbCompression(): number {
    return (this.legs.getLength() - dist(GEOM.bottomBracket, this.frame.getLocalPoint(this.rider.getPosition()))) * 100;
  }

  /** Every body that belongs to this rider (for render interpolation). */
  allBodies(): Body[] {
    const list = [this.frame, this.rearWheel, this.frontWheel];
    if (this.state === 'riding') list.push(this.rider);
    if (this.ragdoll) for (const p of this.ragdoll.parts) list.push(p.body);
    return list;
  }
}

export function xf(b: Body): Xf {
  const p = b.getPosition();
  return { p: { x: p.x, y: p.y }, a: b.getAngle() };
}

function dist(a: Vec, b: Vec): number { return Math.hypot(a.x - b.x, a.y - b.y); }

function polygonArea(pts: Vec[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

function shapeArea(s: Box | Circle): number {
  if (s instanceof Circle) return Math.PI * s.getRadius() ** 2;
  const v = (s as unknown as { m_vertices: Vec[] }).m_vertices;
  return polygonArea(v);
}
