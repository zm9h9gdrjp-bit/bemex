/**
 * Bike geometry and rider skeleton.
 *
 * Bike-local coordinates: origin midway between the axles at axle height,
 * x forward, y up, meters. Numbers follow a 20" race BMX: 0.99 m wheelbase,
 * 345 mm chainstay, 74° head angle, 71° seat angle, 8.5" bar rise, 25/9 gearing.
 *
 * The rider is 1.75 m tall (8 heads). Hip and shoulder come from the physical
 * rider body; knees, feet, elbows and hands are placed with two-bone IK so the
 * feet stay on the pedals and the hands stay on the grips.
 */
import type { Vec } from './terrain';

const DEG = Math.PI / 180;

export const GEOM = {
  wheelRadius: 0.258, // 20 x 1.75" tire
  rearAxle: { x: -0.495, y: 0 },
  frontAxle: { x: 0.495, y: 0 },
  bottomBracket: { x: -0.15, y: 0.03 },
  seatCluster: { x: -0.24, y: 0.295 },
  seat: { x: -0.27, y: 0.345 },
  headTubeTop: { x: 0.36, y: 0.44 },
  headTubeBottom: { x: 0.4, y: 0.3 },
  stem: { x: 0.38, y: 0.5 },
  grips: { x: 0.3, y: 0.7 },
  crankLength: 0.175,
  chainringTeeth: 25,
  cogTeeth: 9,
  /** Chain pitch 1/2" → pitch radius = teeth · 12.7 mm / 2π. */
  chainringRadius: (25 * 0.0127) / (2 * Math.PI),
  cogRadius: (9 * 0.0127) / (2 * Math.PI),
  headAngle: 74 * DEG,
  seatAngle: 71 * DEG,

  // Rider (1.75 m).
  thigh: 0.45,
  shin: 0.45,
  upperArm: 0.3,
  forearm: 0.28,
  torso: 0.52,
  neck: 0.1,
  headRadius: 0.11,
  /** Shoulder relative to hip in the rider body's own frame (neutral torso lean 58°). */
  shoulderLocal: { x: Math.cos(58 * DEG) * 0.52, y: Math.sin(58 * DEG) * 0.52 },
};

/** Crank turns once per (chainring / cog) wheel turns. */
export const GEAR_RATIO = GEOM.chainringTeeth / GEOM.cogTeeth;

export interface Xf { p: Vec; a: number }

export interface RiderPose {
  hip: Vec; knee: Vec; foot: Vec;
  kneeFar: Vec; footFar: Vec;
  shoulder: Vec; elbow: Vec; hand: Vec;
  elbowFar: Vec; handFar: Vec;
  neck: Vec; head: Vec;
  pedal: Vec; pedalFar: Vec;
}

/**
 * Two-bone IK. `bendSign` +1 bends the middle joint counter-clockwise from the
 * root→target line (knees forward when the target is below), -1 the other way.
 * Out of reach: the limb straightens and the end still lands on the target, so
 * feet never visibly leave the pedals.
 */
export function solveIK(a: Vec, target: Vec, l1: number, l2: number, bendSign: number): { mid: Vec; end: Vec } {
  const dx = target.x - a.x, dy = target.y - a.y;
  const d = Math.hypot(dx, dy);
  const base = Math.atan2(dy, dx);
  if (d >= l1 + l2) {
    const k = l1 / (l1 + l2);
    return { mid: { x: a.x + dx * k, y: a.y + dy * k }, end: { ...target } };
  }
  const dd = Math.max(d, Math.abs(l1 - l2) + 1e-4);
  const cos = (l1 * l1 + dd * dd - l2 * l2) / (2 * l1 * dd);
  const off = Math.acos(Math.max(-1, Math.min(1, cos))) * bendSign;
  return { mid: { x: a.x + Math.cos(base + off) * l1, y: a.y + Math.sin(base + off) * l1 }, end: { ...target } };
}

export function toWorld(p: Vec, xf: Xf): Vec {
  const c = Math.cos(xf.a), s = Math.sin(xf.a);
  return { x: xf.p.x + p.x * c - p.y * s, y: xf.p.y + p.x * s + p.y * c };
}

/** Pedal positions in bike-local space for a crank angle (radians, y-up; decreasing = forward). */
export function pedals(crank: number): { near: Vec; far: Vec } {
  const bb = GEOM.bottomBracket, r = GEOM.crankLength;
  return {
    near: { x: bb.x + Math.cos(crank) * r, y: bb.y + Math.sin(crank) * r },
    far: { x: bb.x - Math.cos(crank) * r, y: bb.y - Math.sin(crank) * r },
  };
}

/** Full skeleton in world space from the frame and rider-body transforms. */
export function buildPose(frame: Xf, rider: Xf, crank: number): RiderPose {
  const g = GEOM;
  const hip = rider.p;
  const shoulder = toWorld(g.shoulderLocal, rider);
  const torsoA = Math.atan2(shoulder.y - hip.y, shoulder.x - hip.x);
  const neck = { x: shoulder.x + Math.cos(torsoA + 0.2) * g.neck, y: shoulder.y + Math.sin(torsoA + 0.2) * g.neck };
  // Head up, looking ahead: sits above the neck, nudged forward along the bike.
  const up = rider.a + Math.PI / 2;
  const head = { x: neck.x + Math.cos(up) * 0.1 + Math.cos(rider.a) * 0.05, y: neck.y + Math.sin(up) * 0.1 + Math.sin(rider.a) * 0.05 };

  const pd = pedals(crank);
  const pedal = toWorld(pd.near, frame), pedalFar = toWorld(pd.far, frame);
  // Foot sits on top of the pedal (ankle ~4 cm above the spindle).
  const lift = (p: Vec) => ({ x: p.x - Math.sin(frame.a) * 0.04, y: p.y + Math.cos(frame.a) * 0.04 });
  const leg = solveIK(hip, lift(pedal), g.thigh, g.shin, 1);
  const legFar = solveIK(hip, lift(pedalFar), g.thigh, g.shin, 1);

  const grip = toWorld(g.grips, frame);
  const gripFar = toWorld({ x: g.grips.x - 0.015, y: g.grips.y + 0.01 }, frame);
  const arm = solveIK(shoulder, grip, g.upperArm, g.forearm, -1);
  const armFar = solveIK(shoulder, gripFar, g.upperArm, g.forearm, -1);

  return {
    hip, knee: leg.mid, foot: leg.end, kneeFar: legFar.mid, footFar: legFar.end,
    shoulder, elbow: arm.mid, hand: arm.end, elbowFar: armFar.mid, handFar: armFar.end,
    neck, head, pedal, pedalFar,
  };
}

/**
 * Where the rider's hip and shoulder want to be, in bike-local space, for a
 * given lean (-1 back … +1 forward) and tuck (0 … 1). These targets drive the
 * spring "limbs" that hold the rider body on the bike.
 */
export function riderTarget(lean: number, tuck: number, bob: number): { hip: Vec; shoulder: Vec } {
  const back = Math.min(0, lean), fwd = Math.max(0, lean);
  const hip = {
    x: -0.14 + back * 0.24 + fwd * 0.15,
    y: 0.76 - tuck * 0.2 + back * 0.02 + fwd * 0.03 + bob,
  };
  const torsoA = (58 + fwd * 12 - back * 6 - tuck * 14) * DEG;
  return { hip, shoulder: { x: hip.x + Math.cos(torsoA) * GEOM.torso, y: hip.y + Math.sin(torsoA) * GEOM.torso } };
}
