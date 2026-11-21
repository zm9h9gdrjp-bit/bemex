/**
 * Track data format. Tracks are authored as JSON so they can be edited by hand
 * or exported from the in-game editor (later milestone).
 *
 * Each section is an independent run of ground; the space between two sections
 * is a real gap with a pit below. Control points are [x, y] in meters (y up) and
 * are interpolated with a centripetal Catmull-Rom spline.
 */
export type SurfaceType = 'dirt' | 'sand' | 'snow' | 'ice' | 'stone' | 'wood';

export interface TrackSection {
  points: [number, number][];
  surface?: SurfaceType;
}

export interface TrackData {
  id: string;
  name: string;
  startX: number;
  finishX: number;
  /** Height of the pit floor under gaps. */
  pitY: number;
  sections: TrackSection[];
}
