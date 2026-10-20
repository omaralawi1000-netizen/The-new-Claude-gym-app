import type { Lang, NutrientKey, Quantity, FoodSnapshot } from './types';
import { fmtNum } from './units';
import { roundNutrient, type Sum } from './nutrition';
import type { TFn } from './i18n';
import { REFERENCE_BY_ID } from '../data/foods';

export const NUTRIENT_LABEL: Record<NutrientKey, string> = {
  kcal: 'Calories', protein: 'Protein', carbs: 'Carbs', fat: 'Fat', fibre: 'Fibre', sugar: 'Sugars', satFat: 'Saturated fat', sodium: 'Sodium',
};
export const NUTRIENT_UNIT: Record<NutrientKey, string> = { kcal: 'kcal', protein: 'g', carbs: 'g', fat: 'g', fibre: 'g', sugar: 'g', satFat: 'g', sodium: 'mg' };

export function fmtNutrient(k: NutrientKey, v: number | undefined, lang: Lang, withUnit = false): string {
  if (v === undefined) return '—';
  const r = roundNutrient(k, v);
  const s = fmtNum(r, lang, k === 'kcal' || k === 'sodium' ? 0 : r < 10 ? 1 : 0);
  return withUnit ? `${s} ${NUTRIENT_UNIT[k]}` : s;
}

/** Sum display: exact when every item had the nutrient; "≥" when some items lacked it; "—" when none had it. */
export function fmtSum(k: NutrientKey, sum: Sum, lang: Lang, withUnit = false): { text: string; partial: boolean; unknown: boolean } {
  const v = sum.totals[k];
  const missing = sum.unknown[k] ?? 0;
  if (v === undefined) return { text: sum.count === 0 ? fmtNutrient(k, 0, lang, withUnit) : '—', partial: false, unknown: sum.count > 0 };
  const base = fmtNutrient(k, v, lang, withUnit);
  return missing > 0 ? { text: `≥ ${base}`, partial: true, unknown: false } : { text: base, partial: false, unknown: false };
}

export function qtyLabel(e: { qty: Quantity; snap: FoodSnapshot; base: number }, lang: Lang, t: TFn): string {
  const q = e.qty;
  if (q.unit === 'portion') {
    const p = e.snap.portions.find((x) => x.id === q.portionId);
    const label = p?.label ?? t('portion');
    return q.amount === 1 ? label : `${fmtNum(q.amount, lang, 2)} × ${label}`;
  }
  return `${fmtNum(q.amount, lang, 1)} ${q.unit}`;
}


export function sourceLabel(src: string, t: TFn): string {
  return ({ reference: t('Reference (approximate)'), off: 'Open Food Facts', usda: 'USDA FoodData Central', custom: t('Your food'), recipe: t('Your recipe'), quick: t('Quick entry') } as Record<string, string>)[src] ?? src;
}

/** A food's name in the app's language (built-in foods also have a Danish name). Search still matches both names. */
export function foodName(f: { name: string; nameDa?: string }, lang: Lang): string {
  return lang === 'da' && f.nameDa ? f.nameDa : f.name;
}

/** A logged entry's name in the app's language: a built-in food shows its Danish name, anything else the name it was logged with. */
export function entryName(snap: FoodSnapshot, lang: Lang): string {
  const ref = lang === 'da' && snap.foodId ? REFERENCE_BY_ID[snap.foodId] : undefined;
  return ref?.nameDa || snap.name;
}
