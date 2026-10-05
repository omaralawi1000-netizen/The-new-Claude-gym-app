import { useEffect } from 'react';
import { useStore, exerciseMap } from '../../state/store';
import { tNow } from '../../lib/i18n';
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

// ── the alert when the app isn't on screen ──────────────────
const TAG = 'aven-rest';
async function notify(body: string) {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    if (useStore.getState().settings.restNotify === false) return;
    const reg = await navigator.serviceWorker?.ready;
    const opts: NotificationOptions & { renotify?: boolean; vibrate?: number[] } = { body, tag: TAG, renotify: true, vibrate: [180, 90, 180, 90, 320], icon: `${import.meta.env.BASE_URL}icon-192.png` };
    if (reg) await reg.showNotification(tNow('Rest over'), opts);
    else new Notification(tNow('Rest over'), opts);
  } catch { /* ignore */ }
}
/** Back in the app: the alert has done its job. */
function clearNotice() {
  navigator.serviceWorker?.ready.then((reg) => reg.getNotifications({ tag: TAG })).then((ns) => ns.forEach((n) => n.close())).catch(() => {});
}

/**
 * Asked once, the first time a rest starts: may Aven alert you when it ends while the phone is in your pocket? A quiet toast
 * with an Allow button, never a prompt out of nowhere.
 */
export function offerRestAlerts(toast: (text: string, o: { actionLabel: string; onAction: () => void; duration: number }) => void) {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'default') return;
    if (localStorage.getItem('aven.restAsk')) return;
    localStorage.setItem('aven.restAsk', '1');
    toast(tNow('Get an alert when rest is over, even with the phone in your pocket?'), { actionLabel: tNow('Allow'), onAction: () => { Notification.requestPermission().catch(() => {}); }, duration: 9000 });
  } catch { /* ignore */ }
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
    for (const s of [3, 2, 1]) if (left - s * 1000 > 0) timers.push(setTimeout(() => { if (!document.hidden) vibrate(24); }, left - s * 1000));
    timers.push(setTimeout(() => {
      if (cued === key) return;
      cued = key;
      const st = useStore.getState();
      if (document.hidden) notify(nextSetText(st.active));
      else { if (st.settings.sound) tones(); vibrate([180, 90, 180, 90, 320]); }
    }, left));
    return () => timers.forEach(clearTimeout);
  }, [endsAt, total, paused]);
  useEffect(() => {
    const on = () => { if (!document.hidden) clearNotice(); };
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
}
