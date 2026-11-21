import { Container, Graphics } from 'pixi.js';
import type { Bike } from '../physics/bike';
import type { Terrain, Vec } from '../physics/terrain';
import { GEOM, toWorld, type RiderPose } from '../physics/riderPose';
import { BIKE } from '../config/physics';

export interface RiderLook {
  frame: number;
  frameDark: number;
  jersey: number;
  jerseyDark: number;
  pants: number;
  pantsDark: number;
  helmet: number;
  helmetStripe: number;
  visor: number;
  skin: number;
  shoe: number;
}

export const DEFAULT_LOOK: RiderLook = {
  frame: 0xd8262f, frameDark: 0x8f171d,
  jersey: 0xf2efe8, jerseyDark: 0xb8b2a6,
  pants: 0x2b3a4a, pantsDark: 0x1a2430,
  helmet: 0xd8262f, helmetStripe: 0xf2efe8, visor: 0x1c2a33,
  skin: 0xd9a27a, shoe: 0x1b1b1b,
};

/** Visual lift: wheels sit in the rut on the track top, not on its front edge. */
export const RUT_LIFT = 0.24;

const TIRE = 0x1f1f1f;
const RIM = 0xc9ccd0;
const CHROME = 0x9aa0a6;

export class BikeView extends Container {
  private shadow = new Graphics();
  private body = new Graphics();
  /** 1 = solid; bots in later milestones render as ghosts at 0.6. */
  ghost = 1;

  constructor(private bike: Bike, private terrain: Terrain, public look: RiderLook = DEFAULT_LOOK) {
    super();
    this.addChild(this.shadow, this.body);
  }

  update(): void {
    const g = this.body;
    g.clear();
    this.shadow.clear();
    this.alpha = this.ghost;
    const lift = (p: Vec): Vec => ({ x: p.x, y: p.y + RUT_LIFT });

    const bike = this.bike;
    const frameP = bike.frame.getPosition();
    const angle = bike.frame.getAngle();
    const w = bike.wheels();

    // Contact shadow: shrinks and fades with height above the ground.
    const ground = this.terrain.heightAt(frameP.x);
    if (ground !== null) {
      const h = Math.max(0, frameP.y - BIKE.wheelRadius - ground);
      const k = Math.max(0, 1 - h / 7);
      if (k > 0) this.shadow.ellipse(frameP.x, ground + RUT_LIFT + 0.02, 0.95 * (0.5 + k * 0.5), 0.09 * (0.4 + 0.6 * k)).fill({ color: 0x000000, alpha: 0.28 * k });
    }

    const L = (p: Vec) => lift(toWorld(p, frameP, angle));
    const riding = bike.state === 'riding';
    const pose = riding ? liftPose(bike.pose()) : null;
    const lk = this.look;

    // Far-side limbs first (darker), behind the bike.
    if (pose) {
      limb(g, pose.hip, pose.kneeFar, 0.15, lk.pantsDark);
      limb(g, pose.kneeFar, pose.footFar, 0.12, lk.pantsDark);
      foot(g, pose.footFar, angle, lk.shoe);
      limb(g, pose.shoulder, pose.elbowFar, 0.1, lk.jerseyDark);
      limb(g, pose.elbowFar, pose.handFar, 0.085, lk.jerseyDark);
    }

    wheel(g, lift(w.rear.p), w.rear.a);
    wheel(g, lift(w.front.p), w.front.a);

    // Frame: chain stays, seat tube, top tube, down tube, fork, bars.
    const rear = L(GEOM.rearAxle), bb = L(GEOM.bottomBracket), seat = L(GEOM.seat);
    const htTop = L(GEOM.headTubeTop), htBot = L(GEOM.headTubeBottom), front = lift(w.front.p);
    const bars = L(GEOM.grips);
    const tube = (a: Vec, b: Vec, wdt: number, c: number) => g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: wdt, color: c, cap: 'round' });
    tube(rear, bb, 0.05, lk.frameDark);
    tube(rear, seat, 0.045, lk.frameDark);
    tube(bb, seat, 0.06, lk.frame);
    tube(seat, htTop, 0.06, lk.frame);
    tube(bb, htBot, 0.07, lk.frame);
    tube(htTop, htBot, 0.08, lk.frame);
    tube(htBot, front, 0.05, CHROME);
    tube(htTop, L({ x: 0.33, y: 0.62 }), 0.045, CHROME);
    tube(L({ x: 0.33, y: 0.62 }), bars, 0.045, CHROME);
    // Seat.
    const s1 = L({ x: -0.42, y: 0.5 }), s2 = L({ x: -0.18, y: 0.52 });
    tube(s1, s2, 0.07, 0x161616);
    // Sprocket and cranks.
    g.circle(bb.x, bb.y, 0.09).stroke({ width: 0.025, color: CHROME });
    if (pose) {
      tube(bb, pose.pedalFar, 0.035, 0x3a3a3a);
      tube(bb, pose.pedal, 0.04, CHROME);
    }

    if (pose) {
      // Near leg.
      limb(g, pose.hip, pose.knee, 0.17, lk.pants);
      limb(g, pose.knee, pose.foot, 0.13, lk.pants);
      foot(g, pose.foot, angle, lk.shoe);
      // Torso: a tapered capsule from hip to shoulder.
      limb(g, pose.hip, pose.shoulder, 0.27, lk.jersey);
      // Number panel stripe.
      const mid = mix(pose.hip, pose.shoulder, 0.55);
      limb(g, mix(pose.hip, pose.shoulder, 0.35), mid, 0.2, lk.helmet);
      // Near arm.
      limb(g, pose.shoulder, pose.elbow, 0.11, lk.jersey);
      limb(g, pose.elbow, pose.hand, 0.09, lk.jersey);
      g.circle(pose.hand.x, pose.hand.y, 0.05).fill(0x222222);
      helmet(g, pose.head, angle, lk);
    } else if (bike.ragdoll) {
      for (const part of bike.ragdoll.parts) {
        const p = lift(part.body.getPosition());
        const a = part.body.getAngle();
        if (part.bone === 'head') { helmet(g, p, a, lk); continue; }
        const dx = Math.cos(a) * part.halfLength, dy = Math.sin(a) * part.halfLength;
        const color = part.bone === 'thigh' || part.bone === 'shin' ? lk.pants : lk.jersey;
        limb(g, { x: p.x - dx, y: p.y - dy }, { x: p.x + dx, y: p.y + dy }, part.halfWidth * 2, color);
      }
    }
  }
}

function liftPose(p: RiderPose): RiderPose {
  const out = {} as RiderPose;
  for (const k of Object.keys(p) as (keyof RiderPose)[]) out[k] = { x: p[k].x, y: p[k].y + RUT_LIFT };
  return out;
}

function mix(a: Vec, b: Vec, t: number): Vec { return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; }

function limb(g: Graphics, a: Vec, b: Vec, width: number, color: number): void {
  g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width, color, cap: 'round' });
}

function foot(g: Graphics, p: Vec, angle: number, color: number): void {
  const c = Math.cos(angle), s = Math.sin(angle);
  g.moveTo(p.x - c * 0.07, p.y - s * 0.07).lineTo(p.x + c * 0.13, p.y + s * 0.13).stroke({ width: 0.08, color, cap: 'round' });
}

function wheel(g: Graphics, p: Vec, a: number): void {
  const r = BIKE.wheelRadius;
  g.circle(p.x, p.y, r - 0.035).stroke({ width: 0.07, color: TIRE });
  g.circle(p.x, p.y, r - 0.075).stroke({ width: 0.025, color: RIM });
  for (let i = 0; i < 9; i++) {
    const t = a + (i * Math.PI * 2) / 9;
    g.moveTo(p.x, p.y).lineTo(p.x + Math.cos(t) * (r - 0.085), p.y + Math.sin(t) * (r - 0.085));
  }
  g.stroke({ width: 0.008, color: 0xdadde0 });
  g.circle(p.x, p.y, 0.035).fill(CHROME);
  // Tread hint: a few marks on the tire that rotate with it.
  for (let i = 0; i < 4; i++) {
    const t = a + (i * Math.PI) / 2;
    g.circle(p.x + Math.cos(t) * (r - 0.035), p.y + Math.sin(t) * (r - 0.035), 0.012).fill(0x3a3a3a);
  }
}

function helmet(g: Graphics, p: Vec, angle: number, lk: RiderLook): void {
  const r = GEOM.headRadius * 1.12;
  const c = Math.cos(angle), s = Math.sin(angle);
  const at = (lx: number, ly: number) => ({ x: p.x + lx * c - ly * s, y: p.y + lx * s + ly * c });
  g.circle(p.x, p.y, r).fill(lk.helmet);
  // Stripe over the crown.
  const s0 = at(-r * 0.9, r * 0.2), s1 = at(r * 0.4, r * 0.85);
  g.moveTo(s0.x, s0.y).lineTo(s1.x, s1.y).stroke({ width: 0.035, color: lk.helmetStripe, cap: 'round' });
  // Visor opening and chin bar of a full-face helmet.
  const v0 = at(r * 0.25, r * 0.05), v1 = at(r * 0.95, -0.02);
  g.moveTo(v0.x, v0.y).lineTo(v1.x, v1.y).stroke({ width: 0.075, color: lk.visor, cap: 'round' });
  const peak = at(r * 0.6, r * 0.55), peakEnd = at(r * 1.35, r * 0.4);
  g.moveTo(peak.x, peak.y).lineTo(peakEnd.x, peakEnd.y).stroke({ width: 0.035, color: lk.helmet, cap: 'round' });
}
