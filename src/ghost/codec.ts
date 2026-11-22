import { b64url, unb64url, hash } from '../core/save';

/**
 * A ghost is the rider's inputs, one byte per physics step, plus sparse
 * keyframes. Replaying the inputs through the same deterministic physics
 * reproduces the run; the keyframes let the replay re-sync if it ever drifts.
 *
 * Input byte bits: 0 pedal, 1 lean back, 2 lean forward, 3 jump, 4 pump,
 * 5 "tap to respawn" (applied before that step).
 *
 * Binary layout (then optionally deflated, then base64url):
 *   str trackId · str name · varint finishSteps · varint keyEvery
 *   varint runCount · (varint runLength, u8 mask)*
 *   varint keyCount · (zigzag dx cm, dy cm, da mrad)*   — deltas from the previous key
 *
 * Text form: "g1" + ("z" deflated | "r" raw) + base64url + "." + checksum.
 */
export const BIT = { pedal: 1, leanBack: 2, leanForward: 4, jump: 8, pump: 16, skip: 32 } as const;

export interface GhostKey { x: number; y: number; a: number }

export interface GhostData {
  trackId: string;
  name: string;
  /** Physics steps from start to crossing the finish line (time = steps / stepHz). */
  finishSteps: number;
  /** One input mask per physics step. */
  inputs: Uint8Array;
  /** A keyframe (frame position and angle after the step) every `keyEvery` steps. */
  keyEvery: number;
  keys: GhostKey[];
}

class Writer {
  private buf: number[] = [];
  u8(v: number): void { this.buf.push(v & 255); }
  varint(v: number): void {
    v = Math.max(0, Math.floor(v));
    while (v >= 0x80) { this.buf.push((v & 0x7f) | 0x80); v = Math.floor(v / 128); }
    this.buf.push(v);
  }
  zigzag(v: number): void { v = Math.round(v); this.varint(v >= 0 ? v * 2 : -v * 2 - 1); }
  str(s: string): void { const b = new TextEncoder().encode(s); this.varint(b.length); for (const x of b) this.buf.push(x); }
  bytes(): Uint8Array { return new Uint8Array(this.buf); }
}

class Reader {
  private i = 0;
  constructor(private b: Uint8Array) {}
  u8(): number { if (this.i >= this.b.length) throw new Error('eof'); return this.b[this.i++]; }
  varint(): number {
    let v = 0, mul = 1;
    for (;;) { const x = this.u8(); v += (x & 0x7f) * mul; if (x < 0x80) return v; mul *= 128; if (mul > 2 ** 49) throw new Error('varint'); }
  }
  zigzag(): number { const v = this.varint(); return v % 2 ? -(v + 1) / 2 : v / 2; }
  str(): string { const n = this.varint(); if (n > 200) throw new Error('str'); const s = this.b.subarray(this.i, this.i + n); this.i += n; return new TextDecoder().decode(s); }
}

function pack(g: GhostData): Uint8Array {
  const w = new Writer();
  w.str(g.trackId);
  w.str(g.name);
  w.varint(g.finishSteps);
  w.varint(g.keyEvery);
  // Run-length encode the inputs: they change only a few times per second.
  const runs: [number, number][] = [];
  for (const m of g.inputs) {
    const last = runs[runs.length - 1];
    if (last && last[1] === m) last[0]++; else runs.push([1, m]);
  }
  w.varint(runs.length);
  for (const [n, m] of runs) { w.varint(n); w.u8(m); }
  w.varint(g.keys.length);
  let px = 0, py = 0, pa = 0;
  for (const k of g.keys) {
    const x = Math.round(k.x * 100), y = Math.round(k.y * 100), a = Math.round(k.a * 1000);
    w.zigzag(x - px); w.zigzag(y - py); w.zigzag(a - pa);
    px = x; py = y; pa = a;
  }
  return w.bytes();
}

function unpack(b: Uint8Array): GhostData {
  const r = new Reader(b);
  const trackId = r.str(), name = r.str(), finishSteps = r.varint(), keyEvery = r.varint();
  const runCount = r.varint();
  const parts: number[] = [];
  let total = 0;
  for (let i = 0; i < runCount; i++) {
    const n = r.varint(), m = r.u8();
    total += n;
    if (total > 120 * 60 * 30) throw new Error('too long');
    parts.push(n, m);
  }
  const inputs = new Uint8Array(total);
  for (let i = 0, o = 0; i < parts.length; i += 2) { inputs.fill(parts[i + 1], o, o + parts[i]); o += parts[i]; }
  const keyCount = r.varint();
  const keys: GhostKey[] = [];
  let x = 0, y = 0, a = 0;
  for (let i = 0; i < keyCount; i++) {
    x += r.zigzag(); y += r.zigzag(); a += r.zigzag();
    keys.push({ x: x / 100, y: y / 100, a: a / 1000 });
  }
  if (keyEvery < 1 || finishSteps > inputs.length) throw new Error('bad ghost');
  return { trackId, name, finishSteps, inputs, keyEvery, keys };
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

const canZip = typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

export async function encodeGhost(g: GhostData): Promise<string> {
  let bytes = pack(g);
  let mode = 'r';
  if (canZip) {
    try {
      const z = await pipe(bytes, new CompressionStream('deflate-raw'));
      if (z.length < bytes.length) { bytes = z; mode = 'z'; }
    } catch { /* keep raw */ }
  }
  const body = b64url(bytes);
  return `g1${mode}${body}.${hash(body)}`;
}

export async function decodeGhost(text: string): Promise<GhostData> {
  const m = /^g1([zr])([A-Za-z0-9_-]+)\.([0-9a-f]{8})$/.exec(text.trim());
  if (!m) throw new Error('format');
  if (hash(m[2]) !== m[3]) throw new Error('checksum');
  let bytes = unb64url(m[2]);
  if (m[1] === 'z') {
    if (!canZip) throw new Error('unsupported');
    bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
  }
  return unpack(bytes);
}
