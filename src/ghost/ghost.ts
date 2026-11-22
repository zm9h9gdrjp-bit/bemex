import { World, Vec2 } from 'planck';
import { PHYSICS } from '../config/physics';
import { Terrain } from '../physics/terrain';
import { Bike, NO_CONTROLS, type BikeControls } from '../physics/bike';
import { routeContacts } from '../physics/contacts';
import type { TrackData } from '../levels/types';
import { BIT, type GhostData, type GhostKey } from './codec';

export const KEY_EVERY = 60; // keyframe every 0.5 s at 120 Hz

export function maskOf(c: BikeControls, skip: boolean): number {
  return (c.pedal ? BIT.pedal : 0) | (c.leanBack ? BIT.leanBack : 0) | (c.leanForward ? BIT.leanForward : 0)
    | (c.jump ? BIT.jump : 0) | (c.pump ? BIT.pump : 0) | (skip ? BIT.skip : 0);
}

export function controlsOf(m: number): BikeControls {
  return {
    pedal: !!(m & BIT.pedal), leanBack: !!(m & BIT.leanBack), leanForward: !!(m & BIT.leanForward),
    jump: !!(m & BIT.jump), pump: !!(m & BIT.pump),
  };
}

/** Collects the player's inputs step by step during a run. */
export class GhostRecorder {
  private inputs: number[] = [];
  private keys: GhostKey[] = [];
  private skipNext = false;

  get steps(): number { return this.inputs.length; }

  /** "Tap to respawn" happens between steps: it is replayed before the next step. */
  markSkip(): void { this.skipNext = true; }

  /** Call once per physics step with the controls used for that step. */
  record(c: BikeControls): void {
    this.inputs.push(maskOf(c, this.skipNext));
    this.skipNext = false;
  }

  /** Call after the step: stores a keyframe every KEY_EVERY steps. */
  keyframe(bike: Bike): void {
    if (this.inputs.length % KEY_EVERY !== 0) return;
    const p = bike.frame.getPosition();
    this.keys.push({ x: p.x, y: p.y, a: bike.frame.getAngle() });
  }

  finish(trackId: string, name: string): GhostData {
    return { trackId, name, finishSteps: this.inputs.length, inputs: Uint8Array.from(this.inputs), keyEvery: KEY_EVERY, keys: this.keys.slice() };
  }
}

/**
 * Replays a ghost in its own physics world, in lockstep with the player's run.
 * Same track, same fixed step, same inputs → the same ride. If floating-point
 * differences ever make it drift, it snaps back onto the recorded keyframes.
 */
export class GhostReplay {
  readonly world: World;
  readonly terrain: Terrain;
  readonly bike: Bike;
  private step = 0;
  resyncs = 0;

  constructor(track: TrackData, readonly data: GhostData) {
    this.world = new World({ gravity: new Vec2(0, PHYSICS.gravity) });
    this.terrain = new Terrain(this.world, track);
    this.bike = new Bike(this.world, this.terrain, 1);
    routeContacts(this.world, new Map([[1, this.bike]]));
  }

  get finished(): boolean { return this.step >= this.data.finishSteps; }

  /** Advance one physics step (call alongside the player's step). */
  advance(dt: number): void {
    const s = this.step;
    const m = s < this.data.inputs.length ? this.data.inputs[s] : 0;
    if (m & BIT.skip) this.bike.skipCrash();
    if (s >= this.data.finishSteps) this.bike.brake(true);
    this.bike.preStep(dt, s < this.data.finishSteps ? controlsOf(m) : NO_CONTROLS);
    this.world.step(dt, PHYSICS.velocityIterations, PHYSICS.positionIterations);
    this.bike.postStep(dt);
    this.bike.events.length = 0;
    this.step++;
    if (this.step % this.data.keyEvery === 0) this.check(this.step / this.data.keyEvery - 1);
  }

  /** Compare with the recorded keyframe; if it drifted, move the whole bike onto it. */
  private check(i: number): void {
    const k = this.data.keys[i];
    if (!k || this.bike.state !== 'riding') return;
    const f = this.bike.frame;
    const p = f.getPosition();
    if (Math.hypot(p.x - k.x, p.y - k.y) < 0.3) return;
    this.resyncs++;
    const da = k.a - f.getAngle();
    const c = Math.cos(da), s = Math.sin(da);
    const next = this.data.keys[i + 1];
    const v = next ? new Vec2((next.x - k.x) * 2, (next.y - k.y) * 2) : f.getLinearVelocity().clone();
    for (const b of this.bike.allBodies()) {
      const q = b.getPosition();
      const rx = q.x - p.x, ry = q.y - p.y;
      b.setTransform(new Vec2(k.x + rx * c - ry * s, k.y + rx * s + ry * c), b.getAngle() + da);
      b.setLinearVelocity(v);
      b.setAngularVelocity(0);
    }
  }
}
