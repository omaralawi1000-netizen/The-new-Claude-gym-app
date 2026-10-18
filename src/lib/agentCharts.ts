/**
 * A small chart in the Coach's chat (show_chart): the model asks for a metric, this builds the numbers from the app's own
 * data. The chart travels on the card as plain numbers and words (no functions), so it is still there when the chat is
 * opened again tomorrow. Drawn by the same charts as the Progress tab (ui/charts.tsx), sized for a card.
 */
import { useStore, allExercises } from '../state/store';
import { addDays, fmtDate, startOfWeek } from './dates';
import { fmtNum, kgToDisplay } from './units';
import { countable, epley } from './workout';
import { nutritionByDay, weeklyTraining, weightTrend } from './stats';
import { matchExercises } from './workoutText';
import type { Exercise, Lang } from './types';

export type ChartMetric = 'strength' | 'bodyweight' | 'calories' | 'protein' | 'volume' | 'sessions' | 'mat';
export const CHART_METRICS: ChartMetric[] = ['strength', 'bodyweight', 'calories', 'protein', 'volume', 'sessions', 'mat'];

export interface ChartData {
  type: 'line' | 'bar';
  /** line: one point per day or session (x = time in ms). bar: one bar per day or week */
  points: { x: number; y: number; label: string; sub?: string; dim?: boolean; emphasis?: boolean }[];
  /** a smoothed line through the points (bodyweight) */
  trend?: { x: number; y: number }[];
  target?: number; targetLabel?: string;
  /** decimals and unit for the numbers on it */
  digits: number; unit: string;
  /** what the line or bars are, for screen readers and the legend */
  series: string;
  trendLabel?: string;
}

export interface BuiltChart { title: string; subtitle: string; chart: ChartData }
type T = (k: string, v?: Record<string, string | number>) => string;

const noon = (d: string) => new Date(`${d}T12:00:00`).getTime();
const short = (d: string, lang: Lang) => fmtDate(d, lang, { day: 'numeric', month: 'short' });

/** The numbers for one chart, or why there aren't enough yet. */
export function buildChart(metric: ChartMetric, o: { exercise?: string | null; weeks?: number | null; today: string; lang: Lang; t: T }): BuiltChart | { miss: string } {
  const st = useStore.getState();
  const { lang, t, today } = o;
  const unit = st.settings.units.weight;
  const weeks = Math.max(2, Math.min(52, Math.round(o.weeks ?? 12)));
  const from = addDays(today, -weeks * 7);
  const signed = (v: number, d: number) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${fmtNum(Math.abs(v), lang, d)}`;

  if (metric === 'strength') {
    const pool = allExercises(st.exercises);
    const done = st.sessions.filter((s) => s.status === 'done');
    const used = pool.filter((e) => done.some((s) => s.exercises.some((x) => x.exerciseId === e.id)));
    const hit = o.exercise ? matchExercises(o.exercise, used, lang, 1)[0] : undefined;
    const ex: Exercise | undefined = hit && hit.score >= 0.5 ? hit.ex : undefined;
    if (!ex) return { miss: o.exercise ? t('No sessions of {name} to draw yet', { name: o.exercise }) : t('Which lift should I draw?') };
    const name = lang === 'da' && ex.nameDa ? ex.nameDa : ex.name;
    const points = done.filter((s) => s.date >= from && s.exercises.some((x) => x.exerciseId === ex.id)).map((s) => {
      const sets = s.exercises.filter((x) => x.exerciseId === ex.id).flatMap((x) => x.sets).filter(countable);
      const top = sets.reduce((m, x) => Math.max(m, x.weightKg && x.reps && x.reps <= 12 ? epley(x.weightKg, x.reps) : 0), 0);
      return { x: s.startedAt, y: Math.round(kgToDisplay(top, unit) * 10) / 10, label: short(s.date, lang) };
    }).filter((p) => p.y > 0);
    if (points.length < 2) return { miss: t('No sessions of {name} to draw yet', { name }) };
    const d = points[points.length - 1].y - points[0].y;
    return {
      title: `${name} · ${t('Estimated 1RM')}`,
      subtitle: Math.abs(d) < 0.25 ? t('Steady since {date}', { date: points[0].label }) : `${signed(d, 1)} ${unit} ${t('since {date}', { date: points[0].label })}`,
      chart: { type: 'line', points, digits: 0, unit, series: t('Estimated 1RM') },
    };
  }

  if (metric === 'bodyweight') {
    const ws = [...st.weights].filter((w) => w.date >= from).sort((a, b) => a.date.localeCompare(b.date));
    if (ws.length < 2) return { miss: t('Log your weight a few times and I can draw it') };
    const trend = weightTrend(st.weights).filter((p) => p.date >= from);
    const d = trend.length >= 2 ? trend[trend.length - 1].kg - trend[0].kg : ws[ws.length - 1].kg - ws[0].kg;
    return {
      title: t('Bodyweight'),
      subtitle: `${signed(kgToDisplay(d, unit), 1)} ${unit} ${t('since {date}', { date: short(ws[0].date, lang) })}`,
      chart: {
        type: 'line', digits: 1, unit, series: t('Weigh-ins'), trendLabel: t('Trend (estimate)'),
        points: ws.map((w) => ({ x: noon(w.date), y: Math.round(kgToDisplay(w.kg, unit) * 10) / 10, label: short(w.date, lang) })),
        trend: trend.map((p) => ({ x: noon(p.date), y: Math.round(kgToDisplay(p.kg, unit) * 100) / 100 })),
      },
    };
  }

  if (metric === 'calories' || metric === 'protein') {
    // a bar a day, never more than four weeks (more is a wall of bars on a card)
    const days = Math.min(28, weeks * 7);
    const nut = nutritionByDay(st.entries, addDays(today, -(days - 1)), today);
    const logged = nut.filter((x) => x.logged);
    if (logged.length < 2) return { miss: t('Log a few days of food and I can draw it') };
    const key = metric === 'calories' ? 'kcal' : 'protein';
    const goal = metric === 'calories' ? st.settings.goals.kcal : st.settings.goals.protein;
    const avg = logged.reduce((n, x) => n + x[key], 0) / logged.length;
    const u2 = metric === 'calories' ? 'kcal' : 'g';
    return {
      title: metric === 'calories' ? t('Calories per day') : t('Protein per day'),
      subtitle: `${t('avg {n}', { n: `${fmtNum(Math.round(avg), lang, 0)} ${u2}` })}${goal ? ` · ${t('target {n}', { n: fmtNum(goal, lang, 0) })}` : ''} · ${t('{n} days logged', { n: logged.length })}`,
      chart: {
        type: 'bar', digits: 0, unit: u2, series: metric === 'calories' ? t('Calories per day') : t('Protein per day'),
        target: goal || undefined, targetLabel: goal ? t('target') : undefined,
        points: nut.map((x) => ({ x: noon(x.date), y: Math.round(x[key]), label: String(Number(x.date.slice(8))), sub: fmtDate(x.date, lang, { weekday: 'short', day: 'numeric', month: 'short' }), dim: !x.logged, emphasis: x.date === today })),
      },
    };
  }

  // weekly: training volume, workouts, minutes on the mat
  const wk = weeklyTraining(st.sessions, today, weeks, st.settings.weekStart);
  const cur = startOfWeek(today, st.settings.weekStart);
  const bars = wk.map((b) => {
    const end = addDays(b.start, 6);
    const y = metric === 'volume' ? Math.round(kgToDisplay(b.volume, unit))
      : metric === 'sessions' ? b.sessions
      : Math.round(st.activities.filter((x) => x.kind === 'wrestling' && x.date >= b.start && x.date <= end).reduce((n, x) => n + x.durationSec, 0) / 60);
    return { x: noon(b.start), y, label: fmtDate(b.start, lang, { day: 'numeric', month: 'numeric' }), sub: `${t('Week of')} ${short(b.start, lang)}`, emphasis: b.start === cur };
  });
  if (bars.filter((b) => b.y > 0).length < 1) return { miss: metric === 'mat' ? t('No wrestling logged in these weeks') : t('No workouts in these weeks') };
  const past = bars.slice(0, -1).filter((b) => b.y > 0);
  const avg = past.length ? past.reduce((n, b) => n + b.y, 0) / past.length : 0;
  const u2 = metric === 'volume' ? unit : metric === 'sessions' ? '' : 'min';
  const title = metric === 'volume' ? t('Weekly volume') : metric === 'sessions' ? t('Sessions per week') : t('Mat time per week');
  return {
    title,
    subtitle: avg ? t('avg {n} a week', { n: `${fmtNum(metric === 'sessions' ? Math.round(avg * 10) / 10 : Math.round(avg), lang, metric === 'sessions' ? 1 : 0)}${u2 ? ` ${u2}` : ''}` }) : t('This week so far'),
    chart: { type: 'bar', digits: 0, unit: u2, series: title, points: bars },
  };
}
