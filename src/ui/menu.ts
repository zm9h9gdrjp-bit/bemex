import { t, fmt, fmtTime, getLang } from '../core/i18n';
import { Save } from '../core/save';
import { Wallet, type Currency } from '../economy/wallet';
import { DEV } from '../config/dev';

/** Same stroke icon set as the touch controls (24 grid, 2.2 stroke). */
export const ICON = {
  coin: '<svg viewBox="0 0 24 24" class="ico"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v9M9.5 9.5h3.75a1.75 1.75 0 0 1 0 3.5h-2.5a1.75 1.75 0 0 0 0 3.5H14.5"/></svg>',
  gem: '<svg viewBox="0 0 24 24" class="ico"><path d="M7 4h10l4 5-9 11L3 9z"/><path d="M3 9h18M9.5 4 8 9l4 11 4-11-1.5-5"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" class="ico chev"><path d="M9 6l6 6-6 6"/></svg>',
};

export interface MenuHooks {
  resume(): void;
  restart(): void;
  trackName(): string;
  bestTime(): number | null;
  hasGhost(): boolean;
  /** Builds the challenge link for the best run; returns null if there is none. */
  challengeLink(name: string): Promise<string | null>;
  ghostEnabled(): boolean;
  setGhostEnabled(on: boolean): void;
  deleteBest(): void;
  /** Name of the friend whose challenge is loaded, if any. */
  challengeName(): string | null;
  leaveChallenge(): void;
  /** Back to the track list. */
  tracks(): void;
}

type View = 'main' | 'challenge' | 'progress' | 'pin' | 'admin';

const ADMIN_KEY = 'trickriders.admin';

/**
 * Pause menu. One sheet, several views. Everything here is plain DOM so it
 * stays crisp, accessible and cheap on phones.
 */
export class Menu {
  private root = document.createElement('div');
  private sheet = document.createElement('div');
  private view: View = 'main';
  private offUpdate: (() => void) | null = null;
  isOpen = false;

  constructor(parent: HTMLElement, private hooks: MenuHooks) {
    this.root.className = 'menu';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.sheet.className = 'sheet scroll';
    this.root.append(this.sheet);
    this.root.addEventListener('pointerdown', (e) => { if (e.target === this.root) this.close(); });
    parent.append(this.root);
  }

  open(view: View = 'main'): void {
    this.isOpen = true;
    this.root.classList.add('open');
    this.offUpdate?.();
    this.offUpdate = Save.onChange(() => { if (this.view === 'main' || this.view === 'admin') this.render(); });
    this.go(view);
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.classList.remove('open');
    this.offUpdate?.();
    this.offUpdate = null;
    this.hooks.resume();
  }

  private go(v: View): void {
    if ((v === 'admin') && !this.adminUnlocked()) v = 'pin';
    this.view = v;
    this.render();
  }

  private adminUnlocked(): boolean {
    try { return sessionStorage.getItem(ADMIN_KEY) === '1'; } catch { return false; }
  }

  private render(): void {
    const s = this.sheet;
    s.innerHTML = '';
    s.append(this.walletBar());
    switch (this.view) {
      case 'main': this.renderMain(s); break;
      case 'challenge': this.renderChallenge(s); break;
      case 'progress': this.renderProgress(s); break;
      case 'pin': this.renderPin(s); break;
      case 'admin': this.renderAdmin(s); break;
    }
  }

  // ------------------------------------------------------------------ pieces

  private walletBar(): HTMLElement {
    const bar = el('div', 'wallet');
    bar.innerHTML = `
      <span class="cur">${ICON.coin}<b class="num">${fmt(Wallet.get('coins'))}</b><small>${t('coins')}</small></span>
      <span class="cur">${ICON.gem}<b class="num">${fmt(Wallet.get('gems'))}</b><small>${t('gems')}</small></span>`;
    const x = button('', () => this.close(), 'icon-btn');
    x.setAttribute('aria-label', t('close'));
    x.innerHTML = '<svg viewBox="0 0 24 24" class="ico"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    bar.append(x);
    return bar;
  }

  private header(title: string, back = true): HTMLElement {
    const h = el('div', 'head');
    if (back) {
      const b = button('', () => this.go('main'), 'icon-btn');
      b.setAttribute('aria-label', t('back'));
      b.innerHTML = '<svg viewBox="0 0 24 24" class="ico"><path d="M15 6l-6 6 6 6"/></svg>';
      h.append(b);
    }
    h.append(el('h2', '', title));
    return h;
  }

  private renderMain(s: HTMLElement): void {
    s.append(this.header(t('paused'), false));
    const main = el('div', 'primary');
    main.append(button(t('resume'), () => this.close(), 'btn accent'), button(t('restart'), () => { this.hooks.restart(); this.close(); }, 'btn'));
    s.append(main);

    const list = el('div', 'list');
    const best = this.hooks.bestTime();
    const friend = this.hooks.challengeName();
    list.append(row(t('tracks'), this.hooks.trackName(), () => this.hooks.tracks()));
    list.append(row(t('challenge'), best ? `${t('best')} ${fmtTime(best)}` : t('ghostNone'), () => this.go('challenge'), !best));
    if (friend) list.append(row(t('challengeEnd'), t('challengeFrom', { n: friend }), () => { this.hooks.leaveChallenge(); this.close(); }));
    list.append(toggleRow(t('ghostOn'), this.hooks.ghostEnabled(), (on) => this.hooks.setGhostEnabled(on)));
    list.append(row(t('progress'), t('lastSaved', { d: when(Save.data.savedAt) }), () => this.go('progress')));
    list.append(row(t('admin'), '', () => this.go('admin')));
    s.append(list);
    s.append(el('p', 'foot', `${this.hooks.trackName()}`));
  }

  private renderChallenge(s: HTMLElement): void {
    s.append(this.header(t('challenge')));
    const best = this.hooks.bestTime();
    const body = el('div', 'body');
    body.append(el('p', 'big num', best ? fmtTime(best) : '—'));
    body.append(el('p', 'muted', t('challengeHint')));
    const label = el('label', 'field');
    label.append(el('span', '', t('yourName')));
    const input = document.createElement('input');
    input.maxLength = 20;
    input.setAttribute('autocomplete', 'nickname');
    input.value = Save.data.playerName;
    label.append(input);
    body.append(label);
    const status = el('p', 'status');
    const send = button(t('share'), async () => {
      const name = input.value.trim().slice(0, 20);
      Save.update((d) => { d.playerName = name; });
      const link = await this.hooks.challengeLink(name || '—');
      if (!link) return;
      try {
        if (navigator.share) { await navigator.share({ title: 'Trick Riders', text: t('challengeHint'), url: link }); return; }
      } catch { /* cancelled: fall back to copying */ }
      try { await navigator.clipboard.writeText(link); status.textContent = t('copied'); }
      catch { status.textContent = link; }
    }, 'btn accent');
    if (!this.hooks.hasGhost()) send.setAttribute('disabled', '');
    body.append(send, status);
    s.append(body);
  }

  private renderProgress(s: HTMLElement): void {
    s.append(this.header(t('progress')));
    const body = el('div', 'body');
    body.append(el('p', 'muted', t('backupHint')));
    const code = Save.exportCode();
    const out = document.createElement('textarea');
    out.readOnly = true;
    out.rows = 3;
    out.value = code;
    out.className = 'code';
    const status = el('p', 'status');
    const row1 = el('div', 'row-btns');
    row1.append(
      button(t('copyCode'), async () => {
        try { await navigator.clipboard.writeText(code); status.textContent = t('copied'); }
        catch { out.select(); }
      }, 'btn'),
      button(t('downloadFile'), () => {
        const blob = new Blob([code], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `trick-riders-${new Date().toISOString().slice(0, 10)}.txt`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      }, 'btn'),
    );
    body.append(out, row1);

    body.append(el('h3', '', t('importLabel')));
    const inp = document.createElement('textarea');
    inp.rows = 3;
    inp.className = 'code';
    inp.placeholder = 'TR1.…';
    const file = document.createElement('input');
    file.type = 'file';
    file.accept = '.txt,text/plain';
    file.hidden = true;
    const doImport = (text: string) => {
      try { Save.importCode(text); status.textContent = t('importOk'); this.render(); }
      catch { status.textContent = t('importBad'); }
    };
    file.addEventListener('change', async () => { const f = file.files?.[0]; if (f) doImport(await f.text()); });
    const row2 = el('div', 'row-btns');
    row2.append(button(t('importBtn'), () => doImport(inp.value), 'btn'), button(t('importFile'), () => file.click(), 'btn'));
    body.append(inp, row2, file, status);
    s.append(body);
  }

  private renderPin(s: HTMLElement): void {
    s.append(this.header(t('admin')));
    const body = el('div', 'body');
    const label = el('label', 'field');
    label.append(el('span', '', t('pinLabel')));
    const input = document.createElement('input');
    input.type = 'password';
    input.inputMode = 'numeric';
    input.autocomplete = 'off';
    input.maxLength = 8;
    label.append(input);
    const status = el('p', 'status');
    const go = () => {
      if (input.value === DEV.pin) {
        try { sessionStorage.setItem(ADMIN_KEY, '1'); } catch { /* session only */ }
        this.go('admin');
      } else { status.textContent = t('pinWrong'); input.value = ''; }
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    body.append(label, button(t('enter'), go, 'btn accent'), status);
    s.append(body);
    setTimeout(() => input.focus(), 50);
  }

  private renderAdmin(s: HTMLElement): void {
    s.append(this.header(t('admin')));
    const body = el('div', 'body admin');
    body.append(this.currencyEditor('coins', DEV.coinSteps, ICON.coin), this.currencyEditor('gems', DEV.gemSteps, ICON.gem));
    const danger = el('div', 'list');
    danger.append(confirmRow(t('resetEconomy'), () => { Wallet.set('coins', 0); Wallet.set('gems', 0); }));
    danger.append(confirmRow(t('deleteGhost'), () => this.hooks.deleteBest()));
    body.append(danger);
    s.append(body);
  }

  private currencyEditor(c: Currency, steps: number[], icon: string): HTMLElement {
    const box = el('section', 'cur-edit');
    box.innerHTML = `<div class="cur-head">${icon}<span>${t(c)}</span><b class="num">${fmt(Wallet.get(c))}</b></div>`;
    const btns = el('div', 'steps');
    for (const n of [...steps].reverse()) btns.append(button(`−${fmt(n)}`, () => Wallet.add(c, -n), 'chip'));
    for (const n of steps) btns.append(button(`+${fmt(n)}`, () => Wallet.add(c, n), 'chip plus'));
    const setRow = el('div', 'set');
    const input = document.createElement('input');
    input.type = 'number';
    input.inputMode = 'numeric';
    input.min = '0';
    input.placeholder = fmt(Wallet.get(c));
    setRow.append(input, button(t('setTo'), () => {
      const v = Number(input.value);
      if (Number.isFinite(v) && input.value !== '') Wallet.set(c, v);
    }, 'btn'));
    box.append(btns, setRow);
    return box;
  }
}

// ------------------------------------------------------------------ helpers

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(label: string, onTap: () => void, cls: string): HTMLButtonElement {
  const b = el('button', cls, label);
  b.type = 'button';
  b.addEventListener('click', (e) => { e.preventDefault(); if (!b.hasAttribute('disabled')) onTap(); });
  return b;
}

function row(label: string, detail: string, onTap: () => void, disabled = false): HTMLElement {
  const b = button('', onTap, 'row');
  b.innerHTML = `<span>${label}</span><small>${detail}</small>${ICON.chevron}`;
  if (disabled) b.setAttribute('disabled', '');
  return b;
}

function toggleRow(label: string, on: boolean, change: (on: boolean) => void): HTMLElement {
  const b = button('', () => { on = !on; b.setAttribute('aria-checked', String(on)); change(on); }, 'row toggle');
  b.setAttribute('role', 'switch');
  b.setAttribute('aria-checked', String(on));
  b.innerHTML = `<span>${label}</span><i class="sw"></i>`;
  return b;
}

/** Destructive row: first tap arms it, second tap within 3 s runs it. */
function confirmRow(label: string, run: () => void): HTMLElement {
  let armed = 0;
  const b = button('', () => {
    if (Date.now() - armed < 3000) { armed = 0; small.textContent = ''; run(); return; }
    armed = Date.now();
    small.textContent = t('confirmAgain');
  }, 'row danger');
  b.innerHTML = `<span>${label}</span><small></small>`;
  const small = b.querySelector('small')!;
  return b;
}

function when(iso: string): string {
  const d = new Date(iso);
  const loc = { pt: 'pt-BR', en: 'en-US', de: 'de-DE' }[getLang()];
  return `${d.toLocaleDateString(loc, { day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' })}`;
}
