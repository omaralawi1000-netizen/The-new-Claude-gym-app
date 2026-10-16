/**
 * Hands-free sets (phase 5 part 2): what was said, read without any AI (instant, free, private). Only set-shaped phrases
 * count — "8 at 80", "80 for 8", "8", "same again", "done", "skip", "+15 seconds", and the Danish ones ("8 på 80", "samme
 * igen", "spring over") — and anything else is ignored rather than guessed at (talking to someone else must never log a
 * set). A number far from the plan or from last time is asked about, never logged (`guardSet`).
 */
export type SetCommand =
  | { kind: 'set'; kg?: number; reps?: number }
  | { kind: 'same' }
  | { kind: 'done' }
  | { kind: 'skip' }
  | { kind: 'rest'; sec: number }
  | { kind: 'undo' };

const WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30,
  forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100,
  en: 1, et: 1, én: 1, to: 2, tre: 3, fire: 4, fem: 5, seks: 6, syv: 7, otte: 8, ni: 9, ti: 10, elleve: 11, tolv: 12,
  tretten: 13, fjorten: 14, femten: 15, seksten: 16, sytten: 17, atten: 18, nitten: 19, tyve: 20, tredive: 30,
  fyrre: 40, halvtreds: 50, tres: 60, halvfjerds: 70, firs: 80, halvfems: 90, hundrede: 100,
};
const NUM = String.raw`(\d+(?:[.,]\d+)?)`;
const KG = String.raw`(?:kg|kilo|kilos|kilogram|kilograms|kilo's)`;
const REPS = String.raw`(?:reps?|repetitions?|times|gange|gentagelser|rep)`;

/** "62 and a half" / "62 og en halv" → "62.5"; number words → digits; filler and punctuation out. */
function normal(text: string): string {
  let s = ` ${text.toLowerCase()} `
    .replace(/[!?;:"“”]/g, ' ')
    .replace(/\.(?!\d)/g, ' ') // a full stop ends the sentence (a decimal point is followed by a digit)
    .replace(/(\d),(\d)/g, '$1.$2');
  s = s.replace(/[a-zæøåé]+/g, (w) => (WORDS[w] !== undefined && w !== 'to' && w !== 'en' && w !== 'et' ? String(WORDS[w]) : w));
  // "eighty two" → 82
  s = s.replace(/\b([2-9]0) ([1-9])\b/g, (_, a, b) => String(Number(a) + Number(b)));
  s = s.replace(/(\d+)\s+(?:and a half|og en halv|komma fem)\b/g, '$1.5');
  // "to" / "en" are also ordinary words: a digit only beside a set word ("to gange", "en rep")
  s = s.replace(/\b(to|en|et)\s+(gange|gentagelser|rep|reps)\b/g, (_, w, r) => `${WORDS[w]} ${r}`);
  s = s.replace(/\b(?:uh+|um+|øh+|okay|ok|so|then|that was|that's|det var|så|well|right|yeah|ja|just|lige)\b/g, ' ');
  return s.replace(/[,]/g, ' ').replace(/\s+/g, ' ').trim();
}
const n = (x: string) => Number(x.replace(',', '.'));

export function parseSetCommand(text: string): SetCommand | null {
  const s = normal(text);
  if (!s || s.split(' ').length > 9) return null; // a sentence, not a set
  if (/^(?:undo|no|nope|cancel|fortryd|nej|annuller)$/.test(s)) return { kind: 'undo' };
  if (/^(?:same(?: again| as before| as last)?|again|det samme|samme(?: igen| som før)?|igen)$/.test(s)) return { kind: 'same' };
  if (/^(?:done|finished|got it|set done|færdig|klar|done with (?:the|that) set)$/.test(s)) return { kind: 'done' };
  if (/^(?:skip(?: (?:it|this|this set|the set))?|spring over|spring den over|drop (?:it|this set))$/.test(s)) return { kind: 'skip' };
  let m = s.match(new RegExp(`^(?:add |plus |\\+ ?)?${NUM} ?(?:s|sec|secs|seconds|sekunder)(?: (?:more|extra|mere|ekstra|rest|pause))?$`));
  if (m) return { kind: 'rest', sec: Math.round(n(m[1])) };
  m = s.match(new RegExp(`^(?:add |plus |\\+ ?)?(?:a|1|one|et) ?(?:minute|minut)(?: (?:more|extra|mere|ekstra))?$`));
  if (m) return { kind: 'rest', sec: 60 };
  // reps at/for weight
  m = s.match(new RegExp(`^${NUM} ?${REPS}? (?:at|@|with|på|med|x|×) ${NUM} ?${KG}?$`));
  if (m && Number.isInteger(n(m[1]))) return { kind: 'set', reps: n(m[1]), kg: n(m[2]) };
  // weight for reps
  m = s.match(new RegExp(`^${NUM} ?${KG}? (?:for|times|x|×|til|i) ${NUM} ?${REPS}?$`));
  if (m && Number.isInteger(n(m[2]))) return { kind: 'set', kg: n(m[1]), reps: n(m[2]) };
  // "80 kg 8 reps" / "8 reps 80 kg"
  m = s.match(new RegExp(`^${NUM} ?${KG} ${NUM} ?${REPS}$`));
  if (m) return { kind: 'set', kg: n(m[1]), reps: n(m[2]) };
  m = s.match(new RegExp(`^${NUM} ?${REPS} ${NUM} ?${KG}$`));
  if (m) return { kind: 'set', reps: n(m[1]), kg: n(m[2]) };
  // one number: reps ("8", "8 reps"), or a weight when a unit says so ("82.5 kilos")
  m = s.match(new RegExp(`^${NUM} ?${KG}$`));
  if (m) return { kind: 'set', kg: n(m[1]) };
  m = s.match(new RegExp(`^${NUM}(?: ?${REPS})?$`));
  if (m && Number.isInteger(n(m[1]))) return { kind: 'set', reps: n(m[1]) };
  return null;
}

/**
 * Is this set believable? A weight more than 25 % off the plan (or last time), or more than 30 reps, is asked about on
 * screen instead of logged ("18 or 80?" — speech often drops or adds a digit). Returns the choices to offer, or null.
 */
export function guardSet(cmd: { kg?: number; reps?: number }, planned: { kg?: number; reps?: number }): { kg?: number[]; reps?: number[] } | null {
  const out: { kg?: number[]; reps?: number[] } = {};
  if (cmd.kg !== undefined && planned.kg) {
    const off = Math.abs(cmd.kg - planned.kg) / planned.kg;
    if (off > 0.25) {
      // the likely slip: a digit dropped or added (18 ↔ 80, 8 ↔ 80, 800 ↔ 80), else the plan
      const near = [cmd.kg * 10, cmd.kg / 10, planned.kg].find((x) => Math.abs(x - planned.kg!) / planned.kg! <= 0.25) ?? planned.kg;
      out.kg = [cmd.kg, Math.round(near * 4) / 4];
    }
  }
  if (cmd.reps !== undefined && (cmd.reps > 30 || cmd.reps < 1)) out.reps = [cmd.reps, planned.reps ?? Math.min(30, Math.round(cmd.reps / 10))];
  return out.kg || out.reps ? out : null;
}
