/**
 * Everything the Health screen shows, worked out from the watch (lib/watchDetail.ts: minutes and sleep stages; the store's
 * `health` and `steps`: one row per day) and from Aven itself (workouts, wrestling, weigh-ins). Pure builders plus one hook
 * that reads the detail from IndexedDB and keeps it fresh.
 */
import { useEffect, useMemo, useState } from 'react';
import { minutes, onWatchDetail, watchDetails, type SleepSession, type WatchDetail } from '../../lib/watchDetail';
import { asleepMin, dayLoad, mainSleep, midpoint, readyScore, sleepScore, type Score } from '../../lib/scores';
import { addDays, dayKey, parseKey, startOfWeek } from '../../lib/dates';
import { trendRate, weightTrend } from '../../lib/stats';
import type { ActivityLog, AppData, HealthDay } from '../../lib/types';

export const DETAIL_DAYS = 30;

/** the watch detail of the last 30 days, by date; null until read */
export function useWatchDays(today: string): Map<string, WatchDetail> | null {
  const [m, setM] = useState<Map<string, WatchDetail> | null>(null);
  useEffect(() => {
    let live = true;
    const load = () => { watchDetails(addDays(today, -DETAIL_DAYS), addDays(today, 1)).then((l) => { if (live) setM(new Map(l.map((d) => [d.date, d]))); }).catch(() => { if (live) setM(new Map()); }); };
    load();
    const off = onWatchDetail(load);
    return () => { live = false; off(); };
  }, [today]);
  return m;
}

const median = (xs: number[]) => { if (!xs.length) return undefined; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const quant = (xs: number[], q: number) => { if (!xs.length) return undefined; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))]; };
// parseKey gives noon (safe from clock changes); the minutes count from midnight
const midnight = (date: string) => { const d = parseKey(date); d.setHours(0, 0, 0, 0); return d.getTime(); };

/** heart rate, a minute at a time, between two moments (from the days that hold them) */
export function hrBetween(det: Map<string, WatchDetail>, from: number, to: number): { t: number; bpm: number }[] {
  const out: { t: number; bpm: number }[] = [];
  for (let d = dayKey(from); d <= dayKey(to); d = addDays(d, 1)) {
    const hm = det.get(d)?.hr; if (!hm) continue;
    const m = minutes(hm), t0 = midnight(d);
    for (let i = 0; i < 1440; i++) { const t = t0 + i * 60000; if (m[i] && t >= from && t <= to) out.push({ t, bpm: m[i] }); }
  }
  return out;
}

export interface Block { from: number; to: number; stage: number }
export interface DayRibbon {
  from: number; to: number;
  sleep: Block[];
  /** steps per half hour */
  steps: number[];
  /** heart rate, 5-minute averages (time, bpm) */
  hr: { t: number; bpm: number }[];
  /** workouts and sports: when, what, what kind (colour) */
  moves: { from: number; to: number; label: string; kind: 'train' | 'cardio' }[];
}

/** the last 24 hours, for the ribbon on top */
export function buildRibbon(det: Map<string, WatchDetail>, data: Pick<AppData, 'sessions' | 'activities'>, now: number, label: (a: ActivityLog) => string): DayRibbon {
  const from = now - 24 * 3600000, to = now;
  const sleep: Block[] = [];
  for (const d of [dayKey(from), dayKey(to)]) for (const s of det.get(d)?.sleep ?? []) {
    for (const st of s.stages) { const a = s.start + st.from * 60000, b = a + st.min * 60000; if (b > from && a < to) sleep.push({ from: Math.max(a, from), to: Math.min(b, to), stage: st.stage }); }
  }
  const steps = new Array(48).fill(0);
  for (let d = dayKey(from); d <= dayKey(to); d = addDays(d, 1)) {
    const sm = det.get(d)?.steps; if (!sm) continue;
    const m = minutes(sm), t0 = midnight(d);
    for (let i = 0; i < 1440; i++) { const t = t0 + i * 60000; if (m[i] && t >= from && t < to) steps[Math.floor((t - from) / 1800000)] += m[i]; }
  }
  const raw = hrBetween(det, from, to), hr: DayRibbon['hr'] = [];
  for (let i = 0; i < raw.length;) {
    const slot = Math.floor((raw[i].t - from) / 300000); let n = 0, sum = 0, j = i;
    while (j < raw.length && Math.floor((raw[j].t - from) / 300000) === slot) { sum += raw[j].bpm; n++; j++; }
    hr.push({ t: from + slot * 300000 + 150000, bpm: sum / n }); i = j;
  }
  const moves: DayRibbon['moves'] = [];
  for (const s of data.sessions) if (s.status === 'done' && s.endedAt && s.endedAt > from && s.startedAt < to) moves.push({ from: s.startedAt, to: s.endedAt, label: s.name, kind: 'train' });
  for (const a of data.activities) { const a0 = a.startAt ?? a.at - a.durationSec * 1000; const a1 = a0 + a.durationSec * 1000; if (a1 > from && a0 < to) moves.push({ from: a0, to: a1, label: label(a), kind: 'cardio' }); }
  return { from, to, sleep, steps, hr, moves };
}

export interface Night { session: SleepSession; asleep: number; stages: Record<'deep' | 'rem' | 'light' | 'awake', number>; score: Score | null; usual?: number; hrLow?: number; hrHigh?: number; last14: { date: string; min: number }[] }

export interface HealthView {
  today: string;
  day?: HealthDay;
  night?: Night;
  ready: ReturnType<typeof readyScore> | null;
  heart: { rest?: number; usual?: number; trace: number[]; hrv?: number; hrvRange?: [number, number]; spo2?: number; resp?: number; restRange?: [number, number]; spo2Range?: [number, number]; respRange?: [number, number]; overnight: { t: number; bpm: number }[]; top?: number; vo2?: number };
  steps: { today?: number; usual?: number; curve: number[]; usualCurve: number[]; week: { date: string; count?: number }[]; nowFrac: number };
  week: { days: { date: string; marks: ('gym' | 'wr' | 'run' | 'miss')[] }[]; cardioMin: number; workouts: number; target: number; sports: { label: string; min: number }[]; last?: ActivityLog };
  body: { kg?: number; date?: string; series: number[]; rate: number | null; fat?: number };
  ribbon: DayRibbon | null;
  hasWatch: boolean;
}

export function buildView(a: { data: AppData; det: Map<string, WatchDetail> | null; today: string; now: number; label: (a: ActivityLog) => string }): HealthView {
  const { data, det, today, now } = a;
  const st = data.settings;
  const age = st.body?.birthYear ? new Date(now).getFullYear() - st.body.birthYear : undefined;
  const days = [...(data.health ?? [])].filter((d) => d.date <= today).sort((x, y) => x.date.localeCompare(y.date));
  const byDate = new Map(days.map((d) => [d.date, d]));
  const day = byDate.get(today);
  const past = days.filter((d) => d.date < today && d.date >= addDays(today, -60));
  const D = det ?? new Map<string, WatchDetail>();

  // ── sleep: the main sleep that ended today
  const restUsual = median(past.slice(-30).filter((d) => d.restHr).map((d) => d.restHr!));
  let night: Night | undefined;
  const main = mainSleep(D.get(today)?.sleep);
  const mids: number[] = [];
  const last14: Night['last14'] = [];
  for (let i = 14; i >= 1; i--) {
    const d = addDays(today, -i), s = mainSleep(D.get(d)?.sleep);
    if (s) mids.unshift(midpoint(s));
    const min = s ? asleepMin(s) : byDate.get(d)?.sleepMin;
    last14.push({ date: d, min: min ?? 0 });
  }
  if (main) {
    const sum = (k: number) => main.stages.reduce((x, s) => x + (s.stage === k ? s.min : 0), 0);
    const hr = hrBetween(D, main.start, main.end);
    const score = sleepScore({ night: main, age, pastMidpoints: mids, restHr: restUsual, hr });
    const bpms = hr.map((p) => p.bpm);
    night = { session: main, asleep: asleepMin(main), stages: { deep: sum(2), rem: sum(3), light: sum(1) + sum(4), awake: sum(0) }, score, usual: median(last14.map((x) => x.min).filter(Boolean)), hrLow: bpms.length ? Math.min(...bpms) : undefined, hrHigh: bpms.length ? Math.max(...bpms) : undefined, last14 };
  }

  // ── ready: everything combined, against your own last 60 days
  const loads: number[] = [];
  for (let i = 28; i >= 1; i--) loads.push(dayLoad(addDays(today, -i), { activities: data.activities, sessions: data.sessions, restHr: restUsual, age, sex: st.body?.sex }));
  const week7 = last14.slice(-7).map((x) => x.min).filter(Boolean);
  const ready = day || past.length ? readyScore({ days: [...past, day ?? { date: today }], sleep: night?.score?.score, week: week7, age, loads }) : null;

  // ── heart
  const r30 = past.slice(-30);
  const range = (xs: number[]): [number, number] | undefined => { const lo = quant(xs, 0.2), hi = quant(xs, 0.8); return lo !== undefined && hi !== undefined ? [lo, hi] : undefined; };
  const overnight = main ? hrBetween(D, main.start, main.end) : [];
  const todayHr = D.get(today)?.hr ? minutes(D.get(today)!.hr) : [];
  const heart: HealthView['heart'] = {
    rest: day?.restHr, usual: restUsual, trace: [...r30, ...(day ? [day] : [])].filter((d) => d.restHr).map((d) => d.restHr!),
    hrv: day?.hrv, hrvRange: range(past.filter((d) => d.hrv).map((d) => d.hrv!)), restRange: range(r30.filter((d) => d.restHr).map((d) => d.restHr!)),
    spo2: day?.spo2, spo2Range: range(r30.filter((d) => d.spo2).map((d) => d.spo2!)), resp: day?.respRate, respRange: range(r30.filter((d) => d.respRate).map((d) => d.respRate!)),
    overnight: smooth5(overnight), top: todayHr.length ? Math.max(...todayHr) || undefined : undefined, vo2: [...days].reverse().find((d) => d.vo2max)?.vo2max,
  };

  // ── steps: today so far against your usual day (cumulative, every 15 minutes)
  const stepsBy = new Map(data.steps.map((s) => [s.date, s.count]));
  const cum = (d: string) => { const sm = D.get(d)?.steps; if (!sm) return null; const m = minutes(sm); const out: number[] = []; let c = 0; for (let i = 0; i < 1440; i++) { c += m[i]; if (i % 15 === 14) out.push(c); } return out; };
  const pastCurves: number[][] = [];
  for (let i = 1; i <= 14; i++) { const c = cum(addDays(today, -i)); if (c && c[95] > 500) pastCurves.push(c); }
  const usualCurve = pastCurves.length >= 3 ? Array.from({ length: 96 }, (_, k) => median(pastCurves.map((c) => c[k]))!) : [];
  const nowMin = Math.max(0, Math.min(1439, Math.round((now - midnight(today)) / 60000)));
  const todayCurve = (cum(today) ?? []).slice(0, Math.floor(nowMin / 15) + 1);
  const pastCounts = Array.from({ length: 14 }, (_, i) => stepsBy.get(addDays(today, -1 - i))).filter((v): v is number => !!v);
  const wkStart = startOfWeek(today, st.weekStart);
  const steps: HealthView['steps'] = {
    today: stepsBy.get(today) ?? (todayCurve.length ? todayCurve[todayCurve.length - 1] : undefined), usual: median(pastCounts), curve: todayCurve, usualCurve,
    week: Array.from({ length: 7 }, (_, i) => { const d = addDays(wkStart, i); return { date: d, count: d <= today ? stepsBy.get(d) : undefined }; }), nowFrac: nowMin / 1440,
  };

  // ── this week: workouts and sports, day by day
  const sch = data.schedule;
  const target = sch.mode === 'rotation' ? sch.rotation.perWeek : Math.max(1, Object.values(sch.weekly).filter(Boolean).length) || 3;
  const wdays = Array.from({ length: 7 }, (_, i) => addDays(wkStart, i));
  const acts = data.activities.filter((x) => x.date >= wkStart && x.date <= today);
  const gyms = data.sessions.filter((x) => x.status === 'done' && x.date >= wkStart && x.date <= today);
  const sportMin = new Map<string, number>();
  for (const x of acts) sportMin.set(a.label(x), (sportMin.get(a.label(x)) ?? 0) + Math.round(x.durationSec / 60));
  const week: HealthView['week'] = {
    days: wdays.map((d) => {
      const marks: HealthView['week']['days'][number]['marks'] = [];
      gyms.filter((x) => x.date === d).forEach(() => marks.push('gym'));
      acts.filter((x) => x.date === d).forEach((x) => marks.push(x.kind === 'wrestling' ? 'wr' : 'run'));
      if (!marks.length && d < today) marks.push('miss');
      return { date: d, marks };
    }),
    cardioMin: acts.reduce((n, x) => n + Math.round(x.durationSec / 60), 0), workouts: gyms.length, target,
    sports: [...sportMin].map(([label, min]) => ({ label, min })).sort((x, y) => y.min - x.min),
    last: [...data.activities].sort((x, y) => y.at - x.at)[0],
  };

  // ── body
  const w = [...data.weights].sort((x, y) => x.date.localeCompare(y.date));
  const lw = w[w.length - 1];
  const body: HealthView['body'] = { kg: lw?.kg, date: lw?.date, series: w.filter((x) => x.date >= addDays(today, -30)).map((x) => x.kg), rate: trendRate(weightTrend(w)), fat: [...days].reverse().find((d) => d.bodyFat)?.bodyFat };

  const hasWatch = !!(days.length || data.steps.length || (det && det.size));
  return { today, day, night, ready, heart, steps, week, body, ribbon: det && det.size ? buildRibbon(D, data, now, a.label) : null, hasWatch };
}

/** 5-minute averages, so a night's curve is calm */
function smooth5(xs: { t: number; bpm: number }[]): { t: number; bpm: number }[] {
  const out: { t: number; bpm: number }[] = [];
  for (let i = 0; i < xs.length; i += 5) { const s = xs.slice(i, i + 5); out.push({ t: s[0].t, bpm: s.reduce((n, p) => n + p.bpm, 0) / s.length }); }
  return out;
}

export function useHealthView(data: AppData, today: string, label: (a: ActivityLog) => string): HealthView {
  const det = useWatchDays(today);
  // the minute: the ribbon's "now" and today's steps curve move on with the clock (once a minute is plenty)
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(id); }, []);
  return useMemo(() => buildView({ data, det, today, now, label }), [data, det, today, now, label]);
}
