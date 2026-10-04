import type { Exercise, Lang } from './types';
import { fold, tokens } from './foodText';
import { KG_PER_LB } from './units';

export interface ParsedSet { weightKg?: number; reps?: number; durationSec?: number; distanceM?: number }
export interface ParsedWorkoutRow {
  id: string;
  raw: string;
  query: string;
  sets: ParsedSet[];
}

const W: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, fifteen: 15, twenty: 20, en: 1, to: 2, tre: 3, fire: 4, fem: 5, seks: 6, syv: 7, otte: 8, ni: 9, ti: 10 };

function normaliseNumbers(s: string): string {
  return s
    .toLowerCase()
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty|en|to|tre|fire|fem|seks|syv|otte|ni|ti)\b/g, (m, w) => String(W[w]))
    .replace(/×/g, ' x ');
}

export function splitExerciseSegments(text: string): string[] {
  return text
    .split(/\s*(?:;|\.\s+|\bthen\b|\bnext\b|\bderefter\b|\bdernaest\b|\bdernæst\b)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Parse one spoken segment into an exercise query and sets. Conservative: anything unclear stays unset. */
export function parseWorkoutSegment(seg: string, idx: number): ParsedWorkoutRow | null {
  const s = normaliseNumbers(seg);
  let rest = s;
  const sets: ParsedSet[] = [];
  const unit = '(?:kg|kilos?|kilograms?|lbs?|pounds?)';
  const toKg = (v: number, u?: string) => (u && /^(lb|pound)/.test(u) ? v * KG_PER_LB : v);

  // "3 sets of 8 at 80 kg" / "3 x 8 at 80"
  let m = rest.match(new RegExp(`(\\d+)\\s*(?:sets?|saet|sæt)\\s*(?:of|a|af)?\\s*(\\d+)\\s*(?:reps?|gange)?\\s*(?:at|with|@|med|paa|på)\\s*(\\d+(?:\\.\\d+)?)\\s*(${unit})?`));
  if (m) {
    const n = Math.min(Number(m[1]), 12);
    for (let i = 0; i < n; i++) sets.push({ weightKg: toKg(Number(m[3]), m[4]), reps: Number(m[2]) });
    rest = rest.replace(m[0], ' ');
  }
  // "80 kg x 8 x 3" / "80 x 8"
  if (!sets.length) {
    m = rest.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${unit})?\\s*(?:x|for|by|gange)\\s*(\\d+)(?:\\s*x\\s*(\\d+))?(?!\\s*(?:min|sec|s\\b))`));
    if (m) {
      // "80 for 8, 8 and 6" → further reps follow as bare numbers
      const n = m[4] ? Math.min(Number(m[4]), 12) : 1;
      for (let i = 0; i < n; i++) sets.push({ weightKg: toKg(Number(m[1]), m[2]), reps: Number(m[3]) });
      rest = rest.replace(m[0], ' ');
      const moreMatch = m.index !== undefined ? s.slice(m.index + m[0].length).match(/^\s*(?:(?:,|&|and|og)\s*\d+\s*)+/) : null;
      if (moreMatch) {
        const nums = moreMatch[0].match(/\d+/g) ?? [];
        for (const r of nums) sets.push({ weightKg: sets[0].weightKg, reps: Number(r) });
        rest = rest.replace(moreMatch[0], ' ');
      }
    }
  }
  // "8, 8 and 6 reps at 80 kg"
  if (!sets.length) {
    m = rest.match(new RegExp(`((?:\\d+\\s*(?:,|&|and|og)?\\s*)+)\\s*(?:reps?|gange)\\s*(?:at|with|@|med|paa|på)\\s*(\\d+(?:\\.\\d+)?)\\s*(${unit})?`));
    if (m) {
      for (const r of m[1].match(/\d+/g) ?? []) sets.push({ weightKg: toKg(Number(m[2]), m[3]), reps: Number(r) });
      rest = rest.replace(m[0], ' ');
    }
  }
  // duration / distance: "plank 60 seconds", "run 5 km in 25 minutes"
  if (!sets.length) {
    const dist = rest.match(/(\d+(?:\.\d+)?)\s*(km|kilometers?|kilometres?|mi|miles?|m\b|meters?|metres?)/);
    const dur = rest.match(/(\d+(?:\.\d+)?)\s*(seconds?|secs?|sek|minutes?|mins?|min|hours?|timer?|h\b)/);
    if (dist || dur) {
      const set: ParsedSet = {};
      if (dist) {
        const v = Number(dist[1]);
        set.distanceM = /^km|kilo/.test(dist[2]) ? v * 1000 : /^mi/.test(dist[2]) ? v * 1609.344 : v;
        rest = rest.replace(dist[0], ' ');
      }
      const d2 = rest.match(/(\d+(?:\.\d+)?)\s*(seconds?|secs?|sek|minutes?|mins?|min|hours?|timer?|h\b)/);
      if (d2) {
        const v = Number(d2[1]);
        set.durationSec = /^(sec|sek)/.test(d2[2]) ? v : /^(h|hour|time)/.test(d2[2]) ? v * 3600 : v * 60;
        rest = rest.replace(d2[0], ' ');
      }
      sets.push(set);
    }
  }
  // "10 reps" alone (bodyweight)
  if (!sets.length) {
    m = rest.match(/(\d+)\s*(?:reps?|gange)/);
    if (m) { sets.push({ reps: Number(m[1]) }); rest = rest.replace(m[0], ' '); }
  }
  const query = rest.replace(/\b(at|with|for|of|did|i did|log|add|a|an|the|reps?|sets?|in|i|og|and|på|paa)\b/g, ' ').replace(/[\d.,&@x]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!query && !sets.length) return null;
  return { id: `w${idx}`, raw: seg, query, sets };
}

export function parseWorkoutText(text: string): ParsedWorkoutRow[] {
  return splitExerciseSegments(text).map((s, i) => parseWorkoutSegment(s, i)).filter(Boolean) as ParsedWorkoutRow[];
}

export function matchExercises(query: string, pool: Exercise[], lang: Lang, limit = 5, boost: (e: Exercise) => number = () => 0): { ex: Exercise; score: number }[] {
  const q = tokens(query);
  if (!q.length) return [];
  const out: { ex: Exercise; score: number }[] = [];
  for (const ex of pool) {
    const names = [ex.name, ex.nameDa ?? '', ...(ex.aka ?? [])];
    let best = 0;
    for (const n of names) {
      if (!n) continue;
      const nt = tokens(n);
      if (fold(n) === fold(query)) best = Math.max(best, 1);
      else if (q.every((t) => nt.includes(t))) best = Math.max(best, 0.85 - Math.min(0.3, (nt.length - q.length) * 0.05));
      else {
        const hit = q.filter((t) => nt.some((x) => x.startsWith(t) || t.startsWith(x))).length;
        if (hit) best = Math.max(best, (hit / q.length) * 0.55);
      }
    }
    if (best >= 0.3) out.push({ ex, score: best + boost(ex) });
  }
  return out.sort((a, b) => b.score - a.score || a.ex.name.length - b.ex.name.length).slice(0, limit);
}
