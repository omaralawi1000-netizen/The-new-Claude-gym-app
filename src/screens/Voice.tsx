import { Fragment, type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { sttNames } from '../lib/sttNames';
import { AnimatePresence, motion, useIsPresent, useReducedMotion, useTransform } from 'motion/react';
import { useStore, allExercises } from '../state/store';
import { useUI, haptic } from '../state/ui';
import { useVoice } from '../state/voice';
import { useAi } from '../state/ai';
import { useT, useLang } from '../lib/i18n';
import { mic } from '../lib/mic';
import { speechSupported, startSpeech, type SpeechError, type SpeechHandle } from '../lib/speech';
import { getKey } from '../lib/keys';
import { transcribe, buildPrompt, STT_MODEL, SttError } from '../lib/groq';
import { aiErrorText, type Turn } from '../lib/gemini';
import { decide, brainFor, ORB_BRIEF, agentSystem } from '../lib/agentTurn';
import { droppedCard, runActions, validateAgent, type AgentResult } from '../lib/agent';
import { startLive, LIVE_RULES, liveCost, type LiveSession } from '../lib/live';
import { recordFee, overLimit } from '../lib/spend';
import { mealName } from '../lib/derive';
import { runLookups, validateLookups } from '../lib/agentLookup';
import { dayKey } from '../lib/dates';
import { uid } from '../lib/nutrition';
import { appendExchange, dropFailed, markInThread, readThread, threadSaid, threadTurns } from '../lib/thread';
import { SphereSlot, mirrorOrb, orbPress, orbTap, holdOrbSize, orbVoiceSource, orbBeat, orbHide } from '../ui/Sphere';
import { Stardust, type DustLive } from '../ui/stardust/Stardust';
import { moodOf } from '../ui/stardust/mood';
import { shapeOf } from '../ui/stardust/shape';
import { mirrorProgress, useEngage } from '../ui/engage';
import { kb, watchFocus } from '../ui/keyboard';
import { Veil, VOICE_VEIL, mirrorVeil } from '../ui/Veil';
import { SelfGlow } from '../ui/Glows';
import { refreshBar, setBarFrost } from '../ui/statusBar';
import { Icon } from '../ui/Icon';
import { useOverlayZ } from '../ui/Sheet';
import { ActionCard, UndoAll, RotatingHint, Rich, Words, SpeakButton, prefetchAloud, sttMessage, useWordReveal } from '../ui/agentUi';
import { stopSpeaking } from '../lib/tts';
import { flyLogged } from '../ui/fly';
import { apple, springCurve } from '../ui/motion';
import { OrbHand, rubber } from '../ui/orbHand';

const refreshBarOn = (el: HTMLElement | null) => { if (el) refreshBar(); }; // the top band takes the status bar's current tint

/** One thing you said and what the assistant did about it. `done` once the answer is complete (until then it streams in). */
interface Turn1 { id: string; said: string; reply: string; results: AgentResult[]; undone: string[]; confirmed: string[]; done: boolean; /** its cards in the shared conversation (lib/thread.ts) */ threadId?: string | null; /** said live (its words never fly in) */ live?: boolean; /** talking live, you spoke over this answer */ cut?: boolean }

/** How a sent message and the answer's cards settle: calm, a hint of spring, no wobble (iMessage). */
const SEND = { type: 'spring', stiffness: 170, damping: 26, mass: 1 } as const; // calm: a soft rise, no hurry, no wobble

const recorderOk = () => typeof MediaRecorder !== 'undefined' && mic.supported;
/** Leaving for the Coach, the frost holds until the screen's progress is down to this (the Coach's sheet is mostly up by then). */
const HOLD = 0.25;
const VOICE_VEIL_HOLD = VOICE_VEIL.map((l) => ({ ...l, from: l.from * HOLD, to: l.to * HOLD }));

/**
 * The orb's own screen: a big sphere that listens. Say anything — "log a banana", "bench 100 kilos for 8, 8 and 6",
 * "drank half a litre", "how do I change the theme?" — and it does it, the same way the Coach does (same brain, same
 * actions, same Undo). There are no separate food / workout modes. A quick log closes by itself and leaves an Undo toast.
 */
/**
 * What you said, as it lands: it writes itself in large and centred, word by word, the way you said it — then the whole
 * message shrinks down into a small sent bubble on the right, like a sent iMessage: the bubble takes the same line breaks
 * as the big text, so it is one calm move of one block (nothing reflows or crosses), and the bubble's glass gathers round
 * the words as they arrive, on Apple's smooth spring. A real move, not a crossfade: every big word is measured against its
 * twin in the bubble, flown there, and swapped for it once it sits exactly on top. Browser-run (Web Animations on
 * transform/opacity), so it is drawn at the screen's full rate.
 */
const SAID_FLY = springCurve(apple(0.6));
function SaidMorph({ text, onSettled }: { text: string; onSettled: () => void }) {
  const reduce = useReducedMotion();
  const words = useMemo(() => text.split(/\s+/).filter(Boolean), [text]);
  const instant = !!reduce || document.documentElement.dataset.motion === 'reduce' || words.length > 40;
  const [phase, setPhase] = useState<'write' | 'fly' | 'done'>(instant ? 'done' : 'write');
  const [breaks, setBreaks] = useState<number[]>([]); // words that end a line of the big text
  const wrap = useRef<HTMLDivElement>(null);
  const settledRef = useRef(onSettled); settledRef.current = onSettled;
  useEffect(() => {
    if (instant) { onSettled(); return; }
    // every word has arrived, then a short beat to read it, then it flies
    const id = setTimeout(() => {
      const big = wrap.current ? [...wrap.current.querySelectorAll<HTMLElement>('.said-big .sw')] : [];
      const br: number[] = [];
      for (let i = 0; i < big.length - 1; i++) if (big[i + 1].offsetTop > big[i].offsetTop + 2) br.push(i);
      setBreaks(br); setPhase('fly');
    }, 70 * Math.min(words.length, 18) + 600 + 380);
    return () => clearTimeout(id);
    // eslint-disable-next-line
  }, []);
  // the bubble is now laid out with the big text's line breaks: measure both, fly
  useLayoutEffect(() => {
    if (phase !== 'fly') return;
    const root = wrap.current;
    const bubble = root?.querySelector<HTMLElement>('.said');
    const big = root ? [...root.querySelectorAll<HTMLElement>('.said-big .sw')] : [];
    const small = root ? [...root.querySelectorAll<HTMLElement>('.said .sb')] : [];
    if (!root || !bubble || !big.length || big.length !== small.length) { setPhase('done'); settledRef.current(); return; }
    const anims: Animation[] = [];
    let gone = false;
    const from = getComputedStyle(big[0]).color, to = getComputedStyle(small[0]).color;
    const k = parseFloat(getComputedStyle(small[0]).fontSize) / parseFloat(getComputedStyle(big[0]).fontSize);
    const opts = { duration: SAID_FLY.duration, easing: SAID_FLY.easing, fill: 'forwards' as const };
    big.forEach((el, i) => {
      const b = el.getBoundingClientRect(), s = small[i].getBoundingClientRect();
      // land each word on its twin: left edges together, line centres together (the two line heights differ)
      const dx = s.left - b.left, dy = s.top + s.height / 2 - (b.top + (b.height * k) / 2);
      // the move on its own (run by the compositor, in step with the bubble's); the colour separately (it can't be)
      anims.push(el.animate([{ transform: 'none' }, { transform: `translate(${dx}px, ${dy}px) scale(${k})` }], opts));
      anims.push(el.animate([{ color: from }, { color: to }], { duration: 420, easing: 'ease-out', fill: 'forwards' }));
    });
    // the bubble starts as a faint frame round the big words (its first word on the big first word) and shrinks with them
    const B = bubble.getBoundingClientRect(), b0 = big[0].getBoundingClientRect(), s0 = small[0].getBoundingClientRect();
    const u = 1 / k;
    // (never past its own right edge: the conversation clips there, and the round corner showed cut flat for a moment)
    const bx = Math.min(b0.left - B.left - (s0.left - B.left) * u, B.width * (1 - u));
    const by = b0.top + b0.height / 2 - B.top - (s0.top + s0.height / 2 - B.top) * u;
    anims.push(bubble.animate([
      { transform: `translate(${bx}px, ${by}px) scale(${u})`, opacity: 0 },
      { opacity: 0.2, offset: 0.25 },
      { opacity: 1, offset: 0.7 },
      { transform: 'none', opacity: 1 },
    ], opts));
    // one start time for all of them, so no part can run a frame ahead of another
    const at = document.timeline.currentTime;
    if (at !== null) anims.forEach((x) => { x.startTime = at; });
    Promise.all(anims.map((x) => x.finished)).then(() => { if (!gone) setPhase('done'); }, () => {});
    // the answer starts writing in below while the words are still settling
    const answer = setTimeout(() => settledRef.current(), 380);
    return () => { gone = true; clearTimeout(answer); anims.forEach((x) => x.cancel()); };
  }, [phase]);
  return (
    <div ref={wrap} className={`said-wrap ${phase}`}>
      <div className="said">{words.map((w, i) => <Fragment key={i}><span className="sb">{w}</span>{i === words.length - 1 ? null : breaks.includes(i) ? <br /> : ' '}</Fragment>)}</div>
      {phase !== 'done' && (
        <div className="said-big" aria-hidden>
          {words.map((w, i) => <Fragment key={i}><span className="sw soft soft-in" data-soft={w} style={{ ['--i' as string]: Math.min(i, 18) }}><span className="soft-s">{w}</span></span>{i < words.length - 1 ? ' ' : ''}</Fragment>)}
        </div>
      )}
    </div>
  );
}

/**
 * The answer on the orb screen, as in the Coach: it writes itself in a word at a time at a calm, steady pace (however the
 * network delivers it), each word fading up. What comes after it (play, Continue in Coach, the cards) waits for its last
 * word, and so does the typing field below (`onDone`: written to the end, so nothing under it is pushed down while it
 * writes). `onGrow`: it took a new line (the screen follows it, unless you scrolled up to read).
 */
/**
 * Talking live: your voice as light. A soft warm glow at the bottom of the screen rises and brightens with your voice (its
 * loudness, eased), sinks away while it thinks (drawn up into the orb, which then glows from inside), and rests low while it
 * speaks. Opacity and a vertical scale only, written straight to the element each frame (no React render, no blur); still
 * when the screen is hidden, instant under Reduce motion.
 */
/**
 * Your sentence while talking live (Omar, 26 Oct: "the text isn't live when I speak, I want it word by word"). The moment
 * you start talking its bubble is there, with three small dots that move with your voice (you're being heard); your words
 * come in one after another at a steady pace as they are understood (they arrive in clumps), the dots trailing after them
 * while you keep talking.
 */
function LiveSaid({ text, k, still, ear, levels }: { text: string; k: string; still: boolean; ear: boolean; levels: () => { bands: Float32Array } | null }) {
  // (every word as it comes, the last one too: what you said is whole words, never a word half written)
  const { shown } = useWordReveal(text, false, still);
  return <>{shown && <Words text={shown} k={k} still={still} />}{ear && <Ear levels={levels} gap={!!shown} />}</>;
}
/** Three dots moving with your voice (low, middle and high voice), only by scale: nothing re-renders. */
function Ear({ levels, gap }: { levels: () => { bands: Float32Array } | null; gap: boolean }) {
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const dots = [...(box.current?.children ?? [])] as HTMLElement[];
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduce') return; // (still dots)
    const v = [0, 0, 0], sent = ['', '', '']; let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (useUI.getState().overlays.length) return; // (nothing moves behind an open pop-up)
      const b = levels()?.bands;
      for (let i = 0; i < 3; i++) {
        let x = 0; if (b) for (let j = i * 5; j < i * 5 + 5; j++) x += b[j] ?? 0;
        const want = Math.min(1, (x / 5) * 2.2);
        v[i] += (want - v[i]) * (want > v[i] ? 0.35 : 0.12);
        const sc = `scale(${(0.7 + v[i] * 0.75).toFixed(2)})`;
        if (sc !== sent[i]) { sent[i] = sc; dots[i].style.transform = sc; } // (written only when it changes)
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [levels]);
  return <span ref={box} className={`said-ear${gap ? ' gap' : ''}`} aria-hidden><i /><i /><i /></span>;
}

/** What it is doing while it thinks, from the function it called (Omar, 26 Oct): a few words under the orb. */
function doingLine(name: string, args: Record<string, unknown>, t: (s: string) => string): string {
  if (name === 'look_up') {
    const kinds = Array.isArray(args.lookups) ? (args.lookups as { kind?: string }[]).map((x) => x?.kind ?? '') : [];
    const k = kinds[0] ?? '';
    if (kinds.includes('web')) return t('Searching the web…');
    if (/^(food|nutrition|saved_food)$/.test(k)) return t('Looking at your food…');
    if (/^(workouts|exercise_history|records|training_balance|exercises)$/.test(k)) return t('Looking at your training…');
    if (k === 'body') return t('Looking at your weight…');
    if (/^(health|activities)$/.test(k)) return t('Looking at your health data…');
    if (/^(schedule|routines)$/.test(k)) return t('Looking at your plan…');
    if (/^(memory|notes|conversations)$/.test(k)) return t('Remembering…');
    return t('Looking it up…');
  }
  if (name === 'aven') {
    const types = Array.isArray(args.actions) ? (args.actions as { type?: string }[]).map((x) => x?.type ?? '') : [];
    const a = types[0] ?? '';
    if (/^(log_food|log_quick|log_saved_meal|copy_food|catch_up)$/.test(a)) return t('Logging your food…');
    if (/^(log_sets|log_current_set|edit_set)$/.test(a)) return t('Logging your sets…');
    if (a === 'log_water') return t('Logging water…');
    if (/^(log_weight|log_measurement)$/.test(a)) return t('Logging your weight…');
    if (a === 'log_activity') return t('Logging your activity…');
    if (/routine|split|schedule|plan_day|exercise/.test(a)) return t('Updating your plan…');
    if (/workout/.test(a)) return t('Updating your workout…');
    if (a === 'set_setting') return t('Changing a setting…');
    if (a === 'remember' || a === 'forget') return t('Noting it down…');
    return t('On it…');
  }
  return t('Thinking…');
}

function LiveAura({ session, mode }: { session: { current: LiveSession | null }; mode: 'off' | 'listen' | 'think' | 'speak' }) {
  const ref = useRef<HTMLDivElement>(null);
  const st = useRef({ o: 0, k: 0.55, raf: 0, last: 0 });
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const s = st.current;
    // Reduce motion, or the background glow turned down: a still light per state, no voice tracking, no loop
    const de = document.documentElement;
    const still = de.dataset.motion === 'reduce' || matchMedia('(prefers-reduced-motion: reduce)').matches || /soft|off/.test(de.dataset.glow ?? '');
    const write = () => { el.style.opacity = s.o.toFixed(3); el.style.transform = `scaleY(${s.k.toFixed(3)})`; };
    if (still) { s.o = mode === 'listen' ? 0.35 : mode === 'speak' ? 0.16 : 0; s.k = 0.7; write(); return; }
    cancelAnimationFrame(s.raf); s.last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - s.last) / 1000); s.last = now;
      const lv = mode === 'listen' && !document.hidden ? session.current?.levels().in ?? 0 : 0;
      // where it's heading: listening breathes at a low glow and rises with your voice; thinking drains away; speaking rests low
      const to = mode === 'listen' ? 0.28 + lv * 0.72 : mode === 'speak' ? 0.16 : 0;
      const toK = mode === 'listen' ? 0.55 + lv * 0.6 : mode === 'think' ? 1.25 : 0.5;
      // up quickly with a word, down slowly after it (a voice meter that breathes); draining while it thinks is slow too
      const rate = to > s.o ? 9 : mode === 'think' ? 1.6 : 2.6;
      s.o += (to - s.o) * (1 - Math.exp(-rate * dt));
      s.k += (toK - s.k) * (1 - Math.exp(-(mode === 'think' ? 1.8 : 6) * dt));
      write();
      // settled and nothing to follow: stop asking for frames (listening keeps following your voice)
      if (mode !== 'listen' && Math.abs(to - s.o) < 0.002 && Math.abs(toK - s.k) < 0.002) { s.o = to; s.k = toK; write(); return; }
      s.raf = requestAnimationFrame(step);
    };
    s.raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(s.raf);
  }, [session, mode]);
  // (SelfGlow: the grain that keeps a big soft glow from showing rings on the phone's screen)
  return <div ref={ref} aria-hidden className="live-aura"><SelfGlow /></div>;
}

function OrbReply({ id, text, live, onGrow, onDone, after }: { id: string; text: string; live: boolean; onGrow: () => void; onDone: () => void; after: ReactNode }) {
  const { shown, done } = useWordReveal(text, live);
  const ref = useRef<HTMLDivElement>(null);
  const tall = useRef(0);
  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 0;
    if (h > tall.current + 1) onGrow();
    tall.current = h;
  });
  useLayoutEffect(() => { if (done) { onDone(); onGrow(); } }, [done]); // eslint-disable-line
  return <>{shown && <div ref={ref} className="reply calm" aria-live="polite"><Rich text={shown} id={id} /></div>}{done && after}</>;
}

export function VoiceComposer({ props }: { props: { mode?: 'food' | 'workout'; date?: string; mealId?: string } }) {
  const t = useT();
  const present = useIsPresent();
  const lang = useLang();
  const z = useOverlayZ(65);
  // the content comes up a beat after the frost has started, and leaves a beat before it
  const contentAt = (v: number) => Math.min(1, Math.max(0, (v - 0.12) / 0.6));
  const veilRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // handing over to the Coach: the frost stays while the Coach's sheet rises over it, and only clears once the sheet covers
  // the screen — it used to clear first, and the page behind flashed through between the two
  const toCoach = useRef(false);
  // high refresh rate: the frost and the content's fade also run as browser animations (see mirrorSpring)
  const eng = useEngage((p0, p1, sp) => [...mirrorVeil(veilRef.current, p0, p1, sp, 0, toCoach.current ? VOICE_VEIL_HOLD : VOICE_VEIL), mirrorProgress(contentRef.current, p0, p1, sp, 0, (p) => ({ opacity: contentAt(p) }), [0.12, 0.72]), mirrorOrb(contentRef.current?.closest('.voice') ?? contentRef.current, p0, p1, sp, 0)]);
  const veilE = useTransform(eng, (v) => (toCoach.current ? Math.min(1, v / HOLD) : v));
  // the status bar follows the frost, frame for frame (and lets go when the screen is gone)
  useEffect(() => { setBarFrost(veilE.get()); const off = veilE.on('change', setBarFrost); return () => { off(); setBarFrost(0); }; }, [veilE]);
  const engage = useMemo(() => ({ e: eng }), [eng]);
  const contentO = useTransform(eng, contentAt);
  const exercises = useStore((s) => s.exercises);
  const pool = useMemo(() => allExercises(exercises), [exercises]);
  const currentPhase = useVoice((v) => v.phase);
  const lastPhase = useRef(currentPhase);
  if (present) lastPhase.current = currentPhase;
  const phase = present ? currentPhase : lastPhase.current; // the departing screen keeps its shape while the next session starts
  const hasGroq = useAi((a) => a.hasGroq);
  const engine: 'groq' | 'browser' | 'typed' = hasGroq && recorderOk() ? 'groq' : speechSupported() ? 'browser' : 'typed';
  const supported = engine !== 'typed';
  const [typing, setTyping] = useState(!supported);
  const [typed, setTyped] = useState('');
  const [settledId, setSettledId] = useState<string | null>(null); // the exchange whose words have settled into their bubble
  const [written, setWritten] = useState<string | null>(null); // the exchange whose answer has written itself in to the end
  const [final, setFinal] = useState('');
  const [interim, setInterim] = useState('');
  const [err, setErr] = useState<string | null>(null);
  /** the question that got no answer (slow line, an error): Try again asks it once more, in the same bubble */
  const [ask, setAsk] = useState<{ text: string; id: string; spoken?: boolean } | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  const [turns, setTurns] = useState<Turn1[]>([]);
  const turnsRef = useRef<Turn1[]>([]); turnsRef.current = turns;
  // talking live (lib/live.ts): one open conversation while the screen is up; typed messages still go the usual way
  // (not past this month's AI limit: Live counts in the same 200 kr as the Coach)
  const liveWanted = useAi((a) => a.liveOrb && a.hasGemini && !overLimit(a.solLimitKr));
  const liveRef = useRef<LiveSession | null>(null);
  const liveFailed = useRef(false);
  const [liveActive, setLiveActive] = useState(false);
  const [speaking, setSpeaking] = useState(false); // its voice is playing (Tap to interrupt)
  const [hearing, setHearing] = useState(false); // talking live: you are being heard right now
  // talking live, like ChatGPT (Omar's recording, 26 Oct): each new thing you say starts a fresh page; the last exchange goes
  // and the orb is big in the middle while you talk, then your words and its answer show with the orb small at the bottom
  const [page, setPage] = useState(0), [pageNext, setPageNext] = useState(0);
  const formCards = useRef<(ids: string[]) => void>(() => {}); // (talking live: new cards are written in dust first, below)
  // (the last exchange fades away first, then the new page starts: never cut in one frame)
  useEffect(() => { if (pageNext === page) return; const id = setTimeout(() => setPage(pageNext), calm ? 0 : 320); return () => clearTimeout(id); }, [pageNext, page]); // eslint-disable-line
  const hearDrop = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const liveLevels = useCallback(() => liveRef.current?.levels() ?? null, []);
  const [muted, setMuted] = useState(false);
  const [camStream, setCamStream] = useState<MediaStream | null>(null);
  const [renewing, setRenewing] = useState(false);
  // what it is doing while it thinks, in a few words (Omar's reference, 26 Oct: the assistant says live what it is working on)
  const [doing, setDoing] = useState('');
  const dustBeat = useRef(0); // a log done, for Stardust's sweep of the success colour
  const dustMood = useRef(0); // the mood of what it is saying (its colour leans with it while it speaks)
  const liveTurn = useRef<{ id: string | null; said: string }>({ id: null, said: '' });
  const blobRef = useRef<Blob | null>(null);
  const handle = useRef<SpeechHandle | null>(null);
  const ctl = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const run = useRef(0); // a newer listen (or teardown) invalidates an older one still waiting on the permission prompt
  const busy = useRef(false);
  const latest = useRef({ final: '', interim: '' }); latest.current = { final, interim };
  const finishRef = useRef<() => void>(() => {});
  // the conversation's last exchange is written in place as it happens: sent the moment you stop, then its answer streams in
  const openTurn = (said: string) => { const id = uid('v'); setTurns((all) => [...all, { id, said, reply: '', results: [], undone: [], confirmed: [], done: false }]); return id; };
  const patch = (id: string, p: Partial<Turn1>) => setTurns((all) => all.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const drop = (id: string) => setTurns((all) => all.filter((x) => x.id !== id));
  /** Names Whisper should expect (your lifts and recent foods): it hears them right more often. */
  const sttPrompt = () => buildPrompt(sttNames(pool));
  const go = (p: Parameters<ReturnType<typeof useVoice.getState>['go']>[0]) => useVoice.getState().go(p);

  const teardown = useCallback(() => {
    run.current++;
    liveRef.current?.stop(); liveRef.current = null; setLiveActive(false); orbVoiceSource(null); liveTurn.current = { id: null, said: '' }; setSpeaking(false); setHearing(false); setMuted(false); setCamStream(null); setRenewing(false);
    handle.current?.abort(); handle.current = null;
    mic.release('voice');
    useVoice.getState().set({ micLive: false });
  }, []);

  useEffect(() => {
    if (!present) return;
    alive.current = true;
    const unsub = mic.subscribe(() => useVoice.getState().set({ micLive: mic.active }));
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !(e.target as HTMLElement)?.closest?.('textarea')) useUI.getState().pop(); };
    window.addEventListener('keydown', onKey);
    return () => { alive.current = false; unsub(); window.removeEventListener('keydown', onKey); ctl.current?.abort(); stopSpeaking(); teardown(); go('idle'); };
    // eslint-disable-next-line
  }, [teardown, present]);

  // ── listening ──
  const listen = useCallback(async () => {
    if (!alive.current || busy.current) return;
    stopSpeaking();
    setErr(null); setFinal(''); setInterim(''); setCanRetry(false); blobRef.current = null; pinned.current = true;
    if (liveWanted && !liveFailed.current) { setTyping(false); void goLive(); return; }
    if (!supported) { go('idle'); setTyping(true); return; }
    setTyping(false);
    go('requesting');
    const my = ++run.current;
    if (engine === 'groq') {
      const r = await mic.acquire('voice');
      if (!alive.current || my !== run.current) return;
      if (!r.ok) {
        setErr(r.reason === 'denied' ? t('Microphone permission was denied. You can allow it in your browser settings, or type instead.')
          : r.reason === 'nodevice' ? t('No microphone was found.') : r.reason === 'busy' ? t('The microphone is in use by something else.') : t('The microphone couldn’t start.'));
        go(r.reason === 'denied' ? 'unavailable' : 'error'); setTyping(true); return;
      }
      if (!mic.startRecording('voice')) { teardown(); setErr(t('This browser can’t record audio. Type instead.')); go('error'); setTyping(true); return; }
      go('listening');
      return;
    }
    const h = startSpeech({
      lang: lang === 'da' ? 'da-DK' : 'en-GB',
      onStart: () => { if (alive.current) go('listening'); },
      onText: (f, i) => { setFinal(f); setInterim(i); },
      onError: (e: SpeechError) => {
        if (!alive.current) return;
        if (e === 'denied') { teardown(); setErr(t('Microphone or speech permission was denied. You can allow it in your browser settings, or type instead.')); go('unavailable'); setTyping(true); }
        else if (e === 'network') { teardown(); setErr(t('The browser’s speech service isn’t reachable (it needs a connection). Type instead — nothing was recorded.')); go('error'); setTyping(true); }
        else if (e === 'audio') { teardown(); setErr(t('No microphone was found or it is in use by another app.')); go('error'); setTyping(true); }
        else if (e !== 'aborted' && e !== 'no-speech') setErr(t('Speech recognition stopped unexpectedly.'));
      },
      // ended without us finishing it (no speech, an error): the level meter's mic goes too, so earbuds leave call mode
      onEnd: () => { if (!alive.current) return; if (useVoice.getState().phase === 'listening') finishRef.current(); else if (!busy.current) mic.release('voice'); },
    });
    if (!h) { setErr(t('Speech recognition couldn’t start.')); go('error'); setTyping(true); return; }
    handle.current = h;
    await mic.acquire('voice'); // only for the sphere's level; failing here just means "no level"
    // eslint-disable-next-line
  }, [supported, engine, lang, liveWanted]);

  /** Talk live: the coach's own instructions, the conversation so far and the live rules; food logs through Aven. */
  /** The words it will hear: your lifts and the foods you log most lately (and Aven's own), for the transcription. */
  const liveWords = () => {
    const st = useStore.getState();
    const foods = [...new Set([...st.entries].reverse().map((e) => e.snap?.name).filter((x): x is string => !!x && x.length < 40))].slice(0, 50);
    const lifts = [...new Set(st.sessions.slice(-20).flatMap((w) => w.exercises.map((e) => pool.find((x) => x.id === e.exerciseId)?.name)).filter((x): x is string => !!x))].slice(0, 40);
    return ['Aven', 'skyr', ...foods, ...lifts];
  };
  const liveStarting = useRef(false); // (one connection at a time: opening the screen asked twice, and paid for two)
  const liveAgain = useRef(false);
  const goLive = async () => {
    if (liveRef.current) return;
    if (liveStarting.current) { liveAgain.current = true; return; } // (after the one starting now, if it was called off)
    liveStarting.current = true;
    try {
      do { liveAgain.current = false; await openLive(); } while (liveAgain.current && !liveRef.current && alive.current);
    } finally { liveStarting.current = false; liveAgain.current = false; }
  };
  const openLive = async () => {
    go('requesting');
    const my = ++run.current;
    const st = useStore.getState();
    const where = props.mode === 'workout' && st.active ? 'The user is in their running workout.'
      : props.mealId || props.date ? `The user came from the Food tab${props.date ? ` (day ${props.date})` : ''}${props.mealId ? `, meal ${props.mealId}` : ''}: foods go there unless they say otherwise.`
      : 'The user opened the orb on the main screen and is talking to it.';
    const { system } = agentSystem(st, { lang, pool, where });
    const said = history().map((h) => `${h.role === 'user' ? 'They' : 'You'}: ${h.parts.map((p) => p.text).join('')}`).join('\n').slice(-6000);
    const lt = liveTurn.current;
    const s = await startLive({
      key: getKey('gemini'), voice: useAi.getState().voice, lang, vocabulary: liveWords(),
      system: `${system}\n\nTHE CONVERSATION SO FAR (oldest first; the Coach chat and the orb share it):\n${said || '(nothing yet)'}\n\n${LIVE_RULES}`,
      handlers: {
        // your sentence gets its bubble with its first word and keeps it to the end of the answer (a bubble swapped for
        // another when the answer started made it jump and its words fade in again, 25 Oct film)
        onUserText: (text) => {
          if (!alive.current) return;
          lt.said = text;
          if (lt.id) patch(lt.id, { said: text });
          else { setPageNext(turnsRef.current.length); const id = openTurn(text); lt.id = id; patch(id, { live: true }); }
        },
        // you started talking: your bubble is there at once (its words follow as they are understood); a sound that turns out
        // to be no words takes its empty bubble away again
        onHearing: (on) => {
          if (!alive.current) return;
          setHearing(on); clearTimeout(hearDrop.current);
          if (on && !lt.id) { setPageNext(turnsRef.current.length); const id = openTurn(''); lt.id = id; patch(id, { live: true }); }
          if (!on) hearDrop.current = setTimeout(() => {
            const id = lt.id, tu = id ? turnsRef.current.find((x) => x.id === id) : undefined;
            if (alive.current && id && tu && !tu.said && !tu.reply && !tu.results.length && useVoice.getState().phase !== 'processing') { drop(id); lt.id = null; }
          }, 2500);
        },
        onTurnStart: () => { if (!alive.current) return; if (!lt.id) { setPageNext(turnsRef.current.length); const id = openTurn(lt.said); lt.id = id; patch(id, { live: true }); } go('processing'); },
        onReplyText: (text) => { if (alive.current && lt.id) patch(lt.id, { reply: text }); dustMood.current = moodOf(text); },
        onSpeaking: (on) => { if (!alive.current) return; setSpeaking(on); if (on) setDoing(''); if (liveRef.current) go(on ? 'idle' : lt.id ? 'processing' : 'listening'); },
        onUsage: (u) => recordFee(liveCost(u)),
        onReconnecting: (on) => { if (alive.current) setRenewing(on); },
        onTool: async (name, args) => {
          if (alive.current) setDoing(doingLine(name, args, t));
          if (name === 'look_up') {
            const list = validateLookups(args.lookups);
            if (!list.length) return 'Nothing to look up.';
            const d = useStore.getState();
            const mealLabel = (x: string) => { const m = d.settings.meals.find((y) => y.id === x); return m ? mealName(m, lang) : x; };
            return runLookups(d, list, { today: dayKey(Date.now(), d.settings.dayStartHour), lang, pool, mealLabel, said: threadSaid(readThread()) });
          }
          if (name !== 'aven') return 'Unknown function.';
          const v = validateAgent({ reply: '', actions: Array.isArray(args.actions) ? args.actions : [] });
          if (!v?.actions.length) return 'Those actions could not be read; nothing was changed.';
          const today = dayKey(Date.now(), useStore.getState().settings.dayStartHour);
          const results = v?.actions.length ? await runActions(v.actions, { t, lang, today, brain: brainFor({ big: false, surface: 'orb' }), date: props.date, mealId: props.mealId }) : [];
          const id = lt.id;
          if (id && alive.current) { setTurns((all) => all.map((x) => (x.id === id ? { ...x, results: [...x.results, ...results] } : x))); formCards.current(results.map((x) => x.id)); }
          if (results.some((r) => r.kind !== 'miss' && r.kind !== 'nav' && !r.pending)) { haptic('success'); orbBeat(1); dustBeat.current++; } // (one heartbeat of light: done)
          // (with each item's ref, so "change that" can find it; and what couldn't be read)
          return [results.map((r) => `${r.title}: ${r.lines.map((l) => [l.text, l.sub, l.ref ? `[ref ${l.ref}]` : ''].filter(Boolean).join(' ')).join(', ')}${r.button ? ' (waits for their Apply)' : ''}`).join('; ') || 'Nothing was changed.', v.dropped ? `${v.dropped} action(s) could not be read and were not done.` : ''].filter(Boolean).join(' ');
        },
        onInterrupted: () => { if (alive.current && lt.id) patch(lt.id, { cut: true }); },
        onIdle: () => {
          if (!alive.current) return;
          const id = lt.id; lt.id = null; lt.said = ''; setDoing('');
          if (id) {
            const turn = turnsRef.current.find((x) => x.id === id);
            const threadId = turn ? appendExchange({ said: turn.said, reply: turn.reply, results: turn.results }) : null;
            patch(id, { done: true, threadId });
          }
          if (liveRef.current) go('listening');
        },
        onError: (code) => {
          if (!alive.current) return;
          liveRef.current = null; setLiveActive(false); orbVoiceSource(null);
          if (code === 'denied') { setErr(t('Microphone permission was denied. You can allow it in your browser settings, or type instead.')); go('unavailable'); setTyping(true); return; }
          if (code === 'nodevice') { setErr(t('No microphone was found.')); go('error'); setTyping(true); return; }
          if (code === 'closed') { setErr(t('Live stopped. Tap the sphere to talk again.')); go('idle'); return; }
          // it couldn't connect: the usual orb takes over for this visit
          liveFailed.current = true; go('idle'); void listen(); setErr(t('Live couldn’t connect, so the normal orb answers.')); // (after: listen clears messages as it starts)
        },
      },
    });
    if (!s) return;
    if (!alive.current || my !== run.current) { s.stop(); return; }
    liveRef.current = s; setLiveActive(true);
    orbVoiceSource(() => s.levels()); // (the orb hears this conversation: your voice and its own)
    useVoice.getState().set({ micLive: true });
    go('listening');
  };

  // leaving Aven (another app, the screen locked) while talking live: the microphone and camera go off at once; back
  // within 30 s it carries on as it was, later it has ended and the orb has closed (Omar, 25 Oct: no listening — or
  // paying — in a pocket)
  const mutedRef = useRef(muted); mutedRef.current = muted;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const on = () => {
      const s1 = liveRef.current;
      if (document.hidden) {
        if (!s1) return;
        s1.setMuted(true);
        void s1.setCamera(false); setCamStream(null);
        clearTimeout(timer);
        timer = setTimeout(() => { if (document.hidden && liveRef.current) { teardown(); useUI.getState().pop(); } }, 30_000);
      } else {
        clearTimeout(timer);
        if (s1) s1.setMuted(mutedRef.current);
      }
    };
    document.addEventListener('visibilitychange', on);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', on); };
  }, [teardown]);

  // opened → listen straight away
  useEffect(() => { if (supported) listen(); /* eslint-disable-next-line */ }, []);

  // Groq: stop by itself once you have spoken and gone quiet for 0.9 s (or after 40 s). While you speak the orb answers your
  // voice; your words appear, sent, the moment you stop. (Live words while speaking were tried — quick Groq looks every ~1.2 s —
  // and dropped: they arrived late and a one-second clip was often misheard, which read as broken.)
  useEffect(() => {
    if (!present || phase !== 'listening' || engine !== 'groq') return;
    let heard = 0, quiet = 0; const t0 = performance.now();
    const id = setInterval(() => {
      const lv = mic.level();
      if (lv > 0.16) { heard += 80; quiet = 0; } else if (lv < 0.09) quiet += 80;
      if ((heard >= 240 && quiet >= 900) || performance.now() - t0 > 40000) { clearInterval(id); finishRef.current(); }
    }, 80);
    return () => clearInterval(id);
  }, [phase, engine, present]);

  /** Speech → text with Groq; a failure keeps the recording so a retry doesn't need you to speak again. */
  async function hear(blob: Blob | null): Promise<string | null> {
    if (!blob) { go('idle'); setErr(t('Didn’t catch anything. Tap the sphere to try again, or type it.')); return null; }
    const ai = useAi.getState();
    try {
      const out = (await transcribe(blob, { key: getKey('groq'), model: STT_MODEL[ai.stt], language: ai.voiceLang === 'auto' ? 'auto' : ai.voiceLang, prompt: sttPrompt() })).trim();
      if (!alive.current) return null;
      if (!out) { go('idle'); setErr(t('Didn’t catch anything. Tap the sphere to try again, or type it.')); return null; }
      blobRef.current = null; setCanRetry(false);
      return out;
    } catch (e) {
      if (!alive.current) return null;
      const code = e instanceof SttError ? e.code : 'failed';
      blobRef.current = blob;
      setErr(sttMessage(code, t)); setCanRetry(code !== 'nokey' && code !== 'badkey'); go('error');
      return null;
    }
  }

  /** what it is looking up in the data right now (shown instead of "Thinking…") */
  const [looking, setLooking] = useState('');
  /** The conversation so far, for the model: the one shared with the Coach (what was said there, and here, in order). */
  const history = (): Turn[] => threadTurns(readThread(), useStore.getState().settings.dayStartHour, 12);

  /** Understand what was said, do it, show it. */
  const act = async (text: string, id: string, spoken = false) => {
    busy.current = true;
    setErr(null); setAsk(null); go('processing');
    patch(id, { done: false });
    ctl.current = new AbortController();
    const signal = ctl.current.signal;
    // a slow line is not a Cancel: after 45 s (a look-up in the data adds a round) it says so, with Try again
    let late = false;
    const kill = setTimeout(() => { late = true; ctl.current?.abort(); }, 60_000);
    try {
      const where = props.mode === 'workout' && useStore.getState().active ? 'The user is in their running workout: sets go into it.'
        : props.mealId || props.date ? `The user came from the Food tab${props.date ? ` (day ${props.date})` : ''}${props.mealId ? `, meal ${props.mealId}` : ''}: foods go there unless they say otherwise.`
        : 'The user tapped the orb on the main screen and spoke to it.';
      const brief = ORB_BRIEF;
      // the answer streams in word by word as the model writes it (Gemini), under what you said
      const d = await decide(text, { lang, t, pool, history: history(), where: where + brief, signal, surface: 'orb', dictated: spoken, said: threadSaid(readThread()), onStatus: (x) => { if (alive.current) setLooking(x); }, onReply: (r) => { if (alive.current) patch(id, { reply: r }); } });
      let reply = d.reply;
      if (d.wantsUndo) {
        const ok = (t1: Turn1, r: AgentResult) => !!r.undo && !t1.undone.includes(r.id) && (!r.pending || t1.confirmed.includes(r.id));
        const last = [...turnsRef.current].reverse().find((x) => x.results.some((r) => ok(x, r)));
        if (last) { const r = [...last.results].reverse().find((x) => ok(last, x))!; r.undo!(); markInThread(last.threadId, r.id, 'undone'); setTurns((all) => all.map((x) => (x.id === last.id ? { ...x, undone: [...x.undone, r.id] } : x))); }
        if (!d.actions.length && !reply) reply = t('Undone.');
      }
      const st = useStore.getState();
      const today = dayKey(Date.now(), st.settings.dayStartHour);
      const results = d.actions.length ? await runActions(d.actions, { t, lang, today, brain: brainFor({ big: false, surface: 'orb', signal }), date: props.date, mealId: props.mealId, onStatus: (x) => { if (alive.current) setLooking(x); } }) : [];
      if (d.dropped) results.push(droppedCard(t)); // (never silent: part of the answer was unreadable)
      if (!alive.current) return;
      const said = [reply, d.note].filter(Boolean).join('\n\n');
      // it joins the conversation the Coach shows too (so "move it to lunch" there knows what "it" is)
      const threadId = appendExchange({ said: turnsRef.current.find((x) => x.id === id)?.said ?? text, reply: said, results });
      patch(id, { reply: said, results, done: true, threadId });
      // green "Done" only when something was actually logged or changed; a plain answer just settles
      const acted = d.wantsUndo || results.some((r) => r.kind !== 'miss' && r.kind !== 'nav');
      if (acted) { haptic('success'); go('confirmed'); } else go('idle');
      // talking live: the voice hears what was typed and answered, and the orb listens again
      if (liveRef.current) { liveRef.current.note(turnsRef.current.find((x) => x.id === id)?.said ?? text, said); setTimeout(() => { if (alive.current && liveRef.current) go('listening'); }, 900); }
      if (said.trim()) prefetchAloud(said); // read aloud only when you tap play
      // a quick log and nothing to read: show it for a moment, then step aside with an Undo toast
      const quick = results.length > 0 && results.every((r) => ['food', 'sets', 'water', 'weight', 'activity'].includes(r.kind) && !r.pending);
      if (quick && !reply.trim() && !liveRef.current) { // (talking live, the orb stays: you're mid-conversation)
        setTimeout(() => {
          if (!alive.current) return;
          const undoable = results.filter((r) => r.undo);
          useUI.getState().toast(results.map((r) => r.title).join(' · '), { tone: 'ok', actionLabel: undoable.length ? t('Undo') : undefined, onAction: () => undoable.forEach((r) => r.undo!()) });
          // what was logged flies from the orb to where it landed (unless you are inside the workout, where it already shows)
          const orb = document.querySelector('.voice-orb')?.getBoundingClientRect();
          const inWorkout = useUI.getState().overlays.some((o) => o.type === 'workout');
          useUI.getState().pop();
          if (orb && !inWorkout) {
            const kind = results.some((r) => r.kind === 'sets') ? 'train' : results.some((r) => ['food', 'water'].includes(r.kind)) ? 'food' : null;
            if (kind) setTimeout(() => flyLogged(kind, { x: orb.left + orb.width / 2, y: orb.top + orb.height / 2 }), 140);
          }
        }, 1700);
      } else setTimeout(() => { if (alive.current && useVoice.getState().phase === 'confirmed') go('idle'); }, 1200);
      if (results.some((r) => r.kind === 'nav')) setTimeout(() => { if (alive.current) useUI.getState().pop(); }, 900);
    } catch (e: any) {
      if (!alive.current) return;
      patch(id, { done: true, reply: '' });
      if (e?.code !== 'aborted' || late) {
        setErr(late ? t('Slow connection. Try again, or find your question in the Coach.') : aiErrorText(e, t)); go('error');
        setAsk({ text, id, spoken });
        // the question is kept in the conversation (marked unanswered), so it is not lost when the orb closes
        appendExchange({ said: text, reply: '', results: [], failed: late ? t('Slow connection.') : aiErrorText(e, t) });
      } else go('idle');
    } finally { clearTimeout(kill); busy.current = false; setLooking(''); }
  };

  const finish = async () => {
    if (!alive.current || busy.current) return;
    if (liveRef.current && !typing) { teardown(); go('idle'); return; }
    const p = useVoice.getState().phase;
    // still starting the microphone (Samsung Browser can take a second): a tap here is not "stop" — stopping a start that
    // hasn't finished used to end in "Didn't catch anything" followed by a false "microphone in use"
    if (p === 'processing' || (p === 'requesting' && !typing)) return;
    if (typing) {
      const text = typed.trim(); if (!text) return;
      haptic('send');
      // the box fades away as your words rise into the conversation, and the keyboard leaves with it (not after it)
      const f = document.activeElement as HTMLElement | null; if (f?.tagName === 'TEXTAREA') f.blur();
      setTyped(''); act(text, openTurn(text)); return;
    }
    if (engine === 'groq' && mic.recording) {
      haptic('send'); // by a tap or by falling quiet: felt the same, "got it"
      busy.current = true;
      // the exchange opens at once (the orb steps up, thinking); what you said rises in as a sent bubble when it is transcribed
      const id = openTurn('');
      go('processing');
      const blob = await mic.stopRecording();
      if (!alive.current) return;
      mic.release('voice');
      busy.current = false;
      const heard = await hear(blob);
      if (!alive.current) return;
      if (heard) { patch(id, { said: heard }); act(heard, id, true); } else drop(id);
      return;
    }
    const text = [latest.current.final, latest.current.interim].filter(Boolean).join(' ').trim();
    run.current++; // anything still starting belongs to this attempt and is now abandoned, quietly
    handle.current?.stop(); handle.current = null; mic.release('voice');
    if (!text) { go('idle'); setErr(t('Didn’t catch anything. Tap the sphere to try again, or type it.')); return; }
    haptic('send');
    setInterim(''); setFinal('');
    act(text, openTurn(text), true);
  };
  finishRef.current = finish;

  const retryHear = async () => {
    const b = blobRef.current; if (!b) return;
    setErr(null); setCanRetry(false); go('processing');
    const id = openTurn('');
    const text = await hear(b);
    if (text) { patch(id, { said: text }); act(text, id, true); } else drop(id);
  };

  const listening = phase === 'listening' || phase === 'requesting';
  const thinking = phase === 'processing';
  const last = turns[turns.length - 1];
  const showing = !!last && (liveActive || !listening);
  const label = ({
    idle: showing ? '' : t('Tap the sphere and speak'), requesting: t('Starting the microphone…'), // with an answer up, the Say more button says it
    listening: renewing ? t('Reconnecting…') : muted ? t('Muted') : liveActive || engine === 'groq' ? t('Listening') : mic.active ? t('Listening') : t('Listening (no level meter)'),
    processing: looking || t('Thinking…'), confirmed: t('Done'), error: t('Couldn’t do that'), unavailable: t('Microphone unavailable'),
    review: t('Done'),
  } as Record<string, string>)[phase] ?? '';
  // tapping while the microphone is still starting cancels that start cleanly (teardown also invalidates the pending start, so
  // it can never come back later as a false "microphone in use")
  const tapSphere = () => {
    if (liveUi) { if (speaking) { liveRef.current?.hush(); haptic('light'); } else if (!liveRef.current) void goLive(); return; } // (talking live, it's never a stop)
    if (phase === 'requesting' || liveRef.current) { teardown(); go('idle'); return; } orbTap(0.6); if (listening) finish(); else if (!thinking) { haptic('listen'); listen(); } };
  // talking live, from the first frame (also while it connects): the ChatGPT-like screen, never the old buttons in between
  const liveUi = liveWanted && !liveFailed.current && !typing;
  // (a bubble still waiting for its first word doesn't count: a cough mustn't move the orb up and back down)
  // (while you are still talking, no text: the orb listens big in the middle; a bubble still waiting for its first word
  // doesn't count either, so a cough doesn't move the orb)
  const shown = liveUi ? turns.slice(page) : turns;
  const chatting = liveUi && pageNext === page && shown.some((x) => x.reply || x.results.length || x.done || (x.said && phase === 'processing'));
  const big = liveUi ? !chatting : !showing && !thinking && !typing; // typing: the orb steps up and the box gets the room
  // (Aven's own Reduce motion too, not only the phone's: the glide and the fade are instant then)
  const calm = useReducedMotion() || document.documentElement.dataset.motion === 'reduce';
  // the orb in your hand (Omar, 26 Oct): it follows your finger; swiped down far enough (or flicked down) it goes away,
  // otherwise it springs back with one soft bounce. Only a wrapper's transform moves.
  const handEl = useRef<HTMLSpanElement>(null);
  const calmRef = useRef(calm); calmRef.current = calm;
  const hand = useMemo(() => new OrbHand(() => handEl.current, {
    calm: () => calmRef.current,
    follow: (dx, dy) => [rubber(dx, 34), dy > 0 ? dy * 0.85 : rubber(dy, 60)],
    // down far enough (or flicked down): it goes away. Up (or flicked up): the whole conversation, in the Coach, where you can
    // also type (the orb is your voice, the Coach is the page you read and write on)
    release: (_x, y, vy) => {
      if (y < -34 || (vy < -0.5 && y < -14)) { haptic('light'); toCoach.current = true; useUI.getState().swap(1, 'coach'); return true; }
      if (y < 120 && !(vy > 0.5 && y > 40)) return false;
      haptic('light'); useUI.getState().pop(); return true; // (it leaves from where your finger let it go)
    },
  }), []); // eslint-disable-line
  useEffect(() => () => hand.stop(), [hand]);
  const dragged = useRef(false);
  // Stardust (Omar, 26 Oct, ui/stardust): talking live, the orb becomes thousands of specks of light. The orb flies up from
  // the dock as always; once it has landed it fades as the dust condenses in its place (and comes back to fly home). The dust
  // writes its greeting, notices your voice, folds into a galaxy while it thinks, and answers your finger (held, tapped,
  // dragged). If the phone can't draw it, the usual orb simply stays.
  const [dustOk, setDustOk] = useState(false);
  const [dustOn, setDustOn] = useState(false);
  // A card written in dust (Omar, 26 Oct: "shape the card almost fully with the specks… so it feels seamless"): a new card
  // is laid out unseen, its outline and words are sampled into points (ui/stardust/shape.ts), the dust flies there and
  // draws it, and when it is fully drawn the real card takes over with a flash of light; the rest of the dust flows home.
  // One card at a time; if the dust can't draw, the card simply appears.
  const [forming, setForming] = useState<string[]>([]);
  const formed = useRef(new Set<string>()); // (cards drawn in dust: they appear with a plain fade, not the usual rise)
  const shape = useRef<{ n: number; pts: Float32Array | null }>({ n: 0, pts: null });
  const shapeAt = useRef<{ el: HTMLElement; x: number; y: number } | null>(null); // (the card being written, and where it was)
  const shaping = useRef(false), jump = useRef(0), formQ = useRef<string[]>([]), formBusy = useRef<string | null>(null);
  const dustReady = useRef(false); dustReady.current = dustOk && dustOn && !calm;
  const formNext = () => {
    if (formBusy.current || !formQ.current.length) return;
    const id = formQ.current.shift()!; formBusy.current = id;
    // (the card is laid out, unseen, once its answer is in: wait for it, then read its shape)
    const t0 = performance.now(); let lastKey = '', seen = 0;
    const look = () => {
      if (!alive.current) return;
      const el = document.querySelector<HTMLElement>(`[data-card="${id}"]`);
      // (and still: its answer has finished moving it, so the dust lands exactly where the card will be)
      const rc = el?.getBoundingClientRect(), key = rc ? `${Math.round(rc.left)},${Math.round(rc.top)},${Math.round(rc.width)},${Math.round(rc.height)}` : '';
      // (its words rise into place as it mounts: read them only once every animation inside it has finished)
      const still = !!rc?.height && key === lastKey && !el!.getAnimations({ subtree: true }).some((x) => x.playState === 'running' || x.pending); lastKey = key;
      if (el && !seen) seen = performance.now();
      // (it waits for its answer to finish, then at most 1.5 s for it to settle)
      if (!el || (!still && performance.now() - seen < 1500)) { if (performance.now() - t0 < 15000) { setTimeout(look, 120); return; } formDone(id); return; }
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const pts = shapeOf(el, 6000, talkRef.current?.getBoundingClientRect());
        if (!pts.length || !alive.current) { formDone(id); return; }
        const b0 = el.getBoundingClientRect(); shapeAt.current = { el, x: b0.left, y: b0.top };
        shape.current = { n: shape.current.n + 1, pts }; shaping.current = true;
        formTimer.current = setTimeout(() => formDone(id), 4000); // (never stuck: it appears anyway)
      }));
    };
    look();
  };
  const formTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const formDone = (id: string) => {
    if (formBusy.current !== id) return;
    clearTimeout(formTimer.current);
    setForming((f) => f.filter((x) => x !== id));
    // (the card is there: a moment later the dust lets go and flows home, then the next one)
    setTimeout(() => { shaping.current = false; formBusy.current = null; setTimeout(() => { if (!formBusy.current) shapeAt.current = null; formNext(); }, 1400); }, 550);
  };
  formCards.current = (ids) => {
    if (!dustReady.current || !ids.length) return;
    ids.forEach((x) => formed.current.add(x)); setForming((f) => [...f, ...ids]); formQ.current.push(...ids); formNext();
  };
  const onDustCrisp = (on: boolean) => { if (formBusy.current && shaping.current) { if (on) formDone(formBusy.current); return; } setCrisp(on); };
  // Undo: the card dissolves back into dust (its outline and words, flowing home)
  const dissolve = (id: string) => {
    if (!dustReady.current || formBusy.current) return; // (a card being drawn keeps the dust)
    const el = document.querySelector<HTMLElement>(`[data-card="${id}"]`); const pts = el ? shapeOf(el, 6000, talkRef.current?.getBoundingClientRect()) : null;
    if (!pts?.length) return;
    const b0 = el!.getBoundingClientRect(); shapeAt.current = { el: el!, x: b0.left, y: b0.top };
    shape.current = { n: shape.current.n + 1, pts }; jump.current++;
    setTimeout(() => { if (!formBusy.current) shapeAt.current = null; }, 1800);
  };
  // (the dust stopped drawing, or it was left: every card waiting for it appears at once)
  useEffect(() => { if (dustOk && dustOn) return; formQ.current = []; formBusy.current = null; shaping.current = false; clearTimeout(formTimer.current); setForming([]); }, [dustOk, dustOn]);
  const [crisp, setCrisp] = useState(false);
  const [heard, setHeard] = useState(false); // your voice was heard this visit: the greeting has gone back into the orb
  const dustWanted = liveUi && present;
  useEffect(() => { if (!dustWanted) { setDustOn(false); return; } const id = setTimeout(() => setDustOn(true), calm ? 0 : 120); return () => clearTimeout(id); }, [dustWanted]); // eslint-disable-line
  useEffect(() => { orbHide(dustOn && dustOk, calm); }, [dustOn, dustOk]); // eslint-disable-line
  useEffect(() => () => orbHide(false, true), []);
  const greetRef = useRef<HTMLDivElement>(null);
  const touch = useRef({ hold: null as [number, number] | null, tap: { n: 0, x: 0, y: 0 }, at: [0, 0] as [number, number] });
  // where a finger is on the sphere, in its own units (its middle 0, its edge 1, y up)
  const orbUnits = (e: React.PointerEvent): [number, number] => { const r = handEl.current?.getBoundingClientRect(); if (!r) return [0, 0]; const R = (r.width / 2) * 0.66 || 1; return [(e.clientX - r.left - r.width / 2) / R, -(e.clientY - r.top - r.height / 2) / R]; };
  const dustLive = useRef<DustLive>(null as unknown as DustLive);
  // (what moves is read when the dust draws, through getters, not when the screen renders)
  dustLive.current = {
    on: dustOn, listen: liveActive && phase === 'listening' && !speaking, think: phase === 'processing' && !speaking, speak: speaking, quiet: muted || renewing,
    levels: () => liveRef.current?.levels() ?? null,
    get hold() { return touch.current.hold; }, get press() { return touch.current.hold ? 1 : 0; }, get tap() { return touch.current.tap; },
    get lean(): [number, number] { return [hand.x, hand.y]; }, get beat() { return dustBeat.current; }, get mood() { return dustMood.current; },
    greet: dustOn && liveActive && !chatting && !heard && turns.length === 0, onVoice: () => setHeard(true),
    horizon: liveUi && chatting && !calm,
    textBottom: () => { const box = talkRef.current; const items = box?.querySelectorAll('.exchange'); const last = items?.[items.length - 1] as HTMLElement | undefined;
      if (!box || !last) return 0; const b = box.getBoundingClientRect(); return Math.min(b.bottom, last.getBoundingClientRect().bottom); },
    shift: () => { const a = shapeAt.current; if (!a || !a.el.isConnected) return [0, 0]; const b = a.el.getBoundingClientRect(); return [b.left - a.x, b.top - a.y]; },
    get shape() { return shape.current; }, get shaping() { return shaping.current; }, get jump() { return jump.current; },
  };
  // what it's doing, in a word (the orb says it too, in light): listening, thinking, speaking
  const liveLabel = renewing ? t('Reconnecting…') : muted ? t('Muted') : !liveActive ? '' : speaking ? t('Speaking') : phase === 'processing' ? doing || t('Thinking…') : phase === 'listening' ? t('Listening') : '';
  // the sphere is about to grow or shrink (the .45 s transition below): its canvas holds the big size meanwhile
  const orbSize = big ? 'min(62vw, 250px)' : 96;
  const wasBig = useRef(big);
  useLayoutEffect(() => { if (wasBig.current !== big) { wasBig.current = big; holdOrbSize(Math.min(window.innerWidth * 0.62, 250), 520); } }, [big]);
  // the keyboard overlays the page: the whole screen rides above it, so the box you type in and the Send button stay in sight
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => (rootRef.current ? watchFocus(rootRef.current, (el) => el.closest<HTMLElement>('.hide-scroll')) : undefined), []);
  // (while the screen fades away it keeps its shape: the keyboard leaving used to re-flow it, and the answer jumped down
  // mid-fade)
  const live = useRef(true); live.current = present;
  const padAt = useRef(0);
  const kbPad = useTransform(kb, (v) => (live.current ? (padAt.current = v > 1 ? v + 6 : 0) : padAt.current));
  // a long answer keeps its newest words in view while it streams in — unless you have scrolled up to read
  const talkRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  useEffect(() => {
    const el = talkRef.current; if (!el) return;
    const on = () => { pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 64; };
    el.addEventListener('scroll', on, { passive: true });
    return () => el.removeEventListener('scroll', on);
  }, []);
  const follow = () => {
    const el = talkRef.current;
    if (el && pinned.current && el.scrollHeight > el.clientHeight) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  };
  useLayoutEffect(follow, [last?.done, last?.results.length, turns.length, final]); // eslint-disable-line

  return (
    <motion.div ref={rootRef} className={liveUi ? 'voice live' : 'voice'} style={{ position: 'fixed', inset: 0, zIndex: z, display: 'flex', flexDirection: 'column', paddingBottom: kbPad }} role="dialog" aria-modal="true" aria-label={t('Dictation')}>
      {/* The frost behind builds up gradually with the screen's progress (one blur layer and a tint, fading in with it).
          Nothing above it fades as a whole: a fading parent switched the blur off until the fade ended, then it snapped on. */}
      <Veil e={veilE} z={0} layers={VOICE_VEIL} className="veil-abs" elRef={veilRef} />
      {/* the top of the screen starts in exactly the status bar's colour and fades into the frost: no edge under the bar */}
      <motion.div aria-hidden className="voice-top" data-bar-shown ref={refreshBarOn} style={{ opacity: veilE }} />
      {/* your voice flowing in: a warm light rising from the bottom (where the microphone is) with how loud you are; it pulls
          up into the orb while it thinks and stays low while it speaks (the orb's own light answers then) */}
      {liveUi && <LiveAura session={liveRef} mode={!liveActive || muted ? 'off' : speaking ? 'speak' : phase === 'processing' ? 'think' : 'listen'} />}
      {/* (kept for the whole live visit: when it isn't wanted any more, typing or Live failing, the dust fades out as the
          usual orb fades back in, never a frame with neither) */}
      {liveWanted && <motion.div aria-hidden style={{ position: 'absolute', inset: 0, opacity: contentO, pointerEvents: 'none' }}>
        <Stardust orbEl={handEl} greetEl={greetRef} greet={t('What can I do for you?')} live={dustLive} onCrisp={onDustCrisp} ready={setDustOk} />
      </motion.div>}
      <motion.div ref={contentRef} style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', padding: 'calc(var(--sat) + 12px) 18px 0', opacity: contentO }}>
        <div className="row-flex between">
          {liveUi ? <span /> : <button className="icon-btn press" aria-label={t('Close')} onClick={() => useUI.getState().pop()}><Icon name="close" /></button>}
          <button className="chip press" onClick={() => { toCoach.current = true; useUI.getState().swap(1, 'coach'); }}><Icon name="sparkle" size={15} /> {t('Coach')}</button>
        </div>

        {/* the sphere: big while it listens, it steps up and out of the way once there is something to read */}
        <div
          style={{ order: liveUi && chatting ? 3 : 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginTop: big ? 26 : 6, ...(liveUi && chatting ? { paddingBottom: 10 } : {}), transition: calm ? 'none' : 'margin .45s cubic-bezier(.22,1,.36,1)', ...(liveUi && !chatting ? { flex: 1, marginTop: 6, paddingBottom: 24 } : {}) }}>
          {/* (it glides from the middle to the top when the conversation starts: position by transform, the size as before) */}
          <motion.button layout={calm ? false : 'position'} layoutDependency={chatting} transition={{ layout: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } }} aria-label={listening ? t('Stop and send') : t('Start listening')} onClick={() => { if (dragged.current) { dragged.current = false; return; } tapSphere(); }} disabled={thinking && !liveActive} className="voice-orb"
            // (a finger on it: the dust nearby leans towards it while held; a tap scatters it, and it swirls back)
            onPointerDown={(e) => { orbPress(true); dragged.current = false; hand.down(e); const u = orbUnits(e); touch.current.at = u; touch.current.hold = u; }}
            onPointerMove={(e) => { if (hand.move(e)) { dragged.current = true; touch.current.hold = null; } else if (touch.current.hold) touch.current.hold = orbUnits(e); }}
            onPointerUp={() => { orbPress(false); if (touch.current.hold) { const [x, y] = touch.current.at; touch.current.tap = { n: touch.current.tap.n + 1, x, y }; } touch.current.hold = null; hand.up(); }}
            onPointerCancel={() => { orbPress(false); touch.current.hold = null; hand.up(); }}
            style={{ position: 'relative', borderRadius: 999, touchAction: 'none', width: orbSize, height: orbSize, transition: calm ? 'none' : 'width .45s cubic-bezier(.22,1,.36,1), height .45s cubic-bezier(.22,1,.36,1)' }}>
            {/* its light: a close halo and a soft pool just under it, as if it hovers over glass (gradients only: no blur,
                nothing animated but its fade in) */}
            <span ref={handEl} className="orb-hand" style={{ position: 'absolute', inset: 0 }}>
              <span className="voice-glow" aria-hidden style={{ transition: 'opacity .4s var(--ease-out)', ...(liveUi && chatting && dustOk && !calm ? { opacity: 0 } : {}) }}><SelfGlow /></span>
              <SphereSlot id="voice" priority={10} engage={engage} style={{ position: 'absolute', inset: 0 }} />
            </span>
          </motion.button>
          {/* talking live only says something when it matters (muted, reconnecting); its room is kept, so nothing jumps */}
          {liveUi && <div className="micro" aria-live="polite" style={{ marginTop: 10, minHeight: 14, color: 'var(--ac-text)' }}>
            {/* (each new line fades in over the last: it reads as one voice saying what it does next) */}
            <motion.span key={liveLabel} style={{ display: 'inline-block' }} initial={calm ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, ease: [0.2, 0.7, 0.2, 1] }}>{liveLabel}</motion.span>
          </div>}
          {/* its greeting, written in its dust first; the crisp words fade in over the dust once it has written them, and
              go the moment you start talking (the dust takes them back into the orb). Its room is kept: nothing jumps. */}
          {liveUi && !chatting && dustOk && <div ref={greetRef} className="dust-greet" aria-hidden={turns.length > 0} style={{ opacity: crisp && turns.length === 0 ? 1 : 0, transition: calm ? 'none' : `opacity ${crisp ? '.5s' : '.15s'} var(--ease-out)` }}>
            {t('What can I do for you?')}
          </div>}
        </div>
        {!liveUi && <div style={{ order: 1, textAlign: 'center', marginTop: big ? 14 : 8 }}>
          <div className="micro" aria-live="polite" style={{ color: phase === 'listening' ? 'var(--ac-text)' : undefined }}>{label}</div>
        </div>}
        {/* what the camera sees (it sends a picture a second while this shows) */}
        {camStream && liveActive && (
          <video aria-label={t('Camera')} autoPlay muted playsInline ref={(v) => { if (v && v.srcObject !== camStream) v.srcObject = camStream; }}
            style={{ order: 1, alignSelf: 'center', marginTop: 10, width: 'min(58vw, 220px)', aspectRatio: '3 / 4', objectFit: 'cover', borderRadius: 'var(--r-md)' }} />
        )}

        {/* (room round its content, so the typing box's focus glow is not clipped into hard edges by the scrolling) */}
        <div ref={talkRef} style={{ order: 2, position: 'relative', flex: liveUi && !chatting ? '0 0 0' : 1, minHeight: 0, overflowY: 'auto', margin: '14px -12px 0', padding: '0 12px 26px' }} className="hide-scroll fade-top fade-bottom">
          {/* talking live: one conversation like ChatGPT (Omar, 25 Oct). Your words come in word by word in your bubble as you
              say them; its answer writes in under it; everything of this visit stays, newest at the bottom. */}
          {liveUi && (
            // (the conversation fades in once the orb has glided up and shrunk: a first bubble shown while it was still big
            // sat low and then slid up with it)
            <motion.div className="exchange-list" initial={{ opacity: 0 }} animate={{ opacity: chatting ? 1 : 0 }} transition={calm ? { duration: 0 } : { duration: 0.3, delay: chatting ? 0.4 : 0, ease: [0.2, 0.7, 0.2, 1] }}>
              {shown.map((tu, i) => {
                const newest = i === shown.length - 1;
                const cards = tu.results.length > 0 && (
                  <div className="stack gap12">
                    {tu.results.map((r, k) => (
                      <motion.div key={r.id} data-card={r.id} initial={forming.includes(r.id) ? { opacity: 0 } : { opacity: 0, y: 16 }} animate={{ opacity: forming.includes(r.id) ? 0 : 1, y: 0 }}
                        style={forming.includes(r.id) ? { pointerEvents: 'none' } : undefined}
                        transition={formed.current.has(r.id) ? { duration: 0.45, ease: [0.22, 1, 0.36, 1] } : { ...SEND, delay: 0.06 + k * 0.07 }}>
                        <ActionCard r={r} undone={tu.undone.includes(r.id)} confirmed={tu.confirmed.includes(r.id)}
                          onUndo={() => { haptic('light'); dissolve(r.id); r.undo?.(); markInThread(tu.threadId, r.id, 'undone'); setTurns((all) => all.map((x) => (x.id === tu.id ? { ...x, undone: [...x.undone, r.id] } : x))); }}
                          onConfirm={() => { r.button?.run(); haptic('confirm'); markInThread(tu.threadId, r.id, 'confirmed'); setTurns((all) => all.map((x) => (x.id === tu.id ? { ...x, confirmed: [...x.confirmed, r.id] } : x))); }} />
                      </motion.div>
                    ))}
                  </div>
                );
                return (
                  <div key={tu.id} className="exchange">
                    {/* (once answered, an older sentence is plain text: a long conversation keeps few word layers over the orb) */}
                    {(tu.said || (newest && !tu.done && !tu.reply)) && <div className="said"><LiveSaid text={tu.said} k={`u${i}`} still={tu.done && !newest} ear={newest && !tu.reply && !tu.done && (hearing || !tu.said)} levels={liveLevels} /></div>}
                    {/* (the same component when it stops being the newest: a swap made the answer fade in again) */}
                    {tu.reply.trim() && <div className={tu.cut ? 'live-cut' : undefined}><OrbReply id={tu.id} text={tu.reply} live={!tu.done} onGrow={newest ? follow : () => {}} onDone={() => setWritten(tu.id)} after={cards || null} /></div>}
                    {!tu.reply.trim() && cards}
                  </div>
                );
              })}
            </motion.div>
          )}
          {!liveUi && (<>
          <AnimatePresence initial={false} mode="popLayout">
            {!typing && !showing && (
              // what you are saying, as you say it: each new word settles in; when you stop, it rises away into the conversation
              <motion.div key="live" className="display voice-live" exit={{ opacity: 0, y: -10, transition: { duration: 0.22, ease: [0.4, 0, 1, 1] } }}>
                {final || interim ? <Words text={[final, interim].filter(Boolean).join(' ')} k="live" />
                  : !listening && <span className="voice-hint"><RotatingHint /></span>}
              </motion.div>
            )}
            {/* typing: the whole conversation of this visit stays, oldest first, like a chat (Omar, 25 Oct). Talking live shows
                only the answer now, like Gemini: the screen stays calm (the rest is in the Coach chat). */}
            {typing && turns.slice(0, -1).map((tu) => (
              <div key={`h:${tu.id}`} className="exchange">
                {tu.said && <div className="said">{tu.said}</div>}
                {tu.reply.trim() && <div className="reply calm"><Rich text={tu.reply} id={tu.id} /></div>}
                {tu.results.length > 0 && (
                  <div className="stack gap12">
                    {tu.results.map((r) => (
                      <ActionCard key={r.id} r={r} undone={tu.undone.includes(r.id)} confirmed={tu.confirmed.includes(r.id)}
                        onUndo={() => { r.undo?.(); haptic('light'); markInThread(tu.threadId, r.id, 'undone'); setTurns((all) => all.map((x) => (x.id === tu.id ? { ...x, undone: [...x.undone, r.id] } : x))); }}
                        onConfirm={() => { r.button?.run(); haptic('confirm'); markInThread(tu.threadId, r.id, 'confirmed'); setTurns((all) => all.map((x) => (x.id === tu.id ? { ...x, confirmed: [...x.confirmed, r.id] } : x))); }} />
                    ))}
                  </div>
                )}
              </div>
            ))}
            {showing && (
              <motion.div key={last.id} className="exchange" exit={liveActive || typing ? undefined : { opacity: 0, y: -12, transition: { duration: 0.24, ease: [0.4, 0, 1, 1] } }}>
                {/* (live: your words keep arriving while it answers, so they sit still in their bubble instead of morphing in
                    again with every word) */}
                {last.said && !liveActive && (last.live ? <div className="said">{last.said}</div> : <SaidMorph key={`${last.id}:${last.said}`} text={last.said} onSettled={() => setSettledId(last.id)} />)}
                {(() => {
                  const cards = last.done && last.results.length > 0 && (
                  <div className="stack gap12">
                    {last.results.map((r, i) => (
                      <motion.div key={r.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SEND, delay: 0.06 + i * 0.07 }}>
                        <ActionCard r={r} undone={last.undone.includes(r.id)} confirmed={last.confirmed.includes(r.id)}
                          onUndo={() => { r.undo?.(); haptic('light'); markInThread(last.threadId, r.id, 'undone'); setTurns((all) => all.map((x) => (x.id === last.id ? { ...x, undone: [...x.undone, r.id] } : x))); }}
                          onConfirm={() => { r.button?.run(); haptic('confirm'); markInThread(last.threadId, r.id, 'confirmed'); setTurns((all) => all.map((x) => (x.id === last.id ? { ...x, confirmed: [...x.confirmed, r.id] } : x))); }} />
                      </motion.div>
                    ))}
                    <UndoAll results={last.results} undone={last.undone} confirmed={last.confirmed} fresh
                      onUndo={(ids) => { for (const id of ids) { last.results.find((r) => r.id === id)?.undo?.(); markInThread(last.threadId, id, 'undone'); } setTurns((all) => all.map((x) => (x.id === last.id ? { ...x, undone: [...x.undone, ...ids] } : x))); }} />
                  </div>
                  );
                  // the answer waits until your words have settled into their bubble, then writes in below
                  if (!last.reply || (last.said && settledId !== last.id && !liveActive && !last.live)) return last.reply ? null : cards;
                  return <OrbReply key={last.id} id={last.id} text={last.reply} live={!last.done} onGrow={follow} onDone={() => setWritten(last.id)} after={<>
                    {last.done && last.reply.trim() && (
                      // read it aloud (each word lights up as it is said), or take the question on in the Coach
                      <motion.div className="reply-foot" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SEND, delay: 0.12 }}>
                        <SpeakButton id={last.id} text={last.reply} />
                        <button className="cont-chip press" onClick={() => { stopSpeaking(); toCoach.current = true; useUI.getState().swap(1, 'coach', {}); /* this screen's turns are already in the shared conversation (lib/thread.ts) */ }}>
                          {t('Continue in Coach')} <Icon name="chevR" size={14} sw={2.2} />
                        </button>
                      </motion.div>
                    )}
                    {cards}
                  </>} />;
                })()}
              </motion.div>
            )}
          </AnimatePresence>
          {/* talking live: what you're saying now, under the conversation, before it answers */}
          </>)}
          {err && <div className="plinth-2 small" role="alert" style={{ padding: '12px 14px', marginTop: 16 }}>{err}{(canRetry || ask) && <div style={{ marginTop: 10 }}>{canRetry ? <button className="btn sm press" onClick={retryHear}>{t('Retry transcription')}</button> : <button className="btn sm press" onClick={() => { if (!ask || busy.current) return; haptic('light'); dropFailed(ask.text); act(ask.text, ask.id, ask.spoken); }}><Icon name="repeat" size={14} /> {t('Try again')}</button>}</div>}</div>}
          <AnimatePresence initial={false} mode="popLayout">
          {typing && !thinking && !(showing && last.reply && written !== last.id) && (
            // (it fades in and out instead of appearing and vanishing in one frame; leaving, it stays where it was)
            <motion.div key="type" style={{ paddingTop: 12 }} initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: 0.32, ease: [0.2, 0.7, 0.2, 1] } }}
              exit={{ opacity: 0, pointerEvents: 'none', transition: { duration: 0.2, ease: [0.4, 0, 1, 1] } }}>
              <textarea className="input" style={{ minHeight: 96 }} value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus aria-label={t('Type what you ate or did')}
                placeholder={t('“Log a banana” · “Bench 100 kg for 8, 8 and 6” · “How do I change the theme?”')}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finish(); } }} />
              {!supported && <div className="xs t3" style={{ marginTop: 8 }}>{t('Speech recognition isn’t available in this browser. Type it, or use your keyboard’s microphone key.')} {t('Or add a Groq key in Settings → Voice & AI.')}</div>}
            </motion.div>
          )}
          </AnimatePresence>
        </div>

        <div style={{ order: 4, padding: '0 0 calc(var(--sab) + 18px)' }}>
          {/* Tap to interrupt while it speaks (always there, only faded: nothing under it jumps when the voice starts or stops) */}
          {liveUi && (
            <div style={{ display: 'grid', placeItems: 'center', marginBottom: 10 }}>
              <button className={`chip press interrupt${speaking ? '' : ' off'}`} aria-hidden={!speaking} tabIndex={speaking ? 0 : -1} onClick={() => { liveRef.current?.hush(); haptic('light'); }}>{t('Tap to interrupt')}</button>
            </div>
          )}
          <div className="row-flex" style={{ gap: liveUi ? 28 : 10, alignItems: 'flex-end', justifyContent: liveUi ? 'center' : undefined }}>
            {liveUi && <>
              <button className={`icon-btn press${camStream ? ' on' : ''}`} disabled={!liveActive} aria-label={camStream ? t('Camera off') : t('Camera on')} aria-pressed={!!camStream}
                onClick={async () => { haptic('light'); const s1 = liveRef.current; if (!s1) return; if (camStream) { await s1.setCamera(false); setCamStream(null); } else { const c = await s1.setCamera(true); if (c) setCamStream(c); else setErr(t('The camera couldn’t be opened.')); } }}>
                <Icon name="camera" />
              </button>
              <button className={`icon-btn press${muted ? ' on' : ''}`} disabled={!liveActive} aria-label={muted ? t('Unmute') : t('Mute')} aria-pressed={muted}
                onClick={() => { haptic('light'); const m = !muted; liveRef.current?.setMuted(m); setMuted(m); }}>
                <Icon name={muted ? 'micOff' : 'mic'} />
              </button>
            </>}
            {liveUi ? (
              // ends the conversation and closes, like ChatGPT's ✕ (the old buttons never show in between)
              <button className="icon-btn press" aria-label={t('End')} onClick={() => { haptic('light'); useUI.getState().pop(); }}><Icon name="close" /></button>
            ) : supported && (
              <button className="btn press grow" disabled={thinking} onClick={() => { if (typing) listen(); else { teardown(); go('idle'); setTyping(true); } }}>
                {typing ? <><Icon name="mic" size={18} /> {t('Speak instead')}</> : <><Icon name="edit" size={18} /> {t('Type instead')}</>}
              </button>
            )}
            {!liveUi && <button className="btn primary press grow" disabled={(thinking && !liveActive) || phase === 'requesting' || (typing ? !typed.trim() : false)} onClick={() => (liveActive || listening || typing ? finish() : (haptic('listen'), listen()))}>
              {liveActive && !typing ? t('Stop') : thinking ? t('Working…') : listening ? t('Done speaking') : typing ? t('Send') : showing ? <><Icon name="mic" size={18} /> {t('Say more')}</> : <><Icon name="mic" size={18} /> {t('Speak')}</>}
            </button>}
          </div>        </div>
      </motion.div>
    </motion.div>
  );
}
