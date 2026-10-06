import type { Lang, Settings } from './types';

export const KG_PER_LB = 0.45359237;
export const M_PER_MI = 1609.344;
export const CM_PER_IN = 2.54;

export function kgToDisplay(kg: number, u: Settings['units']['weight']): number {
  return u === 'lb' ? kg / KG_PER_LB : kg;
}
export function displayToKg(v: number, u: Settings['units']['weight']): number {
  return u === 'lb' ? v * KG_PER_LB : v;
}
export function mToDisplay(m: number, u: Settings['units']['distance']): number {
  return u === 'mi' ? m / M_PER_MI : m / 1000;
}
export function displayToM(v: number, u: Settings['units']['distance']): number {
  return u === 'mi' ? v * M_PER_MI : v * 1000;
}
export function cmToDisplay(cm: number, u: Settings['units']['length']): number {
  return u === 'in' ? cm / CM_PER_IN : cm;
}
export function displayToCm(v: number, u: Settings['units']['length']): number {
  return u === 'in' ? v * CM_PER_IN : v;
}

const locale = (lang: Lang) => (lang === 'da' ? 'da-DK' : 'en-GB');

/** Locale-aware number, trimmed to `max` decimals. */
/** A percentage the way each language writes it: "26%" in English, "26 %" in Danish. */
export const fmtPct = (n: number | string, lang: Lang) => (lang === 'da' ? `${n} %` : `${n}%`);
export function fmtNum(v: number, lang: Lang, max = 1, min = 0): string {
  if (!Number.isFinite(v)) return '–';
  const group = Math.abs(v) >= 1000;
  // building an Intl formatter is slow; these are called for every number on screen, on every render
  const key = `${lang}|${max}|${min}|${group}`;
  let f = NUM_FMT.get(key);
  if (!f) { f = new Intl.NumberFormat(locale(lang), { maximumFractionDigits: max, minimumFractionDigits: min, useGrouping: group }); NUM_FMT.set(key, f); }
  return f.format(v);
}
const NUM_FMT = new Map<string, Intl.NumberFormat>();

export function fmtWeight(kg: number, u: Settings['units']['weight'], lang: Lang): string {
  const v = kgToDisplay(kg, u);
  return fmtNum(v, lang, u === 'lb' ? 1 : 2);
}

/**
 * Parse user-typed decimals: accepts "1,5", "1.5", " 82,25 ". Returns undefined for blanks / junk.
 * A lone thousands separator ("1.000" or "1,000") is read as a decimal point only if it has
 * 1–2 decimals; exactly three trailing digits are treated as thousands.
 */
export function parseNum(input: string | number | undefined | null): number | undefined {
  if (input === undefined || input === null) return undefined;
  if (typeof input === 'number') return Number.isFinite(input) ? input : undefined;
  let s = input.trim().replace(/\s/g, '');
  if (!s) return undefined;
  if (/^-?\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, '');
  else s = s.replace(',', '.');
  if (!/^-?\d*\.?\d+$|^-?\d+\.$/.test(s)) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

export const weightUnitLabel = (u: Settings['units']['weight']) => u;
export const distanceUnitLabel = (u: Settings['units']['distance']) => u;
