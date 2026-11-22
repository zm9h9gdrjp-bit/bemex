import { Application, Container, Graphics } from 'pixi.js';
import { World, Vec2 } from 'planck';
import { PHYSICS, CRASH } from '../config/physics';
import { Input } from './input';
import { fmt, fmtTime, t } from './i18n';
import { Save } from './save';
import { Interpolator } from './interp';
import { Terrain } from '../physics/terrain';
import { Bike, NO_CONTROLS, type BikeControls } from '../physics/bike';
import { routeContacts } from '../physics/contacts';
import type { TrackData } from '../levels/types';
import { Camera } from '../render/camera';
import { Backdrop } from '../render/backdrop';
import { TerrainView } from '../render/terrainView';
import { BikeView, RUT_LIFT, GHOST_LOOK } from '../render/bikeView';
import { DebugDraw } from '../render/debugDraw';
import { SpeedLines } from '../render/speedLines';
import { Hud, crashText } from '../ui/hud';
import { TouchControls } from '../ui/touch';
import { MobileChrome } from '../ui/mobile';
import { Menu } from '../ui/menu';
import { GhostRecorder, GhostReplay } from '../ghost/ghost';
import { encodeGhost, decodeGhost, type GhostData } from '../ghost/codec';

/** A friend's run loaded from a challenge link. */
interface Challenge { data: GhostData }

/**
 * One rider on one track, racing the clock and a ghost.
 *
 * Every run (start or restart) builds a fresh physics world, so a run is fully
 * reproducible from its inputs: that is what the input-recorded ghost relies
 * on. The ghost rides in its own world, stepped in lockstep with the player.
 */
export class Game {
  world!: World;
  terrain!: Terrain;
  bike!: Bike;
  private recorder = new GhostRecorder();
  private ghost: GhostReplay | null = null;
  private ownBest: GhostData | null = null;
  private challenge: Challenge | null = null;

  private camera = new Camera();
  private backdrop = new Backdrop();
  private worldLayer = new Container();
  private bikeView!: BikeView;
  private ghostView!: BikeView;
  private debugDraw = new DebugDraw();
  private interp = new Interpolator();
  private speedLines = new SpeedLines();
  private hud: Hud;
  private menu: Menu;

  private accumulator = 0;
  /** Physics steps since the start of the run; race time = steps / stepHz. */
  private steps = 0;
  private lostSteps = 0;
  private crashedAtStep = 0;
  private finished = false;
  /** Simulation speed multiplier (dev slow-mo). */
  timeScale = 1;
  private pauseReasons = new Set<string>();
  private respawnFade = 0;

  constructor(private app: Application, private track: TrackData, hudRoot: HTMLElement) {
    this.hud = new Hud(hudRoot);
    this.hud.onToggle = (k) => this.toggle(k);
    new TouchControls(hudRoot);
    new MobileChrome(hudRoot, (p) => this.setPaused('device', p), () => this.openMenu());
    this.menu = new Menu(hudRoot, {
      resume: () => this.setPaused('menu', false),
      restart: () => this.restart(),
      trackName: () => track.name,
      bestTime: () => Save.data.bestTimes[track.id] ?? null,
      hasGhost: () => !!Save.data.ghosts[track.id],
      challengeLink: (name) => this.challengeLink(name),
      ghostEnabled: () => Save.data.settings.showGhost,
      setGhostEnabled: (on) => { Save.update((d) => { d.settings.showGhost = on; }); this.restart(); },
      deleteBest: () => { Save.update((d) => { delete d.bestTimes[track.id]; delete d.ghosts[track.id]; }); this.ownBest = null; this.restart(); },
      challengeName: () => this.challenge?.data.name ?? null,
      leaveChallenge: () => { this.challenge = null; history.replaceState(null, '', location.pathname + location.search); this.restart(); },
    });

    this.newRun();
    // Render graph: sky/parallax (screen space) → world (meters, y-up) → screen fx.
    this.worldLayer.addChild(new TerrainView(this.terrain), this.buildMarkers());
    this.ghostView = new BikeView(this.bike, this.terrain, this.interp, GHOST_LOOK);
    this.ghostView.ghost = 0.5;
    this.bikeView = new BikeView(this.bike, this.terrain, this.interp);
    this.worldLayer.addChild(this.ghostView, this.bikeView, this.debugDraw);
    app.stage.addChild(this.backdrop, this.worldLayer, this.speedLines);

    this.resize();
    this.app.renderer.on('resize', () => this.resize());
    this.loadGhosts().then(() => this.restart());
    window.addEventListener('hashchange', () => this.loadGhosts().then(() => this.restart()));
    app.ticker.add((tk) => this.frame(tk.deltaMS / 1000));
  }

  // ------------------------------------------------------------------ runs

  /** Fresh world, terrain and bike: identical starting state on every run. */
  private newRun(): void {
    this.world = new World({ gravity: new Vec2(0, PHYSICS.gravity) });
    this.terrain = new Terrain(this.world, this.track);
    this.bike = new Bike(this.world, this.terrain, 0);
    routeContacts(this.world, new Map([[0, this.bike]]));
    this.recorder = new GhostRecorder();
    const source = this.challenge?.data ?? (Save.data.settings.showGhost ? this.ownBest : null);
    this.ghost = source ? new GhostReplay(this.track, source) : null;
    this.steps = this.lostSteps = 0;
    this.finished = false;
    this.accumulator = 0;
    if (this.bikeView) {
      this.bikeView.bike = this.bike;
      this.bikeView.terrain = this.terrain;
      if (this.ghost) { this.ghostView.bike = this.ghost.bike; this.ghostView.terrain = this.ghost.terrain; }
    }
  }

  restart(): void {
    this.newRun();
    this.hud.crashBanner(false);
    this.hud.hideMessage();
    this.hud.setCheckpoint(0, this.terrain.checkpoints.length - 1);
    this.camera.snap(this.bike.position);
    if (this.challenge) {
      const c = this.challenge.data;
      this.hud.message(t('challengeFrom', { n: c.name }), fmtTime(c.finishSteps / PHYSICS.stepHz));
      setTimeout(() => { if (this.steps > 0 && !this.finished && this.bike.state === 'riding') this.hud.hideMessage(); }, 2500);
    }
  }

  /** Own best ghost from the save, and a friend's ghost from the #g= link. */
  private async loadGhosts(): Promise<void> {
    const own = Save.data.ghosts[this.track.id];
    this.ownBest = null;
    if (own) {
      try { this.ownBest = await decodeGhost(own); } catch { /* unreadable: ignore */ }
    }
    const m = /[#&]g=([^&]+)/.exec(location.hash);
    this.challenge = null;
    if (m) {
      try {
        const data = await decodeGhost(decodeURIComponent(m[1]));
        if (data.trackId !== this.track.id) throw new Error('track');
        this.challenge = { data };
      } catch {
        this.hud.message(t('challengeBad'), '');
      }
    }
  }

  private async challengeLink(name: string): Promise<string | null> {
    if (!this.ownBest) return null;
    const code = await encodeGhost({ ...this.ownBest, name });
    return `${location.origin}${location.pathname}#g=${code}`;
  }

  private async onFinish(): Promise<void> {
    const time = this.steps / PHYSICS.stepHz;
    const id = this.track.id;
    const prev = Save.data.bestTimes[id];
    const isBest = prev === undefined || time < prev - 1e-6;
    let sub = prev === undefined ? t('newBest') : isBest ? `${t('newBest')} · −${fmt(prev - time, 2)} s` : `${t('best')} ${fmtTime(prev)} · +${fmt(time - prev, 2)} s`;
    if (this.challenge) {
      const theirs = this.challenge.data.finishSteps / PHYSICS.stepHz;
      const n = this.challenge.data.name;
      sub = time < theirs ? t('challengeWon', { n, d: fmt(theirs - time, 2) }) : t('challengeLost', { n, d: fmt(time - theirs, 2) });
    }
    if (isBest) {
      const data = this.recorder.finish(id, Save.data.playerName);
      this.ownBest = data;
      const code = await encodeGhost(data);
      Save.update((d) => { d.bestTimes[id] = time; d.ghosts[id] = code; });
    }
    this.hud.message(`${t('finish')} ${fmtTime(time)}`, sub, [
      { label: t('restart'), run: () => this.restart() },
      { label: t('challenge'), run: () => this.openMenu('challenge'), accent: true },
    ]);
  }

  // ------------------------------------------------------------------ loop

  private setPaused(reason: string, on: boolean): void {
    if (on) this.pauseReasons.add(reason); else this.pauseReasons.delete(reason);
  }

  private openMenu(view: 'main' | 'challenge' = 'main'): void {
    this.setPaused('menu', true);
    this.menu.open(view);
  }

  private resize(): void {
    const w = this.app.screen.width, h = this.app.screen.height;
    this.camera.resize(w, h);
    this.backdrop.resize(w, h);
    this.speedLines.resize(w, h);
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
    if (Input.pressed('pause')) { if (this.menu.isOpen) this.menu.close(); else this.openMenu(); }
    if (this.pauseReasons.size > 0) { this.accumulator = 0; return; }
    if (Input.pressed('debugDraw')) this.toggle('colliders');
    if (Input.pressed('debugSensors')) this.toggle('sensors');
    if (Input.pressed('debugSlow')) this.toggle('slow');
    if (Input.pressed('debugInfo')) this.hud.toggleDebug();
    if (Input.pressed('respawn')) this.restart();
    // Tap to respawn faster. Recorded so the ghost replays it on the same step.
    if (this.bike.state === 'crashed' && (Input.pressed('jump') || Input.pressed('pedal') || Input.pressed('pump'))) {
      this.bike.skipCrash();
      if (!this.finished) this.recorder.markSkip();
    }

    const dt = Math.min(0.1, realDt) * this.timeScale;
    const step = 1 / PHYSICS.stepHz;
    this.accumulator += dt;
    let n = 0;
    const live = this.controls();
    while (this.accumulator >= step && n < PHYSICS.maxStepsPerFrame) {
      this.interp.snapshot(this.bike.allBodies());
      if (this.ghost) this.interp.snapshot(this.ghost.bike.allBodies());
      // After the finish line the rider brakes and inputs stop being recorded.
      const c = this.finished ? NO_CONTROLS : live;
      if (!this.finished) this.recorder.record(c);
      this.bike.preStep(step, c);
      this.world.step(step, PHYSICS.velocityIterations, PHYSICS.positionIterations);
      this.bike.postStep(step);
      if (!this.finished) {
        this.recorder.keyframe(this.bike);
        this.steps++;
        if (this.bike.state === 'riding' && this.bike.frame.getPosition().x >= this.terrain.finishX) {
          this.finished = true;
          this.bike.brake(true);
          void this.onFinish();
        }
      }
      this.ghost?.advance(step);
      this.accumulator -= step;
      n++;
    }
    if (n === PHYSICS.maxStepsPerFrame) this.accumulator = 0;
    this.interp.alpha = this.accumulator / step;

    this.handleEvents();
    this.render(realDt);
    this.debugInfo(realDt, performance.now() - t0);
  }

  private handleEvents(): void {
    for (const e of this.bike.events.splice(0)) {
      switch (e.type) {
        case 'landing':
          if (e.quality !== 'crash') this.hud.landing(e.quality, e.airtime, (e.rotation * 180) / Math.PI, e.cased);
          if (e.quality === 'perfect') navigator.vibrate?.(18);
          if (e.quality === 'sloppy' || e.cased) { this.camera.addTrauma(e.cased ? 0.5 : 0.35); navigator.vibrate?.(40); }
          break;
        case 'pump':
          this.hud.showPump(e.good);
          break;
        case 'crash':
          this.hud.crashBanner(true, this.bike.checkpointIndex, e.reason);
          this.camera.addTrauma(0.8);
          navigator.vibrate?.([60, 40, 60]);
          this.crashedAtStep = this.steps;
          break;
        case 'respawn':
          this.hud.crashBanner(false);
          this.lostSteps += this.steps - this.crashedAtStep;
          this.camera.snap(this.bike.position);
          break;
        case 'checkpoint':
          this.hud.setCheckpoint(e.index, this.terrain.checkpoints.length - 1);
          break;
      }
    }
  }

  /** Debug toggles shared by keys (F2/F4/F6) and the tappable buttons in the data panel. */
  private toggle(k: 'colliders' | 'sensors' | 'bones' | 'slow'): boolean {
    switch (k) {
      case 'colliders': return (this.debugDraw.enabled = !this.debugDraw.enabled);
      case 'sensors': return (this.debugDraw.sensorsOnly = !this.debugDraw.sensorsOnly);
      case 'bones': return (this.bikeView.showBones = !this.bikeView.showBones);
      case 'slow': this.timeScale = this.timeScale === 1 ? 0.15 : 1; return this.timeScale !== 1;
    }
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
    this.ghostView.visible = !!this.ghost;
    if (this.ghost) {
      this.ghostView.update();
      const gp = this.ghost.bike.position;
      const sx = cam.viewW / 2 + (gp.x - cam.x - cam.shakeX) * cam.scale;
      const sy = cam.viewH / 2 - (gp.y + 1.9 + RUT_LIFT - cam.y - cam.shakeY) * cam.scale;
      const label = this.challenge ? this.challenge.data.name : t('ghostYou');
      const onScreen = sx > -40 && sx < cam.viewW + 40;
      this.hud.setGhostTag(onScreen ? label : null, sx, sy);
      this.hud.setGap(this.finished ? null : this.bike.frame.getPosition().x - this.ghost.bike.frame.getPosition().x);
    } else {
      this.hud.setGhostTag(null);
      this.hud.setGap(null);
    }
    this.debugDraw.draw(this.world, RUT_LIFT);

    // Fade out just before the respawn and back in right after it.
    const b = this.bike;
    const fadeOut = b.state === 'crashed' ? Math.max(0, (b.crashTimer - (CRASH.respawnDelay - CRASH.fadeTime)) / CRASH.fadeTime) : 0;
    this.respawnFade = b.state === 'crashed' ? fadeOut : Math.max(0, this.respawnFade - dt / CRASH.fadeTime);
    this.hud.setFade(this.respawnFade * 0.85);
    this.hud.setManual(b.state === 'riding' ? b.manual : null);
    const speed = Math.hypot(vel.x, vel.y);
    this.speedLines.update(dt, speed, this.bike.state === 'riding');

    this.hud.setSpeed(this.bike.state === 'riding' ? speed : 0);
    this.hud.setTime(this.steps / PHYSICS.stepHz, this.lostSteps / PHYSICS.stepHz, this.bike.crashes);
    this.hud.tick(dt);
  }

  private debugInfo(dt: number, frameMs: number): void {
    const b = this.bike;
    const d = b.debug;
    const deg = (r: number) => `${fmt((r * 180) / Math.PI, 1)}°`;
    const slope = this.terrain.slopeAt(b.frame.getPosition().x);
    const susp = b.suspension();
    const mass = b.allBodies().reduce((m, body) => m + body.getMass(), 0);
    this.hud.setDebug([
      { label: 'FPS', value: fmt(1 / Math.max(dt, 1e-3)) },
      { label: 'frame', value: `${fmt(frameMs, 2)} ms` },
      { label: 'estado', value: b.manual ? `${b.state} · ${b.manual.wheel === 'rear' ? 'manual' : 'nose'}` : b.state },
      { label: 'rodas', value: `${b.grounded ? (b.bothWheelsDown ? '2' : '1') : '0'} no chão` },
      { label: 'tempo no ar', value: `${fmt(d.airtime, 2)} s` },
      { label: 'rotação no ar', value: deg(d.rotation) },
      { label: 'ângulo bike − chão', value: deg(b.frame.getAngle() - slope) },
      { label: 'último pouso', value: d.lastQuality ? `${d.lastQuality} ${fmt(d.lastAngleDiffDeg, 1)}°` : '—' },
      { label: 'último impacto', value: `${fmt(d.lastImpact, 1)} m/s` },
      { label: 'última queda', value: d.lastCrash ? crashText(d.lastCrash) : '—' },
      { label: 'pneus / pernas', value: `${fmt(-susp.rear * 100, 1)} / ${fmt(-susp.front * 100, 1)} · ${fmt(b.limbCompression(), 1)} cm` },
      { label: 'velocidade', value: `${fmt(b.speed, 2)} m/s` },
      { label: 'massa total', value: `${fmt(mass, 1)} kg` },
      { label: 'fantasma', value: this.ghost ? `${this.ghost.data.inputs.length} passos · ressinc. ${this.ghost.resyncs}` : '—' },
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
