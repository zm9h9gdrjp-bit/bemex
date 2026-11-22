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
  wheelie: { pt: 'MANUAL', en: 'MANUAL', de: 'MANUAL' },
  nose: { pt: 'NOSE MANUAL', en: 'NOSE MANUAL', de: 'NOSE MANUAL' },
  cased: { pt: 'pouso duro', en: 'cased', de: 'harte Landung' },
  pumpBad: { pt: 'PUMP NA SUBIDA', en: 'PUMP ON THE FACE', de: 'PUMP BERGAUF' },
  crashPit: { pt: 'Caiu no vão', en: 'Fell into the gap', de: 'In die Lücke gefallen' },
  part_head: { pt: 'Cabeça no chão', en: 'Head hit the ground', de: 'Kopf am Boden' },
  part_torso: { pt: 'Corpo no chão', en: 'Body hit the ground', de: 'Oberkörper am Boden' },
  part_hips: { pt: 'Quadril no chão', en: 'Hips hit the ground', de: 'Hüfte am Boden' },
  part_hands: { pt: 'Mão no chão', en: 'Hand hit the ground', de: 'Hand am Boden' },
  part_knees: { pt: 'Joelho no chão', en: 'Knee hit the ground', de: 'Knie am Boden' },
  crashImpact: { pt: 'Impacto {v} m/s (limite {max})', en: 'Impact {v} m/s (limit {max})', de: 'Aufprall {v} m/s (Grenze {max})' },
  crashAngle: { pt: 'Pousou a {a}° do chão (limite {max}°)', en: 'Landed {a}° off the ground (limit {max}°)', de: 'Landung {a}° schräg (Grenze {max}°)' },
  crashMidTrick: { pt: 'Pousou no meio da manobra', en: 'Landed mid-trick', de: 'Mitten im Trick gelandet' },
  crashTipBack: { pt: 'Passou do equilíbrio para trás ({a}°)', en: 'Looped out the back ({a}°)', de: 'Nach hinten überzogen ({a}°)' },
  crashTipForward: { pt: 'Passou por cima do guidão ({a}°)', en: 'Went over the bars ({a}°)', de: 'Über den Lenker ({a}°)' },
  tapRespawn: { pt: 'Toque para voltar já', en: 'Tap to respawn now', de: 'Tippen zum Weiterfahren' },
  crashes: { pt: 'Quedas', en: 'Crashes', de: 'Stürze' },
  dbgColliders: { pt: 'Colisores', en: 'Colliders', de: 'Kollider' },
  dbgSensors: { pt: 'Sensores', en: 'Sensors', de: 'Sensoren' },
  dbgBones: { pt: 'Ossos', en: 'Bones', de: 'Knochen' },
  dbgSlow: { pt: 'Câmera lenta', en: 'Slow-mo', de: 'Zeitlupe' },
  helpLeanBack: { pt: 'inclinar p/ trás · mortal p/ trás', en: 'lean back · backflip', de: 'nach hinten · Backflip' },
  helpLeanFwd: { pt: 'inclinar p/ frente · mortal p/ frente', en: 'lean forward · frontflip', de: 'nach vorn · Frontflip' },
  helpSlow: { pt: 'câmera lenta', en: 'slow-mo', de: 'Zeitlupe' },
  helpSensors: { pt: 'sensores', en: 'sensors', de: 'Sensoren' },
  air: { pt: 'ar', en: 'air', de: 'Luft' },
  speedUnit: { pt: 'km/h', en: 'km/h', de: 'km/h' },
  lostTime: { pt: 'tempo perdido', en: 'time lost', de: 'Zeitverlust' },
  finish: { pt: 'Chegada', en: 'Finish', de: 'Ziel' },
  helpPedal: { pt: 'pedalar', en: 'pedal', de: 'treten' },
  helpLean: { pt: 'inclinar / girar no ar', en: 'lean / spin in the air', de: 'lehnen / in der Luft drehen' },
  helpHop: { pt: 'pular (segure para carregar)', en: 'hop (hold to charge)', de: 'Bunny Hop (halten zum Laden)' },
  helpPump: { pt: 'pump: segure no fundo, solte na crista', en: 'pump: hold in the dip, release on the crest', de: 'Pumpen: in der Senke halten, auf der Kuppe loslassen' },
  helpDebug: { pt: 'colisores', en: 'colliders', de: 'Kollider' },
  helpInfo: { pt: 'dados de pouso', en: 'landing data', de: 'Landedaten' },
  helpRestart: { pt: 'voltar ao início', en: 'restart', de: 'Neustart' },
  rotate: { pt: 'Gire o celular', en: 'Rotate your phone', de: 'Handy drehen' },
  rotateSub: { pt: 'A corrida roda na horizontal', en: 'Races run in landscape', de: 'Rennen laufen im Querformat' },
  restart: { pt: 'Reiniciar', en: 'Restart', de: 'Neustart' },
  data: { pt: 'Dados', en: 'Data', de: 'Daten' },
  tracks: { pt: 'Pistas', en: 'Tracks', de: 'Strecken' },
  chooseTrack: { pt: 'Escolha a pista', en: 'Choose a track', de: 'Strecke wählen' },
  length: { pt: '{m} m', en: '{m} m', de: '{m} m' },
  gaps: { pt: '{n} vãos', en: '{n} gaps', de: '{n} Lücken' },
  gap1: { pt: '1 vão', en: '1 gap', de: '1 Lücke' },
  noGaps: { pt: 'sem vãos', en: 'no gaps', de: 'keine Lücken' },
  noBest: { pt: 'Sem recorde', en: 'No best yet', de: 'Noch keine Bestzeit' },
  go: { pt: 'VAI', en: 'GO', de: 'LOS' },
  menu: { pt: 'Menu', en: 'Menu', de: 'Menü' },
  paused: { pt: 'Pausado', en: 'Paused', de: 'Pause' },
  resume: { pt: 'Continuar', en: 'Resume', de: 'Weiter' },
  coins: { pt: 'Moedas', en: 'Coins', de: 'Münzen' },
  gems: { pt: 'Gemas', en: 'Gems', de: 'Edelsteine' },
  ghost: { pt: 'Fantasma', en: 'Ghost', de: 'Geist' },
  ghostOn: { pt: 'Mostrar fantasma', en: 'Show ghost', de: 'Geist anzeigen' },
  ghostYou: { pt: 'Seu recorde', en: 'Your best', de: 'Deine Bestzeit' },
  ghostNone: { pt: 'Sem recorde nesta pista ainda', en: 'No best run on this track yet', de: 'Noch keine Bestzeit auf dieser Strecke' },
  best: { pt: 'Recorde', en: 'Best', de: 'Bestzeit' },
  newBest: { pt: 'Novo recorde', en: 'New best', de: 'Neue Bestzeit' },
  challenge: { pt: 'Desafiar um amigo', en: 'Challenge a friend', de: 'Freund herausfordern' },
  challengeHint: { pt: 'Manda o link: quem abrir corre contra o seu recorde.', en: 'Send the link: whoever opens it races your best run.', de: 'Link senden: wer ihn öffnet, fährt gegen deine Bestzeit.' },
  yourName: { pt: 'Seu nome no desafio', en: 'Your name on the challenge', de: 'Dein Name in der Herausforderung' },
  share: { pt: 'Enviar link', en: 'Send link', de: 'Link senden' },
  copied: { pt: 'Link copiado', en: 'Link copied', de: 'Link kopiert' },
  challengeFrom: { pt: 'Desafio de {n}', en: 'Challenge from {n}', de: 'Herausforderung von {n}' },
  challengeWon: { pt: 'Você venceu {n} por {d} s', en: 'You beat {n} by {d} s', de: 'Du hast {n} um {d} s geschlagen' },
  challengeLost: { pt: '{n} venceu por {d} s', en: '{n} won by {d} s', de: '{n} gewinnt mit {d} s' },
  challengeBad: { pt: 'Link de desafio inválido ou de outra pista', en: 'Invalid challenge link or another track', de: 'Ungültiger Link oder andere Strecke' },
  challengeEnd: { pt: 'Sair do desafio', en: 'Leave challenge', de: 'Herausforderung beenden' },
  progress: { pt: 'Progresso', en: 'Progress', de: 'Fortschritt' },
  backupHint: { pt: 'O Safari pode apagar dados de sites após 7 dias sem uso. Guarde este código ou o arquivo para recuperar tudo.', en: 'Safari may clear website data after 7 days without use. Keep this code or the file to restore everything.', de: 'Safari kann Website-Daten nach 7 Tagen ohne Nutzung löschen. Bewahre Code oder Datei auf.' },
  copyCode: { pt: 'Copiar código', en: 'Copy code', de: 'Code kopieren' },
  downloadFile: { pt: 'Baixar arquivo', en: 'Download file', de: 'Datei laden' },
  importLabel: { pt: 'Restaurar de um código ou arquivo', en: 'Restore from a code or file', de: 'Aus Code oder Datei wiederherstellen' },
  importBtn: { pt: 'Restaurar', en: 'Restore', de: 'Wiederherstellen' },
  importFile: { pt: 'Escolher arquivo', en: 'Choose file', de: 'Datei wählen' },
  importOk: { pt: 'Progresso restaurado', en: 'Progress restored', de: 'Fortschritt wiederhergestellt' },
  importBad: { pt: 'Código inválido ou incompleto', en: 'Invalid or incomplete code', de: 'Ungültiger oder unvollständiger Code' },
  lastSaved: { pt: 'Salvo em {d}', en: 'Saved {d}', de: 'Gespeichert {d}' },
  admin: { pt: 'Admin', en: 'Admin', de: 'Admin' },
  pinLabel: { pt: 'PIN do admin', en: 'Admin PIN', de: 'Admin-PIN' },
  pinWrong: { pt: 'PIN incorreto', en: 'Wrong PIN', de: 'Falsche PIN' },
  enter: { pt: 'Entrar', en: 'Enter', de: 'Öffnen' },
  setTo: { pt: 'Definir', en: 'Set', de: 'Setzen' },
  resetEconomy: { pt: 'Zerar moedas e gemas', en: 'Reset coins and gems', de: 'Münzen und Edelsteine zurücksetzen' },
  deleteGhost: { pt: 'Apagar recorde e fantasma desta pista', en: 'Delete best and ghost for this track', de: 'Bestzeit und Geist dieser Strecke löschen' },
  confirmAgain: { pt: 'Toque de novo para confirmar', en: 'Tap again to confirm', de: 'Zum Bestätigen erneut tippen' },
  close: { pt: 'Fechar', en: 'Close', de: 'Schließen' },
  back: { pt: 'Voltar', en: 'Back', de: 'Zurück' },
  offlineReady: { pt: 'Disponível sem internet', en: 'Available offline', de: 'Offline verfügbar' },
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
