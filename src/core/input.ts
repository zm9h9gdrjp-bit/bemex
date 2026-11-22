/**
 * Unified input: keyboard, touch buttons and the standard Gamepad mapping all
 * write into the same action state. Gameplay only reads `Input.held()` /
 * `Input.pressed()`.
 */
export type Action =
  | 'pedal' | 'leanBack' | 'leanForward' | 'jump' | 'pump'
  | 'trick1' | 'trick2' | 'trick3' | 'boost'
  | 'pause' | 'dev' | 'debugDraw' | 'debugInfo' | 'debugSensors' | 'debugSlow' | 'respawn';

/** Keyboard map (update v2): arrows up/down for hop/pump, → / D pedal, A/Q and E/F lean. */
const KEYMAP: Record<string, Action[]> = {
  ArrowRight: ['pedal'], KeyD: ['pedal'],
  KeyA: ['leanBack'], KeyQ: ['leanBack'], ArrowLeft: ['leanBack'],
  KeyE: ['leanForward'], KeyF: ['leanForward'],
  ArrowUp: ['jump'], KeyW: ['jump'],
  ArrowDown: ['pump'], KeyS: ['pump'],
  KeyJ: ['trick1'], KeyK: ['trick2'], KeyL: ['trick3'],
  Space: ['boost'],
  Escape: ['pause'], KeyP: ['pause'],
  Backquote: ['dev'],
  F2: ['debugDraw'], F3: ['debugInfo'], F4: ['debugSensors'], F6: ['debugSlow'],
  KeyR: ['respawn'],
};

class InputState {
  private keys = new Set<Action>();
  private touch = new Set<Action>();
  private pad = new Set<Action>();
  private prev = new Set<Action>();
  private now = new Set<Action>();

  attach(target: Window): void {
    const typing = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
    };
    target.addEventListener('keydown', (e) => {
      if (typing(e)) return; // menus: let text fields receive the keys
      const acts = KEYMAP[e.code];
      if (!acts) return;
      e.preventDefault();
      for (const a of acts) this.keys.add(a);
    });
    target.addEventListener('keyup', (e) => {
      const acts = KEYMAP[e.code];
      if (!acts) return;
      for (const a of acts) this.keys.delete(a);
    });
    target.addEventListener('blur', () => { this.keys.clear(); this.touch.clear(); });
  }

  setTouch(a: Action, down: boolean): void {
    if (down) this.touch.add(a); else this.touch.delete(a);
  }

  /** Call once per rendered frame before gameplay reads input. */
  poll(): void {
    this.pollGamepad();
    this.prev = this.now;
    this.now = new Set([...this.keys, ...this.touch, ...this.pad]);
  }

  held(a: Action): boolean { return this.now.has(a); }
  pressed(a: Action): boolean { return this.now.has(a) && !this.prev.has(a); }

  private pollGamepad(): void {
    this.pad.clear();
    const pads = navigator.getGamepads?.() ?? [];
    for (const gp of pads) {
      if (!gp || gp.mapping !== 'standard') continue;
      const b = (i: number) => gp.buttons[i]?.pressed ?? false;
      const ax = gp.axes[0] ?? 0;
      if (b(7) || b(5)) this.pad.add('pedal');
      if (ax < -0.4 || b(14)) this.pad.add('leanBack');
      if (ax > 0.4 || b(15)) this.pad.add('leanForward');
      if (b(0)) this.pad.add('jump');
      if (b(13) || (gp.axes[1] ?? 0) > 0.5) this.pad.add('pump');
      if (b(2)) this.pad.add('trick1');
      if (b(3)) this.pad.add('trick2');
      if (b(1)) this.pad.add('trick3');
      if (b(6)) this.pad.add('boost');
      if (b(9)) this.pad.add('pause');
    }
  }
}

export const Input = new InputState();
