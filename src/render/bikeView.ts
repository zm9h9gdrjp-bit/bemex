import { Container, Graphics } from 'pixi.js';
import type { Bike } from '../physics/bike';
import type { Terrain, Vec } from '../physics/terrain';
import { GEOM, toWorld, type RiderPose, type Xf } from '../physics/riderPose';
import type { Interpolator } from '../core/interp';

export interface RiderLook {
  frame: number;
  frameDark: number;
  jersey: number;
  jerseyDark: number;
  jerseyStripe: number;
  pants: number;
  pantsDark: number;
  helmet: number;
  helmetStripe: number;
  goggles: number;
  glove: number;
  skin: number;
  shoe: number;
  rim: number;
  tire: number;
  grip: number;
}

export const DEFAULT_LOOK: RiderLook = {
  frame: 0xd8262f, frameDark: 0x8f171d,
  jersey: 0xf2efe8, jerseyDark: 0xb8b2a6, jerseyStripe: 0xd8262f,
  pants: 0x2b3a4a, pantsDark: 0x1a2430,
  helmet: 0xd8262f, helmetStripe: 0xf2efe8, goggles: 0x1c2a33,
  glove: 0x1f1f1f, skin: 0xd9a27a, shoe: 0x1b1b1b,
  rim: 0xc9ccd0, tire: 0x1f1f1f, grip: 0x222222,
};

/** Visual lift: wheels sit in the rut on the track top, not on its front edge. */
export const RUT_LIFT = 0.24;

/**
 * Graphics tessellates circles from their radius in local units, so a 0.26 m
 * wheel drawn in meters comes out as an octagon. The Pen draws in centimetres
 * on a Graphics scaled by 1/100: same API in meters, smooth curves.
 */
const U = 100;
class Pen {
  constructor(readonly g: Graphics) { g.scale.set(1 / U); }
  clear(): this { this.g.clear(); return this; }
  moveTo(x: number, y: number): this { this.g.moveTo(x * U, y * U); return this; }
  lineTo(x: number, y: number): this { this.g.lineTo(x * U, y * U); return this; }
  circle(x: number, y: number, r: number): this { this.g.circle(x * U, y * U, r * U); return this; }
  ellipse(x: number, y: number, rx: number, ry: number): this { this.g.ellipse(x * U, y * U, rx * U, ry * U); return this; }
  poly(pts: number[]): this { this.g.poly(pts.map((v) => v * U)); return this; }
  fill(style: number | { color: number; alpha?: number }): this { this.g.fill(style); return this; }
  stroke(st: { width: number; color: number; alpha?: number; cap?: 'round' | 'butt' | 'square'; join?: 'round' | 'miter' | 'bevel' }): this {
    this.g.stroke({ ...st, width: st.width * U }); return this;
  }
}

const CHROME = 0x9aa0a6;
const DARK_METAL = 0x3a3d40;

export class BikeView extends Container {
  private shadow = new Pen(new Graphics());
  private g = new Pen(new Graphics());
  /** 1 = solid; bots in later milestones render as ghosts at 0.6. */
  ghost = 1;
  /** Debug: draw IK bones and joint dots over the rider. */
  showBones = false;

  constructor(private bike: Bike, private terrain: Terrain, private interp: Interpolator, public look: RiderLook = DEFAULT_LOOK) {
    super();
    this.addChild(this.shadow.g, this.g.g);
  }

  update(): void {
    const g = this.g;
    g.clear();
    this.shadow.clear();
    this.alpha = this.ghost;
    const bike = this.bike;
    const lk = this.look;
    const lift = (p: Vec): Vec => ({ x: p.x, y: p.y + RUT_LIFT });

    const frameXf = this.interp.get(bike.frame);
    const fx: Xf = { p: lift(frameXf.p), a: frameXf.a };
    const rear = this.interp.get(bike.rearWheel), front = this.interp.get(bike.frontWheel);
    const L = (p: Vec) => toWorld(p, fx);

    // Contact shadow: shrinks and fades with height above the ground.
    const ground = this.terrain.heightAt(frameXf.p.x);
    if (ground !== null) {
      const h = Math.max(0, frameXf.p.y - GEOM.wheelRadius - ground);
      const k = Math.max(0, 1 - h / 7);
      if (k > 0) this.shadow.ellipse(frameXf.p.x, ground + RUT_LIFT + 0.02, 0.9 * (0.5 + k * 0.5), 0.08 * (0.4 + 0.6 * k)).fill({ color: 0x000000, alpha: 0.28 * k });
    }

    let pose: RiderPose | null = null;
    if (bike.state === 'riding') {
      const r = this.interp.get(bike.rider);
      pose = bike.pose(fx, { p: lift(r.p), a: r.a });
    }

    // ---- Far side: leg, arm and crank arm behind the frame.
    if (pose) {
      limb(g, pose.hip, pose.kneeFar, 0.15, lk.pantsDark);
      limb(g, pose.kneeFar, pose.footFar, 0.12, lk.pantsDark);
      shoe(g, pose.footFar, fx.a, darken(lk.shoe));
      limb(g, pose.shoulder, pose.elbowFar, 0.095, lk.jerseyDark);
      limb(g, pose.elbowFar, pose.handFar, 0.08, lk.jerseyDark);
    }
    const bb = L(GEOM.bottomBracket);
    const pedalFarW = pose ? pose.pedalFar : L(farPedal(bike.crank));
    seg(g, bb, pedalFarW, 0.03, DARK_METAL);

    wheel(g, lift(rear.p), rear.a, lk);
    wheel(g, lift(front.p), front.a, lk);

    // ---- Drivetrain: chainring + cog + chain (links move with the crank).
    const rearAxle = lift(rear.p);
    drawChain(g, bb, rearAxle, bike.crank);
    g.circle(rearAxle.x, rearAxle.y, GEOM.cogRadius).fill(DARK_METAL);
    g.circle(bb.x, bb.y, GEOM.chainringRadius).stroke({ width: 0.012, color: CHROME });
    g.circle(bb.x, bb.y, GEOM.chainringRadius * 0.55).fill(CHROME);

    // ---- Frame.
    const seatC = L(GEOM.seatCluster), htTop = L(GEOM.headTubeTop), htBot = L(GEOM.headTubeBottom);
    const frontAxle = lift(front.p);
    seg(g, rearAxle, bb, 0.032, lk.frameDark); // chainstay
    seg(g, rearAxle, seatC, 0.026, lk.frameDark); // seatstay
    seg(g, bb, seatC, 0.04, lk.frame); // seat tube
    seg(g, seatC, htTop, 0.04, lk.frame); // top tube
    seg(g, bb, htBot, 0.05, lk.frame); // down tube
    seg(g, htTop, htBot, 0.055, lk.frame); // head tube
    // Fork legs to the front axle, steerer up to the stem.
    seg(g, htBot, frontAxle, 0.03, lk.frame);
    const stem = L(GEOM.stem);
    seg(g, htTop, stem, 0.035, DARK_METAL);
    // Bars: 8.5" rise from the stem, swept back, with the crossbar.
    const barBase = L({ x: GEOM.stem.x + 0.01, y: GEOM.stem.y });
    const grips = L(GEOM.grips);
    seg(g, barBase, grips, 0.022, CHROME);
    const crossA = L({ x: GEOM.stem.x - 0.025, y: GEOM.stem.y + 0.12 }), crossB = L({ x: GEOM.grips.x + 0.035, y: GEOM.stem.y + 0.12 });
    seg(g, crossA, crossB, 0.016, CHROME);
    seg(g, grips, L({ x: GEOM.grips.x - 0.05, y: GEOM.grips.y + 0.012 }), 0.038, lk.grip);
    // Low small seat on a short post.
    seg(g, seatC, L(GEOM.seat), 0.02, CHROME);
    seg(g, L({ x: GEOM.seat.x - 0.1, y: GEOM.seat.y + 0.01 }), L({ x: GEOM.seat.x + 0.07, y: GEOM.seat.y + 0.02 }), 0.045, 0x161616);

    // ---- Near crank arm and pedal.
    const pedalW = pose ? pose.pedal : L(nearPedal(bike.crank));
    seg(g, bb, pedalW, 0.034, CHROME);
    seg(g, { x: pedalW.x - Math.cos(fx.a) * 0.045, y: pedalW.y - Math.sin(fx.a) * 0.045 }, { x: pedalW.x + Math.cos(fx.a) * 0.045, y: pedalW.y + Math.sin(fx.a) * 0.045 }, 0.025, DARK_METAL);
    g.circle(bb.x, bb.y, 0.018).fill(DARK_METAL);

    if (pose) {
      this.drawRider(g, pose, fx.a);
      if (this.showBones) bones(g, pose);
    } else if (bike.ragdoll) {
      for (const part of bike.ragdoll.parts) {
        const t = this.interp.get(part.body);
        const p = lift(t.p);
        if (part.bone === 'head') { helmet(g, p, t.a, lk); continue; }
        const dx = Math.cos(t.a) * part.halfLength, dy = Math.sin(t.a) * part.halfLength;
        const color = part.bone === 'thigh' || part.bone === 'shin' ? lk.pants : lk.jersey;
        limb(g, { x: p.x - dx, y: p.y - dy }, { x: p.x + dx, y: p.y + dy }, part.halfWidth * 2, color);
      }
    }
  }

  private drawRider(g: Pen, pose: RiderPose, bikeAngle: number): void {
    const lk = this.look;
    // Near leg: thigh tapers to the knee, shin to the ankle.
    limb(g, pose.hip, pose.knee, 0.165, lk.pants);
    limb(g, pose.knee, pose.foot, 0.125, lk.pants);
    g.circle(pose.knee.x, pose.knee.y, 0.07).fill(lk.pants);
    shoe(g, pose.foot, bikeAngle, lk.shoe);
    // Torso: jersey from hip to shoulder, chest wider than waist.
    limb(g, pose.hip, mix(pose.hip, pose.shoulder, 0.55), 0.24, lk.jersey);
    limb(g, mix(pose.hip, pose.shoulder, 0.45), pose.shoulder, 0.28, lk.jersey);
    g.moveTo(mix(pose.hip, pose.shoulder, 0.34).x, mix(pose.hip, pose.shoulder, 0.34).y)
      .lineTo(mix(pose.hip, pose.shoulder, 0.44).x, mix(pose.hip, pose.shoulder, 0.44).y)
      .stroke({ width: 0.25, color: lk.jerseyStripe, cap: 'butt' });
    // Near arm, glove on the grip.
    limb(g, pose.shoulder, pose.elbow, 0.105, lk.jersey);
    limb(g, pose.elbow, pose.hand, 0.085, lk.jersey);
    g.circle(pose.hand.x, pose.hand.y, 0.045).fill(lk.glove);
    // Neck and full-face helmet with goggles.
    limb(g, pose.shoulder, pose.neck, 0.08, lk.skin);
    const headA = Math.atan2(pose.head.y - pose.neck.y, pose.head.x - pose.neck.x) - Math.PI / 2;
    helmet(g, pose.head, headA, lk);
  }
}

function nearPedal(crank: number): Vec {
  const b = GEOM.bottomBracket;
  return { x: b.x + Math.cos(crank) * GEOM.crankLength, y: b.y + Math.sin(crank) * GEOM.crankLength };
}
function farPedal(crank: number): Vec {
  const b = GEOM.bottomBracket;
  return { x: b.x - Math.cos(crank) * GEOM.crankLength, y: b.y - Math.sin(crank) * GEOM.crankLength };
}

function mix(a: Vec, b: Vec, t: number): Vec { return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; }

function darken(c: number): number {
  const r = ((c >> 16) & 255) * 0.7, gg = ((c >> 8) & 255) * 0.7, b = (c & 255) * 0.7;
  return (r << 16) | (gg << 8) | b;
}

function seg(g: Pen, a: Vec, b: Vec, width: number, color: number): void {
  g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width, color, cap: 'round' });
}

function limb(g: Pen, a: Vec, b: Vec, width: number, color: number): void {
  g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width, color, cap: 'round', join: 'round' });
}

function shoe(g: Pen, p: Vec, angle: number, color: number): void {
  const c = Math.cos(angle), s = Math.sin(angle);
  g.moveTo(p.x - c * 0.06, p.y - s * 0.06).lineTo(p.x + c * 0.15, p.y + s * 0.15).stroke({ width: 0.075, color, cap: 'round' });
}

/** 20" wheel: tire with tread, rim, 36 spokes, hub. */
function wheel(g: Pen, p: Vec, a: number, lk: RiderLook): void {
  const r = GEOM.wheelRadius;
  const tireW = 0.044, rimR = r - tireW - 0.004;
  g.circle(p.x, p.y, r - tireW / 2).stroke({ width: tireW, color: lk.tire });
  for (let i = 0; i < 24; i++) {
    const t = a + (i * Math.PI * 2) / 24;
    g.moveTo(p.x + Math.cos(t) * (r - 0.006), p.y + Math.sin(t) * (r - 0.006))
      .lineTo(p.x + Math.cos(t) * (r - 0.02), p.y + Math.sin(t) * (r - 0.02));
  }
  g.stroke({ width: 0.012, color: 0x3a3a3a });
  g.circle(p.x, p.y, rimR).stroke({ width: 0.016, color: lk.rim });
  // 36 spokes, crossed pattern: alternate spokes lean ahead / behind the hub tangent.
  for (let i = 0; i < 36; i++) {
    const t = a + (i * Math.PI * 2) / 36;
    const off = (i % 2 ? 1 : -1) * 0.35;
    g.moveTo(p.x + Math.cos(t + off) * 0.025, p.y + Math.sin(t + off) * 0.025)
      .lineTo(p.x + Math.cos(t) * (rimR - 0.006), p.y + Math.sin(t) * (rimR - 0.006));
  }
  g.stroke({ width: 0.0035, color: 0xd6d9dc });
  g.circle(p.x, p.y, 0.03).fill(CHROME);
  g.circle(p.x, p.y, 0.012).fill(DARK_METAL);
}

/**
 * Chain wrapped around chainring and cog: two tangent runs, dashed so the
 * links visibly travel when pedalling.
 */
function drawChain(g: Pen, bb: Vec, axle: Vec, crank: number): void {
  const R = GEOM.chainringRadius, r = GEOM.cogRadius;
  const dx = axle.x - bb.x, dy = axle.y - bb.y;
  const d = Math.hypot(dx, dy);
  const base = Math.atan2(dy, dx);
  const phi = Math.acos((R - r) / d);
  // With the axle behind the bottom bracket, base - phi is the top run and
  // base + phi the bottom run. Pedalling forward (crank decreasing) pulls the
  // top run toward the cog and feeds the bottom run back to the chainring.
  const travel = -crank * R;
  const runs: [number, number][] = [[base - phi, travel], [base + phi, -travel]];
  const linkLen = 0.0127;
  for (const [ang, tr] of runs) {
    const a = { x: bb.x + Math.cos(ang) * R, y: bb.y + Math.sin(ang) * R };
    const b = { x: axle.x + Math.cos(ang) * r, y: axle.y + Math.sin(ang) * r };
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
    g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 0.012, color: 0x2b2b2b });
    let s = (((tr % (linkLen * 2)) + linkLen * 2) % (linkLen * 2));
    for (; s < len; s += linkLen * 2) {
      g.moveTo(a.x + ux * s, a.y + uy * s).lineTo(a.x + ux * Math.min(len, s + linkLen), a.y + uy * Math.min(len, s + linkLen));
    }
    g.stroke({ width: 0.007, color: 0x8d9196 });
  }
}

function helmet(g: Pen, p: Vec, angle: number, lk: RiderLook): void {
  const r = GEOM.headRadius * 1.15;
  const c = Math.cos(angle), s = Math.sin(angle);
  const at = (lx: number, ly: number) => ({ x: p.x + lx * c - ly * s, y: p.y + lx * s + ly * c });
  g.circle(p.x, p.y, r).fill(lk.helmet);
  // Chin bar of a full-face helmet.
  const chin0 = at(r * 0.2, -r * 0.75), chin1 = at(r * 1.05, -r * 0.35);
  g.moveTo(chin0.x, chin0.y).lineTo(chin1.x, chin1.y).stroke({ width: 0.06, color: lk.helmet, cap: 'round' });
  // Crown stripe.
  const s0 = at(-r * 0.85, r * 0.3), s1 = at(r * 0.35, r * 0.9);
  g.moveTo(s0.x, s0.y).lineTo(s1.x, s1.y).stroke({ width: 0.028, color: lk.helmetStripe, cap: 'round' });
  // Goggles across the eye port, strap round the back.
  const gA = at(r * 0.35, r * 0.05), gB = at(r * 1.02, r * 0.02);
  g.moveTo(gA.x, gA.y).lineTo(gB.x, gB.y).stroke({ width: 0.06, color: lk.goggles, cap: 'round' });
  const strap0 = at(-r * 0.95, r * 0.05);
  g.moveTo(strap0.x, strap0.y).lineTo(gA.x, gA.y).stroke({ width: 0.018, color: 0x1b1b1b });
  // Visor peak.
  const peak = at(r * 0.5, r * 0.65), peakEnd = at(r * 1.35, r * 0.48);
  g.moveTo(peak.x, peak.y).lineTo(peakEnd.x, peakEnd.y).stroke({ width: 0.03, color: lk.helmet, cap: 'round' });
}

function bones(g: Pen, p: RiderPose): void {
  const pairs: [Vec, Vec][] = [
    [p.hip, p.knee], [p.knee, p.foot], [p.hip, p.kneeFar], [p.kneeFar, p.footFar],
    [p.hip, p.shoulder], [p.shoulder, p.elbow], [p.elbow, p.hand], [p.shoulder, p.neck], [p.neck, p.head],
  ];
  for (const [a, b] of pairs) g.moveTo(a.x, a.y).lineTo(b.x, b.y);
  g.stroke({ width: 0.012, color: 0x00e5ff });
  for (const q of [p.hip, p.knee, p.foot, p.shoulder, p.elbow, p.hand, p.head]) g.circle(q.x, q.y, 0.022).fill(0x00e5ff);
}
