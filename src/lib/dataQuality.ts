/**
 * How far the Coach can trust the logs (19 Oct). Advice is only as good as the data under it, and true maintenance most of
 * all, so before anything is averaged the app spots what is probably not real:
 *  - unfinished days: a meal they log almost every day is missing and the day is clearly short (most often a dinner that
 *    was eaten but not logged). Left out of averages and true maintenance, and asked about once when it matters;
 *  - typos: one item far bigger than anything plausible, or 5× what they usually log of that food; a weigh-in far off its
 *    neighbours;
 *  - duplicates: the same item logged twice within two minutes.
 * Works the same for anyone: everything is measured against the person's own habits, never a fixed idea of a "normal" day.
 */
import type { AppData, FoodEntry } from './types';
import { addDays } from './dates';

type Data = Pick<AppData, 'entries' | 'weights' | 'health'>;
const median = (xs: number[]) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** Per logged day in [from, to]: its kcal and the meals in it. */
function days(d: Pick<AppData, 'entries'>, from: string, to: string) {
  const by = new Map<string, { kcal: number; meals: Set<string> }>();
  for (const e of d.entries) {
    if (e.date < from || e.date > to) continue;
    const x = by.get(e.date) ?? by.set(e.date, { kcal: 0, meals: new Set() }).get(e.date)!;
    x.kcal += e.nutrients.kcal ?? 0; x.meals.add(e.mealId);
  }
  return by;
}

/** Meals logged on at least half of their logged days (their habit), over the window: a dinner logged only every other day
 *  is still their dinner — the days without it are the question. */
export function usualMeals(d: Pick<AppData, 'entries'>, from: string, to: string): string[] {
  const by = days(d, from, to);
  if (by.size < 7) return [];
  const count = new Map<string, number>();
  for (const x of by.values()) for (const m of x.meals) count.set(m, (count.get(m) ?? 0) + 1);
  return [...count].filter(([, n]) => n / by.size >= 0.5).map(([m]) => m);
}

/**
 * Days that are probably not finished: a usual meal is missing AND the day is under 75 % of their typical complete day.
 * Today is never counted (it isn't over). Needs a week of logs to know their habits.
 */
export function unfinishedDays(d: Pick<AppData, 'entries'>, today: string, window = 28): { date: string; kcal: number; missing: string[] }[] {
  const from = addDays(today, -window), to = addDays(today, -1);
  const by = days(d, from, to);
  const usual = usualMeals(d, from, to);
  if (!usual.length) return [];
  const complete = [...by.values()].filter((x) => usual.every((m) => x.meals.has(m))).map((x) => x.kcal);
  if (complete.length < 4) return [];
  const typical = median(complete);
  const out: { date: string; kcal: number; missing: string[] }[] = [];
  for (const [date, x] of by) {
    const missing = usual.filter((m) => !x.meals.has(m));
    if (missing.length && x.kcal < typical * 0.75) out.push({ date, kcal: Math.round(x.kcal), missing });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Food entries that look like a slip: one item over 1,500 kcal, 5× their usual amount of it, or the same item twice in 2 min. */
export function oddEntries(d: Pick<AppData, 'entries'>, today: string, window = 14): { entry: FoodEntry; why: string }[] {
  const from = addDays(today, -window);
  const amounts = new Map<string, number[]>();
  for (const e of d.entries) if (!e.quick && e.qty.unit !== 'portion') (amounts.get(e.snap.name.toLowerCase()) ?? amounts.set(e.snap.name.toLowerCase(), []).get(e.snap.name.toLowerCase())!).push(e.qty.amount);
  const out: { entry: FoodEntry; why: string }[] = [];
  const recent = d.entries.filter((e) => e.date >= from && e.date <= today).sort((a, b) => a.at - b.at);
  for (let i = 0; i < recent.length; i++) {
    const e = recent[i];
    const kcal = e.nutrients.kcal ?? 0;
    const usual = amounts.get(e.snap.name.toLowerCase()) ?? [];
    if (kcal > 1500 && !e.quick) out.push({ entry: e, why: `${Math.round(kcal)} kcal in one item` });
    else if (usual.length >= 4 && !e.quick && e.qty.unit !== 'portion' && e.qty.amount >= 5 * median(usual)) out.push({ entry: e, why: `${Math.round(e.qty.amount)} ${e.qty.unit}, about ${Math.round(e.qty.amount / median(usual))}× their usual` });
    const prev = recent[i - 1];
    if (prev && prev.date === e.date && prev.snap.name === e.snap.name && prev.qty.amount === e.qty.amount && e.at - prev.at < 120_000) out.push({ entry: e, why: 'logged twice within 2 minutes' });
  }
  return out;
}

/** Every weigh-in: the ones typed into Aven, and the scale's through the watch (Aven's own wins on the same day). */
export function weighIns(d: Pick<AppData, 'weights' | 'health'>): { date: string; kg: number }[] {
  const by = new Map<string, number>();
  for (const h of d.health ?? []) if (h.weightKg) by.set(h.date, h.weightKg);
  for (const w of d.weights) by.set(w.date, w.kg);
  return [...by].map(([date, kg]) => ({ date, kg })).sort((a, b) => a.date.localeCompare(b.date));
}

/** Weigh-ins (Aven's and the watch's) more than 2.5 kg away from the median of the others within a week either side (a
 *  typo or a scale glitch). */
export function oddWeighIns(d: Pick<AppData, 'weights' | 'health'>, today: string, window = 28): { date: string; kg: number; around: number }[] {
  const ws = weighIns(d).filter((w) => w.date >= addDays(today, -window) && w.date <= today);
  const out: { date: string; kg: number; around: number }[] = [];
  for (const w of ws) {
    const near = ws.filter((x) => x !== w && Math.abs(new Date(x.date).getTime() - new Date(w.date).getTime()) <= 7 * 86_400_000).map((x) => x.kg);
    if (near.length < 2) continue;
    const m = median(near);
    if (Math.abs(w.kg - m) > 2.5) out.push({ date: w.date, kg: w.kg, around: Math.round(m * 10) / 10 });
  }
  return out;
}

/** The Coach's DATA TRUST lines (empty when nothing looks off). */
export function dataTrustLines(d: Data, today: string, mealLabel: (id: string) => string = (x) => x): string[] {
  const L: string[] = [];
  const un = unfinishedDays(d, today);
  if (un.length) L.push(`Probably unfinished days (a meal they nearly always log is missing and the day is clearly short), last 4 weeks: ${un.length} — ${un.slice(-8).map((x) => `${x.date} ${x.kcal} kcal, no ${x.missing.map(mealLabel).join('/')}`).join('; ')}. These are left out of averages and TRUE MAINTENANCE. Treat them as unknown, never as what they ate.`);
  const odd = oddEntries(d, today);
  if (odd.length) L.push(`Entries that may be a slip (ask about one only if it matters to the answer): ${odd.slice(0, 5).map((o) => `"${o.entry.snap.name}" on ${o.entry.date}: ${o.why} [ref ${o.entry.id}]`).join('; ')}.`);
  const ow = oddWeighIns(d, today);
  if (ow.length) L.push(`Weigh-ins far off their neighbours (maybe a typo): ${ow.map((w) => `${w.date} ${w.kg} kg (around ${w.around})`).join('; ')}.`);
  return L.length ? ['DATA TRUST:', ...L] : [];
}
