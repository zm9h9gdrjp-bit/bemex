import { t, fmt, fmtTime, type StringKey } from '../core/i18n';
import type { LandingQuality } from '../physics/landing';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

export interface DebugRow { label: string; value: string }

/** In-race HUD (milestone 1 subset): speed, checkpoint, timer, landing call-outs, crash banner, debug. */
export class Hud {
  private speed = el('span', 'hud-speed num', '0');
  private cp = el('span', 'hud-cp num');
  private time = el('div', 'hud-time num');
  private pop = el('div', 'hud-pop');
  private popBig = el('div', 'big');
  private popSmall = el('div', 'small num');
  private pump = el('div', 'hud-pump', t('pump'));
  private banner = el('div', 'hud-banner');
  private bannerText = el('span', 'num');
  private bannerWhy = el('span', 'why');
  private debug = el('div', 'hud-debug');
  private debugList = el('dl');
  private graph = el('canvas');
  private frameTimes: number[] = [];
  private popTimer = 0;
  private pumpTimer = 0;

  constructor(root: HTMLElement) {
    const tl = el('div', 'hud-tl');
    tl.append(this.speed, el('span', 'hud-unit', t('speedUnit')), this.cp);
    this.pop.append(this.popBig, this.popSmall);
    const b = el('div');
    b.append(this.bannerText, this.bannerWhy);
    this.banner.append(b);
    this.graph.width = 400; this.graph.height = 72;
    this.debug.append(this.debugList, this.graph);

    const help = el('div', 'hud-help');
    const item = (keys: string[], key: StringKey) => {
      const s = el('span');
      s.innerHTML = keys.map((k) => `<kbd>${k}</kbd>`).join('') + t(key);
      help.append(s);
    };
    item(['→'], 'helpPedal');
    item(['←', '→'], 'helpLean');
    item(['↑'], 'helpHop');
    item(['↓'], 'helpPump');
    item(['F2'], 'helpDebug');
    item(['F3'], 'helpInfo');
    item(['R'], 'helpRestart');

    root.append(tl, this.time, this.pop, this.pump, this.banner, this.debug, help);
  }

  setSpeed(ms: number): void { this.speed.textContent = fmt(ms * 3.6); }

  setCheckpoint(i: number, total: number): void {
    this.cp.innerHTML = `${t('checkpoint')} <b>${i}</b>/${total}`;
  }

  setTime(seconds: number, lost: number): void {
    this.time.innerHTML = fmtTime(seconds) + (lost > 0 ? `<small>+${fmt(lost, 1)} s ${t('lostTime')}</small>` : '');
  }

  landing(q: LandingQuality, airtime: number, rotationDeg: number): void {
    this.pop.className = `hud-pop show ${q}`;
    this.popBig.textContent = t(q);
    const rot = Math.abs(rotationDeg) >= 300 ? ` · ${fmt(Math.abs(rotationDeg))}°` : '';
    this.popSmall.textContent = `${t('air')} ${fmt(airtime, 2)} s${rot}`;
    this.popTimer = q === 'perfect' ? 1.1 : 0.8;
  }

  showPump(): void {
    this.pump.classList.add('show');
    this.pumpTimer = 0.5;
  }

  crashBanner(show: boolean, checkpoint = 0, reason: 'landing' | 'head' | 'pit' = 'landing'): void {
    this.banner.classList.toggle('show', show);
    if (show) {
      this.bannerText.textContent = checkpoint === 0 ? t('respawnStart') : t('respawnIn', { n: checkpoint });
      this.bannerWhy.textContent = t(reason === 'pit' ? 'crashPit' : reason === 'head' ? 'crashHead' : 'crashLanding');
    }
  }

  /** Generic centred message (finish time etc.). */
  message(main: string, sub: string): void {
    this.banner.classList.add('show');
    this.bannerText.textContent = main;
    this.bannerWhy.textContent = sub;
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
    // 16.7 ms budget line.
    const y60 = H - (16.7 / 40) * H;
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath(); ctx.moveTo(0, y60); ctx.lineTo(W, y60); ctx.stroke();
    ctx.fillStyle = '#b9b4aa';
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
