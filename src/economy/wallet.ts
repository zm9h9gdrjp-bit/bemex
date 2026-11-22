import { Save } from '../core/save';

export type Currency = 'coins' | 'gems';

/** All balance changes go through here, so they are clamped, saved and broadcast. */
export const Wallet = {
  get(c: Currency): number { return Save.data[c]; },
  add(c: Currency, amount: number): void {
    Save.update((d) => { d[c] = Math.max(0, Math.floor(d[c] + amount)); });
  },
  set(c: Currency, value: number): void {
    Save.update((d) => { d[c] = Math.max(0, Math.floor(value)); });
  },
};
