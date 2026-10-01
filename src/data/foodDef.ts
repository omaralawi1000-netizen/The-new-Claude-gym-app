import type { BasisUnit, Food, FoodState, Nutrients } from '../lib/types';

export type N = [kcal: number, p: number, c: number, f: number, fibre: number | null, sugar: number | null, sat: number | null, na: number | null];
export type P = [label: string, amount: number];
export interface Opt { state?: FoodState; group?: string; density?: number; aliases?: string[] }

const nut = (n: N): Nutrients => {
  const [kcal, protein, carbs, fat, fibre, sugar, satFat, sodium] = n;
  const o: Nutrients = { kcal, protein, carbs, fat };
  if (fibre !== null) o.fibre = fibre;
  if (sugar !== null) o.sugar = sugar;
  if (satFat !== null) o.satFat = satFat;
  if (sodium !== null) o.sodium = sodium;
  return o;
};

export function F(id: string, name: string, nameDa: string, basis: BasisUnit, n: N, portions: P[] = [], opt: Opt = {}): Food {
  return {
    id: `ref:${id}`, name, nameDa, source: 'reference', sourceId: id, basis, per100: nut(n),
    portions: portions.map(([label, amount], i) => ({ id: `p${i}`, label, amount, verified: false })),
    density: opt.density, state: opt.state, variantGroup: opt.group, aliases: opt.aliases,
  };
}
