/**
 * The watch, automatically (Coach 2.0 phase 5b, part D). Galaxy Watch → Samsung Health → Health Connect → the Android app
 * (android/…/HealthSync.java), which opens this page with the numbers in its address after "#hc=" (base64url JSON). The
 * page reads them, keeps what is new — steps per day, the watch's workouts as activities, and the rest of each day (sleep and
 * its stages, resting heart rate, HRV, calories, body numbers) — and takes them out of the address again. The app sends the
 * last 14 days plus one older 30-day stretch each time, so about two years arrive over a few openings. Read only.
 *
 * Only believed on a phone with the Android app (`appOnPhone`: opened in it, or seen there before). Inside the app Chrome's
 * "came from the app" mark is lost once Aven reloads itself for an update, and then the watch's numbers were thrown away
 * and Connect watch seemed to do nothing (Omar, 18 Oct). Everything is checked and capped: at most 150 workouts and 140
 * days a time, sane numbers, about two years kept.
 *
 * Calories the watch counted are shown, never added to the food target (Omar: "I don't think it should count the calories
 * I burn so I can eat more").
 */
import type { ActivityKind, ActivityLog, HealthDay, StepDay } from './types';
import { dayKey } from './dates';
import { uid } from './nutrition';
import { appOnPhone } from './androidApp';
import { useStore } from '../state/store';
import { useUI } from '../state/ui';
import { tNow } from './i18n';
import { parseDetail, saveWatchDetail, type WatchDetail } from './watchDetail';
import { settleWrites } from './hcWrite';

export interface HcWorkout { id: string; t: string; n?: string; s: number; e: number; hr?: number; hx?: number; kc?: number; m?: number; src?: string }
export interface HcPayload {
  v: 1; avail: boolean; on: boolean; granted: boolean; at: number;
  /** why there are no numbers: unavailable (Android older than 14), denied, off, slow, failed */
  note?: string;
  days?: [string, number][];
  ex?: HcWorkout[];
  /** everything else per day (sleep, resting heart rate, HRV, body…) */
  hd?: HealthDay[];
  /** the detail: heart rate and steps a minute at a time, every sleep stage (lib/watchDetail.ts) */
  dt?: WatchDetail[];
  /** reading in the background is allowed (the app reads every half hour while Aven is closed) */
  bg?: boolean;
  /** how long the read took on the phone (ms) */
  ms?: number;
}

/** How it stands, for Settings (no numbers): kept on the phone. */
export interface HcStatus { avail: boolean; on: boolean; granted: boolean; at: number; note?: string; lastSync?: number; bg?: boolean }
const STATUS = 'aven.hc';
export function hcStatus(): HcStatus | null { try { const v = JSON.parse(localStorage.getItem(STATUS) || 'null'); return v && typeof v === 'object' ? v : null; } catch { return null; } }
function saveStatus(p: HcPayload, synced: boolean) {
  const prev = hcStatus();
  const s: HcStatus = { avail: p.avail, on: p.on, granted: p.granted, at: p.at, note: p.note, lastSync: synced ? p.at : prev?.lastSync, bg: synced ? !!p.bg : prev?.bg };
  try { localStorage.setItem(STATUS, JSON.stringify(s)); } catch { /* fine */ }
}

const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : undefined);

/** "hc=" and its numbers in the address; "z~" in front = squeezed (raw deflate) by the Android app. */
const HC = /(?:^#|&)hc=(z~)?([A-Za-z0-9_-]{8,400000})/;
const bytesOf = (b64url: string) => {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

/** "#hc=…" → the checked numbers, or null (a squeezed one needs `parseHcAsync`). */
export function parseHc(hash: string): HcPayload | null {
  const m = HC.exec(hash);
  if (!m || m[1]) return null;
  let raw: any;
  try { raw = JSON.parse(new TextDecoder().decode(bytesOf(m[2]))); } catch { return null; }
  return checkHc(raw);
}

/** The same, squeezed or not. */
export async function parseHcAsync(hash: string): Promise<HcPayload | null> {
  const m = HC.exec(hash);
  if (!m) return null;
  if (!m[1]) return parseHc(hash);
  try {
    const out = new Response(bytesOf(m[2])).body!.pipeThrough(new DecompressionStream('deflate-raw'));
    return checkHc(JSON.parse(await new Response(out).text()));
  } catch { return null; }
}

function checkHc(raw: any): HcPayload | null {
  if (!raw || raw.v !== 1) return null;
  const now = Date.now();
  const at = num(raw.at, now - 30 * 86400000, now + 86400000) ?? now;
  // (the last 14 days plus one older 30-day stretch of the history each time: about two years back)
  const OLD = now - 800 * 86400000;
  const days = (Array.isArray(raw.days) ? raw.days : []).slice(0, 140)
    .filter((d: any) => Array.isArray(d) && typeof d[0] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d[0]) && num(d[1], 1, 150000) !== undefined)
    .map((d: any) => [d[0], Math.round(d[1])] as [string, number]);
  const ex: HcWorkout[] = (Array.isArray(raw.ex) ? raw.ex : []).slice(0, 150).flatMap((w: any): HcWorkout[] => {
    const s = num(w?.s, OLD, now + 3600000), e = num(w?.e, OLD, now + 3600000);
    if (typeof w?.id !== 'string' || !w.id || w.id.length > 120 || s === undefined || e === undefined || e <= s || e - s > 12 * 3600000) return [];
    return [{
      id: w.id, t: typeof w.t === 'string' ? w.t.slice(0, 24) : 'other', n: typeof w.n === 'string' ? w.n.slice(0, 40) : undefined, s, e,
      hr: num(w.hr, 30, 230), hx: num(w.hx, 30, 240), kc: num(w.kc, 1, 5000), m: num(w.m, 1, 300000), src: typeof w.src === 'string' ? w.src.slice(0, 80) : undefined,
    }];
  });
  const r1 = (v: unknown, lo: number, hi: number) => { const x = num(v, lo, hi); return x === undefined ? undefined : Math.round(x * 10) / 10; };
  const ri = (v: unknown, lo: number, hi: number) => { const x = num(v, lo, hi); return x === undefined ? undefined : Math.round(x); };
  const hd: HealthDay[] = (Array.isArray(raw.hd) ? raw.hd : []).slice(0, 140).flatMap((d: any): HealthDay[] => {
    if (typeof d?.d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.d)) return [];
    const sb = num(d.sb, OLD, now + 86400000), se = num(d.se, OLD, now + 86400000);
    const day: HealthDay = {
      date: d.d, activeKcal: ri(d.ak, 1, 10000), totalKcal: ri(d.tk, 300, 15000), distanceM: ri(d.m, 1, 300000), floors: ri(d.fl, 1, 2000),
      restHr: ri(d.rh, 25, 150), hrv: ri(d.hv, 3, 300),
      sleepMin: ri(d.sl, 10, 1440), deepMin: ri(d.dp, 1, 1000), remMin: ri(d.rm, 1, 1000), lightMin: ri(d.lt, 1, 1440), awakeMin: ri(d.aw, 1, 1000),
      ...(sb !== undefined && se !== undefined && se > sb ? { sleepStart: sb, sleepEnd: se } : {}),
      weightKg: r1(d.w, 25, 400), bodyFat: r1(d.bf, 2, 70), vo2max: r1(d.vo, 10, 95), spo2: r1(d.o2, 70, 100), respRate: r1(d.rr, 4, 60),
    };
    for (const k of Object.keys(day) as (keyof HealthDay)[]) if (day[k] === undefined) delete day[k];
    return Object.keys(day).length > 1 ? [day] : [];
  });
  const dt = parseDetail(raw.dt, now);
  return { v: 1, avail: !!raw.avail, on: !!raw.on, granted: !!raw.granted, at, note: typeof raw.note === 'string' ? raw.note.slice(0, 20) : undefined, ...(Array.isArray(raw.days) ? { days } : {}), ...(Array.isArray(raw.ex) ? { ex } : {}), ...(hd.length ? { hd } : {}),
    ...(dt.length ? { dt } : {}), ...(typeof raw.bg === 'boolean' ? { bg: raw.bg } : {}), ...(num(raw.ms, 0, 600000) !== undefined ? { ms: Math.round(raw.ms) } : {}) };
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
export function mergeHc(p: HcPayload, cur: { activities: ActivityLog[]; steps: StepDay[]; health?: HealthDay[]; gone?: string[] }, dayStartHour: number, now = Date.now()): { activities: ActivityLog[]; steps: StepDay[]; health: HealthDay[]; added: number; fresh: number } {
  const acts = [...cur.activities];
  const gone = new Set(cur.gone ?? []);
  let added = 0, fresh = 0;
  const highest = Math.max(0, ...acts.map((a) => a.maxHr ?? 0), ...(p.ex ?? []).map((w) => w.hx ?? 0));
  for (const w of p.ex ?? []) {
    // (one they deleted stays deleted: the walk back through the history would bring it back every time)
    if (gone.has(w.id)) continue;
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
    if (now - w.e < 2 * 86400000) fresh++;
  }
  // (in date order: two years of history arrive oldest last, and "the last wrestling" and the Coach's recent list read it
  // from the end)
  if (added) acts.sort((a, b) => a.date.localeCompare(b.date) || (a.startAt ?? a.at) - (b.startAt ?? b.at));
  let steps = cur.steps;
  if (p.days?.length) {
    const by = new Map(cur.steps.map((d) => [d.date, d.count]));
    for (const [date, count] of p.days) by.set(date, count);
    steps = [...by].map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date)).slice(-760);
  }
  // the rest per day: the newest reading of a day goes over the stored one, field by field (a read that failed or timed
  // out on the phone sends a day without that field, and must not wipe it)
  let health = cur.health ?? [];
  if (p.hd?.length) {
    const by = new Map(health.map((d) => [d.date, d]));
    for (const d of p.hd) by.set(d.date, { ...by.get(d.date), ...d });
    health = [...by.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-760);
  }
  return { activities: acts, steps, health, added, fresh };
}

/**
 * The page was opened by the Android app with "#hc=…": keep the numbers, take them out of the address. Called when the app
 * starts and whenever the address changes (the app opening an Aven that is already running only changes the "#").
 */
export function applyHcFromAddress(): void {
  // the Android app's address arrives as "#hc%3D…": Android writes the "=" in its coded form (Uri.Builder.fragment),
  // and the page looked only for "hc=", so every answer was dropped (found on the CI emulator, 18 Oct)
  let hash = location.hash;
  try { hash = decodeURIComponent(hash); } catch { /* as it is */ }
  if (!/(?:^#|&)hc=/.test(hash)) return;
  // how writing the weigh-ins and food handed along went (lib/hcWrite.ts)
  const hw = /(?:^#|&)hw=([a-z0-9]{1,12})/.exec(hash);
  if (hw) settleWrites(hw[1]);
  // (out of the address either way: a reload or a shared link must not carry it)
  try { history.replaceState(history.state, '', location.pathname + location.search); } catch { /* fine */ }
  // a squeezed answer (the usual one now) is unpacked first: a moment later
  if (HC.exec(hash)?.[1]) void parseHcAsync(hash).then((p) => keepHc(p, hash.length));
  else keepHc(parseHc(hash), hash.length);
}

function keepHc(p: HcPayload | null, len: number): void {
  // what the Android app sent back last, as plain facts (the Watch screen shows them: one screenshot says where it stops)
  try { localStorage.setItem(LAST, JSON.stringify({ at: Date.now(), len, ok: !!p, inApp: appOnPhone(), ...(p ? { avail: p.avail, on: p.on, granted: p.granted, note: p.note, days: p.days?.length, ex: p.ex?.length, hd: p.hd?.length, dt: p.dt?.length, bg: p.bg, ms: p.ms } : {}) })); } catch { /* fine */ }
  // Connect watch / Sync now was tapped here a moment ago: this is its answer (the app reopens Aven at its start, so the
  // Watch screen is opened again, with what came of it said once)
  const ask = takeAsk();
  if (!p || (!ask && !appOnPhone())) return;
  const synced = !!(p.days || p.ex);
  saveStatus(p, synced);
  if (ask) {
    const ui = useUI.getState();
    setTimeout(() => {
      ui.push('settings', { section: 'watch' });
      // (a problem is said on the Watch screen itself, in words that say what to do)
      if (ask !== 'off' && p.on && p.granted) ui.toast(tNow('Watch connected'), { tone: 'ok' });
    }, 700);
  }
  if (synced) {
    const st = useStore.getState();
    const r = mergeHc(p, { activities: st.activities, steps: st.steps ?? [], health: st.health ?? [], gone: st.hcGone }, st.settings.dayStartHour);
    if (JSON.stringify(r.activities) !== JSON.stringify(st.activities) || JSON.stringify(r.steps) !== JSON.stringify(st.steps ?? []) || JSON.stringify(r.health) !== JSON.stringify(st.health ?? [])) st.mergeHealth(r);
    // a new workout from the watch is said once, quietly (not the old ones the walk through the history finds)
    // the minute-by-minute detail goes to its own place on the phone (lib/watchDetail.ts)
    if (p.dt?.length) void saveWatchDetail(p.dt);
    if (r.fresh) useUI.getState().toast(r.fresh === 1 ? tNow('1 workout from your watch') : tNow('{n} workouts from your watch', { n: r.fresh }), { tone: 'ok' });
  }
  window.dispatchEvent(new Event('aven-hc'));
}

const ASK = 'aven.hc.ask', LAST = 'aven.hc.last';
/** The last answer from the Android app, in one short line (or what's missing). */
export function hcLastLine(): string {
  try {
    const l = JSON.parse(localStorage.getItem(LAST) || 'null');
    const a = JSON.parse(localStorage.getItem(ASK) || 'null');
    const hm = (x: number) => new Date(x).toTimeString().slice(0, 5);
    const ask = a ? `tapped ${a.what} ${hm(a.at)}, no answer yet` : '';
    if (!l) return ask || 'no answer from the app yet';
    const got = l.ok ? [l.avail ? 'HC yes' : 'HC no', l.granted ? 'allowed' : 'not allowed', l.on ? 'on' : 'off', l.note, l.days !== undefined ? `${l.days} days` : '', l.ex !== undefined ? `${l.ex} workouts` : '', l.dt ? `${l.dt} detail days` : '', l.ms !== undefined ? `read ${(l.ms / 1000).toFixed(1)} s` : '', l.bg === true ? 'background on' : l.bg === false ? 'background off' : ''].filter(Boolean).join(' · ') : `unreadable (${l.len} chars)`;
    return `answer ${hm(l.at)}: ${got}${l.inApp ? '' : ' · app not seen'}${ask ? ` · ${ask}` : ''}`;
  } catch { return ''; }
}
/** Remember that Connect watch / Sync now / Disconnect was just tapped (the answer comes back in a fresh page). */
export function noteAsk(what: 'connect' | 'sync' | 'off') { try { localStorage.setItem(ASK, JSON.stringify({ what, at: Date.now() })); } catch { /* fine */ } }
function takeAsk(): 'connect' | 'sync' | 'off' | null {
  try {
    const v = JSON.parse(localStorage.getItem(ASK) || 'null');
    localStorage.removeItem(ASK);
    return v && Date.now() - v.at < 3 * 60_000 ? v.what : null;
  } catch { return null; }
}

/** "Connect watch" and friends: the Android app's link (it opens Aven again at this page). Without the app the phone
 *  offers the app's download instead. */
export function hcLink(what: 'connect' | 'sync' | 'off', writes?: string | null): string {
  const ret = encodeURIComponent(location.origin + location.pathname) + (writes ? `&w=${writes}` : '');
  const fallback = encodeURIComponent('https://github.com/omaralawi1000-netizen/The-new-Claude-gym-app/releases/download/android-latest/aven.apk');
  return `intent://health/${what}?return=${ret}#Intent;scheme=aven;package=app.aven.android;S.browser_fallback_url=${fallback};end`;
}
