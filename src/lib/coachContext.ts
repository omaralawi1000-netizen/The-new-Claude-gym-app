import type { AppData, Exercise } from './types';
import { addDays, diffDays } from './dates';
import { nutritionByDay, trendRate, weekStreak, weeklyTraining, weightTrend, average } from './stats';

/**
 * The compact, factual summary the Coach is given. Everything here is computed on the device from the user's own records;
 * the model only sees this text (never the raw database). Estimates are labelled; missing data is said to be missing.
 */
const r0 = (n: number) => Math.round(n);
const r1 = (n: number) => Math.round(n * 10) / 10;

export function buildCoachContext(d: AppData, today: string, exName: (id: string) => string): string {
  const L: string[] = [];
  const p = d.settings.profile;
  L.push(`Today: ${today}.`);
  L.push(`Profile: goal ${p.goal}, experience ${p.experience}, equipment ${p.equipment}, usually trains ${p.days.length ? `${p.days.length} days/week` : 'on no fixed days'}.`);
  const g = d.settings.goals;
  L.push(g.kcal || g.protein ? `Targets: ${[g.kcal && `${g.kcal} kcal`, g.protein && `${g.protein} g protein`, g.carbs && `${g.carbs} g carbs`, g.fat && `${g.fat} g fat`].filter(Boolean).join(', ')}; water ${g.waterMl} ml.` : 'Targets: none set.');

  // nutrition: last 14 days, logged days only (a day with nothing logged is "not logged", never zero)
  const days = nutritionByDay(d.entries, addDays(today, -13), today);
  const logged = days.filter((x) => x.logged && x.date !== today);
  if (logged.length) {
    const k = average(logged.map((x) => x.kcal)); const pr = average(logged.map((x) => x.protein));
    const partial = logged.filter((x) => x.partial).length;
    L.push(`Nutrition (last 14 days): ${logged.length} days logged before today. Average on logged days: ${r0(k ?? 0)} kcal, ${r0(pr ?? 0)} g protein, ${r0(average(logged.map((x) => x.carbs)) ?? 0)} g carbs, ${r0(average(logged.map((x) => x.fat)) ?? 0)} g fat.${partial ? ` ${partial} of those days had items with unknown nutrition, so their totals are lower bounds.` : ''} Days not logged are unknown, not zero.`);
  } else L.push('Nutrition: no earlier days logged in the last 14 days.');
  const t0 = days[days.length - 1];
  L.push(t0.logged ? `Today so far: ${r0(t0.kcal)} kcal, ${r0(t0.protein)} g protein${t0.partial ? ' (some items have unknown nutrition)' : ''}.` : 'Today so far: nothing logged.');

  // weight: measured vs trend estimate
  const ws = [...d.weights].sort((a, b) => a.date.localeCompare(b.date));
  if (ws.length) {
    const last = ws[ws.length - 1]; const tr = weightTrend(ws); const rate = trendRate(tr);
    L.push(`Bodyweight: last measured ${r1(last.kg)} kg on ${last.date} (${ws.length} weigh-ins in total). Trend (smoothed ESTIMATE) ${r1(tr[tr.length - 1].kg)} kg${rate !== null ? `, changing about ${r1(rate)} kg/week over the last 4 weeks (estimate)` : ', too little data for a weekly rate'}.`);
  } else L.push('Bodyweight: no weigh-ins.');

  // training
  const done = d.sessions.filter((s) => s.status === 'done');
  const wk = weeklyTraining(done, today, 4, d.settings.weekStart);
  L.push(`Training: ${done.length} sessions logged in total; last 4 weeks (oldest→newest): ${wk.map((b) => b.sessions).join(', ')} sessions. Current weekly streak ${weekStreak(wk, Math.max(1, p.days.length || 2))}.`);
  for (const s of done.slice(-5).reverse()) {
    const ex = s.exercises.map((e) => {
      const sets = e.sets.filter((x) => x.done && (x.type === 'working'));
      if (!sets.length) return '';
      const top = sets.reduce((a, b) => ((b.weightKg ?? 0) > (a.weightKg ?? 0) ? b : a));
      return `${exName(e.exerciseId)} ${sets.length}×${top.reps ?? '?'}${top.weightKg ? ` @${r1(top.weightKg)}kg` : ''}`;
    }).filter(Boolean).slice(0, 6);
    L.push(`- ${s.date} ${s.name || 'Workout'} (${diffDays(today, s.date)} days ago): ${ex.join('; ') || 'no completed sets'}${s.records?.length ? `; ${s.records.length} PR` : ''}`);
  }
  const wr = d.activities.filter((a) => a.kind === 'wrestling' && diffDays(today, a.date) < 28);
  if (wr.length) L.push(`Wrestling (last 4 weeks): ${wr.length} sessions, ${Math.round(wr.reduce((n, a) => n + a.durationSec, 0) / 60)} min on the mat${wr.some((a) => a.intensity === 3) ? ', some at max intensity' : ''}. Count it as training load.`);
  if (d.active) L.push(`A workout is running now: ${d.active.name || 'Workout'}, ${d.active.exercises.length} exercises.`);
  if (d.routines.length) L.push(`Routines: ${d.routines.map((r) => `${r.name} (${r.items.length} exercises)`).join(', ')}.`);
  const wkly = d.schedule.weekly; const planned = Object.entries(wkly).filter(([, id]) => id).map(([wd, id]) => `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][Number(wd)]}: ${d.routines.find((r) => r.id === id)?.name ?? '?'}`);
  if (d.schedule.mode === 'weekly' && planned.length) L.push(`Weekly plan: ${planned.join(', ')}.`);
  return L.join('\n').slice(0, 5000);
}

export const COACH_SYSTEM = (lang: 'en' | 'da') =>
  'You are the training and nutrition coach inside Aven, a personal gym and food-logging app. ' +
  'Ground every answer in the DATA block you are given; if the data needed to answer is missing or too thin, say so plainly instead of guessing. ' +
  'Numbers marked ESTIMATE are estimates (weight trend, nutrition with unknown items) — keep that label when you use them. Never present a guess as a measurement. ' +
  'Be concise, practical and warm but direct: usually 3–8 short lines, plain text, simple bullet lists with "- " only when listing; no tables, no headings. ' +
  'Give one clear recommendation when asked what to do, with the main reason. You can only advise: you cannot change the user’s data, and you must not say you did. ' +
  'No medical advice or diagnosis. If they mention pain, injury, illness, pregnancy, medication, disordered eating or a very aggressive diet, say it is outside what you can judge and suggest a doctor or qualified professional. ' +
  `Metric units. Reply in ${lang === 'da' ? 'Danish' : 'English'} unless the user writes in the other language.`;

/** Short profile line for routine generation. */
export function profileLine(d: AppData): string {
  const p = d.settings.profile;
  return `goal ${p.goal}, experience ${p.experience}, equipment ${p.equipment}`;
}

export const exerciseNames = (list: Exercise[]) => list.filter((e) => !e.archived).map((e) => e.name);

import { matchExercises } from './workoutText';
import { fold } from './foodText';
import type { RoutineDraft } from './aiValidate';
import type { RoutineItem } from './types';

/**
 * Turn a model-written routine into real routine items. Only exercises that exist in the user's library are kept
 * (exact name, or one clear match); anything else is reported as skipped — never silently invented.
 */
export function mapRoutineItems(draft: RoutineDraft, pool: Exercise[], mkId: () => string): { items: RoutineItem[]; skipped: string[] } {
  const items: RoutineItem[] = []; const skipped: string[] = []; const used = new Set<string>();
  for (const it of draft.items) {
    let ex = pool.find((e) => fold(e.name) === fold(it.exercise) || (e.nameDa && fold(e.nameDa) === fold(it.exercise)));
    if (!ex) {
      const c = matchExercises(it.exercise, pool, 'en', 3);
      const top = c[0]?.score ?? 0;
      if (c.length && top >= 0.7 && (c.length === 1 || top - c[1].score >= 0.06)) ex = c[0].ex;
    }
    if (!ex || used.has(ex.id)) { if (!ex) skipped.push(it.exercise); continue; }
    used.add(ex.id);
    const timed = ex.logType === 'duration' || ex.logType === 'distance';
    items.push({ id: mkId(), exerciseId: ex.id, warmupSets: 0, workingSets: timed ? 1 : Math.min(8, Math.max(1, it.sets)), repMin: it.repMin, repMax: it.repMax, restSec: Math.min(600, Math.max(15, it.restSec || 90)) });
  }
  return { items, skipped };
}
