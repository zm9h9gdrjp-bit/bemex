import { LANDING } from '../config/physics';

export type LandingQuality = 'perfect' | 'good' | 'sloppy' | 'crash';

export interface LandingInput {
  /** Bike angle minus ground slope at the touchdown point, radians. */
  angleDiff: number;
  /** Time between first and second wheel contact; Infinity if only one wheel touched. */
  wheelGap: number;
  /** Rider still holding a trick at touchdown (milestone 2 feeds this). */
  midTrick: boolean;
}

/** Wraps an angle into [-π, π]. */
export function wrapAngle(a: number): number {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}

/** Pure landing classifier, kept separate so bots and tests can reuse it. */
export function classifyLanding(input: LandingInput): LandingQuality {
  if (input.midTrick) return 'crash';
  const deg = Math.abs(wrapAngle(input.angleDiff)) * (180 / Math.PI);
  if (deg > LANDING.sloppyAngle) return 'crash';
  if (deg > LANDING.goodAngle) return 'sloppy';
  if (deg <= LANDING.perfectAngle && input.wheelGap <= LANDING.bothWheelsWindow) return 'perfect';
  return 'good';
}
