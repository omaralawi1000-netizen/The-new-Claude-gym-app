/**
 * The watch in detail, from the Android app (lib/healthSync.ts, "dt" in its answer): heart rate a minute at a time, steps a
 * minute at a time, and every sleep session (naps too) with each stage and its times. The app sends the last 3 days every
 * time and older days 4 at a time, walking back 90 days.
 *
 * Kept on this phone in IndexedDB (`aven-watch`, the last 365 days), not in the app's data: a year of minutes would make
 * every save slow. Not in backups either: Health Connect keeps it, and the Android app sends it again. Read only; Delete all
 * data clears it. Aven Beta gets its own database (lib/beta.ts puts "beta:" in front of every database name).
 *
 * Minutes are packed two characters each (0–4095, "AA" = nothing measured), the empty end of the day left off: `minutes()`
 * unpacks them to 1440 numbers (index = minute of the day on the phone's clock).
 */

/** 0 awake (or out of bed), 1 light, 2 deep, 3 REM, 4 asleep (the watch didn't say which stage) */
export type Stage = 0 | 1 | 2 | 3 | 4;
/** One sleep session; each stage starts `from` minutes after `start` and lasts `min` minutes. */
export interface SleepSession { start: number; end: number; stages: { stage: Stage; from: number; min: number }[] }
export interface WatchDetail {
  date: string;
  /** heart rate per minute, packed (see `minutes`) */
  hr?: string;
  /** steps per minute, packed */
  steps?: string;
  /** the sleep sessions that ended this day, in order */
  sleep?: SleepSession[];
  /** when it arrived */
  at: number;
}

const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const PACKED = /^(?:[A-Za-z0-9_-]{2}){1,1440}$/;

/** A day's packed minutes → 1440 numbers (0 = nothing measured that minute). */
export function minutes(packed: string | undefined): number[] {
  const out = new Array<number>(1440).fill(0);
  if (!packed) return out;
  for (let i = 0; i * 2 + 1 < packed.length && i < 1440; i++) out[i] = ABC.indexOf(packed[i * 2]) * 64 + ABC.indexOf(packed[i * 2 + 1]);
  return out;
}

const num = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

/** The app's "dt" list, checked: only sane days, minutes and stages. */
export function parseDetail(raw: unknown, now = Date.now()): WatchDetail[] {
  if (!Array.isArray(raw)) return [];
  const OLD = now - 800 * 86400000;
  return raw.slice(0, 40).flatMap((d: any): WatchDetail[] => {
    if (typeof d?.d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.d)) return [];
    const hr = typeof d.hm === 'string' && PACKED.test(d.hm) && minutes(d.hm).every((x) => x === 0 || (x >= 25 && x <= 250)) ? d.hm : undefined;
    const steps = typeof d.sm === 'string' && PACKED.test(d.sm) && minutes(d.sm).every((x) => x <= 1000) ? d.sm : undefined;
    const sleep = (Array.isArray(d.sp) ? d.sp : []).slice(0, 8).flatMap((s: any): SleepSession[] => {
      if (!Array.isArray(s) || !num(s[0], OLD, now + 86400000) || !num(s[1], OLD, now + 86400000) || s[1] <= s[0] || s[1] - s[0] > 24 * 3600000) return [];
      const span = Math.ceil((s[1] - s[0]) / 60000) + 1;
      const stages: SleepSession['stages'] = [];
      for (let i = 2; i + 2 < s.length && stages.length < 400; i += 3) {
        const [stage, from, min] = [s[i], s[i + 1], s[i + 2]];
        if (num(stage, 0, 4) && Number.isInteger(stage) && num(from, 0, span) && num(min, 1, span)) stages.push({ stage: stage as Stage, from: Math.round(from), min: Math.round(min) });
      }
      return [{ start: Math.round(s[0]), end: Math.round(s[1]), stages }];
    });
    if (!hr && !steps && !sleep.length) return [];
    return [{ date: d.d, at: now, ...(hr ? { hr } : {}), ...(steps ? { steps } : {}), ...(sleep.length ? { sleep } : {}) }];
  });
}

const DB = 'aven-watch', STORE = 'days', ROUTES = 'routes', KEEP_DAYS = 365;
const hasIdb = () => typeof indexedDB !== 'undefined';
/** Without IndexedDB (tests, a locked-down browser): kept for this visit only. */
const mem = new Map<string, WatchDetail>();
const listeners = new Set<() => void>();
export function onWatchDetail(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }
const changed = () => listeners.forEach((fn) => { try { fn(); } catch { /* its own problem */ } });

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 2);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: 'date' });
      if (!r.result.objectStoreNames.contains(ROUTES)) r.result.createObjectStore(ROUTES, { keyPath: 'id' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
const req = <T>(r: IDBRequest<T>) => new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

/** Newly arrived days, merged into what is kept: what a day brings replaces what it had (a day without heart rate this
 *  time keeps the heart rate from before), and days over a year old go. */
export async function saveWatchDetail(list: WatchDetail[], now = Date.now()): Promise<void> {
  if (!list.length) return;
  const cut = new Date(now - KEEP_DAYS * 86400000).toISOString().slice(0, 10);
  if (!hasIdb()) {
    for (const d of list) mem.set(d.date, { ...mem.get(d.date), ...d });
    for (const k of [...mem.keys()]) if (k < cut) mem.delete(k);
    changed();
    return;
  }
  try {
    const db = await open();
    const dates = list.map((d) => d.date).sort();
    const had = new Map((await req(db.transaction(STORE, 'readonly').objectStore(STORE).getAll(IDBKeyRange.bound(dates[0], dates[dates.length - 1])) as IDBRequest<WatchDetail[]>)).map((d) => [d.date, d]));
    const tx = db.transaction(STORE, 'readwrite');
    const s = tx.objectStore(STORE);
    for (const d of list) s.put({ ...had.get(d.date), ...d });
    s.delete(IDBKeyRange.upperBound(cut, true));
    await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
    db.close();
    changed();
  } catch { /* the summary numbers are kept anyway; the detail comes again with the next answer */ }
}

/** The kept days from..to (dates, inclusive), oldest first. */
export async function watchDetails(from: string, to: string): Promise<WatchDetail[]> {
  if (!hasIdb()) return [...mem.values()].filter((d) => d.date >= from && d.date <= to).sort((a, b) => a.date.localeCompare(b.date));
  try {
    const db = await open();
    const all = await req(db.transaction(STORE, 'readonly').objectStore(STORE).getAll(IDBKeyRange.bound(from, to)) as IDBRequest<WatchDetail[]>);
    db.close();
    return all;
  } catch { return []; }
}

/** One day, or null. */
export async function watchDetail(date: string): Promise<WatchDetail | null> {
  return (await watchDetails(date, date))[0] ?? null;
}

/** How many days are kept (Settings → Watch). */
export async function watchDetailCount(): Promise<number> {
  if (!hasIdb()) return mem.size;
  try {
    const db = await open();
    const n = await req(db.transaction(STORE, 'readonly').objectStore(STORE).count());
    db.close();
    return n;
  } catch { return 0; }
}

/** Delete all data. */
export async function clearWatchDetail(): Promise<void> {
  mem.clear();
  memRoutes.clear();
  if (hasIdb()) {
    try {
      const db = await open();
      await req(db.transaction(STORE, 'readwrite').objectStore(STORE).clear());
      await req(db.transaction(ROUTES, 'readwrite').objectStore(ROUTES).clear());
      db.close();
    } catch { /* fine */ }
  }
  changed();
}

/**
 * GPS routes: a run or walk the watch tracked with GPS, by its Health Connect id (the activity's `hcId`). The Android app
 * sends the newest few (last 14 days) as Google's encoded polyline, thinned to at most 300 points; kept here for good
 * (they are small). `routePoints` turns one into [latitude, longitude] pairs.
 */
export interface Route { id: string; poly: string; at: number }
const memRoutes = new Map<string, Route>();

export function parseRoutes(raw: unknown, now = Date.now()): Route[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 20).flatMap((r: any): Route[] => typeof r?.id === 'string' && r.id && r.id.length <= 120 && typeof r.p === 'string' && /^[?-~]{4,20000}$/.test(r.p) && routePoints(r.p).length >= 2 ? [{ id: r.id, poly: r.p, at: now }] : []);
}

/** An encoded polyline → [latitude, longitude] pairs (nothing if it doesn't decode to places on Earth). */
export function routePoints(poly: string): [number, number][] {
  const out: [number, number][] = [];
  let i = 0, lat = 0, lng = 0;
  const next = () => {
    let shift = 0, x = 0, b = 0;
    do { if (i >= poly.length) return null; b = poly.charCodeAt(i++) - 63; x |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20 && shift < 35);
    return x & 1 ? ~(x >> 1) : x >> 1;
  };
  while (i < poly.length) {
    const a = next(), o = next();
    if (a === null || o === null) return [];
    lat += a; lng += o;
    if (Math.abs(lat) > 9000000 || Math.abs(lng) > 18000000) return [];
    out.push([lat / 1e5, lng / 1e5]);
  }
  return out;
}

export async function saveRoutes(list: Route[]): Promise<void> {
  if (!list.length) return;
  if (!hasIdb()) { for (const r of list) memRoutes.set(r.id, r); changed(); return; }
  try {
    const db = await open();
    const tx = db.transaction(ROUTES, 'readwrite');
    for (const r of list) tx.objectStore(ROUTES).put(r);
    await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
    db.close();
    changed();
  } catch { /* it comes again with the next answer */ }
}

/** A workout's route (its `hcId`), or null. */
export async function routeOf(id: string): Promise<Route | null> {
  if (!hasIdb()) return memRoutes.get(id) ?? null;
  try {
    const db = await open();
    const r = await req(db.transaction(ROUTES, 'readonly').objectStore(ROUTES).get(id) as IDBRequest<Route | undefined>);
    db.close();
    return r ?? null;
  } catch { return null; }
}
