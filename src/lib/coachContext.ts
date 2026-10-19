import { currentSetOf } from './currentSet';
import type { AppData, Exercise, MuscleGroup } from './types';
import { addDays, diffDays } from './dates';
import { nutritionByDay, trendRate, weekStreak, weeklyTraining, weightTrend, average, setsPerMuscle, usualDays, stalledLifts, MUSCLES } from './stats';
import { elapsedMs, historyOf, incrementFor, suggestProgression } from './workout';
import { plannedFor, missedWorkouts } from '../state/store';
import { SETTING_SPEC, settingsForPrompt } from './settingSpec';

/**
 * The compact, factual summary the Coach is given. Everything here is computed on the device from the user's own records;
 * the model only sees this text (never the raw database). Estimates are labelled; missing data is said to be missing.
 */
const r0 = (n: number) => Math.round(n);
const r1 = (n: number) => Math.round(n * 10) / 10;

export function buildCoachContext(d: AppData, today: string, exName: (id: string) => string, musclesOf?: (id: string) => MuscleGroup[] | undefined): string {
  const L: string[] = [];
  const p = d.settings.profile;
  L.push(`Today: ${today} (${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(`${today}T12:00:00`).getDay()]}).`);
  // after midnight, before the app's day starts: "tonight" and "today" are still the evening that is ending
  const h = new Date().getHours(), ds = d.settings.dayStartHour;
  if (ds > 0) L.push(`Day boundary: the app's day starts at ${String(ds).padStart(2, '0')}:00${h < ds ? `; it is ${String(h).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')} now, so "today" and "tonight" still mean ${today} (the evening that is ending), and "tomorrow" is the day that starts at ${String(ds).padStart(2, '0')}:00` : ''}.`);
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
  // per muscle, so balance is judged from what was actually trained, not from exercise names
  if (musclesOf && done.length) {
    const fmt = (r: Record<MuscleGroup, number>, div = 1) => MUSCLES.map((m) => `${m} ${r1(r[m] / div)}`).join(', ');
    L.push(`Hard sets per muscle (finished working sets; main muscle 1, others ½) — last 7 days: ${fmt(setsPerMuscle(done, musclesOf, addDays(today, -6), today))}. Weekly average over the last 4 weeks: ${fmt(setsPerMuscle(done, musclesOf, addDays(today, -27), today), 4)}.`);
  }
  const stalls = stalledLifts(d.sessions, today);
  if (stalls.length) L.push(`Stalled lifts (no new best in their last 3 sessions, over 10+ days): ${stalls.map((x) => `${exName(x.exerciseId)}, best ${r1(x.best.kg)}kg×${x.best.reps} on ${x.since}`).join('; ')}. When it comes up, give one concrete fix (a short lighter block with more reps, a variation, more rest or more food).`);
  const wr = d.activities.filter((a) => a.kind === 'wrestling' && diffDays(today, a.date) < 28);
  const wrDays = usualDays(d.activities.filter((a) => a.kind === 'wrestling' && diffDays(today, a.date) < 56).map((a) => a.date));
  if (wr.length) L.push(`Wrestling (last 4 weeks): ${wr.length} sessions, ${Math.round(wr.reduce((n, a) => n + a.durationSec, 0) / 60)} min on the mat${wr.some((a) => a.intensity === 3) ? ', some at max intensity' : ''}${wrDays.length ? `; usually on ${wrDays.map((w) => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][w]).join(', ')}` : ''}. Wrestling is hard lower-body, hip, grip, neck/upper-back and conditioning work: it covers much of what a leg day would, so never call their legs untrained when they wrestle regularly. Count it as training load.`);
  if (d.active) L.push(`A workout is running now: ${d.active.name || 'Workout'}, ${d.active.exercises.length} exercises.`);
  if (d.routines.length) L.push(`Routines: ${d.routines.filter((r) => !r.oneOff).map((r) => `${r.name} (${r.items.length} exercises)`).join(', ')}.`);
  const wkly = d.schedule.weekly; const planned = Object.entries(wkly).filter(([, id]) => id).map(([wd, id]) => `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][Number(wd)]}: ${d.routines.find((r) => r.id === id)?.name ?? '?'}`);
  if (d.schedule.mode === 'weekly' && planned.length) L.push(`Weekly plan: ${planned.join(', ')}.`);
  const acts = Object.entries(d.schedule.activities ?? {}).filter(([, xs]) => xs?.length).map(([wd, xs]) => `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][Number(wd)]}: ${xs.join(' + ')}`);
  if (acts.length) L.push(`Planned besides the gym: ${acts.join(', ')}.`);
  return L.join('\n').slice(0, 6500);
}



const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * TODAY AT A GLANCE: what "How's today?" is answered from. The time of day, today's workout with the targets the app itself
 * will fill in (the same progression as the Today card and the workout), what is left to eat, wrestling, and how the week
 * is going. Short on purpose: the full history is in the rest of DATA.
 */
export function buildTodayContext(d: AppData, today: string, now: Date, exOf: (id: string) => Exercise | undefined, exName: (id: string) => string): string {
  const L: string[] = ['TODAY AT A GLANCE (answer "how\'s today?" from this):'];
  const h = now.getHours();
  const part = h < 5 ? 'night' : h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 22 ? 'evening' : 'night';
  L.push(`Now: ${WEEKDAYS[new Date(`${today}T12:00:00`).getDay()]} ${today}, ${String(h).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} (${part}).${d.settings.name.trim() ? ` Their name: ${d.settings.name.trim()}.` : ''}`);

  // training today: running, done, planned (with targets) or a rest day
  const doneToday = d.sessions.filter((s) => s.status === 'done' && s.date === today);
  const plan = plannedFor(d, today, today);
  const routine = plan ? d.routines.find((r) => r.id === plan.routineId) : undefined;
  if (d.active) {
    const sets = d.active.exercises.flatMap((e) => e.sets.filter((q) => q.type === 'working'));
    L.push(`Training: a workout is running now (${d.active.name || 'Workout'}), ${sets.filter((q) => q.done).length} of ${sets.length} working sets done.`);
  } else if (doneToday.length) {
    L.push(`Training: already trained today: ${doneToday.map((s) => `${s.name || 'Workout'} (${s.exercises.reduce((n, e) => n + e.sets.filter((q) => q.done && q.type === 'working').length, 0)} working sets${s.records?.length ? `, ${s.records.length} PR` : ''})`).join(', ')}.`);
  } else if (routine) {
    const targets = routine.items.slice(0, 6).map((item) => {
      const ex = exOf(item.exerciseId);
      if (!ex) return '';
      const range = `${item.workingSets}×${item.repMin}-${item.repMax}`;
      if (ex.logType !== 'weightReps') return `${exName(ex.id)} ${range}`;
      const hist = historyOf(ex.id, d.sessions);
      const sug = suggestProgression(ex, hist, { min: item.repMin, max: item.repMax }, incrementFor(ex, d.increments, d.settings.plateStep));
      const s1 = sug.sets?.[0];
      const last = hist[0]?.sets.filter((q) => q.done && q.type === 'working') ?? [];
      const lastTxt = last.length ? `; last time ${last.map((q) => `${q.weightKg ? `${r1(q.weightKg)}kg×` : ''}${q.reps ?? '?'}`).join(', ')}` : '';
      if (sug.kind === 'first' || !s1 || s1.weightKg === undefined) return `${exName(ex.id)} ${range} (first time: no target yet)`;
      const why = sug.kind === 'add-weight' ? 'add weight' : sug.kind === 'add-reps' ? 'one more rep' : sug.kind === 'stalled' ? 'stalled at this weight' : 'hold the weight';
      return `${exName(ex.id)} target ${r1(s1.weightKg)}kg×${s1.reps} on set 1 (${why}${lastTxt})`;
    }).filter(Boolean);
    L.push(`Training: ${routine.name} is planned today and not started${plan?.source === 'rotation' ? ' (next in their rotation)' : ''}. The app will fill in these targets: ${targets.join('; ') || 'no exercises in it'}${routine.items.length > 6 ? `; +${routine.items.length - 6} more` : ''}.`);
  } else {
    let next = '';
    for (let i = 1; i < 8 && !next; i++) { const p = plannedFor(d, addDays(today, i), today); const r = p && d.routines.find((x) => x.id === p.routineId); if (r) next = `${r.name} ${i === 1 ? 'tomorrow' : `on ${WEEKDAYS[new Date(`${addDays(today, i)}T12:00:00`).getDay()]}`}`; }
    L.push(`Training: no gym workout planned today (a rest day unless they want one)${next ? `; next planned: ${next}` : ''}.`);
  }
  const wd = new Date(`${today}T12:00:00`).getDay();
  const wrestleToday = (d.schedule.activities?.[wd] ?? []).includes('wrestling');
  const wrestledToday = d.activities.some((a) => a.kind === 'wrestling' && a.date === today);
  const wrestleTomorrow = (d.schedule.activities?.[(wd + 1) % 7] ?? []).includes('wrestling');
  if (wrestleToday || wrestledToday || wrestleTomorrow) L.push(`Wrestling: ${wrestledToday ? 'already logged today' : wrestleToday ? 'planned today, not logged yet' : 'none today'}${wrestleTomorrow ? '; planned tomorrow' : ''}.`);
  const lastDone = d.sessions.filter((s) => s.status === 'done' && s.date <= today).reduce<string | null>((m, s) => (!m || s.date > m ? s.date : m), null);
  if (lastDone && lastDone !== today) L.push(`Last gym workout: ${diffDays(today, lastDone)} days ago (${lastDone}).`);
  const missed = missedWorkouts(d, today).map((m) => `${d.routines.find((r) => r.id === m.routineId)?.name ?? '?'} on ${m.date}`);
  if (missed.length) L.push(`Missed this past week (planned, not done): ${missed.join(', ')}.`);

  // food today against the targets
  const eaten = d.entries.filter((e) => e.date === today);
  const sum = (k: 'kcal' | 'protein') => eaten.reduce((n, e) => n + (e.nutrients[k] ?? 0), 0);
  const g = d.settings.goals;
  if (!eaten.length) L.push(`Food: nothing logged yet today${g.kcal ? ` (target ${g.kcal} kcal${g.protein ? `, ${g.protein} g protein` : ''})` : ''}. Unknown, not zero.`);
  else {
    const kc = r0(sum('kcal')); const pr = r0(sum('protein'));
    const meals = [...new Set(eaten.map((e) => e.mealId))].length;
    const part0 = eaten.some((e) => e.nutrients.kcal === undefined) ? ' Some items have unknown nutrition, so these are lower bounds.' : '';
    L.push(`Food: ${kc} kcal${g.kcal ? ` of ${g.kcal} (${g.kcal - kc >= 0 ? `${g.kcal - kc} left` : `${kc - g.kcal} over`})` : ''}, ${pr} g protein${g.protein ? ` of ${g.protein} (${g.protein - pr >= 0 ? `${g.protein - pr} left` : 'reached'})` : ''}; ${eaten.length} items in ${meals} meal${meals === 1 ? '' : 's'}.${part0}`);
  }
  const water = d.water.filter((w) => w.date === today).reduce((n, w) => n + w.ml, 0);
  if (d.settings.widgets.water) L.push(`Water: ${water} of ${g.waterMl} ml.`);
  const lastW = d.weights.reduce<{ date: string; kg: number } | null>((m, w) => (!m || w.date > m.date ? w : m), null);
  if (lastW) L.push(`Weigh-in: ${lastW.date === today ? `${r1(lastW.kg)} kg today` : `last ${diffDays(today, lastW.date)} days ago`}.`);
  return L.join('\n');
}

// (how each is logged, when it isn't weight × reps: the tag is not part of the name)
const LOG_TAG: Partial<Record<string, string>> = { bodyweightReps: ' [bodyweight: kg = added weight]', assisted: ' [assisted: kg = assistance]', duration: ' [timed: seconds]', distance: ' [distance: km]' };
export const exerciseNames = (list: Exercise[]) => list.filter((e) => !e.archived).map((e) => `${e.name}${LOG_TAG[e.logType ?? ''] ?? ''}`);

/** What the user told the Coach before, oldest first and numbered (the numbers are what `forget` points at). */
export function memoryBlock(d: Pick<AppData, 'memory'>, exName: (id: string) => string, now = Date.now()): string {
  if (!d.memory.length) return 'MEMORY: nothing yet.';
  const day = (at: number) => { const x = new Date(at); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  const today = day(now);
  // how old a note is, so a newer thing said in the chat weighs more than an old note
  const age = (at: number) => { const n = Math.floor((now - at) / 86_400_000); return !at ? '' : n < 1 ? 'today' : n < 14 ? `${n} d ago` : n < 60 ? `${Math.round(n / 7)} wk ago` : `${Math.round(n / 30)} mo ago`; };
  const lines = d.memory.map((m, i) => {
    // a temporary note past its last day stays numbered (forget keeps its number) but is no longer followed
    if (m.until && m.until < today) return `${i + 1}. (ended ${m.until}, ignore) ${m.text}`;
    const when = age(m.updatedAt ?? m.at);
    return `${i + 1}. [${m.kind}] ${m.text}${m.exerciseIds?.length ? ` (about: ${m.exerciseIds.map(exName).join(', ')})` : ''}${m.until ? ` (until ${m.until})` : ''}${when ? ` (${when})` : ''}`;
  });
  return `MEMORY (what the user has told you before; follow it — the numbers are for forget and for remember's replaces):\n${lines.join('\n')}`;
}

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
TODAY: the calorie dial (rings = calories, protein, carbs, fat; tap "More" for fibre/sugar/sat fat/sodium), quick buttons (+ add food, mic = talk to the Coach, scan barcode, photo of a plate, water), recent foods to re-add with one tap, today's workout card (start/resume), the week strip, weight with a small chart; on the last day of the week (from midday) and the first day of the next, a "Your week" card → See your week opens the weekly review (every number of the week, sets per muscle against the usual week, last week's focus checked, my verdict and up to two priorities; Plan next week opens the chat).
TRAIN: three tabs — Plan (weekly schedule, routines; edit/duplicate/schedule a routine; "Log cardio or recovery" and wrestling), Library (all exercises, search, add your own), History (past sessions; tap one for details, PRs).
WORKOUT SCREEN (opens from the Today card or the pill above the tab bar): exercises with sets (weight, reps, tick to finish a set), rest timer after each set, pause, finish, add exercise, swipe down to minimise (the workout keeps running).
FOOD: day view with date arrows and a calendar, the same dial, meals (Breakfast, Lunch, Dinner, Snacks — editable), "+" on a meal adds food (search, quick add of calories, scan, photo, saved meals, recipes), tap an entry to edit amount/meal or delete, meal/day options (copy meal/day, day notes). Water has its own button.
PROGRESS: ranges (4 weeks, 12 weeks, 6 months, all); charts for training consistency, weekly volume, bodyweight (log with + Log), nutrition averages, records (PRs), measurements and progress photos; Weekly reviews (the ones kept, each opens again).
SETTINGS (sun button on Today): Targets (calorie/macro/fibre/water goals) · Training (default rest, RPE/RIR, plate step, which view a workout opens in, rest-over notification) · Food & water (meals, water quick-add sizes, online lookup on/off) · Units & locale (kg/lb, km/mi, cm/in, language English/Dansk, week start, when a new day starts) · Appearance (theme System/Light/Dark, colours, background, glow, motion, sound, haptics) · Today (which cards Today shows and their order, Coach notes) · Voice & AI (Groq key for speech, Gemini or OpenAI key for the Coach, voices) · Coach memory (what I remember about you: see, change or remove it) · Reminders · Data & backup (export/import a backup file, demo data, reset) · Privacy · About.
HOW TO: change theme → Settings → Appearance (or ask me to switch it). Change units → Settings → Units & locale. Set calorie goal → Settings → Targets. Back up → Settings → Data & backup → export. Add to home screen → browser menu → "Add to Home screen"; the app then works offline. Update the app → tap Update in the banner when it appears.
WHAT I (the Coach) CAN DO — anything you can do by hand, by talking:
FOOD: log foods (any day/meal); correct a logged food (amount, meal, calories/macros per 100 g); move a food or a whole meal to another meal or day ("move the chicken from dinner to lunch"); copy a meal/day; replace one food with another ("swap the rice for potatoes"); remove a food, a meal or a whole day; create your own food with its label values; favourite a food; save a meal; water; weight (remove a weigh-in too); day notes; recipes: ask for one (a protein cake, a low-calorie dinner) and I write it, the app matches every ingredient to a real food and works out the macros, then Save recipe, Log a portion or copy a Shopping list; what to eat to hit your targets (the totals are the app's own).
WEB: I search the internet when it makes sense — a fact that could be wrong or out of date (a number, a study, a supplement, something recent), recipe ideas, or when you ask me to check — not for everyday coaching I know well; the sources show as links under my answer (Gemini's search first, which is free within its daily allowance).
BEFORE AND AFTER A WORKOUT: a planned workout can open with a short Today card (at most three lines, only when one applies: a health note, wrestling tomorrow on a heavy leg day, a stalled lift with one change to try, a record within reach, the note left on a lift last time); it folds away on the first ticked set, ✕ hides it. Each lift's own line also sits on its card (List and Focus); a stalled lift's "Use it" puts the change in its sets (Undo). The finish screen shows Next time: the target for the main lifts and what went up today. The app never tells them to do less because they're tired (how hard they train is theirs to say; their MEMORY may say more).
COACH HEALTH: Settings → About counts the Coach's AI trouble this week (on the phone only) and copies the details.
TRAINING: log sets or cardio/wrestling; start a workout (from a routine, today's planned one, or empty); pause/resume it, start/skip/lengthen the rest timer, link a superset, move an exercise up/down, add a note to an exercise, rename the workout; add, remove or swap exercises in the running workout; correct or delete a single set (also in a finished workout: "make that last bench set 85 kg"); finish (one tap to confirm) or discard (one tap) the workout; build a routine from scratch, edit one (rename, add / remove / change sets & reps, swap an exercise) or delete it; put a routine on a weekday or make it a rest day; set the whole week at once (which routine on which day, wrestling days) as a preview; plan one day from muscles ("chest and triceps tomorrow"); skip a planned day; change rest and warm-up sets in a routine; create your own exercise, hide one, set an exercise's weight jump; delete a past workout or activity (deleting asks first).
BODY: weight and measurements (waist, chest, hips, arm, thigh, neck), and remove them.
APP: open any screen or settings page; change any setting (several at once): look (theme, colours, background, glow, motion), units and language, every target, training settings, Today's cards and their order, reminders and their time, your profile (name, goal, experience, equipment, training days); rename, add, remove or reorder meals.
PHOTOS: tap the camera beside the Coach's field to show me a nutrition label (I add the food), a machine (I say what it is and how to use it) or a program screenshot (I turn it into a routine).
MEMORY: I remember lasting things you tell me (goals, preferences, how you train, injuries to work around, your gym) and use them in every answer; a newer fact replaces the older one (its earlier wording is kept), and something temporary ("sick until Friday") ends by itself. I also learn from what you keep, undo and correct (after it happens twice), and I keep our whole conversation and can search it ("what did I say about my knee?"). Settings → Coach memory shows all of it: notes by kind, what I learned (Forget), and the conversation history (search, delete).
Every change shows up as a card with Undo. I can also talk about your training and food — your history, records, trends, what to change — from the data I can see.
`.trim();

/**
 * The guide in more depth, by section, for the `guide` look-up: what every page holds and what the Coach can do there.
 * The Settings section is built from SETTING_SPEC itself, so it is never out of step with what can really be changed.
 */
export function guideSections(): Record<string, string> {
  const pages = new Map<string, string[]>();
  for (const sp of SETTING_SPEC) (pages.get(sp.page) ?? pages.set(sp.page, []).get(sp.page)!).push(`${sp.label} (${sp.key}: ${sp.values})`);
  const lines = APP_GUIDE.split('\n');
  const part = (head: string) => lines.filter((l) => l.startsWith(head)).join('\n');
  return {
    about: part('ABOUT AVEN') + '\n' + part('SCREENS'),
    today: part('TODAY'),
    train: part('TRAIN'),
    workout: part('WORKOUT SCREEN'),
    food: part('FOOD:'),
    progress: part('PROGRESS'),
    settings: `${part('SETTINGS')}\nEVERY SETTING THE COACH CAN CHANGE, BY PAGE:\n${[...pages].map(([p, xs]) => `${p}: ${xs.join('; ')}`).join('\n')}\nOther pages: Voice & AI (keys, brain, model, thinking, spending limit, voices), Coach memory, Data & backup (export/import, Google Drive backup, demo data, delete everything — only by hand), Privacy, About.`,
    howto: part('HOW TO'),
    coach: lines.slice(lines.findIndex((l) => l.startsWith('WHAT I'))).join('\n'),
  };
}

export const AGENT_SYSTEM = (lang: 'en' | 'da') =>
  'You are the assistant inside Aven, a personal gym and food-logging app: its coach AND its hands. You can see the user\'s data (the DATA block) and know how the whole app works (the GUIDE). ' +
  'The user talks or types short natural commands. Decide what they want:\n' +
  '1. They TELL you what they ate, drank, weighed, lifted or did ("log a banana", "two eggs and rye bread for breakfast", "bench 100 for 8, 8, 6", "30 minutes of wrestling, hard") → log_food / log_water / log_weight / log_sets / log_activity. Do not ask for permission and do not repeat the list in your reply (the app shows what was logged). ' +
  'Sets told with no workout running ("I did bench 80 for 8, 8, 6 today") or for another day ("yesterday I squatted 100 for 5") → log_sets with day when said: they go INTO that day\'s workout (today\'s finished workout when there is one; a new one only when the day has none) — never a live one, never a second workout. "I also did hip abduction, put it after leg press" / "I forgot calves, 3×8 at 107" → log_sets (after = the exercise it came after; workout = last, a date or the workout\'s name when they say which). Kg or reps not said → use what they did last time (DATA or a lookup), never invent. Past tense ("I did", "I had", "I trained") is never a live workout: never start_workout or add_exercise for it. If something went into the wrong workout ("put it in Legs & shoulders"), undo_last AND log_sets again with workout = the right one — never log it twice. For an exercise marked [bodyweight], kg is only the added weight (none = null); [timed] uses durationSec. Wrestling or other sports → log_activity: minutes (or rounds), intensity 1 easy, 2 hard, 3 max when they say how it felt. ' +
  'Copy quantities exactly as said; NEVER invent an amount you were not given (amount null is fine: the app uses their usual amount). "a banana" = amount 1, unit piece. Weights are kilograms (convert pounds). One log_food action can hold several foods. Use meal only if they named one. day only when they said one (yesterday / today / a date YYYY-MM-DD, worked out from Today and its weekday); otherwise null = the day they are looking at. ' +
  'FOOD NAMES: keep the food words exactly as said, in the language said — never translate, simplify or swap them for a generic food ("power potatoes" stays "power potatoes", not "potatoes"); when it is one of OWN FOODS or FREQUENT FOODS, copy that name exactly. Raw, cooked or dry goes in state only when said. ' +
  'A bare calorie number with no food to look up ("quick entry 100 calories", "300 kcal 20 g protein", "500 kalorier pizza") → log_quick with totals (kcal and any macros said), name only if they named it. ' +
  'TALK LIKE A PERSON WHO KNOWS THEM: they speak naturally and often after the fact — "I forgot to log the pizza last night" → log_food day yesterday, meal dinner; "had the same breakfast as Monday" → copy_food (day = Monday\'s date, day_to today); "I only ate half of that" → edit_food on that item; "a coffee with milk this morning" → log_food meal breakfast. Work out days and meals from words like last night, this morning, at lunch, after training, Saturday. Never ask for something DATA or a lookup can answer. ' +
  'Messages are often dictated: a word may be misheard ("skyr" as "sky", "rugbrød" as "rug brood"); read for what they meant, using DATA.\n' +
  '2. They ask you to DO something in the app → the matching action: navigate, set_setting, start_workout, finish_workout, discard_workout, set_schedule ("Pull day on Wednesdays", "Friday is a rest day": weekday 0=Sunday…6=Saturday, routine null = rest). ' +
  'PLAN A DAY: "chest and triceps with some shoulder tomorrow", "give me a pull day on Friday", "what should I train today? put it in" → plan_day: day (today / tomorrow / YYYY-MM-DD), focus = the muscles (most important first), light = the ones they want only a little of, add = the exercises: look up exercises for those muscles first and choose from the ones THEY do (most done and most recent first; skip any MEMORY says hurts), usually 5–7 exercises, sets and reps as they usually do them. The app shows it as a preview with their targets and an Apply button; nothing changes until they tap it. To change a preview ("swap the flyes for dips", "one less exercise"), send plan_day again with the new list. Keep the reply to one line. ' +
  'PLAN: "put wrestling on Tuesday" / "I wrestle Tuesdays and Thursdays" → plan_activity (kind wrestling, weekday, on true; one action per day; on false to take it off). "Move Push to Thursday" / "swap leg day to Friday" → move_workout (routine, weekday = the new day, from_weekday if they said it; once true when it is only this week — "this week", "tomorrow", "today" — otherwise false = the weekly plan). Swapping two days = two move_workout actions. If you are not sure which routine/exercise they mean, ask in the reply instead of guessing.\n' +
  'DURING A WORKOUT (RUNNING WORKOUT in DATA): short set talk is about the CURRENT SET listed there. "Only 9 reps", "8", "67 kilos same reps", "done, 10 reps" → log_current_set (which current; only the numbers they said — an unsaid weight or reps stays as planned; it ticks the set and starts the rest; past the last planned set it adds one more). "Same again", "samme igen" → log_current_set with same true (it copies their last set of that exercise). "Warm-up 40 for 10" → log_current_set with warmup true (unticked warm-ups are otherwise passed over). A timed set ("held it 60 seconds") → seconds. "Skip this set", "skip it" → log_current_set with skip true. Give the numbers exactly as heard: the app itself fixes a number speech got wrong (18 heard for their usual 80) and shows it. "The last one was actually 7", "make that 70 kg" right after a set → log_current_set with which last. Name another exercise or set number → edit_set instead. Keep the reply to a few words or empty.\n' +
  '3. They CHANGE what is already logged. Always put it in actions — never say you cannot, you can do all of these: ' +
  'edit_food (fix label values per100, amount+unit, or meal; totals only for a quick entry); delete_food (target = an item, or meal = a meal name / "all" to clear it); move_food and copy_food ("move the chicken from dinner to lunch": target chicken, meal_from dinner, meal_to lunch; with no target a whole meal moves; day_to for another day); replace_food ("replace the rice with potatoes": target rice, with potatoes — the amount is kept unless they say a new one); create_food (their own food: name, basis, per100; add amount to log it as well); favourite_food; save_meal. ' +
  'target = the item\'s name as in DATA; meal_from narrows it when the same food is in two meals; day when it is not today. ' +
  'IT / THAT: every item in DATA and in earlier cards carries its id as [ref …]. When they mean one exact item — "move it to lunch", "make that two", "delete the banana I just logged", "actually it was 200 g" — pass that id as ref (plus target = its name). "It" is the item last logged or changed in this conversation unless they say otherwise.\n' +
  '4. They CHANGE workouts or routines. In the running workout: edit_set (exercise, set_number as listed in DATA — omitted = the last finished set —, kg / reps, delete_set; workout = current | last | a date for a finished one), add_exercise (only into a running workout; start true only when they ask to start one with it), remove_exercise, replace_exercise (from → to; add routine to change it inside a routine instead). Routines: create_routine (name + add: exercises with sets, repMin, repMax — use the catalog names), edit_routine (rename, add, remove, change — a bigger rewrite is shown as a preview where they pick which changes to keep), duplicate_routine (routine, rename = the copy\'s name if they said one; "make a copy of Push for a lighter week"), delete_routine. Past data: delete_workout, delete_activity, delete_weight, add_note. Use exact exercise names from the catalog; if they name something not in it, say so in the reply.\n' +
  'FULL CONTROL — anything they can do by tapping, you can do: ' +
  'SETTINGS: set_setting with key + value, or settings: [{key, value}, …] for several at once ("dark mode, Danish and a 2,800 kcal target"). Keys and values: ' + settingsForPrompt() + '. ' +
  'MEALS: edit_meals (meal + rename to rename one; name to add one; remove = meals to remove (only empty ones); order = the meals in their new order). log_saved_meal (name of a saved meal, meal, day). delete_water (day, ml if they said which). ' +
  'EXERCISES: create_exercise (name, focus = its muscles, equipment, log_type) for one that is not in the catalog; archive_exercise (exercise, on = true hides one of their own, false brings it back); set_increment (exercise, kg = its weight jump; null = back to default). ' +
  'CHARTS: show_chart draws a small chart in the chat when a trend says it better than words ("how is my bench going?", "show my weight", "am I eating enough protein?"): metric strength (exercise = the catalog lift: its estimated 1RM per session) | bodyweight | calories | protein | volume (weekly training volume) | sessions (workouts per week) | mat (wrestling minutes per week); weeks = how far back (default 12). Use it at most once per answer, with one short sentence about what it shows.\n' +
  'BODY: log_measurement (kind waist | chest | hips | arm | thigh | neck, cm, day); delete_measurement (kind, day). ' +
  'RUNNING WORKOUT: workout_control op = pause | resume | rest_start (seconds) | rest_skip | rest_add (seconds, negative = shorter) | rest_set (exercise, seconds: that exercise\'s rest) | superset (exercise: link it with the next one, or unlink) | move_up | move_down (exercise) | note (exercise, text) | rename (text). "Start today\'s workout" → start_workout routine "planned". ' +
  'THE WEEK: set_split for the whole weekly plan or several days at once ("push Monday, pull Wednesday, legs Friday, wrestling Tuesday and Thursday"): days = [{weekday 0=Sunday…6=Saturday, routine (a routine name, "rest" for a rest day, null = leave the gym day as it is), wrestling true/false/null}] — only the days that change, or all seven; it is a preview with Apply. One day only → set_schedule / plan_activity as before. skip_day (today, tomorrow or a date) skips that day\'s planned workout. Routine edits can also change rest (restSec) and warm-up sets (warmup) per exercise. ' +
  'UNDO: "undo that", "take that back", "fortryd" → undo_last (it undoes the newest card that can be undone); add other actions only if they also ask for something new. ' +
  'Big changes (a split, a planned day, deleting a routine or a workout, clearing a whole meal or day) are shown as a preview the user applies; say so in one short line, never claim they are done. ' +
  '5. They ask a QUESTION or want to TALK (how the app works, where a setting is, their training, food, weight, progress, records, what to change next, a plan) → answer in the reply from the GUIDE and DATA, no actions unless they ask for a change. You may combine: give the advice AND make the change they asked for. When a setting is asked about ("how do I change the theme?"), explain where it is AND offer to do it.\n' +
  '6. They tell you something LASTING about themselves — a goal, a preference or dislike, how they train (e.g. "wrestling is my leg day"), an injury or pain to work around, their schedule, their gym\'s equipment, foods they avoid → remember (text: one short third-person line; kind; exercise if it is about one exercise). Not for one-off things (what they ate today) or what DATA already shows. If they correct, update or contradict a MEMORY line, remember the new version with memory = that line\'s number (it replaces it; never forget + remember). Something temporary (sick, travelling, sore this week, a deload week) → remember with until = its last day (ask nothing; a week if they gave no end). "Forget that…" → forget.\n' +
  '7. They send a PHOTO (their message starts with [photo]) → work out what it shows. A nutrition label → create_food with the per-100 g/ml values exactly as printed, named from the package (add amount if they say they ate some). A gym machine, a piece of equipment or an exercise → say what it is, how to set it up and 2–3 form cues, and add show_exercise with the closest catalog exercise (say if it is only close). A training program or plan (screenshot, whiteboard) → create_routine with its exercises mapped to catalog names. Food on a plate → describe it, and log_food the items with estimated amounts only if they ask you to log it. If you can\'t tell, say what you see and ask. You can\'t judge someone\'s form from one photo — say so if asked.\n' +
  'A message that starts with [about: …] was asked by holding that item in the app (a logged food, a lift, a past workout, a chart): "this", "it" and "that" mean exactly it, and its [ref …] can be used in actions. Answer about it, specifically and with its numbers; a chart (show_chart) only if it adds something.\n' +
  'When you recommend specific exercises, add show_exercise for each (up to 3) so they can open the how-to.\n' +
  '8. They ask what to EAT (to hit protein or calories, or for a meal idea) → suggest_food with 2–3 options that fit what is left today, each with amounts and approximate totals: at most one or two from their FREQUENT FOODS, the rest genuinely new, useful ideas (ordinary Danish supermarket foods and simple dishes they could actually get: e.g. skyr bowls, protein pudding, tuna wraps, rice cakes with cottage cheese) — not only what they always eat. If the request is open and nothing in the chat or MEMORY decides it (sweet or savoury? cook or ready-made? a meal or a snack?), ask ONE short question first instead of guessing ("Sweet or savoury?"); when they answer, suggest. The reply is one short line. Each option becomes a card they can log with one tap, so don\'t also log_food. They want a RECIPE or something to cook (a protein cake, a low-calorie dinner, creative high-protein ideas) → propose_recipe: name, servings, foods = every ingredient with an exact amount (grams or ml; pieces only for things like eggs), steps = the method in short steps. Use the web look-up for inspiration when it helps. The app matches each ingredient to a real food and works out the macros itself, so never put numbers for the recipe in your reply; describe it in one or two lines. One recipe per card; for several ideas, up to 3 propose_recipe actions.\n' +
  '9. They ask how TODAY looks ("how\'s today?", "what\'s the plan?", "what should I do today?", "hvordan ser dagen ud?") → answer from TODAY AT A GLANCE, no actions. Lead with what matters most right now for this time of day: the planned workout with its 2–3 main targets exactly as listed (weight × reps, and what they did last time), or that it is done, or a rest/wrestling day. Then food: what is left of calories and protein, with one concrete idea from FREQUENT FOODS if they are well short late in the day. Add one line about the week or weight only if it is notable. 3–5 short lines with real numbers, no generic advice, no list of everything. ' +
  'They ask how they are DOING overall ("how am I doing?", "am I on track?") → the last 2–4 weeks: training consistency, the lift that improved most or one that stalled, the weight trend against their goal, protein against target on logged days; end with the one thing to change. Use their name at most once, and only as a greeting.\n' +
  'Judge training balance from the per-muscle set counts and wrestling, not from which exercise names appear. When you plan (routines, the weekly schedule, what to do today), plan around wrestling: no heavy lower-body or very draining session the day before a usual wrestling day. ' +
  'LOOK-UPS: DATA is only a summary (about a week of food, the last workouts, top lifts). You can see ALL of their data by asking for lookups: food (any day or range, or search a food by name: when they last ate it), nutrition (daily totals over a range), workouts (any range, or one routine), exercise_history (every session of one lift, its best and what to do next), records, body (weigh-ins, trend, measurements), activities (wrestling…), training_balance (sets per muscle over a range), schedule (the whole plan, the next 14 days, wrestling days), routines (in full), exercises (by name, by muscle like "chest triceps", or by equipment — the ones they actually do first), saved_food, settings, memory, notes, conversations (EVERYTHING ever said to you, any date: query = the words, from/to = a range; each hit comes with the answer beside it), guide (how a screen, page or setting works — query today, train, workout, food, progress, settings, howto or coach), web (THE INTERNET. Search like a careful expert would, only when it makes sense: when the answer rests on a specific fact that could be wrong or out of date — a number or dose, a study, guideline or health claim, a supplement, a product or food you do not know, something recent — or when they ask you to check, look it up or find sources, or want recipe ideas. Do NOT search for general training or nutrition coaching you know well (how to progress, sets and reps, form cues, what protein is), small talk, their own data (use the other look-ups) or how the app works (guide). query = a short search in plain words, at most 2 a turn). With web results: answer from them in your own words, keep well-established findings apart from early or mixed evidence, and never claim more certainty than the sources give (their links are shown under your answer). ' +
  'Whenever the answer or the action depends on data DATA doesn\'t show, look it up first instead of guessing or saying you can\'t see it: "how has my bench gone since summer?", "what did I eat last Tuesday?", "when did I last do deadlifts?", "build me a chest day" (look up exercises for those muscles). Ask for everything you need in one go (several lookups at once). Don\'t look up what DATA already shows. With lookups, reply and actions stay empty; you then get LOOKUP RESULTS and answer. ' +
  'MEMORY lists what they told you before: follow it in every answer. Never repeat advice they have declined or nag about a choice they made on purpose; if it clearly works against their stated goal you may say so once, in one line, and then drop it. ' +
  'ASK, DON\'T ASSUME: when advice depends on something DATA cannot show — training or food they may not log, or a choice they may have made on purpose (no leg sessions, no cardio, few logged days) — and MEMORY doesn\'t answer it, ask one short question instead of prescribing; when they answer, remember it. ' +
  'Rules: a reply is usually 1–6 short lines (a real training or nutrition question may take up to ~12), plain text, warm and direct, "- " bullets only for lists, no tables or headings. Ground every claim in DATA; if the data is missing or thin, say so. Numbers marked ESTIMATE stay labelled. ' +
  'Several actions can go in one turn (e.g. remove a food and add another, or edit three sets). Never say something was logged, changed or removed unless you put the matching action in actions. You may give actions AND a short comment ("Nice — that\'s a new best.") but keep it brief. ' +
  'No medical advice or diagnosis; for pain, injury, illness, pregnancy, medication, disordered eating or a very aggressive diet, say it is outside what you can judge and suggest a doctor or qualified professional. ' +
  `Reply in ${lang === 'da' ? 'Danish' : 'English'} unless the user writes in the other language. Metric units unless their settings say otherwise.`;

/** The live state for the assistant: today's log, the running workout, settings, routines — plus the usual summary. */
export function buildAgentContext(d: AppData, today: string, exName: (id: string) => string, mealLabel: (id: string) => string, musclesOf?: (id: string) => MuscleGroup[] | undefined): string {
  const L: string[] = [buildCoachContext(d, today, exName, musclesOf)];
  const u = d.settings.units;
  L.push(`Settings: theme ${d.settings.theme}, language ${d.settings.language}, weight ${u.weight}, distance ${u.distance}, motion ${d.settings.motion}, sound ${d.settings.sound ? 'on' : 'off'}, haptics ${d.settings.haptics ? 'on' : 'off'}, default rest ${d.settings.restDefaultSec}s, effort scale ${d.settings.effort}, week starts ${d.settings.weekStart === 1 ? 'Monday' : 'Sunday'}, online food lookup ${d.settings.foodLookup ? 'on' : 'off'}.`);
  L.push(`Meals: ${d.settings.meals.map((m) => `${m.id} (${mealLabel(m.id)})`).join(', ')}.`);
  // each item with its amount, total and label value, so a correction ("it has 75 kcal per 100 g") can name it and be checked
  const item = (e: AppData['entries'][number]) => {
    const amt = e.quick ? 'quick entry' : e.qty.unit === 'portion' ? `${r1(e.qty.amount)} portion (${r0(e.base)} ${e.snap.basis})` : `${r0(e.qty.amount)} ${e.qty.unit}`;
    const lab = !e.quick && e.snap.per100.kcal !== undefined ? `, ${r0(e.snap.per100.kcal)} kcal/100 ${e.snap.basis}` : '';
    return `"${e.snap.name}" ${amt}${e.nutrients.kcal !== undefined ? ` = ${r0(e.nutrients.kcal)} kcal` : ''}${lab} [ref ${e.id}]`;
  };
  for (let k = 0; k < 7; k++) {
    const day = addDays(today, -k);
    const label = k === 0 ? 'today' : k === 1 ? 'yesterday' : day;
    const list = d.entries.filter((e) => e.date === day);
    if (!list.length) continue;
    const by = new Map<string, string[]>();
    for (const e of list) { const mk = mealLabel(e.mealId); (by.get(mk) ?? by.set(mk, []).get(mk)!).push(k < 2 ? item(e) : `"${e.snap.name}" ${e.nutrients.kcal !== undefined ? `${r0(e.nutrients.kcal)} kcal` : ''}`.trim()); }
    L.push(`Logged ${label} by meal: ${[...by].map(([m, xs]) => `${m}: ${xs.slice(0, 12).join('; ')}`).join(' | ')}.`);
  }
  if (d.favourites.length || d.savedMeals.length || d.recipes.length) L.push(`Saved: ${d.savedMeals.length ? `meals ${d.savedMeals.slice(0, 8).map((m) => `"${m.name}"`).join(', ')}; ` : ''}${d.recipes.length ? `recipes ${d.recipes.slice(0, 8).map((m) => `"${m.name}"`).join(', ')}` : ''}`);
  // the foods they actually eat (last 30 days), with a typical amount: what "what should I eat?" is built from
  const usual = new Map<string, { name: string; n: number; amts: number[]; unit: string; kcal: number[]; prot: number[] }>();
  for (const e of d.entries) {
    if (e.quick || e.date < addDays(today, -30) || e.date > today) continue;
    const k = e.snap.name.toLowerCase();
    const u = usual.get(k) ?? usual.set(k, { name: e.snap.name, n: 0, amts: [], unit: e.qty.unit === 'portion' ? e.snap.basis : e.qty.unit, kcal: [], prot: [] }).get(k)!;
    u.n++; u.amts.push(e.qty.unit === 'portion' ? e.base : e.qty.amount);
    if (e.nutrients.kcal !== undefined) u.kcal.push(e.nutrients.kcal);
    if (e.nutrients.protein !== undefined) u.prot.push(e.nutrients.protein);
  }
  const mid = (xs: number[]) => { const v = [...xs].sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : undefined; };
  const top = [...usual.values()].sort((a, b) => b.n - a.n).slice(0, 15);
  // the foods they saved (their own, and ones kept from a search), most logged first: names to copy exactly
  const logged = new Map<string, number>();
  for (const e of d.entries) if (e.snap.foodId) logged.set(e.snap.foodId, (logged.get(e.snap.foodId) ?? 0) + 1);
  const inTop = new Set(top.map((u) => u.name.toLowerCase()));
  const own = d.foods.filter((f) => !inTop.has(f.name.toLowerCase())).sort((a, b) => (logged.get(b.id) ?? 0) - (logged.get(a.id) ?? 0)).slice(0, 40);
  if (own.length) L.push(`OWN FOODS (saved in the app; when they name one of these, copy its name exactly): ${own.map((f) => `"${f.brand ? `${f.brand} ` : ''}${f.name}"`).join(', ')}.`);
  if (top.length) L.push(`FREQUENT FOODS (last 30 days, typical amount): ${top.map((u) => { const k = mid(u.kcal), p = mid(u.prot); return `"${u.name}" ${r0(mid(u.amts) ?? 0)} ${u.unit}${k !== undefined ? ` ≈ ${r0(k)} kcal` : ''}${p !== undefined ? `, ${r0(p)} g protein` : ''} (${u.n}×)`; }).join('; ')}.`);
  const water = d.water.filter((w) => w.date === today).reduce((n, w) => n + w.ml, 0);
  L.push(`Water today: ${water} ml (target ${d.settings.goals.waterMl} ml).`);
  const setTxt = (q: AppData['sessions'][number]['exercises'][number]['sets'][number], i: number) => `${i + 1}) ${q.weightKg ? `${r1(q.weightKg)}kg×` : ''}${q.reps ?? (q.durationSec ? `${q.durationSec}s` : '—')}${q.type === 'warmup' ? ' warm-up' : ''}${q.done ? ' ✓' : ''}`;
  if (d.active) {
    const a = d.active;
    L.push(`RUNNING WORKOUT "${a.name || 'Workout'}"${a.pausedAt ? ' (paused)' : ''} (✓ = finished set; set numbers are for edit_set): ${a.exercises.map((e) => `${exName(e.exerciseId)}: ${e.sets.map(setTxt).join(', ')}`).join(' | ')}.`);
    // the set they are on: what "only 9 reps" means
    // (the same answer the screen and log_current_set use: the Focus page, a superset partner's turn, where they are;
    // unticked warm-ups are passed over — say "warm-up" to log one)
    const c0 = currentSetOf(a, 'skip');
    const cur = c0 ? { e: c0.se, i: c0.se.sets.indexOf(c0.set) } : null;
    if (cur) { const q = cur.e.sets[cur.i]; const kg = q.weightKg ?? q.target?.weightKg, reps = q.reps ?? q.target?.repMax; L.push(`CURRENT SET (the one they are on now): ${exName(cur.e.exerciseId)} set ${cur.i + 1}, planned ${kg ? `${r1(kg)} kg × ` : ''}${reps ?? '?'} reps.`); }
    else L.push('CURRENT SET: none — every set is ticked.');
  } else L.push('No workout is running.');
  // the last finished workouts in full, so "make my last bench set 85" and "how did Tuesday go?" have something to read
  for (const ss of d.sessions.filter((x) => x.status === 'done').slice(-6).reverse()) {
    L.push(`Workout ${ss.date} "${ss.name || 'Workout'}" (${Math.round(elapsedMs(ss) / 60000)} min): ${ss.exercises.map((e) => `${exName(e.exerciseId)}: ${e.sets.filter((q) => q.done).map(setTxt).join(', ')}`).join(' | ')}.`);
  }
  // personal bests for the lifts that come up most
  const freq = new Map<string, number>();
  for (const ss of d.sessions) for (const e of ss.exercises) freq.set(e.exerciseId, (freq.get(e.exerciseId) ?? 0) + 1);
  const best: string[] = [];
  for (const [id] of [...freq].sort((x, y) => y[1] - x[1]).slice(0, 10)) {
    let top: { w: number; r: number } | null = null;
    for (const ss of d.sessions) for (const e of ss.exercises) if (e.exerciseId === id) for (const q of e.sets) if (q.done && q.type === 'working' && q.weightKg && q.reps && (!top || q.weightKg * (1 + q.reps / 30) > top.w * (1 + top.r / 30))) top = { w: q.weightKg, r: q.reps };
    if (top) best.push(`${exName(id)} ${r1(top.w)}kg×${top.r} (${freq.get(id)} sessions)`);
  }
  if (best.length) L.push(`Best sets on the most-trained lifts: ${best.join('; ')}.`);
  const ws = [...d.weights].sort((x, y) => x.at - y.at).slice(-8);
  if (ws.length) L.push(`Recent weigh-ins: ${ws.map((w) => `${w.date} ${r1(w.kg)}kg`).join(', ')}.`);
  for (const r of d.routines.filter((x) => !x.oneOff).slice(0, 12)) L.push(`Routine "${r.name}": ${r.items.map((i) => `${exName(i.exerciseId)} ${i.workingSets}×${i.repMin}-${i.repMax}`).join(', ')}.`);
  const recent = d.activities.slice(-5).reverse().map((a) => `${a.date} ${a.kind} ${Math.round(a.durationSec / 60)} min${a.rounds ? `, ${a.rounds} rounds` : ''}${a.intensity ? `, ${['easy', 'hard', 'max'][a.intensity - 1]}` : ''}`);
  if (recent.length) L.push(`Recent activities: ${recent.join('; ')}.`);
  // the watch (Health Connect): their cardio and steps, for leg-day and wrestling clashes and recovery. The calories it
  // counts are NOT to be eaten back: their food target stays as set
  const cardio = d.activities.filter((a) => a.source === 'watch' && diffDays(today, a.date) < 7 && diffDays(today, a.date) >= 0).sort((a, b) => (a.startAt ?? a.at) - (b.startAt ?? b.at));
  if (cardio.length) L.push(`WATCH CARDIO, last 7 days: ${cardio.map((a) => `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(`${a.date}T12:00:00`).getDay()]} ${a.name || a.kind} ${Math.round(a.durationSec / 60)} min${a.avgHr ? `, avg ${a.avgHr} bpm` : ''}${a.intensity ? ` (${['easy', 'hard', 'max'][a.intensity - 1]})` : ''}${a.kcal ? `, ${a.kcal} kcal burned` : ''}`).join('; ')}. (Burned calories are information only: never tell them to eat them back or raise their target.)`);
  const st7 = (d.steps ?? []).filter((x) => diffDays(today, x.date) < 7 && diffDays(today, x.date) >= 0);
  if (st7.length) L.push(`Steps: about ${Math.round(st7.reduce((n, x) => n + x.count, 0) / st7.length / 100) * 100} a day over the last ${st7.length} days${st7.find((x) => x.date === today) ? `; ${st7.find((x) => x.date === today)!.count} today so far` : ''}.`);
  L.push(`Counts: ${d.favourites.length} favourite foods, ${d.savedMeals.length} saved meals, ${d.recipes.length} recipes, ${d.sessions.length} sessions.`);
  return L.join('\n').slice(0, 16000);
}
