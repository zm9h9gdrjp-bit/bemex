import { Container, Graphics, FillGradient } from 'pixi.js';
import type { Terrain, Vec } from '../physics/terrain';

/**
 * Track band: the riding line is the front edge of a thick dirt strip. Above
 * it, a lit top surface recedes into the screen (offset up), below it a darker
 * front face fades into the grass bank. Drawn in world meters (y up).
 */
export interface TerrainPalette {
  top: number;
  topEdge: number;
  face: number;
  faceDeep: number;
  bank: number;
  bankDeep: number;
  rut: number;
  pit: number;
}

export const DIRT_PALETTE: TerrainPalette = {
  top: 0xc99a62, topEdge: 0xe3bc86, face: 0x8a5a33, faceDeep: 0x5a3820,
  bank: 0x5f8a2e, bankDeep: 0x2f4a1a, rut: 0xb2864f, pit: 0x2a1a10,
};

const TOP_DEPTH = 0.55; // how far the track top recedes (meters, screen-up)
const FACE_DEPTH = 1.1;
const BANK_DEPTH = 22;

export class TerrainView extends Container {
  constructor(terrain: Terrain, pal: TerrainPalette = DIRT_PALETTE) {
    super();
    // Pit backdrop for gaps: dark earth walls under every section boundary.
    const pit = new Graphics();
    const first = terrain.sections[0], last = terrain.sections[terrain.sections.length - 1];
    pit.rect(first.minX - 40, terrain.pitY - 30, last.maxX - first.minX + 80, 30 + 0.02).fill(pal.pit);
    pit.rect(first.minX - 40, terrain.pitY, last.maxX - first.minX + 80, 0.5).fill(0x3b2616);
    this.addChild(pit);

    for (const sec of terrain.sections) {
      const pts = sec.pts;
      const g = new Graphics();
      const minY = Math.min(...pts.map((p) => p.y));

      // Bank below the face: grass, deeper toward the bottom.
      const bankGrad = new FillGradient({
        type: 'linear', start: { x: 0, y: minY }, end: { x: 0, y: minY - BANK_DEPTH },
        colorStops: [{ offset: 0, color: pal.bank }, { offset: 1, color: pal.bankDeep }],
        textureSpace: 'global',
      });
      g.poly(band(pts, -FACE_DEPTH, minY - BANK_DEPTH)).fill(bankGrad);

      // Front face of the track.
      const faceGrad = new FillGradient({
        type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: -FACE_DEPTH },
        colorStops: [{ offset: 0, color: pal.face }, { offset: 1, color: pal.faceDeep }],
        textureSpace: 'global',
      });
      g.poly(offsetBand(pts, 0, -FACE_DEPTH)).fill(faceGrad);

      // Top surface (seen slightly from above).
      g.poly(offsetBand(pts, TOP_DEPTH, 0)).fill(pal.top);
      // Ruts: two worn lines where wheels run.
      polyline(g, pts, TOP_DEPTH * 0.45).stroke({ width: 0.09, color: pal.rut, alpha: 0.9 });
      polyline(g, pts, TOP_DEPTH * 0.18).stroke({ width: 0.05, color: pal.rut, alpha: 0.6 });
      // Lit lip on the riding edge.
      polyline(g, pts, 0.02).stroke({ width: 0.07, color: pal.topEdge });
      // Grass fringe at the bottom of the face.
      polyline(g, pts, -FACE_DEPTH).stroke({ width: 0.16, color: pal.bank });

      // Side walls where a section ends at a gap (gives the lip real thickness).
      const a = pts[0], b = pts[pts.length - 1];
      g.poly([a.x, a.y + TOP_DEPTH, a.x, minY - BANK_DEPTH, a.x - 0.6, minY - BANK_DEPTH, a.x - 0.25, a.y]).fill(pal.faceDeep);
      g.poly([b.x, b.y + TOP_DEPTH, b.x + 0.25, b.y, b.x + 0.6, minY - BANK_DEPTH, b.x, minY - BANK_DEPTH]).fill(pal.faceDeep);

      // Pebbles scattered on the face for texture (seeded so they stay put).
      let seed = Math.floor(a.x * 13.37) | 0;
      const rnd = () => ((seed = (seed * 1664525 + 1013904223) | 0) >>> 0) / 4294967296;
      // Drawn in centimetres on a 1/100-scaled layer so small ellipses stay round.
      const pebbles = new Graphics();
      pebbles.scale.set(0.01);
      for (let x = a.x + 0.5; x < b.x - 0.5; x += 0.7 + rnd() * 1.4) {
        const y = sampleY(pts, x) - 0.15 - rnd() * (FACE_DEPTH - 0.3);
        pebbles.ellipse(x * 100, y * 100, 6 + rnd() * 6, 4 + rnd() * 3).fill({ color: pal.faceDeep, alpha: 0.7 });
      }
      this.addChild(g, pebbles);
    }
  }
}

function sampleY(pts: Vec[], x: number): number {
  for (let i = 0; i < pts.length - 1; i++) {
    if (x >= pts[i].x && x <= pts[i + 1].x) {
      const t = (x - pts[i].x) / (pts[i + 1].x - pts[i].x);
      return pts[i].y + (pts[i + 1].y - pts[i].y) * t;
    }
  }
  return pts[pts.length - 1].y;
}

/** Open path along the curve (poly() would close it back to the start). */
function polyline(g: Graphics, pts: Vec[], dy: number): Graphics {
  g.moveTo(pts[0].x, pts[0].y + dy);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y + dy);
  return g;
}

function offsetLine(pts: Vec[], dy: number): number[] {
  const out: number[] = [];
  for (const p of pts) out.push(p.x, p.y + dy);
  return out;
}

/** Closed polygon between the curve shifted by dyTop and the curve shifted by dyBottom. */
function offsetBand(pts: Vec[], dyTop: number, dyBottom: number): number[] {
  const out = offsetLine(pts, dyTop);
  for (let i = pts.length - 1; i >= 0; i--) out.push(pts[i].x, pts[i].y + dyBottom);
  return out;
}

/** Curve shifted by dy, closed down to a flat bottom. */
function band(pts: Vec[], dy: number, bottom: number): number[] {
  const out = offsetLine(pts, dy);
  out.push(pts[pts.length - 1].x, bottom, pts[0].x, bottom);
  return out;
}
