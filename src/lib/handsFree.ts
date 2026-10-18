/**
 * Hands-free sets (Coach 2.0 phase 5, Beta trial). Omar trains with music on, walking around the gym: the main path is the
 * watch's Done ✓ on "Time for set 2" (src/screens/workout/rest.ts applyDone). This is the other one, for when the phone is
 * near: a tap on an empty part of the running workout listens for ONE set-shaped phrase ("8 at 80", "only 6", "same
 * again", "done", "skip", "+30 seconds", and the Danish ones) and does it; anything else is ignored (talking to a friend
 * never logs). It never listens by itself.
 *
 * Feedback stays out of the way: the set ticks as a tap ticks it (its haptic, its light), a small toast with Undo. A voice
 * line only when something needs saying: a number it fixed ("Logged 80, I heard 18") or a phrase it didn't get.
 */
import { mic } from './mic';
import { STT_MODEL, SttError, buildPrompt, transcribe } from './groq';
import { getKey } from './keys';
import { useAi } from '../state/ai';
import { useStore, allExercises } from '../state/store';
import { useUI, haptic } from '../state/ui';
import { tNow } from './i18n';
import { parseSetCommand } from './setCommand';
import { currentSetOf } from './currentSet';
import { sttNames } from './sttNames';
import { runActions, type AgentResult } from './agent';
import { dayKey } from './dates';
import { adjustRest, skipRest } from '../screens/workout/actions';

type State = 'idle' | 'listening' | 'hearing';
let state: State = 'idle';
const subs = new Set<() => void>();
const set = (s: State) => { state = s; subs.forEach((f) => f()); };
export const handsFreeState = () => state;
export const subscribeHandsFree = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

/** The set it will log, marked while it listens (a soft breathing ring, styles.css .hf-listen). */
let marked: string | null = null;
function mark(id: string | null) {
  if (marked) document.querySelectorAll(`[data-set="${marked}"]`).forEach((el) => el.classList.remove('hf-listen'));
  marked = id;
  if (id) document.querySelectorAll(`[data-set="${id}"]`).forEach((el) => el.classList.add('hf-listen'));
}

/** A short spoken line, only when it matters (the phone's own voice: instant, offline; music dips for a moment). */
export function say(text: string) {
  try {
    if (typeof speechSynthesis === 'undefined') return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = useStore.getState().settings.language === 'da' ? 'da-DK' : 'en-GB';
    u.rate = 1.02; u.volume = 0.9;
    speechSynthesis.speak(u);
  } catch { /* no voice: the toast says it */ }
}

/** Words → what to do. Pure, for tests: null means "not a set: ignore". */
export function commandFor(words: string) {
  return parseSetCommand(words);
}

let last: AgentResult | null = null;

/** What a heard phrase does in the running workout. Returns the card (for Undo), or null when there was nothing to do. */
export async function act(words: string): Promise<{ result: AgentResult | null; spoken: string | null; ignored: boolean }> {
  const st = useStore.getState();
  const a = st.active;
  const cmd = commandFor(words);
  if (!a || !cmd) return { result: null, spoken: null, ignored: true };
  const lang = st.settings.language;
  const ctx = { t: tNow as any, lang, today: dayKey(Date.now(), st.settings.dayStartHour), brain: null };
  if (cmd.kind === 'rest') { adjustRest(cmd.sec); return { result: null, spoken: null, ignored: false }; }
  if (cmd.kind === 'skip') { skipRest(); return { result: null, spoken: null, ignored: false }; }
  if (cmd.kind === 'undo') { last?.undo?.(); const was = !!last; last = null; return { result: null, spoken: was ? tNow('Undone') : null, ignored: !was }; }
  const action = cmd.kind === 'set' ? { type: 'log_current_set' as const, kg: cmd.kg ?? null, reps: cmd.reps ?? null, which: 'current' as const }
    : cmd.kind === 'same' ? { type: 'log_current_set' as const, which: 'current' as const, same: true }
    : { type: 'log_current_set' as const, which: 'current' as const };
  const [r] = await runActions([action], ctx);
  last = r?.undo ? r : null;
  // a voice line only when it fixed a number (the card's amber line) or couldn't log it
  const fixed = r?.lines.find((l) => l.warn)?.text;
  const spoken = r?.kind === 'miss' ? r.title : fixed ? fixed : null;
  return { result: r ?? null, spoken, ignored: false };
}

/** One tap → one phrase. Stops by itself when you go quiet (or after 8 s, or if nothing is said within 4 s). */
export async function listenOnce(): Promise<void> {
  if (state !== 'idle') { if (state === 'listening') stopNow = true; return; } // a second tap: stop and use what was said
  const st = useStore.getState();
  const toast = useUI.getState().toast;
  const a = st.active;
  if (!a) return;
  if (!useAi.getState().hasGroq) { toast(tNow('Hands-free needs a Groq key (Settings → Voice & AI).'), { tone: 'bad' }); return; }
  const r = await mic.acquire('handsfree', { phone: true }); // (music keeps playing in the earbuds)
  if (!r.ok || !mic.startRecording('handsfree')) { mic.release('handsfree'); toast(tNow('The microphone isn’t available. Check the permission, or type.'), { tone: 'bad' }); return; }
  haptic('light');
  set('listening');
  mark(currentSetOf(a, 'skip')?.set.id ?? null);
  stopNow = false;
  const heardAny = await new Promise<boolean>((done) => {
    let heard = 0, quiet = 0; const t0 = performance.now();
    const id = setInterval(() => {
      const lv = mic.level();
      if (lv > 0.16) { heard += 80; quiet = 0; } else if (lv < 0.09) quiet += 80;
      const el = performance.now() - t0;
      if (stopNow || (heard >= 240 && quiet >= 800) || el > 8000 || (heard < 240 && el > 4000)) { clearInterval(id); done(heard >= 240 || stopNow); }
    }, 80);
  });
  const blob = await mic.stopRecording();
  mic.release('handsfree');
  if (!heardAny || !blob) { mark(null); set('idle'); return; } // nothing said: nothing happens
  set('hearing');
  try {
    const ai = useAi.getState();
    const pool = allExercises(useStore.getState().exercises);
    const words = (await transcribe(blob, { key: getKey('groq'), model: STT_MODEL[ai.stt], language: ai.voiceLang === 'auto' ? 'auto' : ai.voiceLang, prompt: buildPrompt(sttNames(pool)) })).trim();
    const out = await act(words);
    if (out.ignored) { say(tNow('Didn’t catch that')); return; }
    if (out.spoken) say(out.spoken);
    const res = out.result;
    if (res && res.kind !== 'miss') toast(`${res.lines[0]?.sub ?? res.title} ✓`, { tone: 'ok', actionLabel: res.undo ? tNow('Undo') : undefined, onAction: res.undo, duration: 4500 });
  } catch (e) {
    say(e instanceof SttError && (e.code === 'offline' || e.code === 'network') ? tNow('No connection') : tNow('Didn’t catch that'));
  } finally { mark(null); set('idle'); }
}
let stopNow = false;

/** Is this tap on empty space in the workout (not a button, a field, a set row, a menu)? */
export function isEmptyTap(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.closest) return false;
  return !el.closest('button, a, input, textarea, select, label, [role="button"], [role="switch"], [role="slider"], [data-set], .wk-head-wrap, .sheet, .icon-btn, .chip, .btn');
}
