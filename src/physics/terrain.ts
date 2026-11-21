import { World, Vec2, Chain, Edge, type Body } from 'planck';
import type { TrackData, SurfaceType } from '../levels/types';
import { CAT, MASK } from './collision';
import { CRASH } from '../config/physics';

export interface Vec { x: number; y: number }

/** Friction per surface. Sand is grippy but slow (rolling drag), ice is slippery. */
export const SURFACE_FRICTION: Record<SurfaceType, number> = {
  dirt: 0.95, sand: 1.0, snow: 0.7, ice: 0.12, stone: 0.9, wood: 0.85,
};
/** Rolling resistance as a deceleration in m/s² applied while on that surface. */
export const SURFACE_DRAG: Record<SurfaceType, number> = {
  dirt: 0.15, sand: 1.6, snow: 0.45, ice: 0.02, stone: 0.1, wood: 0.12,
};

export interface TerrainSection {
  /** Sampled polyline, sorted by x. */
  pts: Vec[];
  surface: SurfaceType;
  minX: number;
  maxX: number;
}

export interface FixtureTag {
  kind: 'ground' | 'pit' | 'wheel' | 'frame' | 'rider' | 'ragdoll';
  surface?: SurfaceType;
  wheel?: 'rear' | 'front';
  owner?: number;
}

const SAMPLE_SPACING = 0.35;

/** Centripetal Catmull-Rom: no cusps or overshoot on uneven point spacing. */
function catmullRom(points: [number, number][]): Vec[] {
  const p = points.map(([x, y]) => ({ x, y }));
  if (p.length < 2) return p;
  // Extrapolated phantom endpoints keep the curve's ends straight.
  const first = { x: 2 * p[0].x - p[1].x, y: 2 * p[0].y - p[1].y };
  const n = p.length;
  const last = { x: 2 * p[n - 1].x - p[n - 2].x, y: 2 * p[n - 1].y - p[n - 2].y };
  const ext = [first, ...p, last];
  const out: Vec[] = [];
  const tj = (ti: number, a: Vec, b: Vec) => ti + Math.pow(Math.hypot(b.x - a.x, b.y - a.y), 0.5) + 1e-6;

  for (let i = 1; i < ext.length - 2; i++) {
    const p0 = ext[i - 1], p1 = ext[i], p2 = ext[i + 1], p3 = ext[i + 2];
    const t0 = 0, t1 = tj(t0, p0, p1), t2 = tj(t1, p1, p2), t3 = tj(t2, p2, p3);
    const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const steps = Math.max(2, Math.ceil(segLen / SAMPLE_SPACING));
    for (let s = 0; s < steps; s++) {
      const t = t1 + ((t2 - t1) * s) / steps;
      const a1 = lerpV(p0, p1, (t1 - t) / (t1 - t0), (t - t0) / (t1 - t0));
      const a2 = lerpV(p1, p2, (t2 - t) / (t2 - t1), (t - t1) / (t2 - t1));
      const a3 = lerpV(p2, p3, (t3 - t) / (t3 - t2), (t - t2) / (t3 - t2));
      const b1 = lerpV(a1, a2, (t2 - t) / (t2 - t0), (t - t0) / (t2 - t0));
      const b2 = lerpV(a2, a3, (t3 - t) / (t3 - t1), (t - t1) / (t3 - t1));
      out.push(lerpV(b1, b2, (t2 - t) / (t2 - t1), (t - t1) / (t2 - t1)));
    }
  }
  out.push(p[n - 1]);
  // Guarantee x is strictly increasing so height lookups stay well-defined.
  const clean: Vec[] = [out[0]];
  for (let i = 1; i < out.length; i++) {
    if (out[i].x > clean[clean.length - 1].x + 0.02) clean.push(out[i]);
  }
  return clean;
}

function lerpV(a: Vec, b: Vec, wa: number, wb: number): Vec {
  return { x: a.x * wa + b.x * wb, y: a.y * wa + b.y * wb };
}

export class Terrain {
  readonly sections: TerrainSection[];
  readonly checkpoints: number[];
  readonly startX: number;
  readonly finishX: number;
  readonly pitY: number;
  private body: Body;

  constructor(world: World, readonly data: TrackData) {
    this.startX = data.startX;
    this.finishX = data.finishX;
    this.pitY = data.pitY;
    this.body = world.createBody();

    this.sections = data.sections.map((s) => {
      const pts = catmullRom(s.points);
      const surface = s.surface ?? 'dirt';
      return { pts, surface, minX: pts[0].x, maxX: pts[pts.length - 1].x };
    });

    for (const sec of this.sections) {
      this.body.createFixture({
        shape: new Chain(sec.pts.map((p) => new Vec2(p.x, p.y)), false),
        friction: SURFACE_FRICTION[sec.surface],
        filterCategoryBits: CAT.TERRAIN,
        filterMaskBits: MASK.TERRAIN,
        userData: { kind: 'ground', surface: sec.surface } satisfies FixtureTag,
      });
    }

    // Pit floor spanning the whole track, hidden under the ground bands.
    const minX = this.sections[0].minX - 50;
    const maxX = this.sections[this.sections.length - 1].maxX + 50;
    this.body.createFixture({
      shape: new Edge(new Vec2(minX, this.pitY), new Vec2(maxX, this.pitY)),
      friction: 0.8,
      filterCategoryBits: CAT.TERRAIN,
      filterMaskBits: MASK.TERRAIN,
      userData: { kind: 'pit' } satisfies FixtureTag,
    });

    this.checkpoints = this.computeCheckpoints();
  }

  sectionAt(x: number): TerrainSection | null {
    for (const s of this.sections) if (x >= s.minX && x <= s.maxX) return s;
    return null;
  }

  /** Ground height at x, or null over a gap. */
  heightAt(x: number): number | null {
    const s = this.sectionAt(x);
    if (!s) return null;
    const i = this.indexIn(s, x);
    const a = s.pts[i], b = s.pts[i + 1] ?? a;
    const t = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x);
    return a.y + (b.y - a.y) * t;
  }

  /** Ground slope angle at x in radians (0 = flat, positive = uphill to the right). */
  slopeAt(x: number): number {
    const s = this.sectionAt(x);
    if (!s) return 0;
    const i = this.indexIn(s, x);
    const a = s.pts[Math.max(0, i)], b = s.pts[Math.min(s.pts.length - 1, i + 1)];
    return Math.atan2(b.y - a.y, b.x - a.x);
  }

  /** Highest ground below a point, including the pit (for shadows and camera). */
  groundBelow(x: number): number {
    return this.heightAt(x) ?? this.pitY;
  }

  surfaceAt(x: number): SurfaceType {
    return this.sectionAt(x)?.surface ?? 'dirt';
  }

  private indexIn(s: TerrainSection, x: number): number {
    let lo = 0, hi = s.pts.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (s.pts[mid].x <= x) lo = mid; else hi = mid;
    }
    return lo;
  }

  /**
   * Checkpoints every ~15% of the track. Each one is pulled back until it sits on
   * calm, flat-ish ground so a respawn never drops the rider into a gap or onto a lip.
   */
  private computeCheckpoints(): number[] {
    const len = this.finishX - this.startX;
    const result = [this.startX];
    for (let f = CRASH.checkpointEvery; f < 0.98; f += CRASH.checkpointEvery) {
      let x = this.startX + len * f;
      const floor = result[result.length - 1] + 5;
      while (x > floor && !this.isCalm(x)) x -= 0.5;
      if (x > floor) result.push(x);
    }
    return result;
  }

  private isCalm(x: number): boolean {
    for (let dx = -2; dx <= 6; dx += 1) {
      if (this.heightAt(x + dx) === null) return false;
      if (Math.abs(this.slopeAt(x + dx)) > 0.12) return false;
    }
    return true;
  }
}
