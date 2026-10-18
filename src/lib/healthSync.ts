/**
 * The watch, automatically (Coach 2.0 phase 5b, part D). Galaxy Watch → Samsung Health → Health Connect → the Android app
 * (android/…/HealthSync.java), which opens this page with the numbers in its address after "#hc=" (base64url JSON). The
 * page reads them, keeps what is new — steps per day and the watch's workouts as activities — and takes them out of the
 * address again. Read only, never the other way.
 *
 * Only an address the Android app opened is believed (`inAndroidApp`: Chrome says so in the referrer); a link to the site
 * with a made-up "#hc=" does nothing. Everything is checked and capped: at most 60 workouts and 40 days, sane numbers.
 *
 * Calories the watch counted are shown, never added to the food target (Omar: "I don't think it should count the calories
 * I burn so I can eat more").
 */
import type { ActivityKind, ActivityLog, StepDay } from './types';
import { dayKey } from './dates';
import { uid } from './nutrition';
import { inAndroidApp } from './androidApp';
import { useStore } from '../state/store';
import { useUI } from '../state/ui';
import { tNow } from './i18n';

export interface HcWorkout { id: string; t: string; n?: string; s: number; e: number; hr?: number; hx?: number; kc?: number; m?: number; src?: string }
export interface HcPayload {
  v: 1; avail: boolean; on: boolean; granted: boolean; at: number;
  /** why there are no numbers: unavailable (Android older than 14), denied, off, slow, failed */
  note?: string;
  days?: [string, number][];
  ex?: HcWorkout[];
}

/** How it stands, for Settings (no numbers): kept on the phone. */
export interface HcStatus { avail: boolean; on: boolean; granted: boolean; at: number; note?: string; lastSync?: number }
const STATUS = 'aven.hc';
export function hcStatus(): HcStatus | null { try { const v = JSON.parse(localStorage.getItem(STATUS) || 'null'); return v && typeof v === 'object' ? v : null; } catch { return null; } }
function saveStatus(p: HcPayload, synced: boolean) {
  const prev = hcStatus();
  const s: HcStatus = { avail: p.avail, on: p.on, granted: p.granted, at: p.at, note: p.note, lastSync: synced ? p.at : prev?.lastSync };
  try { localStorage.setItem(STATUS, JSON.stringify(s)); } catch { /* fine */ }
}

const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : undefined);

/** "#hc=…" → the checked numbers, or null. */
export function parseHc(hash: string): HcPayload | null {
  const m = /(?:^#|&)hc=([A-Za-z0-9_-]{8,60000})/.exec(hash);
  if (!m) return null;
  let raw: any;
  try {
    const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    raw = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
  } catch { return null; }
  if (!raw || raw.v !== 1) return null;
  const now = Date.now();
  const at = num(raw.at, now - 30 * 86400000, now + 86400000) ?? now;
  const days = (Array.isArray(raw.days) ? raw.days : []).slice(0, 40)
    .filter((d: any) => Array.isArray(d) && typeof d[0] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d[0]) && num(d[1], 1, 150000) !== undefined)
    .map((d: any) => [d[0], Math.round(d[1])] as [string, number]);
  const ex: HcWorkout[] = (Array.isArray(raw.ex) ? raw.ex : []).slice(0, 60).flatMap((w: any): HcWorkout[] => {
    const s = num(w?.s, now - 60 * 86400000, now + 3600000), e = num(w?.e, now - 60 * 86400000, now + 3600000);
    if (typeof w?.id !== 'string' || !w.id || w.id.length > 120 || s === undefined || e === undefined || e <= s || e - s > 12 * 3600000) return [];
    return [{
      id: w.id, t: typeof w.t === 'string' ? w.t.slice(0, 24) : 'other', n: typeof w.n === 'string' ? w.n.slice(0, 40) : undefined, s, e,
      hr: num(w.hr, 30, 230), hx: num(w.hx, 30, 240), kc: num(w.kc, 1, 5000), m: num(w.m, 1, 300000), src: typeof w.src === 'string' ? w.src.slice(0, 80) : undefined,
    }];
  });
  return { v: 1, avail: !!raw.avail, on: !!raw.on, granted: !!raw.granted, at, note: typeof raw.note === 'string' ? raw.note.slice(0, 20) : undefined, ...(Array.isArray(raw.days) ? { days } : {}), ...(Array.isArray(raw.ex) ? { ex } : {}) };
}

/** Health Connect's workout types in Aven's kinds (lifting is left out: Aven logs the gym itself). */
const KIND: Record<string, ActivityKind | null> = {
  treadmill: 'run', run: 'run', rowing_machine: 'row', rowing: 'row', stair_machine: 'stairs', stairs: 'stairs',
  bike_stationary: 'cycle', bike: 'cycle', walk: 'walk', hike: 'hike', martial_arts: 'wrestling', swim: 'swim',
  yoga: 'mobility', stretch: 'mobility', elliptical: 'other', hiit: 'other', other: 'other', strength: null,
};
/** The watch's word for a kind Aven doesn't have (shown as its name). */
const NAME: Record<string, string> = { treadmill: 'Treadmill', stair_machine: 'Stair climber', rowing_machine: 'Rowing machine', bike_stationary: 'Exercise bike', elliptical: 'Elliptical', hiit: 'HIIT' };

/**
 * How hard it was, from the heart rate: under 70 % of your highest heart rate easy, 70–85 % hard, over 85 % max. Your
 * highest is the highest the watch has seen, but never taken as below 185 (a few easy weeks would otherwise make every
 * workout look "max").
 */
export function intensityOf(avgHr: number | undefined, highest: number): 1 | 2 | 3 | undefined {
  if (!avgHr) return undefined;
  const top = Math.max(185, highest);
  const p = avgHr / top;
  return p < 0.7 ? 1 : p <= 0.85 ? 2 : 3;
}

/**
 * The store's activities and steps with the watch's numbers merged in: a workout already there (same Health Connect id)
 * is updated in place (your note stays); one you logged yourself the same day as the same kind, about as long, becomes
 * the watch's (your note and rounds stay); steps for a day are the watch's. Returns what changed.
 */
export function mergeHc(p: HcPayload, cur: { activities: ActivityLog[]; steps: StepDay[] }, dayStartHour: number): { activities: ActivityLog[]; steps: StepDay[]; added: number } {
  const acts = [...cur.activities];
  let added = 0;
  const highest = Math.max(0, ...acts.map((a) => a.maxHr ?? 0), ...(p.ex ?? []).map((w) => w.hx ?? 0));
  for (const w of p.ex ?? []) {
    const kind = KIND[w.t] ?? (w.t in KIND ? null : 'other');
    if (!kind) continue;
    const date = dayKey(w.s, dayStartHour);
    const durationSec = Math.round((w.e - w.s) / 1000);
    const watch: Partial<ActivityLog> = {
      kind, date, durationSec, source: 'watch', hcId: w.id, startAt: w.s, avgHr: w.hr ? Math.round(w.hr) : undefined, maxHr: w.hx ? Math.round(w.hx) : undefined,
      kcal: w.kc ? Math.round(w.kc) : undefined, distanceM: w.m ? Math.round(w.m) : undefined, name: w.n || NAME[w.t], intensity: intensityOf(w.hr, highest),
    };
    const same = acts.findIndex((a) => a.hcId === w.id);
    if (same >= 0) { acts[same] = { ...acts[same], ...watch, note: acts[same].note, rounds: acts[same].rounds }; continue; }
    // logged by hand too (before the watch was connected, or by voice): one activity, the watch's numbers, your words
    const mine = acts.findIndex((a) => !a.hcId && a.date === date && a.kind === kind && Math.abs(a.durationSec - durationSec) <= Math.max(900, durationSec * 0.5));
    if (mine >= 0) { acts[mine] = { ...acts[mine], ...watch, intensity: acts[mine].intensity ?? watch.intensity, note: acts[mine].note, rounds: acts[mine].rounds }; continue; }
    acts.push({ id: uid('ac'), at: w.e, ...watch } as ActivityLog);
    added++;
  }
  let steps = cur.steps;
  if (p.days?.length) {
    const by = new Map(cur.steps.map((d) => [d.date, d.count]));
    for (const [date, count] of p.days) by.set(date, count);
    steps = [...by].map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date)).slice(-120);
  }
  return { activities: acts, steps, added };
}

/**
 * The page was opened by the Android app with "#hc=…": keep the numbers, take them out of the address. Called when the app
 * starts and whenever the address changes (the app opening an Aven that is already running only changes the "#").
 */
export function applyHcFromAddress(): void {
  if (!/(?:^#|&)hc=/.test(location.hash)) return;
  const p = parseHc(location.hash);
  // (out of the address either way: a reload or a shared link must not carry it)
  try { history.replaceState(history.state, '', location.pathname + location.search); } catch { /* fine */ }
  if (!p || !inAndroidApp()) return;
  const synced = !!(p.days || p.ex);
  saveStatus(p, synced);
  if (synced) {
    const st = useStore.getState();
    const r = mergeHc(p, { activities: st.activities, steps: st.steps ?? [] }, st.settings.dayStartHour);
    if (JSON.stringify(r.activities) !== JSON.stringify(st.activities) || JSON.stringify(r.steps) !== JSON.stringify(st.steps ?? [])) st.mergeHealth(r);
    // a new workout from the watch is said once, quietly
    if (r.added) useUI.getState().toast(r.added === 1 ? tNow('1 workout from your watch') : tNow('{n} workouts from your watch', { n: r.added }), { tone: 'ok' });
  }
  window.dispatchEvent(new Event('aven-hc'));
}

/** "Connect watch" and friends: the Android app's link (it opens Aven again at this page). Without the app the phone
 *  offers the app's download instead. */
export function hcLink(what: 'connect' | 'sync' | 'off'): string {
  const ret = encodeURIComponent(location.origin + location.pathname);
  const fallback = encodeURIComponent('https://github.com/omaralawi1000-netizen/The-new-Claude-gym-app/releases/download/android-latest/aven.apk');
  return `intent://health/${what}?return=${ret}#Intent;scheme=aven;package=app.aven.android;S.browser_fallback_url=${fallback};end`;
}
