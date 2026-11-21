/**
 * Minimal i18n. Every UI string goes through t(); the full menu strings land
 * with milestone 8, but the mechanism and the three languages exist from day one.
 */
export type Lang = 'pt' | 'en' | 'de';

const STRINGS = {
  perfect: { pt: 'PERFEITO', en: 'PERFECT', de: 'PERFEKT' },
  good: { pt: 'LIMPO', en: 'CLEAN', de: 'SAUBER' },
  sloppy: { pt: 'TORTO', en: 'SLOPPY', de: 'WACKELIG' },
  crash: { pt: 'QUEDA', en: 'CRASH', de: 'STURZ' },
  pump: { pt: 'PUMP', en: 'PUMP', de: 'PUMP' },
  checkpoint: { pt: 'Checkpoint', en: 'Checkpoint', de: 'Checkpoint' },
  respawnIn: { pt: 'Voltando ao checkpoint {n}', en: 'Back to checkpoint {n}', de: 'Zurück zu Checkpoint {n}' },
  respawnStart: { pt: 'Voltando à largada', en: 'Back to the start', de: 'Zurück zum Start' },
  crashPit: { pt: 'Caiu no vão', en: 'Fell into the gap', de: 'In die Lücke gefallen' },
  crashHead: { pt: 'Bateu a cabeça', en: 'Head hit the ground', de: 'Kopf am Boden' },
  crashLanding: { pt: 'Pouso fora do ângulo', en: 'Landed off angle', de: 'Landewinkel verfehlt' },
  air: { pt: 'ar', en: 'air', de: 'Luft' },
  speedUnit: { pt: 'km/h', en: 'km/h', de: 'km/h' },
  lostTime: { pt: 'tempo perdido', en: 'time lost', de: 'Zeitverlust' },
  finish: { pt: 'Chegada', en: 'Finish', de: 'Ziel' },
  helpPedal: { pt: 'pedalar', en: 'pedal', de: 'treten' },
  helpLean: { pt: 'inclinar / girar no ar', en: 'lean / spin in the air', de: 'lehnen / in der Luft drehen' },
  helpHop: { pt: 'pular (segure para carregar)', en: 'hop (hold to charge)', de: 'Bunny Hop (halten zum Laden)' },
  helpPump: { pt: 'pump na descida', en: 'pump on the way down', de: 'pumpen bergab' },
  helpDebug: { pt: 'colisores', en: 'colliders', de: 'Kollider' },
  helpInfo: { pt: 'dados de pouso', en: 'landing data', de: 'Landedaten' },
  helpRestart: { pt: 'voltar ao início', en: 'restart', de: 'Neustart' },
  touchBack: { pt: 'Trás', en: 'Back', de: 'Zurück' },
  touchFwd: { pt: 'Frente', en: 'Fwd', de: 'Vor' },
  touchPedal: { pt: 'Pedal', en: 'Pedal', de: 'Treten' },
  touchJump: { pt: 'Pulo', en: 'Hop', de: 'Hop' },
  touchPump: { pt: 'Pump', en: 'Pump', de: 'Pump' },
} satisfies Record<string, Record<Lang, string>>;

export type StringKey = keyof typeof STRINGS;

function detect(): Lang {
  const l = (navigator.language || 'pt').slice(0, 2).toLowerCase();
  return l === 'de' ? 'de' : l === 'en' ? 'en' : 'pt';
}

let lang: Lang = detect();

export function setLang(l: Lang): void { lang = l; }
export function getLang(): Lang { return lang; }

export function t(key: StringKey, vars?: Record<string, string | number>): string {
  let s: string = STRINGS[key][lang];
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}

const LOCALE: Record<Lang, string> = { pt: 'pt-BR', en: 'en-US', de: 'de-DE' };

/** Number with locale separators and fixed decimals (1.234,56 in pt/de). */
export function fmt(n: number, decimals = 0): string {
  return new Intl.NumberFormat(LOCALE[lang], { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n);
}

/** Race time as m:ss,cc (pt/de) or m:ss.cc (en). */
export function fmtTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  const sec = fmt(s, 2).padStart(5, '0');
  return `${m}:${sec}`;
}
