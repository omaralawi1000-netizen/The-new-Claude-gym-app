import { useEffect } from 'react';
import { HAPTICS, useUI } from '../../state/ui';
import { useStore, exerciseMap } from '../../state/store';
import { tNow } from '../../lib/i18n';
import { fmtTime } from '../../lib/dates';
import type { SessionExercise, SetRecord, WorkoutSession } from '../../lib/types';
import { exName } from './common';

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
export function unlockRestAudio() {
  try {
    ctx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  } catch { /* no audio */ }
}

/** Three soft rising tones, under half a second (short, so music in your earbuds only dips for a moment). */
function tones() {
  try {
    unlockRestAudio();
    const ac = ctx; if (!ac) return;
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
// Leave Aven mid-rest (another app, or the screen off) and the rest moves to a notification: "Rest over at 14:32" on the lock
// screen, which turns into a buzzing "Rest over" alert when the time comes. The service worker (public/rest-sw.js) keeps the
// time because a hidden page is slowed down; this page keeps a back-up timer. Back in the app, both notifications go away.
const TAG = 'aven-rest';
const LATE_KEY = 'aven.restLate';
const notifyOn = () => typeof Notification !== 'undefined' && Notification.permission === 'granted' && useStore.getState().settings.restNotify !== false;
const toSW = (msg: unknown) => { navigator.serviceWorker?.ready.then((reg) => reg.active?.postMessage(msg)).catch(() => {}); };

/** What the notification needs for the rest that's running now, or null when there's nothing to show (`ended`: also once it's over). */
function restPayload(ended = false) {
  const st = useStore.getState();
  const a = st.active;
  if (!a?.rest || a.pausedAt || (!ended && a.rest.endsAt <= Date.now())) return null;
  const next = nextSetText(a);
  const lang = st.settings.language;
  return {
    key: `${a.id}:${a.rest.endsAt}`, endsAt: a.rest.endsAt,
    title: tNow('Rest over at {time}', { time: fmtTime(a.rest.endsAt, lang) }), body: next ? tNow('Next: {what}', { what: next }) : '',
    overTitle: tNow('Rest over'), overBody: next, icon: `${import.meta.env.BASE_URL}icon-192.png`,
  };
}

/** How late the last alert came (shown in Settings → Training, so the phone itself tells us if it's reliable). */
function rememberLate(d: { due?: number; firedAt?: number; by?: string } | null | undefined) {
  if (!d?.due || !d.firedAt) return;
  try { localStorage.setItem(LATE_KEY, JSON.stringify({ ms: Math.max(0, d.firedAt - d.due), by: d.by, at: d.firedAt })); } catch { /* ignore */ }
}
export function lastRestLate(): { ms: number; by?: string; at: number } | null {
  try { const x = localStorage.getItem(LATE_KEY); return x ? JSON.parse(x) : null; } catch { return null; }
}

/** Back in the app: the notifications have done their job (note how late the alert was first). */
function clearNotice() {
  toSW({ type: 'aven-rest', rest: null });
  navigator.serviceWorker?.ready.then((reg) => reg.getNotifications({ tag: TAG })).then((ns) => ns.forEach((n) => { if ((n.data as any)?.kind === 'over') rememberLate(n.data); n.close(); })).catch(() => {});
}

/**
 * Asked once, the first time a rest starts: may Aven show the rest on the lock screen and buzz when it ends? A quiet toast
 * with an Allow button, never a prompt out of nowhere.
 */
export function offerRestAlerts(toast: (text: string, o: { actionLabel: string; onAction: () => void; duration: number }) => void) {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'default') return;
    if (localStorage.getItem('aven.restAsk2')) return;
    localStorage.setItem('aven.restAsk2', '1');
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
 * minimised): three ticks on the last three seconds, then the tones and a firm buzz, and — if Aven isn't on screen — a
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
      if (document.hidden) { const r = restPayload(true); if (r && notifyOn()) toSW({ type: 'aven-rest-over', rest: r }); }
      else { if (st.settings.sound) tones(); vibrate([...HAPTICS.restOver]); }
    }, left));
    return () => timers.forEach(clearTimeout);
  }, [endsAt, total, paused]);
  // leaving the app mid-rest hands the rest to the notification; coming back takes it away again
  useEffect(() => {
    if (!document.hidden) clearNotice(); // opened again from the home screen: a notification left over has done its job
    const on = () => {
      if (!document.hidden) { clearNotice(); return; }
      const r = restPayload();
      if (r && notifyOn()) toSW({ type: 'aven-rest', rest: r });
    };
    document.addEventListener('visibilitychange', on);
    // tapping a notification: open the workout
    const msg = (e: MessageEvent) => {
      if (e.data?.type !== 'aven-open-workout') return;
      rememberLate(e.data.late);
      openWorkout();
    };
    navigator.serviceWorker?.addEventListener('message', msg);
    return () => { document.removeEventListener('visibilitychange', on); navigator.serviceWorker?.removeEventListener('message', msg); };
  }, []);
  // the workout ended (or a rest was skipped) while a notification was up: take it away
  const hasActive = useStore((s) => !!s.active);
  useEffect(() => { if (!hasActive || endsAt === null) clearNotice(); }, [hasActive, endsAt]);
}
