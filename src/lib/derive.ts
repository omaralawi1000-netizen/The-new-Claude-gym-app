import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { dayKey } from './dates';
import { sumNutrients, type Sum } from './nutrition';
import type { FoodEntry, Meal, Nutrients, WaterEntry } from './types';
import { makeT } from './i18n';

/** "Today" according to the user's day boundary; re-evaluated every 30 s and on focus. */
export function useToday(): string {
  const hour = useStore((s) => s.settings.dayStartHour);
  const [today, setToday] = useState(() => dayKey(Date.now(), hour));
  useEffect(() => {
    const upd = () => setToday(dayKey(Date.now(), hour));
    upd();
    const id = setInterval(upd, 30000);
    document.addEventListener('visibilitychange', upd);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', upd); };
  }, [hour]);
  return today;
}

export function entriesOn(entries: FoodEntry[], date: string): FoodEntry[] {
  return entries.filter((e) => e.date === date).sort((a, b) => a.at - b.at);
}

export function useDayEntries(date: string) {
  const entries = useStore((s) => s.entries);
  return useMemo(() => entriesOn(entries, date), [entries, date]);
}

export function useDaySummary(date: string): { list: FoodEntry[]; sum: Sum } {
  const list = useDayEntries(date);
  return useMemo(() => ({ list, sum: sumNutrients(list.map((e) => e.nutrients)) }), [list]);
}

export function useWaterOn(date: string): { list: WaterEntry[]; ml: number } {
  const water = useStore((s) => s.water);
  return useMemo(() => {
    const list = water.filter((w) => w.date === date);
    return { list, ml: list.reduce((a, w) => a + w.ml, 0) };
  }, [water, date]);
}

export function mealName(m: Meal, lang: 'en' | 'da'): string {
  if (m.name) return m.name;
  const t = makeT(lang);
  return ({ breakfast: t('Breakfast'), lunch: t('Lunch'), dinner: t('Dinner'), snacks: t('Snacks') } as Record<string, string>)[m.id] ?? m.id;
}

/** Which meal is "now" (for default when adding food). */
export function defaultMealId(meals: Meal[], at = new Date()): string {
  const h = at.getHours();
  const ids = meals.map((m) => m.id);
  const pick = h < 10.5 ? 'breakfast' : h < 15 ? 'lunch' : h < 20 ? 'dinner' : 'snacks';
  return ids.includes(pick) ? pick : ids[0];
}

export function perMeal(entries: FoodEntry[], mealId: string): FoodEntry[] {
  return entries.filter((e) => e.mealId === mealId);
}

export const hasGoals = (g: { kcal?: number; protein?: number; carbs?: number; fat?: number }) => !!(g.kcal || g.protein || g.carbs || g.fat);

export function totalsLine(n: Nutrients): string { return `${Math.round(n.kcal ?? 0)} kcal`; }
