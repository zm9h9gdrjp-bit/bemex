/**
 * Versioned save in localStorage.
 *
 * - Every load goes through `migrate`, so older saves are upgraded instead of
 *   being thrown away; anything unreadable falls back to defaults (and the bad
 *   copy is kept under a backup key so it can still be recovered by hand).
 * - `exportCode` / `importCode` produce a copy-pasteable backup: Safari can wipe
 *   a website's storage after 7 days without a visit, and the code survives that.
 */
export const SAVE_VERSION = 1;
const KEY = 'trickriders.save';
const BAD_KEY = 'trickriders.save.corrupt';

export interface SaveData {
  version: number;
  coins: number;
  gems: number;
  /** Name shown on shared ghost challenges. */
  playerName: string;
  /** Best finish time per track id, seconds. */
  bestTimes: Record<string, number>;
  /** Encoded best ghost per track id (see ghost/codec.ts). */
  ghosts: Record<string, string>;
  settings: { showGhost: boolean };
  /** ISO time of the last write, shown on the backup screen. */
  savedAt: string;
}

export function defaults(): SaveData {
  return {
    version: SAVE_VERSION, coins: 0, gems: 0, playerName: '',
    bestTimes: {}, ghosts: {}, settings: { showGhost: true }, savedAt: new Date().toISOString(),
  };
}

/** Upgrades any older save shape to the current version. */
function migrate(raw: unknown): SaveData {
  if (!raw || typeof raw !== 'object') throw new Error('not an object');
  const r = raw as Partial<SaveData> & { version?: number };
  const d = defaults();
  // v0 (no version field) → v1: same fields, just validated.
  const out: SaveData = {
    version: SAVE_VERSION,
    coins: num(r.coins, d.coins),
    gems: num(r.gems, d.gems),
    playerName: typeof r.playerName === 'string' ? r.playerName.slice(0, 20) : '',
    bestTimes: rec(r.bestTimes, (v) => typeof v === 'number' && v > 0),
    ghosts: rec(r.ghosts, (v) => typeof v === 'string'),
    settings: { showGhost: r.settings?.showGhost !== false },
    savedAt: typeof r.savedAt === 'string' ? r.savedAt : d.savedAt,
  };
  return out;
}

function num(v: unknown, def: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : def;
}
function rec<T>(v: unknown, ok: (x: unknown) => boolean): Record<string, T> {
  const out: Record<string, T> = {};
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (ok(x)) out[k] = x as T;
  return out;
}

type Listener = (s: SaveData) => void;

class SaveStore {
  data: SaveData = defaults();
  private listeners = new Set<Listener>();

  load(): void {
    let text: string | null = null;
    try { text = localStorage.getItem(KEY); } catch { /* storage blocked: play with defaults */ }
    if (!text) { this.data = defaults(); return; }
    try {
      this.data = migrate(JSON.parse(text));
    } catch {
      try { localStorage.setItem(BAD_KEY, text); } catch { /* ignore */ }
      this.data = defaults();
    }
    // Ask the browser not to evict our storage (honoured for home-screen apps).
    navigator.storage?.persist?.().catch(() => undefined);
  }

  write(): void {
    this.data.savedAt = new Date().toISOString();
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* full or blocked */ }
    for (const l of this.listeners) l(this.data);
  }

  update(fn: (d: SaveData) => void): void {
    fn(this.data);
    this.write();
  }

  onChange(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  /** Backup code: TR1.<base64url JSON>.<checksum>. */
  exportCode(): string {
    const body = b64url(new TextEncoder().encode(JSON.stringify(this.data)));
    return `TR1.${body}.${hash(body)}`;
  }

  /** Validates, migrates and replaces the current save. Throws a readable error. */
  importCode(code: string): void {
    const parts = code.trim().split('.');
    if (parts.length !== 3 || parts[0] !== 'TR1') throw new Error('format');
    if (hash(parts[1]) !== parts[2]) throw new Error('checksum');
    const json = new TextDecoder().decode(unb64url(parts[1]));
    this.data = migrate(JSON.parse(json));
    this.write();
  }

  reset(): void {
    this.data = defaults();
    this.write();
  }
}

export const Save = new SaveStore();

// ---- small encoding helpers shared with the ghost codec

export function b64url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function unb64url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

/** FNV-1a, 8 hex chars. Detects typos and truncation, not tampering. */
export function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
