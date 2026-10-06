import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion, useTransform } from 'motion/react';
import { useStore, allExercises } from '../state/store';
import { useUI, buzz } from '../state/ui';
import { useVoice } from '../state/voice';
import { useAi } from '../state/ai';
import { useT, useLang } from '../lib/i18n';
import { mic } from '../lib/mic';
import { speechSupported, startSpeech, type SpeechError, type SpeechHandle } from '../lib/speech';
import { getKey } from '../lib/keys';
import { transcribe, buildPrompt, STT_MODEL, SttError } from '../lib/groq';
import { aiErrorText, type Turn } from '../lib/gemini';
import { decide, brainFor } from '../lib/agentTurn';
import { runActions, type AgentResult } from '../lib/agent';
import { dayKey } from '../lib/dates';
import { uid } from '../lib/nutrition';
import { SphereSlot, mirrorOrb, orbPress, orbTap } from '../ui/Sphere';
import { mirrorProgress, useEngage } from '../ui/engage';
import { kb, watchFocus } from '../ui/keyboard';
import { Veil, VOICE_VEIL, mirrorVeil } from '../ui/Veil';
import { setBarFrost } from '../ui/statusBar';
import { Icon } from '../ui/Icon';
import { useOverlayZ } from '../ui/Sheet';
import { ActionCard, RotatingHint, Rich, Words, SpeakButton, prefetchAloud, tidy, sttMessage, cardsNote } from '../ui/agentUi';
import { stopSpeaking } from '../lib/tts';
import { flyLogged } from '../ui/fly';
import { apple, springCurve } from '../ui/motion';

/** One thing you said and what the assistant did about it. `done` once the answer is complete (until then it streams in). */
interface Turn1 { id: string; said: string; reply: string; results: AgentResult[]; undone: string[]; confirmed: string[]; done: boolean }

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
          {words.map((w, i) => <Fragment key={i}><span className="sw" style={{ ['--i' as string]: Math.min(i, 18) }}>{w}</span>{i < words.length - 1 ? ' ' : ''}</Fragment>)}
        </div>
      )}
    </div>
  );
}

export function VoiceComposer({ props }: { props: { mode?: 'food' | 'workout'; date?: string; mealId?: string } }) {
  const t = useT();
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
  const phase = useVoice((v) => v.phase);
  const hasGroq = useAi((a) => a.hasGroq);
  const engine: 'groq' | 'browser' | 'typed' = hasGroq && recorderOk() ? 'groq' : speechSupported() ? 'browser' : 'typed';
  const supported = engine !== 'typed';
  const [typing, setTyping] = useState(!supported);
  const [typed, setTyped] = useState('');
  const [settledId, setSettledId] = useState<string | null>(null); // the exchange whose words have settled into their bubble
  const [final, setFinal] = useState('');
  const [interim, setInterim] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  const [turns, setTurns] = useState<Turn1[]>([]);
  const turnsRef = useRef<Turn1[]>([]); turnsRef.current = turns;
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
  const sttPrompt = () => {
    const st = useStore.getState();
    const foods = [...new Set([...st.entries].sort((a, b) => b.at - a.at).map((e) => e.snap.name))].slice(0, 25);
    const lifts = [...new Set(st.sessions.slice(-6).flatMap((x) => x.exercises.map((e) => pool.find((q) => q.id === e.exerciseId)?.name ?? '')))].filter(Boolean);
    return buildPrompt([...lifts, ...foods].slice(0, 40));
  };
  const go = (p: Parameters<ReturnType<typeof useVoice.getState>['go']>[0]) => useVoice.getState().go(p);

  const teardown = useCallback(() => {
    run.current++;
    handle.current?.abort(); handle.current = null;
    mic.release('voice');
    useVoice.getState().set({ micLive: false });
  }, []);

  useEffect(() => {
    alive.current = true;
    const unsub = mic.subscribe(() => useVoice.getState().set({ micLive: mic.active }));
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !(e.target as HTMLElement)?.closest?.('textarea')) useUI.getState().pop(); };
    window.addEventListener('keydown', onKey);
    return () => { alive.current = false; unsub(); window.removeEventListener('keydown', onKey); ctl.current?.abort(); stopSpeaking(); teardown(); go('idle'); };
    // eslint-disable-next-line
  }, [teardown]);

  // ── listening ──
  const listen = useCallback(async () => {
    if (busy.current) return;
    stopSpeaking();
    setErr(null); setFinal(''); setInterim(''); setCanRetry(false); blobRef.current = null; pinned.current = true;
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
  }, [supported, engine, lang]);

  // opened → listen straight away
  useEffect(() => { if (supported) listen(); /* eslint-disable-next-line */ }, []);

  // Groq: stop by itself once you have spoken and gone quiet for 0.9 s (or after 40 s). While you speak the orb answers your
  // voice; your words appear, sent, the moment you stop. (Live words while speaking were tried — quick Groq looks every ~1.2 s —
  // and dropped: they arrived late and a one-second clip was often misheard, which read as broken.)
  useEffect(() => {
    if (phase !== 'listening' || engine !== 'groq') return;
    let heard = 0, quiet = 0; const t0 = performance.now();
    const id = setInterval(() => {
      const lv = mic.level();
      if (lv > 0.16) { heard += 80; quiet = 0; } else if (lv < 0.09) quiet += 80;
      if ((heard >= 240 && quiet >= 900) || performance.now() - t0 > 40000) { clearInterval(id); finishRef.current(); }
    }, 80);
    return () => clearInterval(id);
  }, [phase, engine]);

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

  /** The conversation so far, for the model (what was done becomes a one-line note). */
  const history = (): Turn[] => {
    const out: Turn[] = [];
    for (const x of turnsRef.current.filter((y) => y.done).slice(-6)) {
      out.push({ role: 'user', parts: [{ text: x.said }] });
      const done = cardsNote(x.results, x.confirmed, x.undone, false);
      const said = [x.reply, done].filter(Boolean).join('\n');
      if (said) out.push({ role: 'model', parts: [{ text: said }] });
    }
    return out;
  };

  /** Understand what was said, do it, show it. */
  const act = async (text: string, id: string) => {
    busy.current = true;
    setErr(null); go('processing');
    ctl.current = new AbortController();
    const signal = ctl.current.signal;
    const kill = setTimeout(() => ctl.current?.abort(), 30_000);
    try {
      const where = props.mode === 'workout' && useStore.getState().active ? 'The user is in their running workout: sets go into it.'
        : props.mealId || props.date ? `The user came from the Food tab${props.date ? ` (day ${props.date})` : ''}${props.mealId ? `, meal ${props.mealId}` : ''}: foods go there unless they say otherwise.`
        : 'The user tapped the orb on the main screen and spoke to it.';
      // the orb screen is spoken to, often mid-workout: one or two short sentences, not an article (the Coach chat keeps longer answers)
      const brief = ' They are speaking to the orb screen, probably mid-workout: answer in 1–2 short sentences (about 35 words), plain text, no bullet lists or headings — this overrides the usual reply length. If the question really needs more (a plan, a breakdown), give just the short answer: a “Continue in Coach” button sits under it, so never tell them to open the Coach.';
      // the answer streams in word by word as the model writes it (Gemini), under what you said
      const d = await decide(text, { lang, t, pool, history: history(), where: where + brief, signal, surface: 'orb', onReply: (r) => { if (alive.current) patch(id, { reply: r }); } });
      let reply = d.reply;
      if (d.wantsUndo) {
        const last = [...turnsRef.current].reverse().find((x) => x.results.some((r) => r.undo && !x.undone.includes(r.id) && !r.pending));
        if (last) { const r = [...last.results].reverse().find((x) => x.undo && !last.undone.includes(x.id) && !x.pending)!; r.undo!(); setTurns((all) => all.map((x) => (x.id === last.id ? { ...x, undone: [...x.undone, r.id] } : x))); }
        if (!d.actions.length && !reply) reply = t('Undone.');
      }
      const st = useStore.getState();
      const today = dayKey(Date.now(), st.settings.dayStartHour);
      const results = d.actions.length ? await runActions(d.actions, { t, lang, today, brain: brainFor({ big: false, surface: 'orb', signal }), date: props.date, mealId: props.mealId }) : [];
      if (!alive.current) return;
      const said = [reply, d.note].filter(Boolean).join('\n\n');
      patch(id, { reply: said, results, done: true });
      // green "Done" only when something was actually logged or changed; a plain answer just settles
      const acted = d.wantsUndo || results.some((r) => r.kind !== 'miss' && r.kind !== 'nav');
      if (acted) { buzz([12, 40, 18] as any); go('confirmed'); } else go('idle');
      if (said.trim()) prefetchAloud(said); // read aloud only when you tap play
      // a quick log and nothing to read: show it for a moment, then step aside with an Undo toast
      const quick = results.length > 0 && results.every((r) => ['food', 'sets', 'water', 'weight', 'activity'].includes(r.kind) && !r.pending);
      if (quick && !reply.trim()) {
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
      patch(id, { done: true });
      if (e?.code !== 'aborted') { setErr(aiErrorText(e, t)); go('error'); } else go('idle');
    } finally { clearTimeout(kill); busy.current = false; }
  };

  const finish = async () => {
    if (busy.current) return;
    const p = useVoice.getState().phase;
    // still starting the microphone (Samsung Browser can take a second): a tap here is not "stop" — stopping a start that
    // hasn't finished used to end in "Didn't catch anything" followed by a false "microphone in use"
    if (p === 'processing' || (p === 'requesting' && !typing)) return;
    if (typing) { const text = typed.trim(); if (!text) return; setTyped(''); act(text, openTurn(text)); return; }
    if (engine === 'groq' && mic.recording) {
      busy.current = true;
      // the exchange opens at once (the orb steps up, thinking); what you said rises in as a sent bubble when it is transcribed
      const id = openTurn('');
      go('processing');
      const blob = await mic.stopRecording(); mic.release('voice');
      busy.current = false;
      const heard = await hear(blob);
      if (!alive.current) return;
      if (heard) { patch(id, { said: heard }); act(heard, id); } else drop(id);
      return;
    }
    const text = [latest.current.final, latest.current.interim].filter(Boolean).join(' ').trim();
    run.current++; // anything still starting belongs to this attempt and is now abandoned, quietly
    handle.current?.stop(); handle.current = null; mic.release('voice');
    if (!text) { go('idle'); setErr(t('Didn’t catch anything. Tap the sphere to try again, or type it.')); return; }
    setInterim(''); setFinal('');
    act(text, openTurn(text));
  };
  finishRef.current = finish;

  const retryHear = async () => {
    const b = blobRef.current; if (!b) return;
    setErr(null); setCanRetry(false); go('processing');
    const id = openTurn('');
    const text = await hear(b);
    if (text) { patch(id, { said: text }); act(text, id); } else drop(id);
  };

  const listening = phase === 'listening' || phase === 'requesting';
  const thinking = phase === 'processing';
  const last = turns[turns.length - 1];
  const showing = !!last && !listening;
  const label = ({
    idle: showing ? '' : t('Tap the sphere and speak'), requesting: t('Starting the microphone…'), // with an answer up, the Say more button says it
    listening: engine === 'groq' ? t('Listening') : mic.active ? t('Listening') : t('Listening (no level meter)'),
    processing: t('Thinking…'), confirmed: t('Done'), error: t('Couldn’t do that'), unavailable: t('Microphone unavailable'),
    review: t('Done'),
  } as Record<string, string>)[phase] ?? '';
  // tapping while the microphone is still starting cancels that start cleanly (teardown also invalidates the pending start, so
  // it can never come back later as a false "microphone in use")
  const tapSphere = () => { if (phase === 'requesting') { teardown(); go('idle'); return; } buzz(10); orbTap(0.6); if (listening) finish(); else if (!thinking) listen(); };
  const big = !showing && !thinking && !typing; // typing: the orb steps up and the box gets the room
  // the keyboard overlays the page: the whole screen rides above it, so the box you type in and the Send button stay in sight
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => (rootRef.current ? watchFocus(rootRef.current, (el) => el.closest<HTMLElement>('.hide-scroll')) : undefined), []);
  const kbPad = useTransform(kb, (v) => (v > 1 ? v + 6 : 0));
  // a long answer keeps its newest words in view while it streams in — unless you have scrolled up to read
  const talkRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  useEffect(() => {
    const el = talkRef.current; if (!el) return;
    const on = () => { pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 64; };
    el.addEventListener('scroll', on, { passive: true });
    return () => el.removeEventListener('scroll', on);
  }, []);
  useLayoutEffect(() => {
    const el = talkRef.current;
    if (el && pinned.current && last && el.scrollHeight > el.clientHeight) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [last?.reply, last?.done, last?.results.length]); // eslint-disable-line

  return (
    <motion.div ref={rootRef} className="voice" style={{ position: 'fixed', inset: 0, zIndex: z, display: 'flex', flexDirection: 'column', paddingBottom: kbPad }} role="dialog" aria-modal="true" aria-label={t('Dictation')}>
      {/* The frost behind builds up gradually with the screen's progress (one blur layer and a tint, fading in with it).
          Nothing above it fades as a whole: a fading parent switched the blur off until the fade ended, then it snapped on. */}
      <Veil e={veilE} z={0} layers={VOICE_VEIL} className="veil-abs" elRef={veilRef} />
      {/* the top of the screen starts in exactly the status bar's colour and fades into the frost: no edge under the bar */}
      <motion.div aria-hidden className="voice-top" style={{ opacity: veilE }} />
      <motion.div ref={contentRef} style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', padding: 'calc(var(--sat) + 12px) 18px 0', opacity: contentO }}>
        <div className="row-flex between">
          <button className="icon-btn press" aria-label={t('Close')} onClick={() => useUI.getState().pop()}><Icon name="close" /></button>
          <button className="chip press" onClick={() => { toCoach.current = true; useUI.getState().swap(1, 'coach'); }}><Icon name="sparkle" size={15} /> {t('Coach')}</button>
        </div>

        {/* the sphere: big while it listens, it steps up and out of the way once there is something to read */}
        <div style={{ display: 'grid', placeItems: 'center', marginTop: big ? 26 : 6, transition: 'margin .45s cubic-bezier(.22,1,.36,1)' }}>
          <button aria-label={listening ? t('Stop and send') : t('Start listening')} onClick={tapSphere} disabled={thinking} className="voice-orb" onPointerDown={() => orbPress(true)} onPointerUp={() => orbPress(false)} onPointerCancel={() => orbPress(false)} onPointerLeave={() => orbPress(false)}
            style={{ position: 'relative', borderRadius: 999, width: big ? 'min(62vw, 250px)' : 96, height: big ? 'min(62vw, 250px)' : 96, transition: 'width .45s cubic-bezier(.22,1,.36,1), height .45s cubic-bezier(.22,1,.36,1)' }}>
            <SphereSlot id="voice" priority={10} engage={engage} style={{ position: 'absolute', inset: 0 }} />
          </button>
        </div>
        <div style={{ textAlign: 'center', marginTop: big ? 14 : 8 }}>
          <div className="micro" aria-live="polite" style={{ color: phase === 'listening' ? 'var(--ac-text)' : undefined }}>{label}</div>
        </div>

        <div ref={talkRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', marginTop: 14, paddingBottom: 12 }} className="hide-scroll">
          <AnimatePresence initial={false} mode="popLayout">
            {!typing && !showing && (
              // what you are saying, as you say it: each new word settles in; when you stop, it rises away into the conversation
              <motion.div key="live" className="display voice-live" exit={{ opacity: 0, y: -10, filter: 'blur(5px)', transition: { duration: 0.22, ease: [0.4, 0, 1, 1] } }}>
                {final || interim ? <Words text={[final, interim].filter(Boolean).join(' ')} k="live" />
                  : !listening && <span className="voice-hint"><RotatingHint /></span>}
              </motion.div>
            )}
            {showing && (
              <motion.div key={last.id} className="exchange" exit={{ opacity: 0, y: -12, filter: 'blur(6px)', transition: { duration: 0.24, ease: [0.4, 0, 1, 1] } }}>
                {last.said && <SaidMorph key={`${last.id}:${last.said}`} text={last.said} onSettled={() => setSettledId(last.id)} />}
                {/* the answer waits until your words have settled into their bubble, then writes in below */}
                {last.reply && (settledId === last.id || !last.said) && <div className="reply calm" aria-live="polite"><Rich text={last.done ? last.reply : tidy(last.reply)} id={last.id} /></div>}
                {last.done && last.reply.trim() && (settledId === last.id || !last.said) && (
                  // read it aloud (each word lights up as it is said), or take the question on in the Coach
                  <motion.div className="reply-foot" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SEND, delay: 0.12 }}>
                    <SpeakButton id={last.id} text={last.reply} />
                    <button className="cont-chip press" onClick={() => { buzz(6); stopSpeaking(); toCoach.current = true; useUI.getState().swap(1, 'coach', { seed: turnsRef.current.filter((x) => x.done && (x.said || x.reply)).slice(-4).map((x) => ({ said: x.said, reply: x.reply })) }); }}>
                      {t('Continue in Coach')} <Icon name="chevR" size={14} sw={2.2} />
                    </button>
                  </motion.div>
                )}
                {last.done && last.results.length > 0 && (
                  <div className="stack gap12">
                    {last.results.map((r, i) => (
                      <motion.div key={r.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SEND, delay: 0.06 + i * 0.07 }}>
                        <ActionCard r={r} undone={last.undone.includes(r.id)} confirmed={last.confirmed.includes(r.id)}
                          onUndo={() => { r.undo?.(); buzz(8); setTurns((all) => all.map((x) => (x.id === last.id ? { ...x, undone: [...x.undone, r.id] } : x))); }}
                          onConfirm={() => { r.button?.run(); buzz(14); setTurns((all) => all.map((x) => (x.id === last.id ? { ...x, confirmed: [...x.confirmed, r.id] } : x))); }} />
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
          {err && <div className="plinth-2 small" role="alert" style={{ padding: '12px 14px', marginTop: 16 }}>{err}{canRetry && <div style={{ marginTop: 10 }}><button className="btn sm press" onClick={retryHear}>{t('Retry transcription')}</button></div>}</div>}
          {typing && !thinking && (
            <div style={{ marginTop: 12 }}>
              <textarea className="input" style={{ minHeight: 96 }} value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus aria-label={t('Type what you ate or did')}
                placeholder={t('“Log a banana” · “Bench 100 kg for 8, 8 and 6” · “How do I change the theme?”')}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finish(); } }} />
              {!supported && <div className="xs t3" style={{ marginTop: 8 }}>{t('Speech recognition isn’t available in this browser. Type it, or use your keyboard’s microphone key.')} {t('Or add a Groq key in Settings → Voice & AI.')}</div>}
            </div>
          )}
        </div>

        <div style={{ padding: '10px 0 calc(var(--sab) + 18px)' }}>
          <div className="row-flex" style={{ gap: 10 }}>
            {supported && (
              <button className="btn press grow" disabled={thinking} onClick={() => { if (typing) listen(); else { teardown(); go('idle'); setTyping(true); } }}>
                {typing ? <><Icon name="mic" size={18} /> {t('Speak instead')}</> : <><Icon name="edit" size={18} /> {t('Type instead')}</>}
              </button>
            )}
            <button className="btn primary press grow" disabled={thinking || phase === 'requesting' || (typing ? !typed.trim() : false)} onClick={() => (listening || typing ? finish() : listen())}>
              {thinking ? t('Working…') : listening ? t('Done speaking') : typing ? t('Send') : showing ? <><Icon name="mic" size={18} /> {t('Say more')}</> : <><Icon name="mic" size={18} /> {t('Speak')}</>}
            </button>
          </div>        </div>
      </motion.div>
    </motion.div>
  );
}
