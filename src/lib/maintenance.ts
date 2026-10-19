/**
 * True maintenance (Omar, 19 Oct): the calories he really keeps his weight on, worked out from what he logs and what the
 * scale does, not from a formula. Over the last 4 weeks: average logged intake minus what the weight change says
 * (7,700 kcal a kilo). Relative to his own logging, so a target built on it works even if some evenings go unlogged.
 * And the "invisible calories": when the watch says he burns clearly more than the logs and the scale add up to, the gap
 * is most likely food that wasn't logged.
 */
import type { AppData } from './types';
import { addDays, diffDays } from './dates';
import { unfinishedDays } from './dataQuality';

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

/** Every weigh-in: the ones typed into Aven, and the scale's through the watch (Aven's own wins on the same day). */
export function weighIns(d: Pick<AppData, 'weights' | 'health'>): { date: string; kg: number }[] {
  const by = new Map<string, number>();
  for (const h of d.health ?? []) if (h.weightKg) by.set(h.date, h.weightKg);
  for (const w of d.weights) by.set(w.date, w.kg);
  return [...by].map(([date, kg]) => ({ date, kg })).sort((a, b) => a.date.localeCompare(b.date));
}

/** The weight change per day over the points (least squares, so one odd weigh-in doesn't swing it). */
function slopePerDay(pts: { date: string; kg: number }[]): number {
  const x0 = pts[0].date;
  const xs = pts.map((p) => diffDays(p.date, x0)), ys = pts.map((p) => p.kg);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0, den = 0;
  xs.forEach((x, i) => { num += (x - mx) * (ys[i] - my); den += (x - mx) ** 2; });
  return den ? num / den : 0;
}

/** null until there is enough to say anything: 10 logged days and 4 weigh-ins two weeks apart in the last 4 weeks. */
export function trueMaintenance(d: Pick<AppData, 'entries' | 'weights' | 'health'>, today: string, days = 28): Maintenance | null {
  const from = addDays(today, -days), to = addDays(today, -1);
  const intake = intakeByDay(d, from, to);
  // a day with its usual dinner missing is a log that wasn't finished, not a day they ate little (lib/dataQuality.ts)
  for (const u of unfinishedDays(d, today, days)) intake.delete(u.date);
  if (intake.size < 10) return null;
  const pts = weighIns(d).filter((w) => w.date >= from && w.date <= today);
  if (pts.length < 4 || diffDays(pts[pts.length - 1].date, pts[0].date) < 14) return null;
  const avgIntake = [...intake.values()].reduce((a, b) => a + b, 0) / intake.size;
  const slope = slopePerDay(pts);
  const kcal = Math.round((avgIntake - slope * KCAL_PER_KG) / 10) * 10;
  const confidence = intake.size >= 20 && pts.length >= 10 ? 'high' : intake.size >= 14 && pts.length >= 6 ? 'medium' : 'low';
  const out: Maintenance = { kcal, confidence, loggedDays: intake.size, weighIns: pts.length, kgPerWeek: Math.round(slope * 7 * 100) / 100, avgIntake: Math.round(avgIntake) };
  // the watch's total burn, where it has 10 days: a clear gap above what the logs say = most likely unlogged food
  const burn = (d.health ?? []).filter((h) => h.date >= from && h.date <= to && h.totalKcal).map((h) => h.totalKcal!);
  if (burn.length >= 10) {
    const watchBurn = Math.round(burn.reduce((a, b) => a + b, 0) / burn.length);
    out.watchBurn = watchBurn;
    if (watchBurn - kcal >= 300) out.invisible = Math.round((watchBurn - kcal) / 50) * 50;
  }
  return out;
}

/** A target from his goal and true maintenance: fat loss ~0.5 kg a week, muscle a small surplus, otherwise maintenance. */
export function suggestedTarget(m: Maintenance, goal: string | undefined): number {
  const delta = goal === 'fatloss' ? -500 : goal === 'muscle' ? 250 : 0;
  return Math.max(1500, Math.round((m.kcal + delta) / 50) * 50);
}
