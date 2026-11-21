import { Application, Container, Graphics } from 'pixi.js';
import { World, Vec2, type Contact } from 'planck';
import { PHYSICS } from '../config/physics';
import { Input } from './input';
import { fmt, fmtTime, t } from './i18n';
import { Terrain, type FixtureTag } from '../physics/terrain';
import { Bike, NO_CONTROLS, type BikeControls } from '../physics/bike';
import type { TrackData } from '../levels/types';
import { Camera } from '../render/camera';
import { Backdrop } from '../render/backdrop';
import { TerrainView } from '../render/terrainView';
import { BikeView, RUT_LIFT } from '../render/bikeView';
import { DebugDraw } from '../render/debugDraw';
import { SpeedLines } from '../render/speedLines';
import { Hud } from '../ui/hud';
import { TouchControls } from '../ui/touch';

/**
 * Milestone 1 game: one rider on a test track. Owns the physics world, the
 * fixed-step loop and the render graph. Later milestones split race flow and
 * menus into a proper scene state machine.
 */
export class Game {
  readonly world: World;
  readonly terrain: Terrain;
  readonly bike: Bike;
  private bikes = new Map<number, Bike>();

  private camera = new Camera();
  private backdrop = new Backdrop();
  private worldLayer = new Container();
  private bikeView: BikeView;
  private debugDraw = new DebugDraw();
  private speedLines = new SpeedLines();
  private hud: Hud;

  private accumulator = 0;
  private raceTime = 0;
  private lostTime = 0;
  private finished = false;
  private crashedAt = 0;
  /** Simulation speed multiplier (dev slow-mo, later trick slow-mo). */
  timeScale = 1;

  constructor(private app: Application, track: TrackData, hudRoot: HTMLElement) {
    this.world = new World({ gravity: new Vec2(0, PHYSICS.gravity) });
    this.terrain = new Terrain(this.world, track);
    this.bike = new Bike(this.world, this.terrain, 0);
    this.bikes.set(0, this.bike);
    this.world.on('begin-contact', (c) => this.route(c, 1));
    this.world.on('end-contact', (c) => this.route(c, -1));

    // Render graph: sky/parallax (screen space) → world (meters, y-up) → screen fx.
    this.worldLayer.addChild(new TerrainView(this.terrain), this.buildMarkers());
    this.bikeView = new BikeView(this.bike, this.terrain);
    this.worldLayer.addChild(this.bikeView, this.debugDraw);
    app.stage.addChild(this.backdrop, this.worldLayer, this.speedLines);

    this.hud = new Hud(hudRoot);
    new TouchControls(hudRoot);
    this.hud.setCheckpoint(0, this.terrain.checkpoints.length - 1);

    this.resize();
    this.app.renderer.on('resize', () => this.resize());
    this.camera.snap(this.bike.position);
    app.ticker.add((tk) => this.frame(tk.deltaMS / 1000));
  }

  private resize(): void {
    // app.screen is in CSS pixels regardless of devicePixelRatio.
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    this.camera.resize(w, h);
    this.backdrop.resize(w, h);
    this.speedLines.resize(w, h);
  }

  /** Dispatches contacts between bike parts and terrain to the owning bike. */
  private route(c: Contact, delta: 1 | -1): void {
    const a = c.getFixtureA().getUserData() as FixtureTag | null;
    const b = c.getFixtureB().getUserData() as FixtureTag | null;
    if (!a || !b) return;
    const pair: [FixtureTag, FixtureTag][] = [[a, b], [b, a]];
    for (const [mine, other] of pair) {
      if (mine.owner === undefined || (other.kind !== 'ground' && other.kind !== 'pit')) continue;
      this.bikes.get(mine.owner)?.onContact(mine, other, delta);
    }
  }

  private controls(): BikeControls {
    return {
      pedal: Input.held('pedal'),
      leanBack: Input.held('leanBack'),
      leanForward: Input.held('leanForward'),
      jump: Input.held('jump'),
      pump: Input.held('pump'),
    };
  }

  private frame(realDt: number): void {
    const t0 = performance.now();
    Input.poll();
    if (Input.pressed('debugDraw')) this.debugDraw.enabled = !this.debugDraw.enabled;
    if (Input.pressed('debugInfo')) this.hud.toggleDebug();
    if (Input.pressed('respawn')) this.restart();

    const dt = Math.min(0.1, realDt) * this.timeScale;
    const step = 1 / PHYSICS.stepHz;
    this.accumulator += dt;
    let steps = 0;
    // After the finish line the rider coasts out and brakes; input is ignored.
    const c = this.finished ? NO_CONTROLS : this.controls();
    if (this.finished && this.bike.state === 'riding') this.bike.frame.setLinearDamping(1.2);
    while (this.accumulator >= step && steps < PHYSICS.maxStepsPerFrame) {
      this.bike.preStep(step, c);
      this.world.step(step, PHYSICS.velocityIterations, PHYSICS.positionIterations);
      this.bike.postStep(step);
      this.accumulator -= step;
      steps++;
    }
    if (steps === PHYSICS.maxStepsPerFrame) this.accumulator = 0;

    if (!this.finished) {
      this.raceTime += dt;
      if (this.bike.state === 'riding' && this.bike.frame.getPosition().x >= this.terrain.finishX) {
        this.finished = true;
        this.hud.message(`${t('finish')} ${fmtTime(this.raceTime)}`, `R · ${t('helpRestart')}`);
      }
    }
    this.handleEvents();
    this.render(realDt);
    this.debugInfo(realDt, performance.now() - t0);
  }

  private handleEvents(): void {
    for (const e of this.bike.events.splice(0)) {
      switch (e.type) {
        case 'landing':
          if (e.quality !== 'crash') this.hud.landing(e.quality, e.airtime, (e.rotation * 180) / Math.PI);
          if (e.quality === 'perfect') navigator.vibrate?.(18);
          if (e.quality === 'sloppy') { this.camera.addTrauma(0.35); navigator.vibrate?.(40); }
          break;
        case 'pump':
          this.hud.showPump();
          break;
        case 'crash':
          this.hud.landing('crash', this.bike.airtime, 0);
          this.hud.crashBanner(true, this.bike.checkpointIndex, e.reason);
          this.camera.addTrauma(0.8);
          navigator.vibrate?.([60, 40, 60]);
          this.crashedAt = this.raceTime;
          break;
        case 'respawn':
          this.hud.crashBanner(false);
          this.lostTime += this.raceTime - this.crashedAt;
          break;
        case 'checkpoint':
          this.hud.setCheckpoint(e.index, this.terrain.checkpoints.length - 1);
          break;
      }
    }
  }

  restart(): void {
    this.bike.respawn(0);
    this.bike.events.length = 0;
    this.raceTime = 0;
    this.lostTime = 0;
    this.finished = false;
    this.hud.crashBanner(false);
    this.hud.setCheckpoint(0, this.terrain.checkpoints.length - 1);
    this.camera.snap(this.bike.position);
  }

  private render(dt: number): void {
    const pos = this.bike.position;
    const vel = this.bike.velocity;
    const ground = this.terrain.groundBelow(pos.x);
    this.camera.update(dt, { x: pos.x, y: pos.y + RUT_LIFT }, vel, pos.y - ground);

    const cam = this.camera;
    this.worldLayer.scale.set(cam.scale, -cam.scale);
    this.worldLayer.position.set(
      cam.viewW / 2 - (cam.x + cam.shakeX) * cam.scale,
      cam.viewH / 2 + (cam.y + cam.shakeY) * cam.scale,
    );
    this.backdrop.update(cam);
    this.bikeView.update();
    this.debugDraw.draw(this.world);
    const speed = Math.hypot(vel.x, vel.y);
    this.speedLines.update(dt, speed, this.bike.state === 'riding');

    this.hud.setSpeed(this.bike.state === 'riding' ? speed : 0);
    this.hud.setTime(this.raceTime, this.lostTime);
    this.hud.tick(dt);
  }

  private debugInfo(dt: number, frameMs: number): void {
    const b = this.bike;
    const d = b.debug;
    const deg = (r: number) => `${fmt((r * 180) / Math.PI, 1)}°`;
    const slope = this.terrain.slopeAt(b.frame.getPosition().x);
    this.hud.setDebug([
      { label: 'FPS', value: fmt(1 / Math.max(dt, 1e-3)) },
      { label: 'frame', value: `${fmt(frameMs, 2)} ms` },
      { label: 'estado', value: b.state },
      { label: 'rodas', value: `${b.grounded ? (b.bothWheelsDown ? '2' : '1') : '0'} no chão` },
      { label: 'tempo no ar', value: `${fmt(d.airtime, 2)} s` },
      { label: 'rotação no ar', value: deg(d.rotation) },
      { label: 'ângulo bike', value: deg(b.frame.getAngle()) },
      { label: 'inclinação chão', value: deg(slope) },
      { label: 'último pouso', value: d.lastQuality ? `${d.lastQuality} ${fmt(d.lastAngleDiffDeg, 1)}°` : '—' },
      { label: 'suspensão', value: `${fmt(b.suspension().rear * 100, 1)} / ${fmt(b.suspension().front * 100, 1)} cm` },
      { label: 'velocidade', value: `${fmt(b.speed, 2)} m/s` },
      { label: 'x', value: `${fmt(b.frame.getPosition().x, 1)} m` },
      { label: 'massa', value: `${fmt(b.frame.getMass() + b.rearWheel.getMass() + b.frontWheel.getMass(), 1)} kg` },
    ], frameMs);
  }

  /** Checkpoint flags and the finish gate, in world meters. */
  private buildMarkers(): Graphics {
    const g = new Graphics();
    const post = (x: number, h: number, color: number) => {
      const y = (this.terrain.heightAt(x) ?? 0) + RUT_LIFT + 0.3;
      g.rect(x - 0.04, y, 0.08, h).fill(0x2a2a2a);
      g.poly([x + 0.04, y + h, x + 0.75, y + h - 0.22, x + 0.04, y + h - 0.44]).fill(color);
    };
    this.terrain.checkpoints.slice(1).forEach((x) => post(x, 2.2, 0xf4f1ea));
    // Finish gate: two posts with a checkered banner.
    const fx = this.terrain.finishX;
    const fy = (this.terrain.heightAt(fx) ?? 0) + RUT_LIFT;
    g.rect(fx - 0.1, fy, 0.2, 4.2).fill(0x2a2a2a);
    g.rect(fx + 2.4, fy + 0.5, 0.2, 3.7).fill(0x2a2a2a);
    for (let i = 0; i < 10; i++) for (let j = 0; j < 2; j++) {
      g.rect(fx + i * 0.25, fy + 3.6 + j * 0.3, 0.25, 0.3).fill((i + j) % 2 ? 0x1b1b1b : 0xf4f1ea);
    }
    return g;
  }
}
