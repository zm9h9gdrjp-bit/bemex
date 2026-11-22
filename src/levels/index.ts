import type { TrackData } from './types';
import pump from './pump-track.json';
import circuit from './test-track.json';
import bigAir from './big-air.json';

/** Tracks in the order they appear on the start screen (easiest first). */
export const TRACKS: TrackData[] = [pump as TrackData, circuit as TrackData, bigAir as TrackData];

export function trackById(id: string): TrackData | undefined {
  return TRACKS.find((t) => t.id === id);
}
