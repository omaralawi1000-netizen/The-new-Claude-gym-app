/**
 * Sleep score and Ready score (Health screen), from the watch, measured against your own normal. Plan:
 * /mnt/project-files/health/plan/build-plan.md (Omar, 20 Oct: "it has to make sense"; 7 hours must never read 100).
 *
 * Both are made of parts (each 0–100) with weights; a part that can't be measured gives its weight to the others. Pure
 * functions: the screen gathers the data (lib/watchDetail.ts, the store) and passes it in.
 *
 * The Ready score only explains: it never tells you to train lighter (you train to failure; Omar 19 Oct) and never asks
 * how you feel.
 */
import type { SleepSession } from './watchDetail';
import type { ActivityLog, HealthDay, WorkoutSession } from './types';

export interface Part { key: string; score: number; weight: number }
export interface Score { score: number; band: string; parts: Part[]; /** the part that pulled it down most */ low?: string; /** short sleep held the score down to this (it bit) */ cap?: number; /** …because the night was under this many minutes */ capMin?: number }

/** straight lines between points [x, y] (x rising); flat beyond both ends */
export function curve(x: number, pts: [number, number][]): number {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return pts[pts.length - 1][1];
}

const median = (xs: number[]) => { if (!xs.length) return undefined; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);

/** weighted mean of the parts that could be measured (their weights shared out), and the part costing the most points */
function combine(parts: Part[]): { score: number; low?: string } {
  const w = parts.reduce((a, p) => a + p.weight, 0);
  const score = parts.reduce((a, p) => a + p.score * p.weight, 0) / w;
  const low = [...parts].sort((a, b) => (100 - b.score) * b.weight - (100 - a.score) * a.weight)[0];
  return { score, low: low && low.score < 85 ? low.key : undefined };
}

// ── Sleep ────────────────────────────────────────────────────

/** minutes of sleep you need: 8 h, 8 h 30 under 18 */
export const sleepNeed = (age?: number) => (age !== undefined && age < 18 ? 510 : 480);

export function asleepMin(s: SleepSession): number { return s.stages.reduce((a, x) => a + (x.stage ? x.min : 0), 0); }

/** the middle of the sleep as minutes after noon (so a night never wraps round midnight) */
export function midpoint(s: SleepSession): number {
  const d = new Date((s.start + s.end) / 2);
  return (d.getHours() * 60 + d.getMinutes() + 720) % 1440;
}

/** the main sleep of a day: the longest session that ended that day (naps are shown, not scored) */
export function mainSleep(list: SleepSession[] | undefined): SleepSession | undefined {
  return (list ?? []).filter((s) => asleepMin(s) >= 120).sort((a, b) => asleepMin(b) - asleepMin(a))[0];
}

export interface SleepInput {
  night: SleepSession;
  age?: number;
  /** midpoints (minutes after noon) of your earlier nights, newest first; 5+ needed for Timing */
  pastMidpoints?: number[];
  /** your usual resting heart rate (the median of recent days) */
  restHr?: number;
  /** heart rate during the night: time (ms) and bpm */
  hr?: { t: number; bpm: number }[];
}

export function sleepScore(x: SleepInput): Score | null {
  const n = x.night;
  if (!n.stages.length) return null;
  const need = sleepNeed(x.age);
  const asleep = asleepMin(n);
  const inBed = Math.max(asleep, (n.end - n.start) / 60000);
  const parts: Part[] = [];

  // Duration: hours short of what you need
  const short = (need - asleep) / 60;
  parts.push({ key: 'duration', weight: 30, score: asleep <= 240 ? 10 : short >= 0 ? curve(short, [[0, 100], [1, 80], [2, 55], [3, 30], [(need - 240) / 60, 10]]) : curve(-short, [[2, 100], [3, 95]]) });

  // Deep and REM: against a share of what you need (18 % and 22 %), when the watch told the stages apart
  if (n.stages.some((s) => s.stage === 2 || s.stage === 3)) {
    const stage = (k: number) => n.stages.reduce((a, s) => a + (s.stage === k ? s.min : 0), 0);
    const soft: [number, number][] = [[0, 0], [0.25, 30], [0.5, 60], [0.75, 85], [1, 100]];
    parts.push({ key: 'deep', weight: 15, score: curve(stage(2) / (0.18 * need), soft) });
    parts.push({ key: 'rem', weight: 15, score: curve(stage(3) / (0.22 * need), soft) });
  }

  // Restfulness: how much of the time in bed was sleep, and how often you woke (5 min or more; the first one is free)
  const firstSleep = n.stages.findIndex((s) => s.stage !== 0);
  let lastSleep = -1; n.stages.forEach((s, i) => { if (s.stage !== 0) lastSleep = i; });
  const wakes = n.stages.filter((s, i) => s.stage === 0 && s.min >= 5 && i > firstSleep && i < lastSleep).length;
  parts.push({ key: 'rest', weight: 15, score: Math.max(0, curve(asleep / inBed, [[0.6, 10], [0.75, 40], [0.85, 75], [0.92, 100]]) - 4 * Math.max(0, wakes - 1)) });

  // Timing: the middle of the night against your usual middle (last 14 nights)
  const usual = median((x.pastMidpoints ?? []).slice(0, 14));
  if (usual !== undefined && (x.pastMidpoints ?? []).length >= 5) parts.push({ key: 'timing', weight: 10, score: curve(Math.abs(midpoint(n) - usual), [[30, 100], [60, 80], [120, 45], [180, 20]]) });

  // Heart: how far your sleeping heart rate sits above your resting rate; its low point in the last 2 hours costs 10
  const hr = (x.hr ?? []).filter((p) => p.t >= n.start && p.t <= n.end && p.bpm > 0);
  if (x.restHr && hr.length >= 60) {
    const avg = mean(hr.map((p) => p.bpm))!;
    // the low point: the calmest 5 minutes in a row
    let lowT = hr[0].t, lowM = Infinity;
    for (let i = 0; i + 5 <= hr.length; i++) { const m = mean(hr.slice(i, i + 5).map((p) => p.bpm))!; if (m < lowM) { lowM = m; lowT = hr[i].t; } }
    const late = lowT >= n.end - 2 * 3600000;
    parts.push({ key: 'heart', weight: 15, score: Math.max(0, curve(avg - x.restHr, [[3, 100], [6, 75], [10, 45], [15, 15]]) - (late ? 10 : 0)) });
  }

  const c = combine(parts);
  // caps, so the number always means what it says: short sleep can't look great however tidy it was
  const cap = asleep < 300 ? 59 : asleep < 360 ? 74 : asleep < 430 ? 84 : asleep < 460 ? 92 : 100;
  const score = Math.round(Math.min(c.score, cap));
  return { score, band: score >= 85 ? 'Great' : score >= 70 ? 'Good' : score >= 55 ? 'Fair' : 'Poor', parts, low: c.low ?? (cap < 100 && c.score > cap ? 'duration' : undefined), cap: c.score > cap ? cap : undefined, capMin: c.score > cap ? (cap === 59 ? 300 : cap === 74 ? 360 : cap === 84 ? 430 : 460) : undefined };
}

// ── Training load ────────────────────────────────────────────

/** max heart rate by age (Tanaka): 208 − 0.7 × age */
export const maxHr = (age?: number) => 208 - 0.7 * (age ?? 30);

/** heart-rate training impulse (Banister TRIMP) for minutes at an average heart rate */
export function trimp(min: number, avgHr: number, restHr: number, max: number, sex?: 'male' | 'female'): number {
  const r = Math.min(1, Math.max(0, (avgHr - restHr) / (max - restHr)));
  return sex === 'female' ? min * r * 0.86 * Math.exp(1.67 * r) : min * r * 0.64 * Math.exp(1.92 * r);
}

/** one day's load: watch workouts by heart rate; wrestling without heart rate by how hard it felt; lifting by its minutes */
export function dayLoad(date: string, a: { activities: ActivityLog[]; sessions: WorkoutSession[]; restHr?: number; age?: number; sex?: 'male' | 'female' }): number {
  const rest = a.restHr ?? 60, max = maxHr(a.age);
  const atRatio = (r: number) => rest + r * (max - rest);
  let load = 0;
  for (const x of a.activities) {
    if (x.date !== date) continue;
    const min = x.durationSec / 60;
    load += trimp(min, x.avgHr ?? atRatio(x.intensity === 3 ? 0.85 : x.intensity === 2 ? 0.7 : x.kind === 'wrestling' ? 0.7 : 0.55), rest, max, a.sex);
  }
  for (const s of a.sessions) {
    if (s.date !== date || s.status !== 'done' || !s.endedAt) continue;
    const min = Math.min(180, Math.max(0, (s.endedAt - s.startedAt - (s.pausedMs ?? 0)) / 60000));
    load += trimp(min, atRatio(0.5), rest, max, a.sex); // lifting: rests between sets, about half your heart-rate range on average
  }
  return load;
}

// ── Ready ────────────────────────────────────────────────────

export interface ReadyInput {
  /** daily numbers, oldest first, ending today (60+ days is best) */
  days: HealthDay[];
  /** last night's Sleep score */
  sleep?: number;
  /** minutes slept on each of the last 7 nights (missing nights left out) */
  week?: number[];
  age?: number;
  /** each day's training load, oldest first, ending yesterday (28 days) */
  loads?: number[];
}
export const READY_DAYS = 14;

/** null with `learning` = not enough of your normal yet (days with HRV or resting HR so far) */
export function readyScore(x: ReadyInput): (Score & { learning?: undefined }) | { learning: number } {
  const past = x.days.slice(0, -1).slice(-60);
  const today = x.days[x.days.length - 1];
  const known = past.filter((d) => d.hrv || d.restHr).length;
  if (known < READY_DAYS || !today) return { learning: known };
  const parts: Part[] = [];

  // HRV: last 3 nights against your normal, on a log scale (HRV is skewed)
  const ln = past.filter((d) => d.hrv).map((d) => Math.log(d.hrv!));
  const recent = x.days.slice(-3).filter((d) => d.hrv).map((d) => Math.log(d.hrv!));
  if (ln.length >= 10 && recent.length && today.hrv) {
    const m = mean(ln)!, sd = Math.max(0.05, Math.sqrt(mean(ln.map((v) => (v - m) ** 2))!));
    parts.push({ key: 'hrv', weight: 30, score: curve((mean(recent)! - m) / sd, [[-3, 10], [-2, 30], [-1, 60], [0, 85], [0.5, 100]]) });
  }

  // Resting heart rate against your usual
  const rhr = median(past.filter((d) => d.restHr).map((d) => d.restHr!));
  if (rhr !== undefined && today.restHr) parts.push({ key: 'restHr', weight: 20, score: curve(today.restHr - rhr, [[-2, 100], [0, 85], [3, 65], [6, 40], [10, 15]]) });

  // Sleep: last night, less the debt of the week (5 h short over 7 nights costs 15)
  if (x.sleep !== undefined) {
    const need = sleepNeed(x.age);
    const debt = (x.week ?? []).reduce((a, m) => a + Math.max(0, need - m), 0) / 60;
    parts.push({ key: 'sleep', weight: 25, score: Math.max(0, x.sleep - Math.min(15, debt * 3)) });
  }

  // Load: the last 7 days against the last 28 (acute : chronic); a very hard yesterday costs 10
  const loads = x.loads ?? [];
  if (loads.length >= 14) {
    const chronic = mean(loads.slice(-28))!, acute = mean(loads.slice(-7))!;
    if (chronic > 0) {
      const ratio = acute / chronic;
      const s = ratio < 0.8 ? 90 : curve(ratio, [[1.3, 100], [1.5, 70], [1.8, 40], [2, 25]]);
      parts.push({ key: 'load', weight: 25, score: Math.max(0, s - (loads[loads.length - 1] > 2 * chronic ? 10 : 0)) });
    }
  }
  if (!parts.length) return { learning: known };

  const c = combine(parts);
  let score = c.score;
  // small checks: breathing faster than usual, low blood oxygen
  const rr = median(past.filter((d) => d.respRate).map((d) => d.respRate!));
  const checks: string[] = [];
  if (rr !== undefined && today.respRate && today.respRate - rr >= 1.5) { score -= 8; checks.push('breathing'); }
  if (today.spo2 && today.spo2 < 93) { score -= 5; checks.push('oxygen'); }
  score = Math.round(Math.max(0, Math.min(100, score)));
  return { score, band: score >= 80 ? 'Ready' : score >= 60 ? 'Steady' : score >= 40 ? 'Behind' : 'Run down', parts, low: c.low ?? checks[0] };
}
