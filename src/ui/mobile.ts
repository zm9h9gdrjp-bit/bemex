import { Input } from '../core/input';
import { t } from '../core/i18n';

/**
 * Phone-specific chrome (iPhone first):
 * - rotate prompt in portrait, which also pauses the race
 * - restart / data buttons, since there is no keyboard for R and F3
 * - blocks Safari pinch-zoom, double-tap zoom and long-press menus
 */
export class MobileChrome {
  private rotate = document.createElement('div');
  private bar = document.createElement('div');

  constructor(root: HTMLElement, onPauseChange: (paused: boolean) => void, onMenu: () => void) {
    this.rotate.className = 'rotate';
    this.rotate.innerHTML = `
      <svg viewBox="0 0 48 48" aria-hidden="true"><rect x="15" y="6" width="18" height="30" rx="3"/><path d="M8 34a16 16 0 0 0 22 8"/><path d="M26 38l4 4-5 2"/></svg>
      <b>${t('rotate')}</b><span>${t('rotateSub')}</span>`;
    root.append(this.rotate);

    this.bar.className = 'mbar';
    const btn = (label: string, icon: string, onTap: () => void) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = `${icon}<span>${label}</span>`;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); onTap(); });
      this.bar.append(b);
    };
    const pulse = (a: 'respawn' | 'debugInfo') => {
      Input.setTouch(a, true);
      setTimeout(() => Input.setTouch(a, false), 80);
    };
    btn(t('data'), '<svg viewBox="0 0 24 24"><path d="M5 19V11M12 19V5M19 19v-6"/></svg>', () => pulse('debugInfo'));
    btn(t('restart'), '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v5h5"/></svg>', () => pulse('respawn'));
    btn(t('menu'), '<svg viewBox="0 0 24 24"><path d="M5 7h14M5 12h14M5 17h14"/></svg>', onMenu);
    root.append(this.bar);

    const portrait = window.matchMedia('(orientation: portrait) and (pointer: coarse)');
    let hidden = false;
    const apply = () => {
      this.rotate.classList.toggle('show', portrait.matches);
      onPauseChange(portrait.matches || hidden);
    };
    portrait.addEventListener('change', apply);
    document.addEventListener('visibilitychange', () => { hidden = document.hidden; apply(); });
    apply();

    // Safari ignores user-scalable=no; these stop pinch and double-tap zoom.
    const stop = (e: Event) => e.preventDefault();
    document.addEventListener('gesturestart', stop, { passive: false });
    document.addEventListener('gesturechange', stop, { passive: false });
    document.addEventListener('dblclick', stop, { passive: false });
    document.addEventListener('contextmenu', stop);
    // Block page bounce, but let scrollable panels (menu, track list) scroll.
    document.addEventListener('touchmove', (e) => {
      if ((e.target as HTMLElement | null)?.closest?.('.scroll')) return;
      e.preventDefault();
    }, { passive: false });
  }
}
