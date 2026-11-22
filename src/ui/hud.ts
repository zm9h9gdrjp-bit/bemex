import { t, fmt, fmtTime, type StringKey } from '../core/i18n';
import type { LandingQuality } from '../physics/landing';
import type { CrashReason, ManualState } from '../physics/bike';
import { LANDING, MANUAL } from '../config/physics';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

export interface DebugRow { label: string; value: string }
export type DebugToggle = 'colliders' | 'sensors' | 'bones' | 'slow';

/** Human-readable crash cause, in the current language, with the numbers that caused it. */
export function crashText(r: CrashReason): string {
  switch (r.kind) {
    case 'pit': return t('crashPit');
    case 'body': return t(`part_${r.part}` as StringKey);
    case 'tipBack': return t('crashTipBack', { a: fmt(r.angleDeg) });
    case 'tipForward': return t('crashTipForward', { a: fmt(Math.abs(r.angleDeg)) });
    case 'landing':
      if (r.cause === 'impact') return t('crashImpact', { v: fmt(r.impact, 1), max: fmt(LANDING.crashImpactVelocity) });
      if (r.cause === 'overRotated') return t('crashAngle', { a: fmt(Math.abs(r.angleDeg)), max: fmt(LANDING.maxLandingAngle) });
      return t('crashMidTrick');
  }
}

/** In-race HUD: speed, checkpoint, timer, crashes, landing call-outs, manual balance, crash banner, debug. */
export class Hud {
  private speed = el('span', 'hud-speed num', '0');
  private cp = el('span', 'hud-cp num');
  private time = el('div', 'hud-time num');
  private pop = el('div', 'hud-pop');
  private popBig = el('div', 'big');
  private popSmall = el('div', 'small num');
  private pump = el('div', 'hud-pump');
  private banner = el('div', 'hud-banner');
  private bannerText = el('span', 'num');
  private bannerWhy = el('span', 'why num');
  private bannerHint = el('span', 'hint');
  private fade = el('div', 'hud-fade');
  private meter = el('div', 'hud-meter');
  private needle = el('i');
  private debug = el('div', 'hud-debug');
  private debugList = el('dl');
  private graph = el('canvas');
  private frameTimes: number[] = [];
  private popTimer = 0;
  private pumpTimer = 0;
  private crashes = 0;
  private lost = 0;
  /** Called when a debug toggle button is tapped. */
  onToggle: (k: DebugToggle) => boolean = () => false;

  constructor(root: HTMLElement) {
    const tl = el('div', 'hud-tl');
    tl.append(this.speed, el('span', 'hud-unit', t('speedUnit')), this.cp);
    this.pop.append(this.popBig, this.popSmall);
    const b = el('div');
    b.append(this.bannerText, this.bannerWhy, this.bannerHint);
    this.banner.append(b);

    // Manual balance: an arc from 0° (both wheels) to the tip-over angle, with the balance point marked.
    this.meter.innerHTML = `<svg viewBox="0 0 120 64" aria-hidden="true">
      <path class="track" d="M10 58 A50 50 0 0 1 110 58"/>
      <path class="danger" d="M95.4 22.6 A50 50 0 0 1 110 58"/>
    </svg><b class="sweet"></b>`;
    this.meter.append(this.needle);

    this.graph.width = 400; this.graph.height = 72;
    const toggles = el('div', 'dbg-toggles');
    const mk = (k: DebugToggle, label: StringKey) => {
      const btn = el('button', '', t(label));
      btn.type = 'button';
      btn.addEventListener('pointerdown', (e) => { e.preventDefault(); btn.classList.toggle('on', this.onToggle(k)); });
      toggles.append(btn);
    };
    mk('colliders', 'dbgColliders');
    mk('sensors', 'dbgSensors');
    mk('bones', 'dbgBones');
    mk('slow', 'dbgSlow');
    this.debug.append(toggles, this.debugList, this.graph);

    const help = el('div', 'hud-help');
    const item = (keys: string[], key: StringKey) => {
      const s = el('span');
      s.innerHTML = keys.map((k) => `<kbd>${k}</kbd>`).join('') + t(key);
      help.append(s);
    };
    item(['→', 'D'], 'helpPedal');
    item(['A', 'Q'], 'helpLeanBack');
    item(['E', 'F'], 'helpLeanFwd');
    item(['↑'], 'helpHop');
    item(['↓'], 'helpPump');
    item(['F2'], 'helpDebug');
    item(['F3'], 'helpInfo');
    item(['F4'], 'helpSensors');
    item(['F6'], 'helpSlow');
    item(['R'], 'helpRestart');

    root.append(this.fade, tl, this.time, this.meter, this.pop, this.pump, this.banner, this.debug, help);
  }

  setSpeed(ms: number): void { this.speed.textContent = fmt(ms * 3.6); }

  setCheckpoint(i: number, total: number): void {
    this.cp.innerHTML = `${t('checkpoint')} <b>${i}</b>/${total}`;
  }

  setTime(seconds: number, lost: number, crashes: number): void {
    if (lost === this.lost && crashes === this.crashes && this.time.firstChild) {
      (this.time.firstChild as Text).textContent = fmtTime(seconds);
      return;
    }
    this.lost = lost; this.crashes = crashes;
    const extra = crashes > 0 ? `<small>${t('crashes')} ${crashes} · +${fmt(lost, 1)} s</small>` : '';
    this.time.innerHTML = fmtTime(seconds) + extra;
  }

  landing(q: LandingQuality, airtime: number, rotationDeg: number, cased = false): void {
    this.pop.className = `hud-pop show ${q}`;
    this.popBig.textContent = t(q);
    const rot = Math.abs(rotationDeg) >= 300 ? ` · ${fmt(Math.abs(rotationDeg))}°` : '';
    this.popSmall.textContent = `${t('air')} ${fmt(airtime, 2)} s${rot}${cased ? ` · ${t('cased')}` : ''}`;
    this.popTimer = q === 'perfect' ? 1.1 : 0.8;
  }

  showPump(good: boolean): void {
    this.pump.textContent = t(good ? 'pump' : 'pumpBad');
    this.pump.className = `hud-pump show${good ? '' : ' bad'}`;
    this.pumpTimer = 0.5;
  }

  /** Manual balance meter: visible while riding on one wheel. */
  setManual(m: ManualState | null): void {
    this.meter.classList.toggle('show', !!m);
    if (!m) return;
    const tip = m.wheel === 'rear' ? MANUAL.wheelieTipAngle : MANUAL.noseTipAngle;
    const balance = m.wheel === 'rear' ? MANUAL.wheelieBalanceAngle : MANUAL.noseBalanceAngle;
    const k = Math.min(1, Math.abs(m.angleDeg) / tip);
    // Needle sweeps 180° (left = both wheels, right = tip-over).
    this.needle.style.transform = `rotate(${-90 + k * 180}deg)`;
    this.meter.style.setProperty('--sweet', `${-90 + (balance / tip) * 180}deg`);
    this.meter.classList.toggle('nose', m.wheel === 'front');
  }

  crashBanner(show: boolean, checkpoint = 0, reason?: CrashReason): void {
    this.banner.classList.toggle('show', show);
    if (show) {
      this.bannerText.textContent = checkpoint === 0 ? t('respawnStart') : t('respawnIn', { n: checkpoint });
      this.bannerWhy.textContent = reason ? crashText(reason) : '';
      this.bannerHint.textContent = t('tapRespawn');
    }
  }

  /** 0 → 1 black fade used around respawns. */
  setFade(a: number): void { this.fade.style.opacity = String(Math.max(0, Math.min(1, a))); }

  /** Generic centred message (finish time etc.). */
  message(main: string, sub: string): void {
    this.banner.classList.add('show');
    this.bannerText.textContent = main;
    this.bannerWhy.textContent = sub;
    this.bannerHint.textContent = '';
  }

  toggleDebug(): boolean { return this.debug.classList.toggle('show'); }

  setDebug(rows: DebugRow[], frameMs: number): void {
    if (!this.debug.classList.contains('show')) return;
    this.debugList.innerHTML = rows.map((r) => `<dt>${r.label}</dt><dd>${r.value}</dd>`).join('');
    this.frameTimes.push(frameMs);
    if (this.frameTimes.length > 100) this.frameTimes.shift();
    const ctx = this.graph.getContext('2d')!;
    const W = this.graph.width, H = this.graph.height;
    ctx.clearRect(0, 0, W, H);
    const y60 = H - (16.7 / 40) * H;
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath(); ctx.moveTo(0, y60); ctx.lineTo(W, y60); ctx.stroke();
    const bw = W / 100;
    this.frameTimes.forEach((ms, i) => {
      const h = Math.min(H, (ms / 40) * H);
      ctx.fillStyle = ms > 20 ? '#ff6a55' : '#b9b4aa';
      ctx.fillRect(i * bw, H - h, bw - 1, h);
    });
  }

  tick(dt: number): void {
    if (this.popTimer > 0 && (this.popTimer -= dt) <= 0) this.pop.classList.remove('show');
    if (this.pumpTimer > 0 && (this.pumpTimer -= dt) <= 0) this.pump.classList.remove('show');
  }
}
