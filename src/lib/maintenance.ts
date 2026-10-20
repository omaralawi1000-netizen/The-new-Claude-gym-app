/**
 * True maintenance (Omar, 19 Oct): the calories he really keeps his weight on, worked out from what he logs and what the
 * scale does, not from a formula. Over the last 4 weeks: average logged intake minus what the weight change says
 * (7,700 kcal a kilo). Relative to his own logging, so a target built on it works even if some evenings go unlogged.
 * Made robust after review round 1 (one typo of a weigh-in gave 6,910 kcal "high"): weigh-ins far off their neighbours
 * are left out, and so are the two mornings after a big day (water, salt, food in the gut) while enough remain; the trend
 * is the median of the slopes between weigh-ins at least a week apart (one odd point can't swing it); a trend steeper
 * than 1.5 kg a week and a result outside 1,200–6,000 are clamped and marked low confidence.
 * And the "invisible calories": when the watch says they burn clearly more (500+ kcal and 20 %+) than the logs and the
 * scale add up to, either the watch overestimates or some food isn't logged.
 */
import type { AppData } from './types';
import { addDays, diffDays } from './dates';
import { oddWeighIns, unfinishedDays, weighIns } from './dataQuality';

export { weighIns };

export interface Maintenance {
  kcal: number;
  confidence: 'low' | 'medium' | 'high';
  loggedDays: number; weighIns: number;
  /** the weight trend, kg a week (negative = losing) */
  kgPerWeek: number;
  avgIntake: number;
  /** kcal a day that are probably not logged (only from the watch's burn, so rough) */
  invisible?: number; watchBurn?: number;
}

const KCAL_PER_KG = 7700;

/** Logged days in a range: days with real food on them (a lone coffee is not a logged day). */
export function intakeByDay(d: Pick<AppData, 'entries'>, from: string, to: string): Map<string, number> {
  const by = new Map<string, number>();
  for (const e of d.entries) if (e.date >= from && e.date <= to) by.set(e.date, (by.get(e.date) ?? 0) + (e.nutrients.kcal ?? 0));
  for (const [k, v] of by) if (v < 800) by.delete(k);
  return by;
}

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** The weight change per day: the median of the slopes between weigh-ins at least a week apart (Theil–Sen), so one odd
 *  weigh-in can't swing it. */
function slopePerDay(pts: { date: string; kg: number }[]): number {
  const xs: number[] = [];
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
    const dd = diffDays(pts[j].date, pts[i].date);
    if (dd >= 7) xs.push((pts[j].kg - pts[i].kg) / dd);
  }
  return xs.length ? median(xs) : 0;
}

/** null until there is enough to say anything: 10 logged days and 4 weigh-ins two weeks apart in the last 4 weeks. */
export function trueMaintenance(d: Pick<AppData, 'entries' | 'weights' | 'health'>, today: string, days = 28): Maintenance | null {
  const from = addDays(today, -days), to = addDays(today, -1);
  const intake = intakeByDay(d, from, to);
  // a day with its usual dinner missing is a log that wasn't finished, not a day they ate little (lib/dataQuality.ts)
  for (const u of unfinishedDays(d, today, days)) intake.delete(u.date);
  if (intake.size < 10) return null;
  // weigh-ins that are probably a typo or a glitch, and the two mornings after a big day (while 6 or more remain)
  const odd = new Set(oddWeighIns(d, today, days).map((w) => w.date));
  const all = weighIns(d).filter((w) => w.date >= from && w.date <= today && !odd.has(w.date));
  const usual = median([...intake.values()]);
  const big = [...intake].filter(([, k]) => k >= usual + Math.max(600, usual * 0.25)).map(([date]) => date);
  const after = new Set(big.flatMap((x) => [addDays(x, 1), addDays(x, 2)]));
  const calm = all.filter((w) => !after.has(w.date));
  const pts = calm.length >= 6 ? calm : all;
  if (pts.length < 4 || diffDays(pts[pts.length - 1].date, pts[0].date) < 14) return null;
  const avgIntake = [...intake.values()].reduce((a, b) => a + b, 0) / intake.size;
  const raw = slopePerDay(pts);
  const slope = Math.max(-1.5 / 7, Math.min(1.5 / 7, raw));
  const exact = avgIntake - slope * KCAL_PER_KG;
  const kcal = Math.round(Math.max(1200, Math.min(6000, exact)) / 10) * 10;
  const clamped = slope !== raw || Math.abs(kcal - exact) > 10;
  const steep = Math.abs(slope * 7) > 1;
  // (high needs the weigh-ins spread over 3 weeks: two weeks of daily weigh-ins are still mostly water swings)
  const span = diffDays(pts[pts.length - 1].date, pts[0].date);
  const confidence = clamped || steep ? 'low' : intake.size >= 20 && pts.length >= 10 && span >= 21 ? 'high' : intake.size >= 14 && pts.length >= 6 ? 'medium' : 'low';
  const out: Maintenance = { kcal, confidence, loggedDays: intake.size, weighIns: pts.length, kgPerWeek: Math.round(slope * 7 * 100) / 100, avgIntake: Math.round(avgIntake) };
  // the watch's total burn, where it has 10 days: a clear gap above what the logs say
  const burn = (d.health ?? []).filter((h) => h.date >= from && h.date <= to && h.totalKcal).map((h) => h.totalKcal!);
  if (burn.length >= 10) {
    const watchBurn = Math.round(burn.reduce((a, b) => a + b, 0) / burn.length);
    out.watchBurn = watchBurn;
    if (confidence !== 'low' && watchBurn - kcal >= 500 && watchBurn - kcal >= kcal * 0.2) out.invisible = Math.round((watchBurn - kcal) / 50) * 50;
  }
  return out;
}

/** A target from his goal and true maintenance: fat loss ~0.5 kg a week, muscle a small surplus, otherwise maintenance. */
export function suggestedTarget(m: Maintenance, goal: string | undefined): number {
  const delta = goal === 'fatloss' ? -500 : goal === 'muscle' ? 250 : 0;
  return Math.max(1500, Math.round((m.kcal + delta) / 50) * 50);
}
