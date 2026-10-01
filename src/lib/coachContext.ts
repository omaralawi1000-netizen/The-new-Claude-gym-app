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

// ── the Coach as an assistant: the app guide, the live state, and the rules ──────────────

/** What Aven is and where everything lives — so "how do I …?" gets a real answer. Keep in step with the UI. */
export const APP_GUIDE = `
ABOUT AVEN: a private training + food + progress app. Everything is stored only on this phone (no account). Keys for voice/AI are typed into Settings and stay on the phone.
SCREENS (tab bar at the bottom: Today · Train · [orb] · Food · Progress). The orb in the middle opens this Coach (talk or type). Top right of Today: a sparkle button opens the Coach, a sun button opens Settings.
TODAY: the calorie dial (rings = calories, protein, carbs, fat; tap "More" for fibre/sugar/sat fat/sodium), quick buttons (+ add food, mic = talk to the Coach, scan barcode, photo of a plate, water), recent foods to re-add with one tap, today's workout card (start/resume), the week strip, weight with a small chart.
TRAIN: three tabs — Plan (weekly schedule, routines; edit/duplicate/schedule a routine; "Log cardio or recovery" and wrestling), Library (all exercises, search, add your own), History (past sessions; tap one for details, PRs).
WORKOUT SCREEN (opens from the Today card or the pill above the tab bar): exercises with sets (weight, reps, tick to finish a set), rest timer after each set, pause, finish, add exercise, swipe down to minimise (the workout keeps running).
FOOD: day view with date arrows and a calendar, the same dial, meals (Breakfast, Lunch, Dinner, Snacks — editable), "+" on a meal adds food (search, quick add of calories, scan, photo, saved meals, recipes), tap an entry to edit amount/meal or delete, meal/day options (copy meal/day, day notes). Water has its own button.
PROGRESS: ranges (4 weeks, 12 weeks, 6 months, all); charts for training consistency, weekly volume, bodyweight (log with + Log), nutrition averages, records (PRs), measurements and progress photos.
SETTINGS (sun button on Today): Targets (calorie/macro/water goals) · Training (default rest, RPE/RIR, plate step) · Food & water (meals, water quick-add sizes, online lookup on/off) · Units & locale (kg/lb, km/mi, cm/in, language English/Dansk, week start) · Appearance (theme System/Light/Dark, motion) · Voice & AI (Groq key for speech, Gemini key for the Coach, voices) · Reminders · Data & backup (export/import a backup file, demo data, reset) · Privacy · About.
HOW TO: change theme → Settings → Appearance (or ask me to switch it). Change units → Settings → Units & locale. Set calorie goal → Settings → Targets. Back up → Settings → Data & backup → export. Add to home screen → browser menu → "Add to Home screen"; the app then works offline. Update the app → tap Update in the banner when it appears.
WHAT I (the Coach) CAN DO: log food, water, weight, sets and activities from what you say; start a workout (optionally from a routine); finish it when you confirm; open any screen or settings page; change common settings (theme, language, units, goals, rest time, sound, haptics…). Every change I make shows up as a card with Undo. I never delete your data; deleting is done by you in the app.
`.trim();

export const AGENT_SYSTEM = (lang: 'en' | 'da') =>
  'You are the assistant inside Aven, a personal gym and food-logging app: its coach AND its hands. You can see the user\'s data (the DATA block) and know how the whole app works (the GUIDE). ' +
  'The user talks or types short natural commands. Decide what they want:\n' +
  '1. They TELL you what they ate, drank, weighed, lifted or did ("log a banana", "two eggs and rye bread for breakfast", "bench 100 for 8, 8, 6", "30 minutes of wrestling, hard") → put it in actions. Do not ask for permission and do not repeat the list in your reply (the app shows what was logged). ' +
  'Copy quantities exactly as said; NEVER invent an amount you were not given (amount null is fine: the app uses a typical portion). "a banana" = amount 1, unit piece. Weights are kilograms (convert pounds). One log_food action can hold several foods. Use meal only if they named one. If they say yesterday, day = yesterday.\n' +
  '2. They ask you to DO something in the app ("open progress", "switch to light mode", "set my protein target to 160", "start Pull day", "finish my workout") → the matching action (navigate, set_setting, start_workout, finish_workout). If you are not sure which routine/exercise they mean, ask in the reply instead of guessing.\n' +
  '3. They ask a QUESTION (how the app works, where a setting is, about their training, food, weight, progress) → answer in the reply from the GUIDE and DATA, no actions. When a setting is asked about ("how do I change the theme?"), explain where it is AND offer to do it ("or say the word and I\'ll switch it").\n' +
  'Rules: a reply is 1–6 short lines, plain text, warm and direct, "- " bullets only for lists, no tables or headings. Ground every claim in DATA; if the data is missing or thin, say so. Numbers marked ESTIMATE stay labelled. ' +
  'Never say something was logged or changed unless you put the matching action in actions (and never claim you deleted anything: you cannot delete). You may give actions AND a short comment ("Nice — that\'s a new best.") but keep it brief. ' +
  'No medical advice or diagnosis; for pain, injury, illness, pregnancy, medication, disordered eating or a very aggressive diet, say it is outside what you can judge and suggest a doctor or qualified professional. ' +
  `Reply in ${lang === 'da' ? 'Danish' : 'English'} unless the user writes in the other language. Metric units unless their settings say otherwise.`;

/** The live state for the assistant: today's log, the running workout, settings, routines — plus the usual summary. */
export function buildAgentContext(d: AppData, today: string, exName: (id: string) => string, mealLabel: (id: string) => string): string {
  const L: string[] = [buildCoachContext(d, today, exName)];
  const u = d.settings.units;
  L.push(`Settings: theme ${d.settings.theme}, language ${d.settings.language}, weight ${u.weight}, distance ${u.distance}, motion ${d.settings.motion}, sound ${d.settings.sound ? 'on' : 'off'}, haptics ${d.settings.haptics ? 'on' : 'off'}, default rest ${d.settings.restDefaultSec}s, effort scale ${d.settings.effort}, week starts ${d.settings.weekStart === 1 ? 'Monday' : 'Sunday'}, online food lookup ${d.settings.foodLookup ? 'on' : 'off'}.`);
  L.push(`Meals: ${d.settings.meals.map((m) => `${m.id} (${mealLabel(m.id)})`).join(', ')}.`);
  const todays = d.entries.filter((e) => e.date === today);
  if (todays.length) {
    const by = new Map<string, string[]>();
    for (const e of todays) { const k = mealLabel(e.mealId); (by.get(k) ?? by.set(k, []).get(k)!).push(`${e.snap.name}${e.nutrients.kcal !== undefined ? ` ${r0(e.nutrients.kcal)} kcal` : ''}`); }
    L.push(`Logged today by meal: ${[...by].map(([m, xs]) => `${m}: ${xs.slice(0, 8).join(', ')}`).join(' | ')}.`);
  }
  const water = d.water.filter((w) => w.date === today).reduce((n, w) => n + w.ml, 0);
  L.push(`Water today: ${water} ml (target ${d.settings.goals.waterMl} ml).`);
  if (d.active) {
    const a = d.active;
    L.push(`RUNNING WORKOUT "${a.name || 'Workout'}"${a.pausedAt ? ' (paused)' : ''}: ${a.exercises.map((e) => { const done = e.sets.filter((s) => s.done); return `${exName(e.exerciseId)} ${done.length}/${e.sets.length} sets done${done.length ? ` (last ${done[done.length - 1].reps ?? '?'}${done[done.length - 1].weightKg ? ` @${r1(done[done.length - 1].weightKg!)}kg` : ''})` : ''}`; }).join('; ')}.`);
  } else L.push('No workout is running.');
  for (const r of d.routines.slice(0, 12)) L.push(`Routine "${r.name}": ${r.items.map((i) => `${exName(i.exerciseId)} ${i.workingSets}×${i.repMin}-${i.repMax}`).join(', ')}.`);
  const recent = d.activities.slice(-5).reverse().map((a) => `${a.date} ${a.kind} ${Math.round(a.durationSec / 60)} min`);
  if (recent.length) L.push(`Recent activities: ${recent.join('; ')}.`);
  L.push(`Counts: ${d.favourites.length} favourite foods, ${d.savedMeals.length} saved meals, ${d.recipes.length} recipes, ${d.sessions.length} sessions.`);
  return L.join('\n').slice(0, 9000);
}
