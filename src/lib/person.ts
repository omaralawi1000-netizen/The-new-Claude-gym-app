/**
 * WHO THEY ARE (19 Oct): the person's own patterns, worked out from their data, so the Coach knows them the way a coach
 * who has watched them for a month would — and so nothing about one user (Omar's evenings) is assumed about another.
 * Only what the data shows, with the counts; nothing when there is too little to say.
 */
import type { AppData } from './types';
import { addDays, dayKey } from './dates';
import { heavyDays, heavyMode, isEvening } from './eating';
import { unfinishedDays, usualMeals } from './dataQuality';

type Data = Pick<AppData, 'entries' | 'settings' | 'weights' | 'health' | 'catchUps' | 'sessions' | 'activities'>;
const LIGHT = new Set(['walk', 'mobility', 'warmup', 'recovery']);
const WD = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

export function personLines(d: Data, today: string, mealLabel: (id: string) => string = (x) => x): string[] {
  const L: string[] = [];
  const from = addDays(today, -28), to = addDays(today, -1);
  const skip = new Set(unfinishedDays(d, today).map((u) => u.date));
  const entries = d.entries.filter((e) => e.date >= from && e.date <= to && !skip.has(e.date));
  const dates = [...new Set(entries.map((e) => e.date))];

  if (dates.length >= 7) {
    // when they eat: what was logged from 20:00 on that day; a log the day after is said apart (when it was eaten isn't known)
    let total = 0, evening = 0, late = 0;
    for (const e of entries) {
      const k = e.nutrients.kcal ?? 0; total += k;
      if (dayKey(e.at, d.settings.dayStartHour) > e.date) late += k;
      else if (isEvening(e.at, d.settings.dayStartHour)) evening += k;
    }
    L.push(`Eating rhythm: ${pct(evening, total)}% of their logged calories were logged after 20:00 on the day${late ? `; ${pct(late, total)}% were logged the day after (when they were eaten isn't known)` : ''}.`);
    // heavier weekdays, against their own average
    const byDay = new Map<string, number>();
    for (const e of entries) byDay.set(e.date, (byDay.get(e.date) ?? 0) + (e.nutrients.kcal ?? 0));
    const avg = [...byDay.values()].reduce((a, b) => a + b, 0) / byDay.size;
    const wd = new Map<number, number[]>();
    for (const [date, k] of byDay) { const w = new Date(`${date}T12:00:00`).getDay(); (wd.get(w) ?? wd.set(w, []).get(w)!).push(k); }
    const heavyWd = [...wd].filter(([, ks]) => ks.length >= 2 && ks.reduce((a, b) => a + b, 0) / ks.length >= avg * 1.15).map(([w, ks]) => `${WD[w]} (+${pct(ks.reduce((a, b) => a + b, 0) / ks.length - avg, avg)}%)`);
    if (heavyWd.length) L.push(`Heavier weekdays than their average: ${heavyWd.join(', ')}.`);
  }

  // heavy days and what came before them (only with enough heavy days to mean anything; never with notices off)
  const heavy = d.settings.goals.kcal && heavyMode(d.settings) !== 'off' ? heavyDays(d, today) : [];
  if (heavy.length >= 3) {
    const sleep = new Map((d.health ?? []).filter((h) => h.sleepMin !== undefined).map((h) => [h.date, h.sleepMin!]));
    const short = (date: string) => { const s = sleep.get(date); return s !== undefined && s < 360; }; // the night before ends on that date's morning
    const sport = new Set(d.activities.filter((a) => !LIGHT.has(a.kind)).map((a) => a.date));
    const trained = new Set(d.sessions.filter((s) => s.status === 'done').map((s) => s.date));
    const parts: string[] = [];
    const known = heavy.filter((h) => sleep.has(h.date));
    if (known.length >= 3) {
      const all = [...sleep.keys()].filter((x) => x >= from && x <= to);
      parts.push(`${known.filter((h) => short(h.date)).length} of ${known.length} came after a night under 6 h (on ${pct(all.filter(short).length, all.length)}% of all their days)`);
    }
    const onSport = heavy.filter((h) => sport.has(h.date)).length;
    if (onSport) parts.push(`${onSport} of ${heavy.length} were sport days`);
    const onGym = heavy.filter((h) => trained.has(h.date)).length;
    if (onGym) parts.push(`${onGym} of ${heavy.length} were gym days`);
    const late = heavy.filter((h) => h.late).length;
    if (late) parts.push(`${late} of ${heavy.length} were logged the day after`);
    if (parts.length) L.push(`Their heavy days (last 4 weeks): ${parts.join('; ')}. A link only counts when it is clearly above how often that happens anyway.`);
  }

  // how they log
  const meals = usualMeals(d, from, to);
  const logged = new Set(d.entries.filter((e) => e.date >= from && e.date <= to).map((e) => e.date)).size;
  if (logged) L.push(`Logging: food logged on ${logged} of the last 28 days${meals.length ? `; they nearly always log ${meals.map(mealLabel).join(', ')}` : ''}${skip.size ? `; ${skip.size} days look unfinished (DATA TRUST)` : ''}.`);
  const wIns = d.weights.filter((w) => w.date >= from && w.date <= today).length + (d.health ?? []).filter((h) => h.weightKg && h.date >= from && h.date <= today && !d.weights.some((w) => w.date === h.date)).length;
  if (wIns) L.push(`Weigh-ins: ${wIns} in 4 weeks (about ${Math.round((wIns / 4) * 10) / 10} a week).`);

  // training rhythm
  const done = d.sessions.filter((s) => s.status === 'done' && s.date >= from && s.date <= to);
  const sport = d.activities.filter((a) => a.date >= from && a.date <= to && !LIGHT.has(a.kind));
  if (done.length || sport.length) L.push(`Training: about ${Math.round((done.length / 4) * 10) / 10} gym sessions a week${sport.length ? ` and ${Math.round((sport.length / 4) * 10) / 10} sport/cardio sessions a week (${[...new Set(sport.map((a) => a.kind))].join(', ')})` : ''}.`);

  return L.length ? ['WHO THEY ARE (their own patterns from their data, last 4 weeks; facts with counts, never a judgement of character):', ...L] : [];
}
