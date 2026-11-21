import { CAMERA } from '../config/physics';
import type { Vec } from '../physics/terrain';

/**
 * Side-view follow camera. Keeps the rider in the left third, looks ahead in
 * the direction of travel, zooms out with speed and height above ground so the
 * landing stays in view, and supports trauma-based shake.
 */
export class Camera {
  x = 0;
  y = 0;
  /** Pixels per meter after zoom. */
  scale = 40;
  zoom = 1;
  /** Extra multiplier for short punch-ins (combos / slow-mo in later milestones). */
  punch = 1;
  shakeEnabled = true;
  private trauma = 0;
  private lookAhead = 0;
  shakeX = 0;
  shakeY = 0;
  viewW = 1;
  viewH = 1;

  resize(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
  }

  snap(target: Vec): void {
    this.x = target.x;
    this.y = target.y;
    this.update(0, target, { x: 0, y: 0 }, 0, true);
  }

  addTrauma(amount: number): void {
    if (this.shakeEnabled) this.trauma = Math.min(1, this.trauma + amount);
  }

  update(dt: number, target: Vec, vel: Vec, heightAboveGround: number, instant = false): void {
    const speed = Math.hypot(vel.x, vel.y);
    const zSpeed = Math.min(1, speed / CAMERA.speedForMaxZoom);
    const zAir = Math.min(0.35, Math.max(0, heightAboveGround - 1) * CAMERA.airZoomPerMeter);
    const targetZoom = Math.min(CAMERA.maxZoomOut, 1 + zSpeed * zSpeed * 0.32 + zAir);
    const k = instant ? 1 : 1 - Math.exp(-CAMERA.zoomLerp * dt);
    this.zoom += (targetZoom - this.zoom) * k;

    const compact = this.viewH < CAMERA.compactBelowPx;
    const base = compact ? CAMERA.compactViewHeight : CAMERA.baseViewHeight;
    const riderY = compact ? CAMERA.compactRiderScreenY : CAMERA.riderScreenY;
    const viewH = base * this.zoom / this.punch;
    this.scale = this.viewH / viewH;
    const viewWm = this.viewW / this.scale;

    const la = Math.max(-2, Math.min(CAMERA.maxLookAhead, vel.x * CAMERA.lookAheadSeconds));
    this.lookAhead += (la - this.lookAhead) * (instant ? 1 : 1 - Math.exp(-2.5 * dt));

    // Rider at riderScreenX of the width, riderScreenY from the top.
    const tx = target.x + this.lookAhead + viewWm * (0.5 - CAMERA.riderScreenX);
    const ty = target.y + viewH * (riderY - 0.5) * 0.8 + Math.min(4, heightAboveGround * 0.3);
    const f = instant ? 1 : 1 - Math.exp(-CAMERA.followLerp * dt);
    this.x += (tx - this.x) * f;
    // Vertical follow is looser so rollers don't bounce the frame.
    const fy = instant ? 1 : 1 - Math.exp(-CAMERA.followLerp * 0.55 * dt);
    this.y += (ty - this.y) * fy;

    this.trauma = Math.max(0, this.trauma - CAMERA.shakeDecay * dt * 0.25);
    const s = this.trauma * this.trauma;
    const t = performance.now() / 1000;
    this.shakeX = s * 0.6 * (Math.sin(t * 61) + Math.sin(t * 37) * 0.5);
    this.shakeY = s * 0.6 * (Math.sin(t * 53 + 1) + Math.sin(t * 29) * 0.5);
  }

  /** Visible world rectangle (meters). */
  bounds(): { left: number; right: number; top: number; bottom: number } {
    const hw = this.viewW / this.scale / 2, hh = this.viewH / this.scale / 2;
    return { left: this.x - hw, right: this.x + hw, top: this.y + hh, bottom: this.y - hh };
  }
}
