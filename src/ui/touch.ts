import { Input, type Action } from '../core/input';
import { t, type StringKey } from '../core/i18n';

/** One stroke icon set (24px grid, 2.4 stroke), used only where a label alone is slower to read. */
const ICON = {
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  fwd: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="M5 15l7-7 7 7"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M5 9l7 7 7-7"/></svg>',
};

interface Btn { cls: string; action: Action; label: StringKey; icon?: string }

const LAYOUT: Btn[] = [
  { cls: 'lean-back', action: 'leanBack', label: 'touchBack', icon: ICON.back },
  { cls: 'lean-fwd', action: 'leanForward', label: 'touchFwd', icon: ICON.fwd },
  { cls: 'pedal', action: 'pedal', label: 'touchPedal' },
  { cls: 'jump', action: 'jump', label: 'touchJump', icon: ICON.up },
  { cls: 'pump', action: 'pump', label: 'touchPump', icon: ICON.down },
];

/**
 * Multi-touch buttons. Each pointer is tracked independently so the thumbs can
 * hold lean and pedal at the same time. Shown automatically on touch devices.
 */
export class TouchControls {
  readonly root = document.createElement('div');

  constructor(parent: HTMLElement) {
    this.root.className = 'touch';
    for (const b of LAYOUT) {
      const e = document.createElement('div');
      e.className = `tbtn ${b.cls}`;
      e.innerHTML = (b.icon ?? '') + `<span>${t(b.label)}</span>`;
      const down = (ev: PointerEvent) => {
        ev.preventDefault();
        e.setPointerCapture(ev.pointerId);
        e.classList.add('down');
        Input.setTouch(b.action, true);
      };
      const up = () => { e.classList.remove('down'); Input.setTouch(b.action, false); };
      e.addEventListener('pointerdown', down);
      e.addEventListener('pointerup', up);
      e.addEventListener('pointercancel', up);
      e.addEventListener('lostpointercapture', up);
      this.root.append(e);
    }
    parent.append(this.root);
    const coarse = window.matchMedia('(pointer: coarse)');
    const apply = () => this.root.classList.toggle('on', coarse.matches);
    apply();
    coarse.addEventListener('change', apply);
    window.addEventListener('touchstart', () => this.root.classList.add('on'), { once: true });
  }
}
