import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { dayKey } from './dates';
import { sumNutrients, type Sum } from './nutrition';
import type { FoodEntry, Meal, WaterEntry } from './types';
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
export function defaultMealId(meals: Meal[], at = new Date(), dayStartHour = 0): string {
  const h = at.getHours();
  // after midnight but before the new day starts (a shake at 01:30 with the day starting at 04:00): a late snack
  if (h < dayStartHour) return meals.some((m) => m.id === 'snacks') ? 'snacks' : meals[meals.length - 1]?.id ?? meals[0].id;
  const ids = meals.map((m) => m.id);
  const pick = h < 10.5 ? 'breakfast' : h < 15 ? 'lunch' : h < 20 ? 'dinner' : 'snacks';
  return ids.includes(pick) ? pick : ids[0];
}

/** What Undo needs to put a removed meal back: the meal, where it was, and exactly the entries that moved out of it. */
export interface RemovedMeal { meal: Meal; index: number; target: Meal; moved: string[] }

/** Remove a meal; its entries move to another meal (the first other one). Null when it is the only meal or not found. */
export function removeMeal(meals: Meal[], entries: FoodEntry[], id: string): { meals: Meal[]; entries: FoodEntry[]; removed: RemovedMeal } | null {
  const index = meals.findIndex((m) => m.id === id);
  const target = meals.find((m) => m.id !== id);
  if (index < 0 || !target) return null;
  const moved = entries.filter((e) => e.mealId === id).map((e) => e.id);
  return {
    meals: meals.filter((m) => m.id !== id),
    entries: entries.map((e) => (e.mealId === id ? { ...e, mealId: target.id } : e)),
    removed: { meal: meals[index], index, target, moved },
  };
}

/** Undo of removeMeal: the meal back at its place, and the entries it moved back in (only those, and only if still in the target). */
export function restoreMeal(meals: Meal[], entries: FoodEntry[], r: RemovedMeal): { meals: Meal[]; entries: FoodEntry[] } {
  const back = meals.some((m) => m.id === r.meal.id) ? meals : [...meals.slice(0, r.index), r.meal, ...meals.slice(r.index)];
  const ids = new Set(r.moved);
  return { meals: back, entries: entries.map((e) => (ids.has(e.id) && e.mealId === r.target.id ? { ...e, mealId: r.meal.id } : e)) };
}

export function perMeal(entries: FoodEntry[], mealId: string): FoodEntry[] {
  return entries.filter((e) => e.mealId === mealId);
}


