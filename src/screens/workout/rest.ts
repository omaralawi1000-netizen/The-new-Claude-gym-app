import { useEffect } from 'react';
import { HAPTICS, useUI } from '../../state/ui';
import { useStore, exerciseMap } from '../../state/store';
import { tNow } from '../../lib/i18n';
import { fmtTime } from '../../lib/dates';
import type { SessionExercise, SetRecord, WorkoutSession } from '../../lib/types';
import { exName, fmtSet, isStrength } from './common';
import { adjustRest, skipRest } from './actions';
import { fmtNum, kgToDisplay } from '../../lib/units';
import { androidRest, clearAppRest, inAndroidApp, noteAndroidApp, overAppRest, showAppRest } from '../../lib/androidApp';

/** The set to do next: the first one not yet ticked, in the order of the list (with its label: "W" or the working-set number). */
export function nextSetOf(a: WorkoutSession | null | undefined): { se: SessionExercise; set: SetRecord; label: string } | null {
  if (!a) return null;
  for (const se of a.exercises) {
    let n = 0;
    for (const set of se.sets) {
      if (set.type === 'working') n++;
      if (!set.done) return { se, set, label: set.type === 'warmup' ? 'W' : String(n) };
    }
  }
  return null;
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

/** Bring the live workout to the front (from a notification tap or the ?do=workout link). */
export function openWorkout() {
  if (!useStore.getState().active) return;
  const ui = useUI.getState();
  if (ui.overlays.some((o) => o.type === 'workout')) ui.popTo('workout');
  else ui.push('workout', { origin: 'none' });
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
    if (!document.hidden) backInApp(); // opened again from the home screen: a notification left over has done its job
    const on = () => {
      if (!document.hidden) { backInApp(); return; }
      const r = restPayload();
      if (r && notifyOn()) handOff(r);
    };
    document.addEventListener('visibilitychange', on);
    // tapping a notification: open the workout
    const msg = (e: MessageEvent) => {
      if (e.data?.type === 'aven-rest-action') {
        // +30 s or Skip rest from the notification: the service worker has already updated it; this keeps the app in step
        const a = useStore.getState().active;
        if (!a?.rest) return;
        const keys = [`${a.id}:${a.rest.endsAt}`, `${a.id}:${a.rest.endsAt - a.rest.total * 1000}`]; // website's / app's
        if (!keys.includes(e.data.key)) return;
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
