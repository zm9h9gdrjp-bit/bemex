/**
 * Rider skeleton pose, computed from the bike transform plus a few control
 * values (lean, tuck, crank angle). The renderer draws it and the crash code
 * turns it into ragdoll bodies, so what you see is exactly what falls.
 *
 * All local coordinates are relative to the frame origin (between the axles,
 * at axle height), x forward, y up.
 */
import type { Vec } from './terrain';

export const GEOM = {
  rearAxle: { x: -0.52, y: 0 },
  frontAxle: { x: 0.52, y: 0 },
  bottomBracket: { x: -0.07, y: 0.03 },
  seat: { x: -0.3, y: 0.44 },
  headTubeTop: { x: 0.36, y: 0.44 },
  headTubeBottom: { x: 0.42, y: 0.24 },
  grips: { x: 0.3, y: 0.8 },
  crankLength: 0.17,
  thigh: 0.46,
  shin: 0.46,
  upperArm: 0.3,
  forearm: 0.29,
  torso: 0.52,
  neck: 0.13,
  headRadius: 0.13,
};

export interface PoseControls {
  /** -1 = full lean back, +1 = full lean forward. Smoothed by the caller. */
  lean: number;
  /** 0..1, crouch for pumping / hop charge. */
  tuck: number;
  crank: number;
  wobble: number;
  time: number;
}

export interface RiderPose {
  hip: Vec; knee: Vec; foot: Vec;
  kneeFar: Vec; footFar: Vec;
  shoulder: Vec; elbow: Vec; hand: Vec;
  elbowFar: Vec; handFar: Vec;
  neck: Vec; head: Vec;
  pedal: Vec; pedalFar: Vec;
}

/** Two-bone IK. `bendSign` picks which side the middle joint bends to. */
export function solveIK(a: Vec, target: Vec, l1: number, l2: number, bendSign: number): { mid: Vec; end: Vec } {
  let dx = target.x - a.x, dy = target.y - a.y;
  let d = Math.hypot(dx, dy);
  const maxD = l1 + l2 - 1e-4;
  if (d > maxD) { dx *= maxD / d; dy *= maxD / d; d = maxD; }
  const minD = Math.abs(l1 - l2) + 1e-4;
  if (d < minD) d = minD;
  const base = Math.atan2(dy, dx);
  const cos = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const off = Math.acos(Math.max(-1, Math.min(1, cos))) * bendSign;
  const mid = { x: a.x + Math.cos(base + off) * l1, y: a.y + Math.sin(base + off) * l1 };
  return { mid, end: { x: a.x + dx, y: a.y + dy } };
}

/** Pose in bike-local space. */
export function localPose(c: PoseControls): RiderPose {
  const g = GEOM;
  const back = Math.min(0, c.lean), fwd = Math.max(0, c.lean);
  const wob = Math.sin(c.time * 38) * 0.05 * c.wobble;

  const hip = {
    x: -0.12 + back * 0.24 + fwd * 0.14 + wob,
    y: 0.74 - c.tuck * 0.2 + back * 0.06 + fwd * 0.04,
  };
  // Torso leans further forward when leaning forward or tucking.
  const torsoAngle = (58 + fwd * 14 - back * 8 - c.tuck * 16) * (Math.PI / 180);
  const shoulder = { x: hip.x + Math.cos(torsoAngle) * g.torso, y: hip.y + Math.sin(torsoAngle) * g.torso };
  const neck = { x: shoulder.x + Math.cos(torsoAngle + 0.15) * g.neck, y: shoulder.y + Math.sin(torsoAngle + 0.15) * g.neck };
  const head = { x: neck.x + 0.06, y: neck.y + 0.1 };

  const bb = g.bottomBracket;
  const pedal = { x: bb.x + Math.cos(c.crank) * g.crankLength, y: bb.y + Math.sin(c.crank) * g.crankLength };
  const pedalFar = { x: bb.x - Math.cos(c.crank) * g.crankLength, y: bb.y - Math.sin(c.crank) * g.crankLength };

  // Knees bend forward (+x): bendSign depends on hip→foot direction (pointing down).
  const leg = solveIK(hip, { x: pedal.x, y: pedal.y + 0.04 }, g.thigh, g.shin, 1);
  const legFar = solveIK(hip, { x: pedalFar.x, y: pedalFar.y + 0.04 }, g.thigh, g.shin, 1);
  // Elbows bend down/back.
  const arm = solveIK(shoulder, g.grips, g.upperArm, g.forearm, -1);
  const armFar = solveIK(shoulder, { x: g.grips.x - 0.02, y: g.grips.y + 0.01 }, g.upperArm, g.forearm, -1);

  return {
    hip, knee: leg.mid, foot: leg.end, kneeFar: legFar.mid, footFar: legFar.end,
    shoulder, elbow: arm.mid, hand: arm.end, elbowFar: armFar.mid, handFar: armFar.end,
    neck, head, pedal, pedalFar,
  };
}

export function toWorld(p: Vec, pos: Vec, angle: number): Vec {
  const c = Math.cos(angle), s = Math.sin(angle);
  return { x: pos.x + p.x * c - p.y * s, y: pos.y + p.x * s + p.y * c };
}

export function poseToWorld(pose: RiderPose, pos: Vec, angle: number): RiderPose {
  const out = {} as RiderPose;
  for (const k of Object.keys(pose) as (keyof RiderPose)[]) out[k] = toWorld(pose[k], pos, angle);
  return out;
}
