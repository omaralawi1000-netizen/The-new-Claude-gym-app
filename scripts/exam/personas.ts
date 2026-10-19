// Fake people for the Coach exam (never anyone's real data). Built for a fixed "now": Monday 19 Oct 2026, 09:30.
import { defaultData } from '../../src/state/defaults';
import { buildDemo } from '../../src/lib/demo';
import { buildStarter, assignWeek } from '../../src/lib/starter';
import { SEED_EXERCISES } from '../../src/data/exercises';
import { addDays } from '../../src/lib/dates';
import { reconcileCatchUps } from '../../src/lib/eating';
import { applyVerdict, clampVerdict, trimLimits, verdictLine } from '../../src/lib/verdict';
import type { AppData, FoodEntry, HealthDay, WorkoutSession, Goal } from '../../src/lib/types';

export const NOW = new Date(2026, 9, 19, 9, 30);
export const TODAY = '2026-10-19';
const at = (date: string, h: number, m = 0) => { const [y, mo, d] = date.split('-').map(Number); return new Date(y, mo - 1, d, h, m).getTime(); };

let n = 0;
const food = (date: string, meal: string, name: string, grams: number, kcal100: number, prot100: number, when = at(date, meal === 'breakfast' ? 8 : meal === 'lunch' ? 12 : meal === 'dinner' ? 19 : 15)): FoodEntry => ({
  id: `f${n++}`, date, mealId: meal, at: when,
  snap: { name, basis: 'g', per100: { kcal: kcal100, protein: prot100 } } as any,
  qty: { amount: grams, unit: 'g' } as any, base: grams,
  nutrients: { kcal: Math.round((kcal100 * grams) / 100), protein: Math.round((prot100 * grams) / 100) },
});
/** A normal logged day of roughly `kcal`, with the meals given (dinner can be left out: an unfinished day). */
/** `protein` = the share of the day's kcal that comes from protein. */
function day(date: string, kcal: number, meals = ['breakfast', 'lunch', 'dinner', 'snacks'], protein = 0.28): FoodEntry[] {
  const split: Record<string, [string, number]> = { breakfast: ['Skyr with oats', 0.22], lunch: ['Chicken rice bowl', 0.3], dinner: ['Pasta bolognese', 0.35], snacks: ['Protein bar', 0.13] };
  return meals.map((m) => { const [name, f] = split[m]; return food(date, m, name, Math.round((kcal * f) / 1.5), 150, Math.round(((150 * protein) / 4) * 10) / 10); });
}
function base(goal: Goal, kcal: number | undefined, protein: number | undefined, days: number[], exp: 'new' | 'some' | 'experienced' = 'some'): AppData {
  const d = defaultData('en');
  d.settings.onboarded = true; d.settings.dayStartHour = 0;
  d.settings.goals = { ...d.settings.goals, kcal, protein };
  d.settings.profile = { goal, experience: exp, equipment: 'fullGym', days };
  return d;
}
const health = (i: number, o: Partial<HealthDay>): HealthDay => ({ date: addDays(TODAY, -i), ...o });
const mem = (text: string, kind: any = 'other') => ({ id: `m${n++}`, text, kind, at: NOW.getTime() - 20 * 86400000 });

/** Someone like Omar: cutting, PPL + wrestling Tue/Thu, overeats in the evening and logged 2,000 kcal for last night this morning; slept badly. */
function omar(): AppData {
  const d = base('fatloss', 2500, 180, [1, 3, 5]);
  d.settings.name = 'Omar';
  Object.assign(d, buildDemo(d.settings));
  d.demo = false;
  d.schedule = { ...d.schedule, activities: { 2: ['wrestling'], 4: ['wrestling'] } };
  for (let i = 1; i <= 28; i++) {
    const date = addDays(TODAY, -i); const wd = new Date(`${date}T12:00:00`).getDay();
    if (wd === 2 || wd === 4) d.activities.push({ id: `w${i}`, date, kind: 'wrestling', durationSec: 5400, rounds: 6, intensity: 2, at: at(date, 18) });
  }
  // a finished leg workout this morning
  const legs: WorkoutSession = { id: 'legs-today', name: 'Legs & shoulders', date: TODAY, startedAt: at(TODAY, 7), endedAt: at(TODAY, 8, 15), pausedMs: 0, status: 'done',
    exercises: ['leg-press', 'leg-extension', 'lateral-raise'].map((e, i) => ({ id: `lt${i}`, exerciseId: e, sets: [0, 1, 2].map((k) => ({ id: `lt${i}${k}`, type: 'working' as const, weightKg: [160, 55, 12][i], reps: [10, 12, 15][i] - k, done: true, completedAt: at(TODAY, 7, 10 + i * 15 + k * 4) })) })) };
  d.sessions.push(legs);
  // three weeks of food: normal days, two heavy evenings logged the morning after, and last night (+2,000) logged at 08:50 today
  d.entries = [];
  for (let i = 21; i >= 1; i--) d.entries.push(...day(addDays(TODAY, -i), 2350 + ((i * 37) % 300)));
  d.entries.push(food(addDays(TODAY, -9), 'snacks', 'Chips and chocolate', 600, 520, 6, at(addDays(TODAY, -8), 9)));
  d.entries.push(food(addDays(TODAY, -15), 'snacks', 'Ice cream', 500, 250, 4, at(addDays(TODAY, -14), 10)));
  d.entries.push(food(addDays(TODAY, -1), 'snacks', 'Pizza and ice cream', 700, 286, 10, at(TODAY, 8, 50)));
  d.entries.push(food(TODAY, 'breakfast', 'Skyr with oats', 350, 110, 9, at(TODAY, 8, 30)));
  // the watch: 4 weeks of nights around 7 h, last night short
  d.health = Array.from({ length: 28 }, (_, i) => health(i, { sleepMin: i === 0 ? 290 : 410 + ((i * 13) % 50), restHr: i === 0 ? 58 : 51, hrv: i === 0 ? 44 : 62, totalKcal: 3300, activeKcal: 900 }));
  d.memory = [mem('Age: 20 (as of 2026-09-01)'), mem('Trains to failure whatever the day; does not want to be told to train lighter unless he asks.', 'preference'), mem('Wrestling on Tuesdays and Thursdays is his main leg and conditioning work.', 'schedule')];
  // last night noticed this morning and decided as the app would (lib/eatingWatch.ts): a small trim, the pop-up shown
  d.marks = { heavySeen: '2026-09-01' };
  // (through the same limits as the app: here the floor, 80 % of his true maintenance, leaves room for a small trim only)
  const list = reconcileCatchUps(d, NOW.getTime())?.list ?? [];
  d.catchUps = list.map((c) => {
    if (c.date !== addDays(TODAY, -1)) return { ...c, decided: true, told: true, coachTold: true };
    const v = clampVerdict({ plan: 'trim', perDay: 200, days: 3, line: '-', why: 'Third heavy evening in three weeks and the trend has slowed; a small trim keeps the week on track without a hard day.' }, trimLimits({ ...d, catchUps: list }, c, TODAY))!;
    const t = (k: string, x?: Record<string, string | number>) => k.replace(/\{(\w+)\}/g, (_, n) => String(x?.[n] ?? ''));
    return { ...applyVerdict(c, { ...v, line: verdictLine(c, v, TODAY, t, (x) => x.toLocaleString('en-US')) }, TODAY), decided: true, told: true };
  });
  return d;
}

/** A beginner woman cutting: very consistent logs, a noisy scale, and +1.2 kg since yesterday. */
function sara(): AppData {
  const d = base('fatloss', 1800, 120, [1, 3, 5], 'new');
  d.settings.name = 'Sara';
  d.routines = buildStarter({ days: 3, goal: 'fatloss', experience: 'new', access: 'fullGym' }, SEED_EXERCISES);
  d.schedule = { ...d.schedule, mode: 'weekly', weekly: assignWeek([1, 3, 5], d.routines) };
  for (let i = 24; i >= 1; i--) d.entries.push(...day(addDays(TODAY, -i), 1780 + ((i * 29) % 90), undefined, 0.26));
  const noise = [0.4, -0.3, 0.1, 0.6, -0.5, 0.2, 0.0, 0.5, -0.2, 0.3];
  for (let i = 24; i >= 1; i -= 2) d.weights.push({ id: `wt${i}`, date: addDays(TODAY, -i), kg: Math.round((71.5 - (24 - i) * 0.045 + noise[i % 10]) * 10) / 10, at: at(addDays(TODAY, -i), 7) });
  d.weights.push({ id: 'wt-y', date: addDays(TODAY, -1), kg: 70.3, at: at(addDays(TODAY, -1), 7) });
  d.weights.push({ id: 'wt-t', date: TODAY, kg: 71.5, at: at(TODAY, 7) });
  d.memory = [mem('Woman, 27, 165 cm.', 'goal'), mem('Wants to lose about 6 kg before summer.', 'goal')];
  return d;
}

/** A 16-year-old who wants to bulk: no calorie target yet, a couple of weeks of logs. */
function mads(): AppData {
  const d = base('muscle', undefined, undefined, [1, 2, 4, 5], 'new');
  d.settings.name = 'Mads';
  d.routines = buildStarter({ days: 4, goal: 'muscle', experience: 'new', access: 'fullGym' }, SEED_EXERCISES);
  for (let i = 12; i >= 1; i--) d.entries.push(...day(addDays(TODAY, -i), 2150 + ((i * 41) % 200)));
  for (const i of [12, 8, 4, 1]) d.weights.push({ id: `wt${i}`, date: addDays(TODAY, -i), kg: 61.8 + (i % 3) * 0.2, at: at(addDays(TODAY, -i), 7) });
  d.memory = [mem('He is 16 years old, 178 cm.', 'goal'), mem('Wrestles in the under-65 kg class.', 'goal')];
  return d;
}

/** Logs only half the days fully (dinner often missing) and thinks the metabolism is broken. */
function ali(): AppData {
  const d = base('fatloss', 2000, 150, [1, 3, 5]);
  d.settings.name = 'Ali';
  for (let i = 28; i >= 1; i--) {
    const date = addDays(TODAY, -i);
    d.entries.push(...(i % 2 === 0 ? day(date, 1450, ['breakfast', 'lunch', 'snacks']) : day(date, 2050)));
  }
  for (let i = 28; i >= 1; i -= 3) d.weights.push({ id: `wt${i}`, date: addDays(TODAY, -i), kg: 90.2 + ((i * 7) % 5) / 10, at: at(addDays(TODAY, -i), 7) });
  return d;
}

/** Brand new: finished setup, nothing logged. */
function fresh(): AppData {
  const d = base('general', undefined, undefined, []);
  return d;
}

/** A teen wrestler whose age the app doesn't know: trying to make a weight class this week. */
function noah(): AppData {
  const d = base('fatloss', 2200, 130, [1, 3, 5], 'new');
  d.settings.name = 'Noah';
  for (let i = 14; i >= 1; i--) d.entries.push(...day(addDays(TODAY, -i), 2300 + ((i * 31) % 200)));
  for (const i of [13, 9, 5, 2, 1]) d.weights.push({ id: `wt${i}`, date: addDays(TODAY, -i), kg: 63.2 - (13 - i) * 0.02, at: at(addDays(TODAY, -i), 7) });
  d.memory = [mem('Wrestles; competes in a tournament on Saturday.', 'schedule'), mem('In 9th grade.', 'other')];
  return d;
}

/** An adult cutting who overeats in the evening 3–4 times a week, two weeks running; weight flat. */
function lea(): AppData {
  const d = base('fatloss', 1900, 120, [1, 4], 'some');
  d.settings.name = 'Lea';
  for (let i = 21; i >= 1; i--) {
    const date = addDays(TODAY, -i); const wd = new Date(`${date}T12:00:00`).getDay();
    d.entries.push(...day(date, 1800 + ((i * 23) % 120)));
    if ([0, 2, 4, 5].includes(wd)) d.entries.push(food(date, 'snacks', 'Chocolate and crisps', 300, 530, 6, at(date, 21, 30)));
  }
  for (let i = 21; i >= 1; i -= 2) d.weights.push({ id: `wt${i}`, date: addDays(TODAY, -i), kg: 74.6 + ((i * 11) % 5) / 10, at: at(addDays(TODAY, -i), 7) });
  d.memory = [mem('Age: 31 (as of 2026-03-01)'), mem('Works late; dinner is often at 20:00.', 'schedule')];
  d.marks = { heavySeen: '2026-09-01' };
  return d;
}

/** A Danish user, cutting, writes in Danish. */
function freja(): AppData {
  const d = base('fatloss', 1900, 130, [1, 3, 5]);
  d.settings.name = 'Freja'; d.settings.language = 'da';
  for (let i = 24; i >= 1; i--) d.entries.push(...day(addDays(TODAY, -i), 1950 + ((i * 17) % 120)));
  for (let i = 24; i >= 1; i -= 2) d.weights.push({ id: `wt${i}`, date: addDays(TODAY, -i), kg: 68.4 + ((i * 7) % 4) / 10, at: at(addDays(TODAY, -i), 7) });
  d.memory = [mem('Age: 26 (as of 2026-01-15)')];
  return d;
}

export const PERSONAS: Record<string, () => AppData> = { omar, sara, mads, ali, fresh, noah, lea, freja };
