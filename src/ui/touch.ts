import { Input, type Action } from '../core/input';
import { t, type StringKey } from '../core/i18n';

/** One stroke icon set (24px grid, 2.4 stroke), used only where a label alone is slower to read. */
const ICON = {
  // Curved arrows: rotate back (counter-clockwise) / forward (clockwise).
  back: '<svg viewBox="0 0 24 24"><path d="M5 13a7 7 0 1 0 3-5.7"/><path d="M7 3v5h5"/></svg>',
  fwd: '<svg viewBox="0 0 24 24" style="transform:scaleX(-1)"><path d="M5 13a7 7 0 1 0 3-5.7"/><path d="M7 3v5h5"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="M5 15l7-7 7 7"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M5 9l7 7 7-7"/></svg>',
};

interface Btn { cls: string; action: Action; label: StringKey; icon?: string }

/**
 * Layout (update v2):
 * left thumb  — pedal at the bottom, lean back / lean forward right above it;
 * right thumb — big round up (hop) and down (pump) arrows.
 */
const LAYOUT: Btn[] = [
  { cls: 'pedal', action: 'pedal', label: 'touchPedal' },
  { cls: 'lean-back', action: 'leanBack', label: 'touchBack', icon: ICON.back },
  { cls: 'lean-fwd', action: 'leanForward', label: 'touchFwd', icon: ICON.fwd },
  { cls: 'jump', action: 'jump', label: 'touchJump', icon: ICON.up },
  { cls: 'pump', action: 'pump', label: 'touchPump', icon: ICON.down },
];

/**
 * Multi-touch buttons. Every finger is hit-tested on each move, so a thumb can
 * slide from Pedal onto a lean button (and back) without lifting, and two
 * fingers can hold different buttons. Shown automatically on touch devices.
 */
export class TouchControls {
  readonly root = document.createElement('div');
  private buttons: { el: HTMLElement; action: Action }[] = [];
  private fingers = new Map<number, Action | null>();

  constructor(parent: HTMLElement) {
    this.root.className = 'touch';
    for (const b of LAYOUT) {
      const e = document.createElement('div');
      e.className = `tbtn ${b.cls}`;
      e.innerHTML = (b.icon ?? '') + `<span>${t(b.label)}</span>`;
      this.root.append(e);
      this.buttons.push({ el: e, action: b.action });
    }
    parent.append(this.root);

    const hit = (x: number, y: number): Action | null => {
      for (const b of this.buttons) {
        const r = b.el.getBoundingClientRect();
        // 10 px slop so a thumb on the edge still counts.
        if (x >= r.left - 10 && x <= r.right + 10 && y >= r.top - 10 && y <= r.bottom + 10) return b.action;
      }
      return null;
    };
    const update = (id: number, a: Action | null) => {
      this.fingers.set(id, a);
      this.sync();
    };
    window.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' || !this.root.classList.contains('on')) return;
      const a = hit(e.clientX, e.clientY);
      if (a) { e.preventDefault(); update(e.pointerId, a); }
    }, { passive: false });
    window.addEventListener('pointermove', (e) => {
      if (!this.fingers.has(e.pointerId)) return;
      update(e.pointerId, hit(e.clientX, e.clientY));
    });
    const end = (e: PointerEvent) => { if (this.fingers.delete(e.pointerId)) this.sync(); };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);

    const coarse = window.matchMedia('(pointer: coarse)');
    const apply = () => this.root.classList.toggle('on', coarse.matches);
    apply();
    coarse.addEventListener('change', apply);
    window.addEventListener('touchstart', () => this.root.classList.add('on'), { once: true });
  }

  private sync(): void {
    const held = new Set(this.fingers.values());
    for (const b of this.buttons) {
      const down = held.has(b.action);
      b.el.classList.toggle('down', down);
      Input.setTouch(b.action, down);
    }
  }
}
