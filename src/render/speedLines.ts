import { Graphics } from 'pixi.js';

/**
 * Screen-space speed streaks. Fades in above a speed threshold; streak length
 * and count scale with speed. Pooled: a fixed set of streaks is recycled.
 */
interface Streak { x: number; y: number; len: number; speed: number }

export class SpeedLines extends Graphics {
  private streaks: Streak[] = [];
  private w = 1;
  private h = 1;

  constructor(private count = 26) { super(); }

  resize(w: number, h: number): void {
    this.w = w; this.h = h;
    this.streaks = Array.from({ length: this.count }, () => this.spawn(true));
  }

  private spawn(anywhere: boolean): Streak {
    return {
      x: anywhere ? Math.random() * this.w : this.w + Math.random() * 200,
      y: this.h * (0.08 + Math.random() * 0.84),
      len: 40 + Math.random() * 120,
      speed: 0.8 + Math.random() * 0.6,
    };
  }

  update(dt: number, speed: number, enabled: boolean): void {
    this.clear();
    const k = enabled ? Math.max(0, Math.min(1, (speed - 12) / 8)) : 0;
    if (k <= 0) return;
    for (const s of this.streaks) {
      s.x -= speed * 90 * s.speed * dt;
      if (s.x + s.len < 0) Object.assign(s, this.spawn(false));
      this.moveTo(s.x, s.y).lineTo(s.x + s.len * k, s.y);
    }
    this.stroke({ width: 1.5, color: 0xffffff, alpha: 0.22 * k });
  }
}
