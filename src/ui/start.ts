import { t, fmt, fmtTime } from '../core/i18n';
import { Save } from '../core/save';
import { Wallet } from '../economy/wallet';
import { ICON } from './menu';
import type { TrackData } from '../levels/types';

/** Track profile as an SVG polyline (gaps left open), for the overview thumbnails. */
function profile(tr: TrackData): string {
  const ys = tr.sections.flatMap((s) => s.points.map((p) => p[1]));
  const x0 = tr.startX - 10, x1 = tr.finishX + 10;
  const yMin = Math.min(...ys, 0), yMax = Math.min(Math.max(...ys), 8);
  const W = 240, H = 56, pad = 6;
  const sx = (x: number) => ((x - x0) / (x1 - x0)) * W;
  const sy = (y: number) => H - pad - ((Math.min(y, yMax) - yMin) / (yMax - yMin || 1)) * (H - pad * 2);
  const lines = tr.sections.map((s) => {
    const pts = s.points.filter(([x]) => x >= x0 - 5 && x <= x1 + 5).map(([x, y]) => `${sx(x).toFixed(1)},${sy(y).toFixed(1)}`);
    return `<polyline points="${pts.join(' ')}"/>`;
  }).join('');
  const fx = sx(tr.finishX).toFixed(1);
  return `<svg viewBox="0 0 ${W} ${H}" class="profile" preserveAspectRatio="none">${lines}<line class="fin" x1="${fx}" y1="4" x2="${fx}" y2="${H - 4}"/></svg>`;
}

/**
 * Start screen: the track list with an overview of each (profile, length,
 * number of gaps, best time). Tap a track to race it.
 */
export class StartScreen {
  private root = document.createElement('div');

  constructor(parent: HTMLElement, private onPick: (id: string) => void) {
    this.root.className = 'start scroll';
    parent.append(this.root);
  }

  show(tracks: TrackData[]): void {
    const rows = tracks.map((tr) => {
      const best = Save.data.bestTimes[tr.id];
      const len = Math.round(tr.finishX - tr.startX);
      const gaps = tr.sections.length - 1;
      return `<button type="button" class="track" data-id="${tr.id}">
        ${profile(tr)}
        <span class="info">
          <b>${tr.name}</b>
          <small class="num">${t('length', { m: fmt(len) })} · ${gaps === 0 ? t('noGaps') : gaps === 1 ? t('gap1') : t('gaps', { n: gaps })}</small>
        </span>
        <span class="best num">${best ? `<small>${t('best')}</small>${fmtTime(best)}` : `<small>${t('noBest')}</small>`}</span>
      </button>`;
    }).join('');
    this.root.innerHTML = `
      <header>
        <h1>Trick Riders</h1>
        <span class="cur">${ICON.coin}<b class="num">${fmt(Wallet.get('coins'))}</b></span>
        <span class="cur">${ICON.gem}<b class="num">${fmt(Wallet.get('gems'))}</b></span>
      </header>
      <h2>${t('chooseTrack')}</h2>
      <div class="tracks">${rows}</div>`;
    this.root.querySelectorAll<HTMLButtonElement>('.track').forEach((b) => {
      b.addEventListener('click', () => this.onPick(b.dataset.id!));
    });
    this.root.classList.add('open');
  }

  hide(): void { this.root.classList.remove('open'); }
}
