/**
 * "Ask the Coach about this" (a long press on a food, a lift, a past workout or a chart): what the Coach is told about the
 * thing that was pressed, how it is named on the chip above the typing bar, and three questions worth asking about it.
 * Built from the app's own data at the moment of the press, from a small tag on the element (`data-ask`, see askTag).
 */
import type { IconName } from '../ui/Icon';
import { useStore, allExercises, exerciseMap } from '../state/store';
import { dayKey, fmtDate } from './dates';
import { fmtNum } from './units';
import { qtyLabel } from './format';
import { mealName } from './derive';
import { runLookups } from './agentLookup';
import { buildChart, type ChartMetric } from './agentCharts';
import { tNow } from './i18n';
import { workoutName } from './workout';

export type AskKind = 'food' | 'lift' | 'workout' | 'chart';
/** What the Coach is asked about: a chip in the Coach (icon + label), the words the model gets, the questions offered. */
export interface About { kind: AskKind; icon: IconName; label: string; /** its name alone (a heading: no amounts) */ title: string; detail: string; asks: string[] }

/** The tag for an element that can be long-pressed: `<div data-ask={askTag('food', e.id)}>`. */
export const askTag = (k: AskKind, id: string) => `${k}:${id}`;

export function aboutFrom(tag: string): About | null {
  const i = tag.indexOf(':');
  if (i < 1) return null;
  const k = tag.slice(0, i) as AskKind, id = tag.slice(i + 1);
  const st = useStore.getState();
  const lang = st.settings.language;
  const t = tNow;
  const today = dayKey(Date.now(), st.settings.dayStartHour);
  const cap = (s: string, n = 1400) => (s.length > n ? `${s.slice(0, n)}…` : s);

  if (k === 'food') {
    const e = st.entries.find((x) => x.id === id);
    if (!e) return null;
    const meal = st.settings.meals.find((m) => m.id === e.mealId);
    const n = e.nutrients;
    const name = e.snap.name.split(',')[0].trim();
    return {
      kind: k, icon: 'recipe', label: `${name} · ${qtyLabel(e, lang, t)}`, title: name,
      detail: `a logged food: ${e.snap.name}${e.snap.brand ? ` (${e.snap.brand})` : ''}, ${qtyLabel(e, 'en', (x) => x)}, ${Math.round(n.kcal ?? 0)} kcal, ${Math.round(n.protein ?? 0)} g protein, ${Math.round(n.carbs ?? 0)} g carbs, ${Math.round(n.fat ?? 0)} g fat, in ${meal ? mealName(meal, 'en') : e.mealId} on ${e.date}${e.date === today ? ' (today)' : ''} [ref ${e.id}]`,
      asks: [t('Is this a good choice for my goal?'), t('How does it fit the rest of my day?'), t('Give me a swap with more protein')],
    };
  }

  if (k === 'lift') {
    const ex = exerciseMap(st.exercises).get(id);
    if (!ex) return null;
    const name = lang === 'da' && ex.nameDa ? ex.nameDa : ex.name;
    const hist = runLookups(st, [{ kind: 'exercise_history', query: ex.name }], { today, lang, pool: allExercises(st.exercises), mealLabel: (x) => x });
    return {
      kind: k, icon: 'dumbbell', label: name, title: name,
      detail: `the exercise ${ex.name}. Its history:\n${cap(hist)}`,
      asks: [t('How is my {name} going?', { name }), t('What should I do next time?'), t('Give me a swap for it')],
    };
  }

  if (k === 'workout') {
    const ses = st.sessions.find((x) => x.id === id);
    if (!ses) return null;
    const exMap = exerciseMap(st.exercises);
    const unit = st.settings.units.weight;
    const lines = ses.exercises.map((b) => {
      const ex = exMap.get(b.exerciseId);
      const sets = b.sets.filter((x) => x.done).map((x) => (x.weightKg !== undefined ? `${x.weightKg}kg×${x.reps ?? '—'}` : x.reps !== undefined ? `${x.reps} reps` : x.durationSec ? `${x.durationSec}s` : '✓'));
      return `${ex?.name ?? b.exerciseId}: ${sets.join(', ') || 'no sets done'}`;
    });
    const mins = ses.endedAt ? Math.round((ses.endedAt - ses.startedAt - (ses.pausedMs ?? 0)) / 60000) : undefined;
    const when = fmtDate(ses.date, lang, { weekday: 'short', day: 'numeric', month: 'short' });
    return {
      kind: k, icon: 'clock', label: `${workoutName(ses.name, t)} · ${when}`, title: workoutName(ses.name, t),
      detail: `a finished workout: ${ses.name || 'Workout'} on ${ses.date}${mins ? `, ${mins} min` : ''} (weights in kg; they see ${unit}).\n${cap(lines.join('\n'))}`,
      asks: [t('How did this workout go?'), t('What should I change next time?'), t('Compare it with the time before')],
    };
  }

  if (k === 'chart') {
    const [metric, exId] = id.split('|') as [ChartMetric, string | undefined];
    const ex = exId ? exerciseMap(st.exercises).get(exId) : undefined;
    const b = buildChart(metric, { exercise: ex?.name, weeks: 12, today, lang, t });
    if ('miss' in b) return null;
    const pts = b.chart.points.filter((p) => !p.dim).slice(-16).map((p) => `${p.label} ${fmtNum(p.y, 'en', b.chart.digits)}`).join(', ');
    return {
      kind: k, icon: 'progress', label: b.title, title: b.title,
      detail: `the chart "${b.title}" on their screen (${b.subtitle}). Its numbers (${b.chart.unit || 'count'}): ${pts}`,
      asks: [t('What does this show?'), t('Am I on track?'), t('What should I change?')],
    };
  }
  return null;
}
