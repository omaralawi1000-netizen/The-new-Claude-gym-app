import type { Lang } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

/** Day key (YYYY-MM-DD) honouring a custom day-start hour (e.g. 4 → 02:30 still counts as yesterday). */
export function dayKey(d: Date | number = new Date(), dayStartHour = 0): string {
  const t = new Date(typeof d === 'number' ? d : d.getTime());
  if (dayStartHour) t.setHours(t.getHours() - dayStartHour);
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}

/** Local-noon Date for a key (noon avoids DST edge cases when adding days). */
export function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function addDays(key: string, n: number): string {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

export function diffDays(a: string, b: string): number {
  return Math.round((parseKey(a).getTime() - parseKey(b).getTime()) / 86400000);
}

export function weekdayOf(key: string): number {
  return parseKey(key).getDay();
}

export function startOfWeek(key: string, weekStart: 0 | 1): string {
  const wd = weekdayOf(key);
  const back = (wd - weekStart + 7) % 7;
  return addDays(key, -back);
}

export function rangeKeys(from: string, to: string): string[] {
  const out: string[] = [];
  for (let k = from, i = 0; k <= to && i < 4000; k = addDays(k, 1), i++) out.push(k);
  return out;
}

const loc = (lang: Lang) => (lang === 'da' ? 'da-DK' : 'en-GB');

export function fmtDate(key: string, lang: Lang, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }): string {
  return new Intl.DateTimeFormat(loc(lang), opts).format(parseKey(key));
}
export function fmtWeekdayShort(wd: number, lang: Lang, narrow = false): string {
  // 2023-01-01 was a Sunday
  return new Intl.DateTimeFormat(loc(lang), { weekday: narrow ? 'narrow' : 'short' }).format(new Date(2023, 0, 1 + wd, 12));
}
export function fmtTime(ms: number, lang: Lang): string {
  return new Intl.DateTimeFormat(loc(lang), { hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
}
export function fmtDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
export function fmtDurationLong(totalSec: number): string {
  const m = Math.round(totalSec / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ''}`.trim();
}
export function relativeDay(key: string, today: string, lang: Lang): string | null {
  const d = diffDays(key, today);
  if (d === 0) return lang === 'da' ? 'I dag' : 'Today';
  if (d === -1) return lang === 'da' ? 'I går' : 'Yesterday';
  if (d === 1) return lang === 'da' ? 'I morgen' : 'Tomorrow';
  return null;
}
