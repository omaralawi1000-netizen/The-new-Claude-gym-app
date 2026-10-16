import type { Food, Quantity } from './types';
import { allowedUnits } from './nutrition';

// ── Normalisation ───────────────────────────────────────────

export function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s%.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
/** search-only folding: dictation often writes å as "aa" (koldskaal), so both sides collapse "aa" → "a" */
const sfold = (s: string) => fold(s).replace(/aa/g, 'a');
const STOP = new Set(['the', 'a', 'an', 'some', 'of', 'af', 'en', 'et', 'med', 'with', 'my', 'min', 'mit']);
const stem = (t: string) => (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t);
export function tokens(s: string): string[] {
  return sfold(s).split(' ').filter((t) => t && !STOP.has(t)).map(stem);
}

// ── Search ──────────────────────────────────────────────────

export interface Scored { food: Food; score: number }

function fieldScore(field: string, qTokens: string[], qFold: string): number {
  const f = sfold(field);
  if (!f) return 0;
  if (f === qFold) return 1;
  const ft = tokens(field);
  if (qTokens.length && qTokens.every((t) => ft.includes(t))) return 0.86 - Math.min(0.3, (ft.length - qTokens.length) * 0.04);
  if (f.startsWith(qFold)) return 0.8;
  const prefix = qTokens.filter((t) => ft.some((x) => x.startsWith(t) || (t.length > 3 && t.startsWith(x)))).length;
  if (prefix === 0) return 0;
  return (prefix / qTokens.length) * 0.6;
}

/** Same word, or one letter off in a longer word: speech-to-text writes "cheesy" for the brand Cheasy. */
function near(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 5 || b.length < 5 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

export function scoreFood(food: Food, query: string): number {
  const qTokens = tokens(query);
  const qFold = sfold(query);
  if (!qTokens.length) return 0;
  let best = Math.max(fieldScore(food.name, qTokens, qFold), food.nameDa ? fieldScore(food.nameDa, qTokens, qFold) : 0);
  if (food.brand) {
    // "arla skyr": brand tokens + name tokens together
    const all = tokens(`${food.brand} ${food.name}`);
    if (qTokens.every((t) => all.some((x) => near(x, t)))) best = Math.max(best, 0.88 - Math.min(0.25, (all.length - qTokens.length) * 0.03));
  }
  for (const a of food.aliases ?? []) {
    const s = fieldScore(a, qTokens, qFold);
    best = Math.max(best, s >= 1 ? 0.9 : s * 0.95);
  }
  return best;
}

// Danish packs say "Skyr vanilje" while people say "vaniljeskyr", and a fat percentage ("0% fedt") is written a dozen
// ways on packs. So before searching product databases: split a flavour glued onto skyr/yoghurt, drop fat percentages
// and filler words. ("rugbrød" etc. are left alone: those are one word on the pack too.)
const FLAVOURS = 'vanilje|vanilla|jordbær|hindbær|blåbær|skovbær|solbær|kirsebær|brombær|citron|lime|mango|passionsfrugt|passion|pære|æble|banan|kokos|kakao|chokolade|karamel|hasselnød|lakrids|kaffe|fersken|abrikos|rabarber|havtorn|kanel|natur|naturel|græsk';
const HEADS = 'skyr|yoghurt|yogurt|kvark|ymer|a38|ylette';
const GLUED = new RegExp(`^(${FLAVOURS})(${HEADS})$`);
const FILLER = new Set(['med', 'with', 'og', 'and', 'af', 'of', 'en', 'et', 'a', 'an', 'the', 'some', 'lidt', 'noget', 'min', 'mit', 'my']);
export function searchQuery(q: string): string {
  const words = q.toLowerCase()
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/\b\d+(?:\.\d+)?\s*%\s*(?:fedt|fat|fett|fedtindhold)?/g, ' ') // 0% fedt, 0.2 % fat
    .split(/[\s,]+/).filter((w) => w && !FILLER.has(w));
  const out = words.flatMap((w) => { const m = w.match(GLUED); return m ? [m[1], m[2]] : [w]; });
  return (out.join(' ') || q).trim();
}

/** Is this online product plausible? Calories present, sane, and roughly matching its own macros (catches typos in crowd-sourced data). */
function sane(f: Food): boolean {
  const { kcal, protein = 0, carbs = 0, fat = 0 } = f.per100;
  if (kcal === undefined || !(kcal >= 0 && kcal <= 900)) return false;
  if (protein + carbs + fat > 105) return false;
  const fromMacros = protein * 4 + carbs * 4 + fat * 9;
  return Math.abs(fromMacros - kcal) <= kcal * 0.5 + 60;
}

/**
 * The best online result for a spoken food, or undefined when none is a real match (the caller then falls back to the
 * labelled AI estimate). Closest name wins; a branded product only wins if the user named that brand; odd data is skipped.
 */
export function pickOnline(spoken: string, foods: Food[], minScore = 0.55): Food | undefined {
  const query = searchQuery(spoken);
  const qTokens = tokens(query);
  let best: { food: Food; score: number } | undefined;
  for (const f of foods) {
    if (!sane(f)) continue;
    let score = scoreFood(f, query);
    if (f.brand) {
      const brandTokens = tokens(f.brand);
      const named = brandTokens.some((b) => qTokens.some((t) => near(b, t)));
      if (!named) score -= 0.08; // a generic food beats a brand nobody asked for
    }
    if (score >= minScore && (!best || score > best.score)) best = { food: f, score };
  }
  return best?.food;
}

export function searchFoods(query: string, pool: Food[], boost: (f: Food) => number = () => 0, limit = 40): Scored[] {
  const out: Scored[] = [];
  for (const f of pool) {
    const s = scoreFood(f, query);
    if (s >= 0.3) out.push({ food: f, score: s + boost(f) });
  }
  out.sort((a, b) => b.score - a.score || a.food.name.length - b.food.name.length);
  return out.slice(0, limit);
}

// ── Dictation parser ────────────────────────────────────────

const WORD_NUM: Record<string, number> = {
  a: 1, an: 1, one: 1, en: 1, et: 1, two: 2, to: 2, three: 3, tre: 3, four: 4, fire: 4, five: 5, fem: 5,
  six: 6, seks: 6, seven: 7, syv: 7, eight: 8, otte: 8, nine: 9, ni: 9, ten: 10, ti: 10, eleven: 11, twelve: 12,
  half: 0.5, halv: 0.5, halvt: 0.5, halve: 0.5, quarter: 0.25,
};

type Dim = { kind: 'g'; f: number } | { kind: 'ml'; f: number } | { kind: 'count'; word?: string };
const UNITS: Record<string, Dim> = {
  g: { kind: 'g', f: 1 }, gram: { kind: 'g', f: 1 }, grams: { kind: 'g', f: 1 }, gr: { kind: 'g', f: 1 },
  kg: { kind: 'g', f: 1000 }, kilo: { kind: 'g', f: 1000 }, kilos: { kind: 'g', f: 1000 }, kilogram: { kind: 'g', f: 1000 },
  ml: { kind: 'ml', f: 1 }, milliliter: { kind: 'ml', f: 1 }, millilitre: { kind: 'ml', f: 1 }, milliliters: { kind: 'ml', f: 1 },
  cl: { kind: 'ml', f: 10 }, dl: { kind: 'ml', f: 100 }, deciliter: { kind: 'ml', f: 100 }, l: { kind: 'ml', f: 1000 }, liter: { kind: 'ml', f: 1000 }, litre: { kind: 'ml', f: 1000 }, liters: { kind: 'ml', f: 1000 },
  tsp: { kind: 'ml', f: 5 }, teaspoon: { kind: 'ml', f: 5 }, tsk: { kind: 'ml', f: 5 }, teske: { kind: 'ml', f: 5 },
  tbsp: { kind: 'ml', f: 15 }, tablespoon: { kind: 'ml', f: 15 }, spsk: { kind: 'ml', f: 15 }, spiseske: { kind: 'ml', f: 15 },
  slice: { kind: 'count', word: 'slice' }, slices: { kind: 'count', word: 'slice' }, skive: { kind: 'count', word: 'slice' }, skiver: { kind: 'count', word: 'slice' },
  piece: { kind: 'count' }, pieces: { kind: 'count' }, stk: { kind: 'count' }, stykke: { kind: 'count' }, stykker: { kind: 'count' },
  handful: { kind: 'count', word: 'handful' }, handfuls: { kind: 'count', word: 'handful' }, handfulde: { kind: 'count', word: 'handful' }, haandfuld: { kind: 'count', word: 'handful' },
  glass: { kind: 'count', word: 'glass' }, glasses: { kind: 'count', word: 'glass' }, glas: { kind: 'count', word: 'glass' },
  can: { kind: 'count', word: 'can' }, cans: { kind: 'count', word: 'can' }, daase: { kind: 'count', word: 'can' },
  cup: { kind: 'count', word: 'cup' }, cups: { kind: 'count', word: 'cup' }, kop: { kind: 'count', word: 'cup' },
  scoop: { kind: 'count', word: 'scoop' }, scoops: { kind: 'count', word: 'scoop' },
  bowl: { kind: 'count', word: 'bowl' }, bowls: { kind: 'count', word: 'bowl' }, skal: { kind: 'count', word: 'bowl' },
  serving: { kind: 'count' }, servings: { kind: 'count' }, portion: { kind: 'count' }, portioner: { kind: 'count' },
};

export interface ParsedFoodRow {
  id: string;
  raw: string;
  amount?: number;
  dim: 'g' | 'ml' | 'count';
  countWord?: string;
  query: string;
}

export function splitSegments(text: string): string[] {
  const t = text
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/\s+/g, ' ')
    .trim();
  return t
    .split(/\s*(?:[,;.]\s+|[,;]$|\.$|\band\b|\bog\b|\bplus\b|\bthen\b|\bsamt\b)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseFoodText(text: string): ParsedFoodRow[] {
  const rows: ParsedFoodRow[] = [];
  let n = 0;
  for (const seg of splitSegments(text)) {
    const words = seg.toLowerCase().replace(/[.]$/, '').split(/\s+/);
    let i = 0;
    let amount: number | undefined;
    // number
    const numTok = words[i];
    if (numTok !== undefined) {
      const frac = numTok.match(/^(\d+)\/(\d+)$/);
      const glued = numTok.match(/^(\d+(?:\.\d+)?)([a-zæøå]+)$/); // "200g"
      if (frac) { amount = Number(frac[1]) / Number(frac[2]); i++; }
      else if (/^\d+(\.\d+)?$/.test(numTok)) { amount = Number(numTok); i++; }
      else if (glued && UNITS[fold(glued[2])]) { amount = Number(glued[1]); words.splice(i, 1, glued[1], glued[2]); i++; }
      else if (WORD_NUM[numTok] !== undefined && words.length > 1) { amount = WORD_NUM[numTok]; i++; }
      if (amount !== undefined && words[i] === 'and' ) i++;
      // "half a banana" / "one and a half"
      if (amount === 0.5 && (words[i] === 'a' || words[i] === 'en' || words[i] === 'et')) i++;
    }
    let dim: ParsedFoodRow['dim'] = 'count';
    let factor = 1;
    let countWord: string | undefined;
    const unitTok = words[i] ? fold(words[i]) : '';
    const u = UNITS[unitTok];
    if (u && amount !== undefined) {
      i++;
      if (u.kind === 'count') { dim = 'count'; countWord = u.word; }
      else { dim = u.kind; factor = u.f; }
    }
    if (words[i] === 'of' || words[i] === 'af') i++;
    const query = words.slice(i).join(' ').trim();
    if (!query) continue;
    rows.push({
      id: `r${n++}`, raw: seg, amount: amount !== undefined ? amount * factor : undefined,
      dim: amount === undefined ? 'count' : dim, countWord, query,
    });
    // bare "banana" → one of it
    if (amount === undefined) rows[rows.length - 1].amount = 1;
  }
  return rows;
}

// ── Resolution ──────────────────────────────────────────────

export type RowStatus = 'resolved' | 'ambiguous' | 'unmatched';
export interface ResolvedRow extends ParsedFoodRow {
  candidates: Scored[];
  status: RowStatus;
  /** suggested-but-unconfirmed candidate for ambiguous rows */
  suggestionId?: string;
  choiceId?: string;
  /** choice was remembered from an earlier confirmation */
  remembered?: boolean;
}

const TIE = 0.06;

/**
 * Recipe wording → the food it means (a recipe says "plain flour", "vegetable oil", "chocolate chips"; the food list says
 * Wheat flour, Rapeseed oil, Dark chocolate). Used only when the words as written don't find a food, and the food the app
 * picked is always the one shown, so a swap is never hidden.
 */
const KITCHEN: [RegExp, string][] = [
  [/\b(?:plain|all[- ]?purpose|white|self[- ]?rais(?:ing)?|self[- ]?rising|bread|cake|pastry|ap)\s+flour\b/, 'wheat flour'],
  [/\b(?:vegetable|neutral|cooking|canola|frying|sunflower|corn)\s+oil\b|\bneutral olie\b|\bmadolie\b/, 'rapeseed oil'],
  [/\bmilk\s+choc(?:olate)?\s+(?:chips|chunks|drops|buttons)\b/, 'milk chocolate'],
  [/\b(?:(?:dark|semi[- ]?sweet|bitter[- ]?sweet|plain)\s+)?choc(?:olate)?\s+(?:chips|chunks|drops|buttons)\b|\bchokoladeknapper\b/, 'dark chocolate'],
  [/\b(?:caster|castor|granulated|white|cane|superfine|icing|powdered|confectioners'?)\s+sugar\b|\b(?:strosukker|flormelis)\b/, 'sugar'],
  [/\b(?:un)?salted\s+butter\b/, 'butter'],
  [/\b(?:large|medium|small|whole|free[- ]?range|organic)\s+eggs?\b/, 'egg whole raw'],
  [/\b(?:whole|full[- ]?fat)\s+milk\b/, 'milk whole'],
  [/\b(?:rolled|porridge|old[- ]?fashioned|quick)\s+oats\b|\boat\s+flakes\b/, 'oats rolled'],
  [/\bgreek\s+yog(?:h)?urt\b/, 'greek yoghurt'],
];
const KITCHEN_FILLER = /\b(?:fresh|chopped|melted|softened|room[- ]temperature|organic|finely|roughly|sifted|packed|heaped|level|extra[- ]virgin|good[- ]quality)\b/g;
/** Spices and the like: only the thing itself, never a dish named after it ("cinnamon" is not a cinnamon roll). */
const EXACT_ONLY = /^(?:ground\s+)?(?:cinnamon|salt|sea salt|pepper|black pepper|vanilla|vanilla extract|vanilla essence|ginger|nutmeg|cardamom|cloves?|paprika|cumin|turmeric|chili flakes|baking soda|bicarbonate of soda|yeast|water|ice|lemon zest)$/;
const exactOnly = (q: string, f: Food) => { const n = fold(f.name); return n === q || n.startsWith(`${q} `) && /^(?:ground|powder|dried|raw)\b/.test(n.slice(q.length + 1)); };

/** Another way to say the same food, or null. */
export function kitchenQuery(q: string): string | null {
  const s = fold(q);
  for (const [re, to] of KITCHEN) if (re.test(s)) return to;
  const bare = s.replace(KITCHEN_FILLER, ' ').replace(/\s+/g, ' ').trim();
  return bare && bare !== s ? bare : null;
}

export function resolveRows(
  rows: ParsedFoodRow[], pool: Food[], choices: Record<string, string>, boost: (f: Food) => number = () => 0,
): ResolvedRow[] {
  return rows.map((r) => {
    let candidates = searchFoods(r.query, pool, boost, 6);
    if (EXACT_ONLY.test(fold(r.query))) candidates = candidates.filter((c) => exactOnly(fold(r.query).replace(/^ground\s+/, ''), c.food));
    const remembered = choices[fold(r.query)];
    const rem = remembered ? pool.find((f) => f.id === remembered) : undefined;
    if (rem) return { ...r, candidates: [{ food: rem, score: 1 }, ...candidates.filter((c) => c.food.id !== rem.id)], status: 'resolved', choiceId: rem.id, remembered: true };
    // the words as written found nothing sure: try the kitchen's other way of saying it ("plain flour" → wheat flour)
    const alt = !candidates.length || candidates[0].score < 0.55 ? kitchenQuery(r.query) : null;
    const altC = alt ? searchFoods(alt, pool, boost, 6) : [];
    if (altC.length && altC[0].score >= 0.55 && (!candidates.length || altC[0].score > candidates[0].score)) return { ...r, candidates: altC, status: 'resolved', choiceId: altC[0].food.id };
    if (!candidates.length) return { ...r, candidates, status: 'unmatched' };
    const top = candidates[0].score;
    const tied = candidates.filter((c) => top - c.score <= TIE);
    if (top >= 0.55 && tied.length === 1) return { ...r, candidates, status: 'resolved', choiceId: candidates[0].food.id };
    return { ...r, candidates, status: 'ambiguous', suggestionId: candidates[0].food.id };
  });
}

export interface RowQuantity { qty: Quantity | null; estimated: boolean; problem?: 'needsGrams' | 'noAmount' }

/** Convert a parsed quantity into a real Quantity for the chosen food — or explain why it can't. */
export function rowQuantity(row: ParsedFoodRow, food: Food): RowQuantity {
  if (row.amount === undefined || row.amount <= 0) return { qty: null, estimated: false, problem: 'noAmount' };
  const units = allowedUnits(food);
  if (row.dim === 'g' || row.dim === 'ml') {
    if (units.includes(row.dim)) return { qty: { amount: row.amount, unit: row.dim }, estimated: false };
    return { qty: null, estimated: false, problem: 'needsGrams' };
  }
  // count: pick a portion, preferring one whose label mentions the counted word
  if (!food.portions.length) return { qty: null, estimated: false, problem: 'needsGrams' };
  const w = row.countWord;
  const p = (w && food.portions.find((x) => fold(x.label).includes(w))) || food.portions[0];
  return { qty: { amount: row.amount, unit: 'portion', portionId: p.id }, estimated: !p.verified };
}

