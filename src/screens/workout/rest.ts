import { useEffect } from 'react';
import { resumeWorkout } from '../../ui/workoutOpen';
import { HAPTICS, useUI } from '../../state/ui';
import { useStore, exerciseMap } from '../../state/store';
import { tNow } from '../../lib/i18n';
import { fmtTime } from '../../lib/dates';
import type { SessionExercise, SetRecord, WorkoutSession } from '../../lib/types';
import { exName, fmtSet, isStrength } from './common';
import { adjustRest, patchSet, skipRest } from './actions';
import { completeSet } from './complete';
import { fmtNum, kgToDisplay } from '../../lib/units';
import { androidRest, clearAppRest, inAndroidApp, noteAndroidApp, overAppRest, showAppRest } from '../../lib/androidApp';

export { currentSetOf, focusPageNow, setFocusPage, subscribeFocusPage } from '../../lib/currentSet';
import { currentSetOf } from '../../lib/currentSet';

/** The set to do next (for the highlight and the bar): `currentSetOf`, warm-ups included. */
export function nextSetOf(a: WorkoutSession | null | undefined): { se: SessionExercise; set: SetRecord; label: string } | null {
  return currentSetOf(a, 'include', false);
}

/** "Bench Press · set 3", for the alert and the bar. */
export function nextSetText(a: WorkoutSession | null | undefined): string {
  const st = useStore.getState();
  const nx = nextSetOf(a);
  if (!nx) return '';
  const ex = exerciseMap(st.exercises).get(nx.se.exerciseId);
  const name = ex ? exName(ex, st.settings.language) : '';
  return `${name} · ${nx.label === 'W' ? tNow('Warm-up') : `${tNow('Set').toLowerCase()} ${nx.label}`}`;
}

// ── sound ───────────────────────────────────────────────────
// One shared audio output, woken by a tap (ticking a set): phones only allow sound that a touch started, and a new
// AudioContext made when the timer ran out — the old way — was often silent.
let ctx: AudioContext | null = null;
/** Made ahead, when the phone is idle (making one is slow, and it used to be made by the first tick, right on the tap):
 *  it waits silent until a tap wakes it. */
export function prepareRestAudio() {
  if (ctx) return;
  const make = () => { try { ctx ??= new (window.AudioContext || (window as any).webkitAudioContext)(); loadChime(); } catch { /* no audio */ } };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(make, { timeout: 4000 }); else setTimeout(make, 1500);
}
export function unlockRestAudio() {
  try {
    ctx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    loadChime();
  } catch { /* no audio */ }
}

// The rest-over sound: three short clicks, two deep and a bright one (public/sounds/rest-over.mp3, the same file the Android
// app rings with; see CREDITS.md). Decoded once, ahead; until it's there the old soft tones stand in.
let chimeBuf: AudioBuffer | null = null;
let chimeLoading = false;
function loadChime() {
  if (chimeBuf || chimeLoading || !ctx) return;
  chimeLoading = true;
  const ac = ctx;
  fetch(`${import.meta.env.BASE_URL}sounds/rest-over.mp3`).then((r) => r.arrayBuffer()).then((b) => ac.decodeAudioData(b))
    .then((buf) => { chimeBuf = buf; }).catch(() => { chimeLoading = false; });
}

/** The rest-over sound, about half a second (short, so music in your earbuds only dips for a moment). */
function chime() {
  try {
    unlockRestAudio();
    const ac = ctx; if (!ac) return;
    if (chimeBuf) { const src = ac.createBufferSource(); src.buffer = chimeBuf; src.connect(ac.destination); src.start(ac.currentTime + 0.02); return; }
    // not decoded yet: three soft rising tones
    const t0 = ac.currentTime + 0.02;
    [660, 880, 1175].forEach((f, i) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine'; o.frequency.value = f;
      const s = t0 + i * 0.15;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.22, s + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.14);
      o.connect(g); g.connect(ac.destination);
      o.start(s); o.stop(s + 0.16);
    });
  } catch { /* ignore */ }
}

const vibrate = (p: number | number[]) => { try { if (useStore.getState().settings.haptics && 'vibrate' in navigator) navigator.vibrate(p); } catch { /* ignore */ } };

// ── the rest timer outside the app ──────────────────────────
// Leave Aven mid-rest (another app, or the screen off) and the rest moves to a notification: "Back at 14:32" with the set
// that's next ("Preacher Curl · set 2 of 3 · 25 kg × 10") and two buttons, +30 s and Skip rest. When the time comes a
// separate alert rings ("Time for set 2"). The service worker (public/rest-sw.js) keeps the time because a hidden page is
// slowed down; this page keeps a back-up timer. Back in the app, both notifications go away.
// With the Android app on the phone, the rest goes to it instead (src/lib/androidApp.ts): a live countdown that ticks.
const LATE_KEY = 'aven.restLate';
const notifyOn = () => typeof Notification !== 'undefined' && Notification.permission === 'granted' && useStore.getState().settings.restNotify !== false;
const toSW = (msg: unknown) => { navigator.serviceWorker?.ready.then((reg) => reg.active?.postMessage(msg)).catch(() => {}); };
const isRestNote = (n: Notification) => n.tag === 'aven-rest' || n.tag === 'aven-rest-over';

/** The set that's next, in words for a notification: name, "set 2 of 3" and "25 kg × 10" (what's planned or last typed). */
function nextSetWords(a: WorkoutSession) {
  const st = useStore.getState();
  const nx = nextSetOf(a);
  if (!nx) return null;
  const lang = st.settings.language, unit = st.settings.units.weight;
  const ex = exerciseMap(st.exercises).get(nx.se.exerciseId);
  const name = ex ? exName(ex, lang) : '';
  const of = nx.se.sets.filter((x) => x.type === 'working').length;
  const which = nx.label === 'W' ? tNow('Warm-up').toLowerCase() : tNow('set {n} of {total}', { n: nx.label, total: of });
  let target = '';
  if (isStrength(ex)) {
    const kg = nx.set.weightKg ?? nx.set.target?.weightKg;
    const reps = nx.set.reps ?? nx.set.target?.repMax;
    target = [kg ? `${fmtNum(kgToDisplay(kg, unit), lang, 2)} ${unit}` : '', reps ? `× ${reps}` : ''].filter(Boolean).join(' ');
  } else target = fmtSet(nx.set, ex, st.settings.units, lang, tNow);
  return { name, which, target, label: nx.label };
}

/** "2:45" */
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`;

/**
 * The rest-over alert for the set that's next, as the Android app shows it on the watch: its words, what Done ✓ says, and
 * the rest that follows it (as a tap would start: none after a warm-up, inside a superset or after the last set).
 */
function stepOf(a: WorkoutSession) {
  const st = useStore.getState();
  const nx = nextSetOf(a);
  const w = nextSetWords(a);
  if (!nx || !w) return null;
  const all = a.exercises;
  const idx = all.findIndex((e) => e.id === nx.se.id);
  const lastOne = !all.some((e) => e.sets.some((x) => !x.done && x.id !== nx.set.id));
  const linked = !!nx.se.supersetGroup && all.slice(idx + 1).some((e) => e.supersetGroup === nx.se.supersetGroup && e.sets.some((x) => !x.done));
  const n = nx.set.type !== 'working' || lastOne || linked ? 0 : (nx.se.restSec ?? st.settings.restDefaultSec);
  return {
    x: w.name,
    l: [w.which.charAt(0).toUpperCase() + w.which.slice(1), w.target].filter(Boolean).join(' · '),
    o: w.label === 'W' ? tNow('Time for your warm-up') : tNow('Time for set {n}', { n: w.label }),
    b: [w.name, w.target].filter(Boolean).join(' · '),
    d: `${tNow('Done')} ✓${w.target ? ` ${w.target}` : ''}`,
    y: `${(w.label === 'W' ? tNow('Warm-up') : tNow('Set {n}', { n: w.label }))} ✓${w.target ? ` · ${w.target}` : ''}`,
    // what the watch says once it's ticked: the rest that starts, or that the workout is done
    z: n ? tNow('Rest {time}', { time: mmss(n) }) : lastOne ? tNow('Last set done · open Aven to finish') : '',
    n,
  };
}

/** The sets after the next one, a few ahead, each as the watch will need it (ticked one by one with Done ✓ while Aven is
 *  asleep, the Android app carries on with these). */
function stepsAfter(a: WorkoutSession, max = 6) {
  const sim: WorkoutSession = JSON.parse(JSON.stringify(a));
  const out: NonNullable<ReturnType<typeof stepOf>>[] = [];
  for (let i = 0; i <= max; i++) {
    const nx = nextSetOf(sim);
    if (!nx) break;
    if (i > 0) { const s = stepOf(sim); if (!s) break; out.push(s); }
    nx.set.done = true;
  }
  return out;
}

/** What the notifications need for the rest that's running now, or null when there's nothing to show (`ended`: also once it's over). */
function restPayload(ended = false) {
  const st = useStore.getState();
  const a = st.active;
  if (!a?.rest || a.pausedAt || (!ended && a.rest.endsAt <= Date.now())) return null;
  const w = nextSetWords(a);
  const lang = st.settings.language;
  const titleTpl = tNow('Back at {time}');
  const startedAt = a.rest.endsAt - a.rest.total * 1000; // stays put when +30 s moves the end
  return {
    key: `${a.id}:${a.rest.endsAt}`, id: a.id, endsAt: a.rest.endsAt, locale: lang === 'da' ? 'da-DK' : 'en-GB', titleTpl,
    // for the Android app's countdown: the exercise, and "Set 2 of 3 · 60 kg × 8" (warm-ups: "Warm-up · 40 kg × 10")
    appKey: `${a.id}:${startedAt}`, startedAt, exercise: w?.name ?? '',
    line: w ? [w.which.charAt(0).toUpperCase() + w.which.slice(1), w.target].filter(Boolean).join(' · ') : '',
    title: titleTpl.split('{time}').join(fmtTime(a.rest.endsAt, lang)),
    body: w ? [w.name, w.which, w.target].filter(Boolean).join(' · ') : '',
    overTitle: !w ? tNow('Rest over') : w.label === 'W' ? tNow('Time for your warm-up') : tNow('Time for set {n}', { n: w.label }),
    overBody: w ? [w.name, w.target].filter(Boolean).join(' · ') : '',
    // icon: Aven's orb in a circle (left out, Chrome draws a grey letter bubble); badge: the white mark in the status bar
    icon: `${import.meta.env.BASE_URL}notif-icon.png`, badge: `${import.meta.env.BASE_URL}badge-96.png`,
    more: tNow('+30 s'), skip: tNow('Skip rest'), skipShort: tNow('Skip'),
    sound: st.settings.sound,
    // the alert's Done ✓: the set that's next, as planned (one tap on the watch logs it; see applyDone), the rest it starts,
    // and the sets after it (so the Android app can carry on from the wrist while this page is asleep)
    ...(() => { const s = stepOf(a); return s ? { done: s.d, doneNote: s.y, doneSay: s.z, next: s.n, queue: stepsAfter(a) } : { done: '', doneNote: '', doneSay: '', next: 0, queue: [] }; })(),
  };
}
type Payload = NonNullable<ReturnType<typeof restPayload>>;
const appRest = (r: Payload) => ({ ...r, key: r.appKey, skip: r.skipShort });

let viaApp = false; // the rest went to the Android app (its countdown rings by itself)
/** Leaving Aven mid-rest: to the Android app if it's there, otherwise the website's own notification. */
function handOff(r: Payload) {
  showAppRest(appRest(r)).then((ok) => {
    viaApp = ok;
    if (!ok) toSW({ type: 'aven-rest', rest: r });
    else if (onScreen()) clearAppRest(); // already back while it was on its way
  });
}

/** How late the last alert came (shown in Settings → Training, so the phone itself tells us if it's reliable). */
function rememberLate(d: { due?: number; firedAt?: number; by?: string } | null | undefined) {
  if (!d?.due || !d.firedAt) return;
  try { localStorage.setItem(LATE_KEY, JSON.stringify({ ms: Math.max(0, d.firedAt - d.due), by: d.by, at: d.firedAt })); } catch { /* ignore */ }
}
export function lastRestLate(): { ms: number; by?: string; at: number } | null {
  try { const x = localStorage.getItem(LATE_KEY); return x ? JSON.parse(x) : null; } catch { return null; }
}

// Really on screen: visible AND focused. Switching the phone to dark mode while Aven is in the background makes Chrome call
// the page "visible" (without focus, and it stays that way until you come back), so "visible" alone is not enough.
const onScreen = () => !document.hidden && document.hasFocus();
let waitingForFocus: (() => void) | null = null;
/** Back in the app: take the notifications away, but only once the page has the focus (see onScreen). */
function backInApp() {
  if (onScreen()) { clearNotice(); return; }
  if (waitingForFocus) return;
  waitingForFocus = () => { window.removeEventListener('focus', waitingForFocus!); waitingForFocus = null; if (!document.hidden) clearNotice(); };
  window.addEventListener('focus', waitingForFocus);
}

/** Back in the app: the notifications have done their job (note how late the alert was first). */
function clearNotice() {
  clearAppRest();
  toSW({ type: 'aven-rest', rest: null });
  navigator.serviceWorker?.ready.then((reg) => reg.getNotifications()).then((ns) => ns.filter(isRestNote).forEach((n) => { if ((n.data as any)?.kind === 'over') rememberLate(n.data); n.close(); })).catch(() => {});
}

/**
 * Asked once, the first time a rest starts: may Aven show the rest on the lock screen and buzz when it ends? A quiet toast
 * with an Allow button, never a prompt out of nowhere.
 */
export function offerRestAlerts(toast: (text: string, o: { actionLabel: string; onAction: () => void; duration: number }) => void) {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'default') return;
    // asked once on the website; once more inside the Android app, which has its own say in it (Android asks for the app)
    const asked = inAndroidApp() ? 'aven.restAskApp' : 'aven.restAsk2';
    if (localStorage.getItem(asked)) return;
    localStorage.setItem(asked, '1');
    toast(tNow('See your rest on the lock screen and get a buzz when it’s over, even in another app?'), { actionLabel: tNow('Allow'), onAction: () => { Notification.requestPermission().catch(() => {}); }, duration: 9000 });
  } catch { /* ignore */ }
}

/**
 * Done ✓ from the rest-over alert: the set that's next (the one the alert named) is ticked as planned, exactly as a tap
 * ticks it (records, the next rest), and if Aven is out of sight the next rest goes to the lock screen and watch at once.
 * `at` is when it was tapped: a page that was asleep behind the lock screen hears of it later, and the set and the next
 * rest still count from the tap. Each rest's Done counts once (the message, the cache, a page that was asleep).
 */
let doneFor = '';
export function applyDone(at = Date.now(), via = 'message'): boolean {
  const a = useStore.getState().active;
  if (!a?.rest) return noteDone(at, via, 'no rest running');
  const once = `${a.id}:${a.rest.endsAt}`;
  if (doneFor === once) return false; // (the other copy of a tap already applied: nothing to note)
  const nx = nextSetOf(a);
  if (!nx) return noteDone(at, via, 'no set left');
  doneFor = once;
  const ok = !!completeSet(nx.se.id, nx.set.id);
  if (!ok) return noteDone(at, via, 'the set has no reps to log');
  noteDone(at, via, '');
  const late = Date.now() - at;
  if (late > 2000) {
    // heard late: the set was done at the tap, and the next rest started then (it may be over already: "Go")
    patchSet(nx.se.id, nx.set.id, { completedAt: at });
    useStore.getState().mutateActive((x) => (x.rest ? { ...x, rest: { ...x.rest, endsAt: x.rest.endsAt - late } } : x));
  }
  if (!onScreen()) { const r = restPayload(); if (r && notifyOn()) handOff(r); }
  return true;
}

/** The last Done ✓ that reached the page and what came of it (Settings › Training shows it: one screenshot says where a
 *  tap stopped). Returns false, for applyDone's "nothing ticked". */
const DONE_LOG = 'aven.doneLog';
// the keys the workers keep a Done ✓ under (public/rest-sw.js, android/site/…-rest/sw.js): whole paths, the same everywhere
const PENDING_TAP = '/aven-pending/tap-', PENDING_LOG = '/aven-pending/log';
function noteDone(at: number, via: string, why: string): false {
  try { localStorage.setItem(DONE_LOG, JSON.stringify({ at, heard: Date.now(), via, why })); } catch { /* ignore */ }
  return false;
}
export async function lastDone(): Promise<{ tap?: { at: number; sw: string; wins: number }; page?: { at: number; heard: number; via: string; why: string } }> {
  let tap, page;
  try { page = JSON.parse(localStorage.getItem(DONE_LOG) ?? 'null') ?? undefined; } catch { /* ignore */ }
  try { const r = typeof caches !== 'undefined' ? await (await caches.open('aven-pending')).match(PENDING_LOG) : undefined; tap = r ? await r.json() : undefined; } catch { /* ignore */ }
  return { tap, page };
}

/** Is this the rest a Done ✓ was tapped for (the website's key, or the Android app's)? */
const isThisRest = (key: unknown) => {
  const a = useStore.getState().active;
  return !!a?.rest && (key === `${a.id}:${a.rest.endsAt}` || key === `${a.id}:${a.rest.endsAt - a.rest.total * 1000}`);
};

/** The workout a tap was for (its key is "<workout id>:<when that rest started or ends>"). */
const workoutOf = (key: unknown) => (typeof key === 'string' ? key.split(':')[0] : '');
const tapSeen = new Set<number>();

/**
 * Every Done ✓ tap is kept in the workers' cache, one entry each (a whole workout can be done from the wrist while this
 * page sleeps). Applied oldest first when Aven opens or wakes, each ticking the set that was next at that moment, from the
 * time it was tapped. A tap for another workout (the real app and Aven Beta share this cache) is left for its own app.
 */
let pendingRun: Promise<void> | null = null;
export function applyPendingDone(): Promise<void> {
  pendingRun ??= (async () => {
    try {
      if (typeof caches === 'undefined') return;
      const c = await caches.open('aven-pending');
      const taps: { req: Request; key?: string; at: number }[] = [];
      for (const req of await c.keys()) {
        if (!new URL(req.url).pathname.startsWith(PENDING_TAP)) continue;
        try { const p = await (await c.match(req))!.json(); taps.push({ req, key: p.key, at: Number(p.at) || 0 }); } catch { await c.delete(req); }
      }
      taps.sort((x, y) => x.at - y.at);
      for (const tp of taps) {
        const a = useStore.getState().active;
        const old = Date.now() - tp.at;
        if (old > 6 * 3600_000) { await c.delete(tp.req); continue; }
        if (!a || workoutOf(tp.key) !== a.id) { if (old > 30 * 60_000) await c.delete(tp.req); continue; }
        await c.delete(tp.req);
        tapSeen.add(tp.at);
        if (a.rest && a.rest.endsAt - a.rest.total * 1000 <= tp.at + 2000) applyDone(tp.at, 'cache');
        else noteDone(tp.at, 'cache', a.rest ? 'a different rest' : 'no rest running');
      }
    } catch { /* no cache storage: nothing waits */ }
  })().finally(() => { pendingRun = null; });
  return pendingRun;
}

/** Bring the live workout to the front (from a notification tap or the ?do=workout link). */
export function openWorkout() {
  if (!useStore.getState().active) return;
  const ui = useUI.getState();
  if (ui.overlays.some((o) => o.type === 'workout')) ui.popTo('workout');
  else resumeWorkout(() => ui.push('workout', { origin: 'none' }));
}

let cued = ''; // the rest that has been cued: a remount or a reload never cues it twice

/**
 * The end of a rest, wherever you are in the app (it used to live inside the workout screen, so nothing happened while it was
 * minimised): three ticks on the last three seconds, then the rest-over sound and a firm buzz, and — if Aven isn't on screen — a
 * notification saying what's next. Mounted once, in App.
 */
export function useRestCue() {
  const endsAt = useStore((s) => s.active?.rest?.endsAt ?? null);
  const total = useStore((s) => s.active?.rest?.total ?? null);
  const paused = useStore((s) => !!s.active?.pausedAt);
  useEffect(() => {
    if (endsAt === null || paused) return;
    const key = `${endsAt}:${total}`;
    const left = endsAt - Date.now();
    if (left <= 0 || cued === key) return; // already over when this ran (a reload): no late alarm
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const s of [3, 2, 1]) if (left - s * 1000 > 0) timers.push(setTimeout(() => { if (!document.hidden) vibrate(HAPTICS.countdown as number); }, left - s * 1000));
    timers.push(setTimeout(() => {
      if (cued === key) return;
      cued = key;
      const st = useStore.getState();
      if (!onScreen()) {
        const r = restPayload(true);
        if (r && notifyOn()) {
          if (viaApp) overAppRest(appRest(r)); // the app rings on time itself: this only covers it if it didn't
          else { toSW({ type: 'aven-rest-over', rest: r }); if (st.settings.sound) chime(); }
        }
      }
      else { if (st.settings.sound) chime(); vibrate([...HAPTICS.restOver]); }
    }, left));
    return () => timers.forEach(clearTimeout);
  }, [endsAt, total, paused]);
  // leaving the app mid-rest hands the rest to the notification; coming back takes it away again
  useEffect(() => {
    noteAndroidApp();
    androidRest(); // ready before you ever leave mid-rest
    void applyPendingDone(); // a Done ✓ tapped on the watch while Aven was closed
    if (!document.hidden) backInApp(); // opened again from the home screen: a notification left over has done its job
    const on = () => {
      if (!document.hidden) { void applyPendingDone(); backInApp(); return; }
      const r = restPayload();
      if (r && notifyOn()) handOff(r);
    };
    document.addEventListener('visibilitychange', on);
    // tapping a notification: open the workout
    const msg = (e: MessageEvent) => {
      if (e.data?.type === 'aven-rest-action') {
        // Done ✓ on the rest-over alert (phone, lock screen, watch): the workers decide it at the tap, keep it, and say
        // 'done' (an older app worker says 'skip': once the rest is over a Skip can mean nothing else, judged by the tap's
        // time). The kept copy is the one applied; the message is the fallback for a worker that didn't keep it.
        const a = useStore.getState().active;
        const at = typeof e.data.at === 'number' ? e.data.at : Date.now();
        if (e.data.action === 'done' || (e.data.action === 'skip' && a?.rest && a.rest.endsAt < at - 1500 && isThisRest(e.data.key))) {
          void (async () => {
            await pendingRun; await applyPendingDone();
            const b = useStore.getState().active;
            if (!tapSeen.has(at) && b?.rest && workoutOf(e.data.key) === b.id) applyDone(at, 'message');
          })();
          return;
        }
        // +30 s or Skip rest from the notification: the service worker has already updated it; this keeps the app in step
        if (!a?.rest || !isThisRest(e.data.key)) return;
        if (e.data.action === 'more') adjustRest(30); else skipRest();
        if (!onScreen()) { const r = restPayload(); if (r && notifyOn()) handOff(r); }
        return;
      }
      if (e.data?.type !== 'aven-open-workout') return;
      rememberLate(e.data.late);
      openWorkout();
    };
    navigator.serviceWorker?.addEventListener('message', msg);
    return () => {
      document.removeEventListener('visibilitychange', on); navigator.serviceWorker?.removeEventListener('message', msg);
      if (waitingForFocus) { window.removeEventListener('focus', waitingForFocus); waitingForFocus = null; }
    };
  }, []);
  // the workout ended (or a rest was skipped) while a notification was up: take it away
  const hasActive = useStore((s) => !!s.active);
  useEffect(() => { if (!hasActive || endsAt === null) clearNotice(); }, [hasActive, endsAt]);
}
