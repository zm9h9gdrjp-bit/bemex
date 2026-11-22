import { Graphics } from 'pixi.js';
import type { World, Shape } from 'planck';
import { WorldManifold } from 'planck';

/**
 * Physics debug view: every fixture outline, joint anchors and live contact
 * points, drawn in world meters on top of the scene.
 */
export class DebugDraw extends Graphics {
  enabled = false;
  /** Draw only the rider's crash sensors (head, torso, hips, hands, knees). */
  sensorsOnly = false;
  private wm = new WorldManifold();

  /** `lift` shifts the overlay up so it lines up with the drawn rider (rut offset). */
  draw(world: World, lift = 0): void {
    this.clear();
    this.position.y = lift;
    if (this.sensorsOnly) { this.drawSensors(world); return; }
    if (!this.enabled) return;

    for (let b = world.getBodyList(); b; b = b.getNext()) {
      const xf = b.getTransform();
      const color = b.isStatic() ? 0x3ddc84 : b.isAwake() ? 0xffb000 : 0x8a8a8a;
      for (let f = b.getFixtureList(); f; f = f.getNext()) {
        this.drawShape(f.getShape(), xf, f.isSensor() ? 0xff4fd8 : color);
      }
      const c = b.getWorldCenter();
      this.circle(c.x, c.y, 0.03).fill(0xffffff);
    }

    for (let j = world.getJointList(); j; j = j.getNext()) {
      const a = j.getAnchorA(), b = j.getAnchorB();
      this.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 0.03, color: 0x4fc3f7 });
      this.circle(a.x, a.y, 0.04).stroke({ width: 0.02, color: 0x4fc3f7 });
    }

    for (let c = world.getContactList(); c; c = c.getNext()) {
      if (!c.isTouching()) continue;
      c.getWorldManifold(this.wm);
      const n = this.wm.normal;
      for (const p of this.wm.points) {
        if (!p) continue;
        this.circle(p.x, p.y, 0.05).fill(0xff3b30);
        this.moveTo(p.x, p.y).lineTo(p.x + n.x * 0.4, p.y + n.y * 0.4).stroke({ width: 0.02, color: 0xff3b30 });
      }
    }
  }

  private drawSensors(world: World): void {
    for (let b = world.getBodyList(); b; b = b.getNext()) {
      const xf = b.getTransform();
      for (let f = b.getFixtureList(); f; f = f.getNext()) {
        if (!f.isSensor()) continue;
        this.drawShape(f.getShape(), xf, 0xff4fd8);
      }
    }
  }

  private drawShape(shape: Shape, xf: { p: { x: number; y: number }; q: { s: number; c: number } }, color: number): void {
    const tx = (v: { x: number; y: number }) => ({
      x: xf.p.x + xf.q.c * v.x - xf.q.s * v.y,
      y: xf.p.y + xf.q.s * v.x + xf.q.c * v.y,
    });
    const type = shape.getType();
    if (type === 'circle') {
      const s = shape as unknown as { m_p: { x: number; y: number }; m_radius: number };
      const c = tx(s.m_p);
      this.circle(c.x, c.y, s.m_radius).stroke({ width: 0.025, color });
      this.moveTo(c.x, c.y).lineTo(c.x + xf.q.c * s.m_radius, c.y + xf.q.s * s.m_radius).stroke({ width: 0.02, color });
    } else if (type === 'polygon') {
      const s = shape as unknown as { m_vertices: { x: number; y: number }[]; m_count: number };
      const pts: number[] = [];
      for (let i = 0; i < s.m_count; i++) { const v = tx(s.m_vertices[i]); pts.push(v.x, v.y); }
      this.poly(pts).stroke({ width: 0.025, color });
    } else if (type === 'chain') {
      const s = shape as unknown as { m_vertices: { x: number; y: number }[]; m_count: number };
      const v0 = tx(s.m_vertices[0]);
      this.moveTo(v0.x, v0.y);
      for (let i = 1; i < s.m_count; i++) { const v = tx(s.m_vertices[i]); this.lineTo(v.x, v.y); }
      this.stroke({ width: 0.04, color });
      for (let i = 0; i < s.m_count; i++) { const v = tx(s.m_vertices[i]); this.circle(v.x, v.y, 0.03).fill(color); }
    } else if (type === 'edge') {
      const s = shape as unknown as { m_vertex1: { x: number; y: number }; m_vertex2: { x: number; y: number } };
      const a = tx(s.m_vertex1), b = tx(s.m_vertex2);
      this.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 0.04, color: 0xff6f61 });
    }
  }
}
