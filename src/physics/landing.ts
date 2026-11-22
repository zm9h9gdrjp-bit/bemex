import { LANDING } from '../config/physics';

export type LandingQuality = 'perfect' | 'good' | 'wheelie' | 'nose' | 'sloppy' | 'crash';

export interface LandingInput {
  /** Bike angle minus ground slope at the first touchdown, radians (positive = nose up). */
  angleDiff: number;
  /** Time between first and second wheel contact; Infinity if the second wheel didn't follow in time. */
  wheelGap: number;
  /** Which wheel touched first. */
  first: 'rear' | 'front';
  /** Impact speed perpendicular to the ground at touchdown, m/s (positive = into the ground). */
  impact: number;
  /** Rider still holding a trick at touchdown. */
  midTrick: boolean;
  /** Multiplier on angle windows (GRIP stat / upgrades). */
  forgiveness: number;
}

export type CrashCause = 'midTrick' | 'overRotated' | 'impact';

export interface LandingResult {
  quality: LandingQuality;
  cause?: CrashCause;
  /** True when the impact was hard enough to case (thud, speed loss) but not to crash. */
  cased: boolean;
}

/** Wraps an angle into [-π, π]. */
export function wrapAngle(a: number): number {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}

/**
 * Landing classifier. Crashes only for: mid-trick, over-rotation (> ±75°) and
 * impacts above the crash speed. One-wheel landings roll into a manual.
 */
export function classifyLanding(i: LandingInput): LandingResult {
  const deg = Math.abs(wrapAngle(i.angleDiff)) * (180 / Math.PI);
  const cased = i.impact > LANDING.caseImpactVelocity;
  if (i.midTrick) return { quality: 'crash', cause: 'midTrick', cased };
  if (deg > LANDING.maxLandingAngle) return { quality: 'crash', cause: 'overRotated', cased };
  if (i.impact > LANDING.crashImpactVelocity) return { quality: 'crash', cause: 'impact', cased };

  const f = i.forgiveness;
  const both = i.wheelGap <= LANDING.bothWheelsWindow;
  if (both && deg <= LANDING.perfectAngle * f && !cased) return { quality: 'perfect', cased };
  if (deg <= LANDING.goodAngle * f) return { quality: 'good', cased };
  if (!both) return { quality: i.first === 'rear' ? 'wheelie' : 'nose', cased };
  return { quality: 'sloppy', cased };
}
