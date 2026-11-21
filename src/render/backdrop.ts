import { Container, Graphics, FillGradient } from 'pixi.js';
import type { Camera } from './camera';

/**
 * Milestone 1 test backdrop: sky + three parallax ridges with atmospheric
 * fade. Themed scenery packs (Brazil / Germany / Desert) replace this in
 * milestone 4 with the full layer stack.
 */
interface Layer { g: Graphics; factor: number; width: number }

export class Backdrop extends Container {
  private sky = new Graphics();
  private layers: Layer[] = [];
  private w = 0;
  private h = 0;

  constructor() {
    super();
    this.addChild(this.sky);
  }

  resize(w: number, h: number): void {
    this.w = w; this.h = h;
    this.sky.clear();
    const grad = new FillGradient({
      type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: h },
      colorStops: [{ offset: 0, color: 0x8fb7cf }, { offset: 0.65, color: 0xd9e3dc }, { offset: 1, color: 0xe8e2cf }],
      textureSpace: 'global',
    });
    this.sky.rect(0, 0, w, h).fill(grad);

    for (const l of this.layers) l.g.destroy();
    this.layers = [];
    this.addRidge(0.06, 0.52, 0.16, 0xa9bfca, 11, 0.0);
    this.addRidge(0.14, 0.6, 0.13, 0x87a58f, 23, 0.35);
    this.addTrees(0.3, 0.7, 0x4f7243);
  }

  private addRidge(factor: number, baseY: number, amp: number, color: number, seed: number, jag: number): void {
    const width = Math.ceil(this.w * 2.2);
    const g = new Graphics();
    const pts: number[] = [0, this.h];
    for (let x = 0; x <= width; x += 12) {
      const t = (x / width) * Math.PI * 2;
      // Periodic noise so the layer tiles seamlessly.
      const y = Math.sin(t * 2 + seed) * 0.5 + Math.sin(t * 5 + seed * 2) * 0.3 * (1 + jag) + Math.sin(t * 11 + seed) * 0.12 * jag;
      pts.push(x, this.h * (baseY - amp * (0.5 + y * 0.5)));
    }
    pts.push(width, this.h);
    g.poly(pts).fill(color);
    g.poly(pts.map((v, i) => (i % 2 === 0 ? v + width : v))).fill(color);
    this.addChild(g);
    this.layers.push({ g, factor, width });
  }

  private addTrees(factor: number, baseY: number, color: number): void {
    const width = Math.ceil(this.w * 2.2);
    const g = new Graphics();
    const ground = this.h * baseY;
    for (let copy = 0; copy < 2; copy++) {
      let seed = 7;
      const rnd = () => ((seed = (seed * 1664525 + 1013904223) | 0) >>> 0) / 4294967296;
      const ox = copy * width;
      g.rect(ox, ground, width, this.h - ground).fill(color);
      for (let x = 0; x < width; x += 14 + rnd() * 26) {
        const th = this.h * (0.07 + rnd() * 0.1);
        const tw = th * (0.32 + rnd() * 0.12);
        g.poly([ox + x - tw / 2, ground + 2, ox + x, ground - th, ox + x + tw / 2, ground + 2]).fill(color);
      }
    }
    this.addChild(g);
    this.layers.push({ g, factor, width });
  }

  update(cam: Camera): void {
    for (const l of this.layers) {
      const px = cam.x * cam.scale * l.factor;
      l.g.x = -(((px % l.width) + l.width) % l.width);
      // Slight vertical parallax keeps the horizon steady when the camera climbs.
      l.g.y = Math.max(-this.h * 0.2, Math.min(this.h * 0.2, cam.y * cam.scale * l.factor * 0.5));
    }
  }
}
