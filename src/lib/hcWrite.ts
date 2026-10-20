/**
 * Aven's weigh-ins and each day's food totals into Health Connect, so Samsung Health and other apps see them (Omar, 20 Oct:
 * "weight and nutrition, from Aven"). A web page can't hand anything to the Android app by itself, so they ride along when
 * Sync now or Connect watch is tapped ("w=" in the link; android/…/HealthWrite.java writes them, one record per day each,
 * so a day sent again replaces itself). Only what is new or changed since the last send goes (the last 90 days), and a day
 * whose weigh-in or food was deleted here is taken out there too. Counted as sent only once the app says it wrote them
 * ("&hw=" in its answer): not allowed or failed = sent again next time.
 */
import type { AppData, WeightLog } from './types';
import { nutritionByDay } from './stats';
import { addDays } from './dates';

const SENT = 'aven.hc.sent', SENDING = 'aven.hc.sending', RESULT = 'aven.hc.wrote';
const DAYS = 90;
/** What was last written, per date: a short signature of the numbers. */
interface Sigs { w: Record<string, string>; n: Record<string, string> }
export interface Writes { w: [string, number, number][]; n: [string, number, number, number, number][]; dw: string[]; dn: string[] }

const read = <T>(k: string): T | null => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const r1 = (x: number) => Math.round(x * 10) / 10;

/** What to send now, against what was sent before; `sigs` = how everything stands once it is written. */
export function pendingWrites(d: AppData, today: string, sent: Sigs | null): { writes: Writes; sigs: Sigs } {
  const from = addDays(today, -(DAYS - 1));
  const last = new Map<string, WeightLog>();
  for (const w of d.weights) if (w.date >= from && w.date <= today && (!last.has(w.date) || w.at > last.get(w.date)!.at)) last.set(w.date, w);
  const sigs: Sigs = { w: {}, n: {} };
  const writes: Writes = { w: [], n: [], dw: [], dn: [] };
  for (const [date, w] of [...last].sort()) {
    sigs.w[date] = `${r1(w.kg)}|${w.at}`;
    if (sent?.w[date] !== sigs.w[date]) writes.w.push([date, r1(w.kg), w.at]);
  }
  for (const x of nutritionByDay(d.entries, from, today)) {
    if (!x.logged || x.kcal <= 0) continue;
    const n: [string, number, number, number, number] = [x.date, Math.round(x.kcal), r1(x.protein), r1(x.carbs), r1(x.fat)];
    sigs.n[x.date] = n.slice(1).join('|');
    if (sent?.n[x.date] !== sigs.n[x.date]) writes.n.push(n);
  }
  // deleted here since: out there too
  for (const date of Object.keys(sent?.w ?? {})) if (date >= from && !(date in sigs.w)) writes.dw.push(date);
  for (const date of Object.keys(sent?.n ?? {})) if (date >= from && !(date in sigs.n)) writes.dn.push(date);
  return { writes, sigs };
}

/** Sync now / Connect watch is about to be tapped: what to hand along (base64url), or null when nothing changed. */
export function prepareWrites(d: AppData, today: string): string | null {
  const { writes, sigs } = pendingWrites(d, today, read<Sigs>(SENT));
  try { localStorage.removeItem(SENDING); } catch { /* fine */ }
  if (!writes.w.length && !writes.n.length && !writes.dw.length && !writes.dn.length) return null;
  try { localStorage.setItem(SENDING, JSON.stringify({ at: Date.now(), sigs })); } catch { return null; }
  const bytes = new TextEncoder().encode(JSON.stringify(writes));
  let bin = '';
  for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export type WriteResult = { at: number; state: 'ok' | 'denied' | 'failed'; n?: number };
/** The app's answer ("&hw=": how many records, "denied" or "failed"): what was handed along counts as sent only if written. */
export function settleWrites(hw: string): void {
  const sending = read<{ at: number; sigs: Sigs }>(SENDING);
  const state: WriteResult['state'] = /^\d+$/.test(hw) ? 'ok' : hw === 'denied' ? 'denied' : 'failed';
  try {
    if (state === 'ok' && sending && Date.now() - sending.at < 10 * 60_000) localStorage.setItem(SENT, JSON.stringify(sending.sigs));
    localStorage.removeItem(SENDING);
    localStorage.setItem(RESULT, JSON.stringify({ at: Date.now(), state, ...(state === 'ok' ? { n: Number(hw) } : {}) }));
  } catch { /* fine */ }
}

/** How the last send went (Settings → Watch). */
export const lastWrite = (): WriteResult | null => read<WriteResult>(RESULT);
