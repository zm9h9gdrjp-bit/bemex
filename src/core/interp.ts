import type { Body } from 'planck';
import type { Xf } from '../physics/riderPose';

/**
 * Render interpolation. Physics runs at a fixed 120 Hz; the renderer draws
 * between the last two physics states using the leftover accumulator time, so
 * motion is identical and smooth at 30, 60 or 144 FPS.
 */
export class Interpolator {
  private prev = new WeakMap<Body, Xf>();
  alpha = 1;

  /** Call before each physics step for every body that is rendered. */
  snapshot(bodies: Body[]): void {
    for (const b of bodies) {
      const p = b.getPosition();
      this.prev.set(b, { p: { x: p.x, y: p.y }, a: b.getAngle() });
    }
  }

  get(b: Body): Xf {
    const p = b.getPosition(), a = b.getAngle();
    const q = this.prev.get(b);
    if (!q) return { p: { x: p.x, y: p.y }, a };
    const t = this.alpha;
    return {
      p: { x: q.p.x + (p.x - q.p.x) * t, y: q.p.y + (p.y - q.p.y) * t },
      a: q.a + (a - q.a) * t,
    };
  }
}
