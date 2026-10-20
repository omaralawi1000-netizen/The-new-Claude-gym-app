/**
 * What the watch says about sleep, recovery and the body, in a few lines the Coach reads (DATA → BODY & RECOVERY). Plain
 * facts against his own usual (the median of the last 30 days), plus what is clearly off right now. Omar chose (19 Oct):
 * the Coach mentions recovery when it is clearly off and explains it when asked, but never tells him to train lighter on
 * its own (he trains to failure whatever the day; the old readiness feature was dropped for that).
 */
import type { HealthDay } from './types';
import { diffDays } from './dates';

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const hm = (min: number) => { const m = Math.round(min); return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`; }; // (6h60 was possible)
const median = (xs: number[]) => { if (!xs.length) return undefined; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
/** "Usual" needs a few days to mean anything (a watch connected yesterday has one reading). */
const usual = (xs: number[]) => (xs.length >= 3 ? median(xs) : undefined);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);

/** Clearly off (thresholds Omar agreed to): under 5 h of sleep, resting HR 7+ over usual, HRV 25 %+ under usual. */
export interface OffSignal { kind: 'sleep' | 'restHr' | 'hrv'; text: string }

export function recoveryOff(health: HealthDay[], today: string): OffSignal[] {
  const out: OffSignal[] = [];
  const by = new Map(health.map((d) => [d.date, d]));
  const night = by.get(today)?.sleepMin !== undefined ? by.get(today) : undefined; // the night that ended this morning
  const base = health.filter((d) => diffDays(today, d.date) >= 1 && diffDays(today, d.date) <= 30);
  if (night?.sleepMin !== undefined && night.sleepMin < 300) out.push({ kind: 'sleep', text: `slept ${hm(night.sleepMin)} last night` });
  const rh = by.get(today)?.restHr ?? by.get(addDay(today, -1))?.restHr;
  const rhUsual = usual(base.map((d) => d.restHr).filter((x): x is number => x !== undefined));
  if (rh !== undefined && rhUsual !== undefined && rh - rhUsual >= 7) out.push({ kind: 'restHr', text: `resting heart rate ${rh}, ${Math.round(rh - rhUsual)} over usual (${Math.round(rhUsual)})` });
  const hv = by.get(today)?.hrv ?? by.get(addDay(today, -1))?.hrv;
  const hvUsual = usual(base.map((d) => d.hrv).filter((x): x is number => x !== undefined));
  if (hv !== undefined && hvUsual !== undefined && hv <= hvUsual * 0.75) out.push({ kind: 'hrv', text: `HRV ${hv} ms, ${Math.round((1 - hv / hvUsual) * 100)}% under usual (${Math.round(hvUsual)})` });
  return out;
}

function addDay(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The DATA lines (empty when the watch has sent none of this). */
export function recoveryLines(health: HealthDay[] | undefined, today: string): string[] {
  const hs = (health ?? []).filter((d) => diffDays(today, d.date) >= 0);
  if (!hs.length) return [];
  const L: string[] = [];
  const recent = (n: number) => hs.filter((d) => diffDays(today, d.date) < n);
  const nights = recent(7).filter((d) => d.sleepMin !== undefined);
  if (nights.length) {
    L.push(`Sleep, last 7 nights (by the morning it ended): ${nights.map((d) => {
      const st = [d.deepMin && `deep ${hm(d.deepMin)}`, d.remMin && `REM ${hm(d.remMin)}`, d.awakeMin && `awake ${Math.round(d.awakeMin)} min`].filter(Boolean).join(', ');
      const times = d.sleepStart && d.sleepEnd ? ` ${new Date(d.sleepStart).toTimeString().slice(0, 5)}–${new Date(d.sleepEnd).toTimeString().slice(0, 5)}` : '';
      return `${WD[new Date(`${d.date}T12:00:00`).getDay()]} ${hm(d.sleepMin!)}${times}${st ? ` (${st})` : ''}`;
    }).join('; ')}.`);
  }
  const base = hs.filter((d) => diffDays(today, d.date) >= 1 && diffDays(today, d.date) <= 30);
  const usual = (k: 'restHr' | 'hrv' | 'sleepMin') => median(base.map((d) => d[k]).filter((x): x is number => x !== undefined));
  const latest = (k: keyof HealthDay) => { const d = [...hs].reverse().find((x) => x[k] !== undefined); return d ? { v: d[k] as number, date: d.date } : undefined; };
  const rh = latest('restHr'), hv = latest('hrv');
  const parts: string[] = [];
  if (rh) parts.push(`resting HR ${rh.v} (${rh.date}; usual ${usual('restHr') !== undefined ? Math.round(usual('restHr')!) : '?'})`);
  if (hv) parts.push(`HRV ${hv.v} ms (${hv.date}; usual ${usual('hrv') !== undefined ? Math.round(usual('hrv')!) : '?'})`);
  const us = usual('sleepMin');
  if (us !== undefined) parts.push(`usual sleep ${hm(us)}`);
  if (parts.length) L.push(`Recovery: ${parts.join(', ')}. ("usual" = the median of the 30 days before today.)`);
  // 4-week trends: the last 2 weeks against the 2 before
  const half = (k: 'sleepMin' | 'restHr' | 'hrv') => {
    const a = avg(hs.filter((d) => diffDays(today, d.date) < 14).map((d) => d[k]).filter((x): x is number => x !== undefined));
    const b = avg(hs.filter((d) => diffDays(today, d.date) >= 14 && diffDays(today, d.date) < 28).map((d) => d[k]).filter((x): x is number => x !== undefined));
    return a !== undefined && b !== undefined ? { a, b } : undefined;
  };
  const tr: string[] = [];
  const sl = half('sleepMin'); if (sl) tr.push(`sleep ${hm(sl.a)} vs ${hm(sl.b)}`);
  const r2 = half('restHr'); if (r2) tr.push(`resting HR ${Math.round(r2.a)} vs ${Math.round(r2.b)}`);
  const h2 = half('hrv'); if (h2) tr.push(`HRV ${Math.round(h2.a)} vs ${Math.round(h2.b)} ms`);
  if (tr.length) L.push(`Last 2 weeks vs the 2 before (averages): ${tr.join(', ')}.`);
  const body: string[] = [];
  const w = latest('weightKg'); if (w) body.push(`weight ${w.v} kg (${w.date})`);
  const bf = latest('bodyFat'); if (bf) body.push(`body fat ${bf.v}% (${bf.date})`);
  const vo = latest('vo2max'); if (vo) body.push(`VO2 max ${vo.v} (${vo.date})`);
  const o2 = latest('spo2'); if (o2) body.push(`blood oxygen ${o2.v}%`);
  const rr = latest('respRate'); if (rr) body.push(`breathing ${rr.v}/min`);
  if (body.length) L.push(`Body (watch/scale): ${body.join(', ')}.`);
  const act = recent(7).filter((d) => d.activeKcal !== undefined || d.floors !== undefined || d.distanceM !== undefined);
  if (act.length) {
    const a = avg(act.map((d) => d.activeKcal).filter((x): x is number => x !== undefined));
    const km = avg(act.map((d) => d.distanceM).filter((x): x is number => x !== undefined));
    L.push(`Activity, last 7 days (a day): ${[a !== undefined && `${Math.round(a)} active kcal burned (information only, never eaten back)`, km !== undefined && `${(km / 1000).toFixed(1)} km`].filter(Boolean).join(', ')}.`);
  }
  const off = recoveryOff(hs, today);
  if (off.length) L.push(`Clearly off today against their own usual: ${off.map((o) => o.text).join('; ')}.`);
  const first = hs[0]?.date;
  if (first) L.push(`(Watch history goes back to ${first}; older days by lookup health.)`);
  return L.length ? ['BODY & RECOVERY (from the watch):', ...L] : [];
}
