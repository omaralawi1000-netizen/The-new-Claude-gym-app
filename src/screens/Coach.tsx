import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { useStore, allExercises } from '../state/store';
import { useUI, buzz } from '../state/ui';
import { useAi } from '../state/ai';
import { useT, useLang } from '../lib/i18n';
import { Sheet, SheetHead, SOFT } from '../ui/Sheet';
import { Icon } from '../ui/Icon';
import { SphereSlot } from '../ui/Sphere';
import { useVoice } from '../state/voice';
import { mic } from '../lib/mic';
import { getKey } from '../lib/keys';
import { transcribe, buildPrompt, STT_MODEL, SttError } from '../lib/groq';
import { AiError, FALLBACK_MODELS, aiAgent, aiErrorText, aiRoutine, type Turn } from '../lib/gemini';
import { speak, stopSpeaking, onSpeaking, FALLBACK_TTS } from '../lib/tts';
import { AGENT_SYSTEM, APP_GUIDE, buildAgentContext, exerciseNames, mapRoutineItems, profileLine } from '../lib/coachContext';
import { localActions, runActions, validateAgent, type AgentAction, type AgentResult } from '../lib/agent';
import { mealName } from '../lib/derive';
import type { RoutineDraft } from '../lib/aiValidate';
import { uid } from '../lib/nutrition';
import { dayKey } from '../lib/dates';
import type { Routine } from '../lib/types';

type Msg =
  | { id: string; role: 'user' | 'model'; text: string; streaming?: boolean }
  | { id: string; role: 'error'; text: string }
  | { id: string; role: 'action'; results: AgentResult[]; undone: string[]; confirmed: string[] }
  | { id: string; role: 'routine'; draft: RoutineDraft; items: Routine['items']; skipped: string[]; saved?: string };

/**
 * Minimal, safe rendering of the model's text: paragraphs, "- " bullets, **bold**. No HTML is ever injected.
 * Every word is its own span keyed by position, so while a reply streams in only the NEW words mount — and each one
 * blurs in (CSS .w). Words already on screen never re-animate.
 */
function Words({ text, k }: { text: string; k: string }) {
  const parts = text.split(/(\s+)/);
  // words that arrive together cascade one after another; a word keeps the delay it was born with
  const born = useRef<Record<number, number>>({});
  const seen = useRef(0);
  const first = seen.current;
  useEffect(() => { seen.current = parts.length; });
  return <>{parts.map((w, i) => {
    if (/^\s+$/.test(w) || !w) return w || null;
    if (born.current[i] === undefined) born.current[i] = Math.min(520, Math.max(0, (i - first) / 2) * 34);
    return <span key={`${k}-${i}`} className="w" style={{ animationDelay: `${born.current[i]}ms` }}>{w}</span>;
  })}</>;
}
function Rich({ text }: { text: string }) {
  const lines = text.split('\n');
  const bold = (s: string, k: string) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <b key={i}><Words text={p.slice(2, -2)} k={`${k}b${i}`} /></b> : <Words key={i} text={p} k={`${k}t${i}`} />));
  return <>{lines.map((l, i) => {
    const m = l.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)$/);
    if (m) return <div key={i} style={{ display: 'flex', gap: 8, marginTop: 4 }}><span aria-hidden className="w" style={{ color: 'var(--tx3)' }}>•</span><span>{bold(m[1], `l${i}`)}</span></div>;
    return l.trim() ? <div key={i} style={{ marginTop: i ? 8 : 0 }}>{bold(l, `l${i}`)}</div> : null;
  })}</>;
}

/** While the Coach thinks: three lines of light sweep across, then the real words ink in where they were. */
function Thinking() {
  return <div className="thinking" aria-label="…">{[92, 78, 52].map((w, i) => <i key={i} style={{ width: `${w}%`, animationDelay: `${i * 160}ms, ${i * 70}ms` }} />)}</div>;
}



/** Why speech-to-text failed, in words (never a stack trace). */
function sttMessage(code: string, t: (k: string) => string): string {
  return ({
    nokey: t('Add your Groq key in Settings → Voice & AI.'), offline: t('You’re offline, so nothing was sent. Type it instead.'),
    network: t('Couldn’t reach Groq. Try again, or type it.'), timeout: t('Groq took too long. Try again, or type it.'),
    badkey: t('Groq rejected the key. Check it in Settings → Voice & AI.'), busy: t('Groq is rate-limiting right now. Wait a moment, then try again.'),
  } as Record<string, string>)[code] ?? t('Groq couldn’t transcribe that. Try again, or type it.');
}

/** What the Coach just did, as a card: what was logged, one tap to undo — or the question it is waiting on. */
function ActionCard({ r, undone, confirmed, onUndo, onConfirm }: { r: AgentResult; undone: boolean; confirmed: boolean; onUndo: () => void; onConfirm: () => void }) {
  const t = useT();
  const miss = r.kind === 'miss';
  return (
    <div className={`plinth action-card ${undone ? 'undone' : ''} ${miss ? 'miss' : ''}`} style={{ padding: '12px 14px 12px 12px' }}>
      <div className="row-flex" style={{ gap: 10, alignItems: 'flex-start' }}>
        <span className="action-ic" aria-hidden><Icon name={miss ? 'info' : r.pending && !confirmed ? 'info' : 'check'} size={16} sw={2.4} /></span>
        <div className="grow">
          <div className="small" style={{ fontWeight: 650 }}>{undone ? t('Undone') : confirmed ? t('Done') : r.title}</div>
          {r.lines.length > 0 && (
            <div style={{ marginTop: 6 }}>
              {r.lines.map((l, i) => (
                <div key={i} className="action-line row-flex between" style={{ gap: 10, padding: '5px 0', borderTop: i ? '1px solid var(--line)' : 'none', animationDelay: `${120 + i * 70}ms` }}>
                  <span className="small trunc" style={{ color: l.warn ? 'var(--warn)' : 'var(--tx)' }}>{l.text}</span>
                  {l.sub && <span className="xs t2 num" style={{ textAlign: 'right', flex: 'none', maxWidth: '62%' }}>{l.sub}</span>}
                </div>
              ))}
            </div>
          )}
          {!undone && !confirmed && (r.button || r.undo) && (
            <div className="row-flex" style={{ gap: 8, marginTop: 10 }}>
              {r.button && <button className={`btn sm press ${r.pending ? 'primary' : ''}`} onClick={r.pending ? onConfirm : r.button.run}>{r.button.label}</button>}
              {r.undo && !r.pending && <button className="btn sm ghost press" onClick={onUndo}><Icon name="undo" size={15} /> {t('Undo')}</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function Coach({ props }: { props: { listen?: boolean; date?: string; mealId?: string } }) {
  const t = useT();
  const lang = useLang();
  const pop = useUI((u) => u.pop);
  const push = useUI((u) => u.push);
  const toast = useUI((u) => u.toast);
  const ai = useAi();
  const s = useStore();
  const pool = useMemo(() => allExercises(s.exercises), [s.exercises]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [routineMode, setRoutineMode] = useState(false);
  const [recording, setRecording] = useState(false);
  const [hearing, setHearing] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const ctl = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  const msgsRef = useRef<Msg[]>([]); msgsRef.current = msgs;

  useEffect(() => { alive.current = true; const off = onSpeaking(setSpeaking); return () => { alive.current = false; off(); stopSpeaking(); ctl.current?.abort(); mic.release('coach'); }; }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [msgs]);

  const models = useCallback((brain: boolean) => {
    const m = useAi.getState().models;
    return [...new Set((brain ? [m.brain || FALLBACK_MODELS.brain, m.brainAlt, m.fast || FALLBACK_MODELS.fast] : [m.fast || FALLBACK_MODELS.fast, m.fastAlt, m.brain || FALLBACK_MODELS.brain]).filter(Boolean))];
  }, []);

  const say = (m: Msg) => setMsgs((x) => [...x, m]);
  const orb = (p: 'idle' | 'listening' | 'processing' | 'confirmed' | 'error') => useVoice.getState().go(p);
  useEffect(() => () => { if (useVoice.getState().phase !== 'idle') useVoice.getState().go('idle'); }, []);

  const inputRef = useRef<HTMLInputElement>(null);
  const autoClose = useRef(!!props.listen); // a command spoken from the orb slips away once it has been done
  const recRef = useRef<() => void>(() => {});

  /** The conversation so far as the model sees it (cards become a one-line note of what was done). */
  const turnsFor = (text: string): Turn[] => {
    const out: Turn[] = [];
    const push = (role: 'user' | 'model', t: string) => { if (!t.trim()) return; const last = out[out.length - 1]; if (last && last.role === role) last.parts[0].text += `\n${t}`; else out.push({ role, parts: [{ text: t }] }); };
    for (const m of msgsRef.current) {
      if (m.role === 'user' || m.role === 'model') push(m.role, m.text);
      else if (m.role === 'action') push('model', `(done: ${m.results.map((r) => `${r.title}${r.lines.length ? ` — ${r.lines.map((l) => `${l.text}${l.sub ? ` ${l.sub}` : ''}`).join(', ')}` : ''}`).join(' | ')})`);
    }
    push('user', text);
    const tail = out.slice(-14);
    return tail[0]?.role === 'model' ? tail.slice(1) : tail;
  };

  const undoLast = () => {
    for (let i = msgsRef.current.length - 1; i >= 0; i--) {
      const m = msgsRef.current[i];
      if (m.role !== 'action') continue;
      const r = [...m.results].reverse().find((x) => x.undo && !m.undone.includes(x.id) && !x.pending);
      if (r) { r.undo!(); setMsgs((x) => x.map((y) => (y.id === m.id && y.role === 'action' ? { ...y, undone: [...y.undone, r.id] } : y))); return; }
    }
  };

  /** One turn: the model (or, without Gemini, the local reader) says what to do; we do it; the cards show it. */
  const agentTurn = async (text: string, signal: AbortSignal) => {
    const st = useStore.getState();
    const g = useAi.getState();
    const today = dayKey(Date.now(), st.settings.dayStartHour);
    const names = new Map(pool.map((e) => [e.id, e.name]));
    const mealLabel = (id: string) => { const m = st.settings.meals.find((x) => x.id === id); return m ? mealName(m, lang) : id; };
    const placeholder = uid('m');
    say({ id: placeholder, role: 'model', text: '', streaming: true });
    let reply = '', note = '';
    let actions: AgentAction[] = [];
    if (g.hasGemini) {
      try {
        const where = props.mealId || props.date ? `The user opened this from the Food tab${props.date ? ` (day ${props.date})` : ''}${props.mealId ? `, meal ${props.mealId}` : ''}: foods go there unless they say otherwise.` : 'The user opened this from the main screen.';
        const system = `${AGENT_SYSTEM(lang)}\n\nGUIDE:\n${APP_GUIDE}\n\nWHERE THE USER IS: ${where}\n\nEXERCISE CATALOG (use these exact names): ${exerciseNames(pool).join(', ')}\n\nDATA (computed on this device just now):\n${buildAgentContext(st, today, (id) => names.get(id) ?? id, mealLabel)}`;
        const raw = await aiAgent(system, turnsFor(text), { key: getKey('gemini'), models: models(true), signal });
        const v = validateAgent(raw);
        if (!v) throw new AiError('invalid');
        reply = v.reply; actions = v.actions;
      } catch (e: any) {
        if (e?.code === 'aborted') throw e;
        const local = localActions(text);
        if (!local) throw e;
        actions = local; note = t('Gemini wasn’t available, so I used the built-in reader.');
      }
    } else {
      const local = localActions(text);
      if (local) actions = local;
      else reply = t('To chat or ask about the app I need a Gemini key (Settings → Voice & AI). I can still log what you tell me, like “200 g skyr” or “bench 80 for 8”.');
    }
    if (actions.some((a) => a.type === 'undo_last')) { undoLast(); actions = actions.filter((a) => a.type !== 'undo_last'); if (!actions.length && !reply) reply = t('Undone.'); }
    const results = actions.length ? await runActions(actions, { t, lang, today, brain: g.hasGemini ? { key: getKey('gemini'), models: models(false), signal } : null, date: props.date, mealId: props.mealId }) : [];
    if (!alive.current) return;
    const said = [reply, note].filter(Boolean).join('\n\n');
    setMsgs((x) => {
      const base = x.filter((m) => m.id !== placeholder);
      const add: Msg[] = [];
      if (results.length) add.push({ id: uid('m'), role: 'action', results, undone: [], confirmed: [] });
      if (said) add.push({ id: uid('m'), role: 'model', text: said });
      return [...base, ...add];
    });
    if (results.some((r) => r.kind !== 'miss' && r.kind !== 'nav')) buzz([12, 40, 18] as any);
    if (reply && useAi.getState().speak) speakOut(reply);
    orb('confirmed'); setTimeout(() => { if (useVoice.getState().phase === 'confirmed') orb('idle'); }, 1200);
    // said out loud from the orb and nothing to read: show the result for a moment, then step aside with an Undo toast
    const quick = results.length > 0 && results.every((r) => ['food', 'sets', 'water', 'weight', 'activity'].includes(r.kind) && !r.pending);
    if (autoClose.current && quick && !reply.trim()) {
      autoClose.current = false;
      setTimeout(() => {
        if (!alive.current) return;
        const undoable = results.filter((r) => r.undo);
        useUI.getState().toast(results.map((r) => r.title).join(' · '), { tone: 'ok', actionLabel: undoable.length ? t('Undo') : undefined, onAction: () => undoable.forEach((r) => r.undo!()) });
        pop();
      }, 1700);
    } else autoClose.current = false;
  };

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || busy) return;
    setInput(''); setBusy(true); stopSpeaking(); orb('processing');
    const key = getKey('gemini');
    const wasRoutine = routineMode; setRoutineMode(false);
    say({ id: uid('m'), role: 'user', text });
    ctl.current = new AbortController();
    const signal = ctl.current.signal;
    try {
      if (wasRoutine) {
        const draft = await aiRoutine(text, { key, models: models(true), signal }, { exercises: exerciseNames(pool), profile: profileLine(useStore.getState()), lang });
        const { items, skipped } = mapRoutineItems(draft, pool, () => uid('ri'));
        if (items.length < 2) throw Object.assign(new Error('few'), { few: true });
        say({ id: uid('m'), role: 'routine', draft, items, skipped });
      } else {
        await agentTurn(text, signal);
      }
    } catch (e: any) {
      if (!alive.current) return;
      const stopped = e?.code === 'aborted';
      setMsgs((x) => {
        const last = x[x.length - 1];
        const base = last && last.role === 'model' && last.streaming ? (last.text.trim() ? x.map((m, i) => (i === x.length - 1 ? { ...m, streaming: false } as Msg : m)) : x.slice(0, -1)) : x;
        return stopped ? base : [...base, { id: uid('m'), role: 'error', text: e?.few ? t('That didn’t produce a usable routine from the exercises you have. Try describing it differently.') : aiErrorText(e, t) }];
      });
    } finally { if (alive.current) setBusy(false); if (['processing', 'listening'].includes(useVoice.getState().phase)) orb('idle'); }
  };

  const speakOut = async (text: string) => {
    try { const m = useAi.getState(); await speak(text, { key: getKey('gemini'), models: [m.models.tts || FALLBACK_TTS], voice: m.voice }); }
    catch (e) { if (alive.current) say({ id: uid('m'), role: 'error', text: `${t('Couldn’t speak that.')} ${aiErrorText(e, t)}` }); }
  };

  // ── voice input through Groq (same single-owner mic as dictation) ──
  const toggleRec = async () => {
    if (busy || hearing) return;
    if (recording) {
      setRecording(false); setHearing(true); orb('processing');
      const blob = await mic.stopRecording(); mic.release('coach');
      try {
        if (!blob) throw new SttError('failed');
        const st = useAi.getState();
        const out = (await transcribe(blob, { key: getKey('groq'), model: STT_MODEL[st.stt], language: st.voiceLang === 'auto' ? 'auto' : st.voiceLang, prompt: buildPrompt([]) })).trim();
        if (!alive.current) return;
        if (out) send(out); else say({ id: uid('m'), role: 'error', text: t('Didn’t catch anything. Try again.') });
      } catch (e) { if (alive.current) say({ id: uid('m'), role: 'error', text: sttMessage(e instanceof SttError ? e.code : 'failed', t) }); }
      finally { if (alive.current) setHearing(false); }
      return;
    }
    stopSpeaking();
    const r = await mic.acquire('coach');
    if (!r.ok || !mic.startRecording('coach')) { mic.release('coach'); say({ id: uid('m'), role: 'error', text: r.ok ? t('This browser can’t record audio.') : t('The microphone isn’t available. Check the permission, or type.') }); return; }
    setRecording(true); orb('listening');
  };

  recRef.current = toggleRec;
  // opened from the orb: start listening straight away (or, without speech-to-text, open the keyboard)
  useEffect(() => {
    if (!props.listen) return;
    const id = setTimeout(() => { if (!alive.current) return; if (useAi.getState().hasGroq && mic.supported) recRef.current(); else inputRef.current?.focus(); }, 420);
    return () => clearTimeout(id);
    // eslint-disable-next-line
  }, []);
  // stop by itself once you have spoken and gone quiet
  useEffect(() => {
    if (!recording) return;
    let heard = 0, quiet = 0; const t0 = performance.now();
    const id = setInterval(() => {
      const lv = mic.level();
      if (lv > 0.16) { heard += 80; quiet = 0; } else if (lv < 0.09) quiet += 80;
      if ((heard >= 240 && quiet >= 1400) || performance.now() - t0 > 40000) { clearInterval(id); recRef.current(); }
    }, 80);
    return () => clearInterval(id);
  }, [recording]);

  const saveRoutine = (id: string) => {
    const m = msgs.find((x) => x.id === id);
    if (!m || m.role !== 'routine' || m.saved) return;
    const rid = uid('rt');
    const r: Routine = { id: rid, name: m.draft.name, items: m.items, note: m.draft.note ? `${m.draft.note}\n\n${t('Built by the Coach — check it before you rely on it.')}` : t('Built by the Coach — check it before you rely on it.'), createdAt: Date.now(), updatedAt: Date.now() };
    useStore.getState().upsertRoutine(r);
    buzz(14);
    setMsgs((x) => x.map((y) => (y.id === id && y.role === 'routine' ? { ...y, saved: rid } : y)));
    toast(t('Routine created'), { tone: 'ok' });
  };

  const noKey = !ai.hasGemini;
  const chips = [t('Log a banana'), t('Bench press 80 kg for 8, 8, 6'), t('How is my week going?'), t('How do I change the theme?')];
  const nameOf = (id: string) => pool.find((e) => e.id === id)?.name ?? id;

  return (
    <Sheet onClose={pop} tall label={t('Coach')} z={100} foot={(
      <div>
        <div className="row-flex" style={{ gap: 8 }}>
          {/* the orb is the Coach's microphone: it flies in from the tab bar, listens to you, thinks while it answers */}
          <button className="press" aria-label={recording ? t('Stop and send') : t('Speak')} disabled={busy || hearing} onClick={() => (ai.hasGroq && mic.supported ? toggleRec() : push('settings', { section: 'ai' }))}
            style={{ position: 'relative', width: 50, height: 50, flex: 'none', borderRadius: 999, boxShadow: recording ? '0 0 0 2px var(--ac), 0 0 24px -4px var(--ac)' : 'none', transition: 'box-shadow .3s' }}>
            <SphereSlot id="coach" priority={5} style={{ position: 'absolute', inset: -4 }} />
          </button>
          <input ref={inputRef} className="input grow" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={recording ? t('Listening… tap the mic to send') : hearing ? t('Transcribing…') : routineMode ? t('Describe the routine you want') : t('Ask the Coach')} aria-label={t('Message the Coach')} disabled={recording || hearing} />
          {busy ? <button className="btn press" onClick={() => ctl.current?.abort()}>{t('Stop')}</button> : <button className="btn primary press" disabled={!input.trim()} onClick={() => send()}>{routineMode ? t('Build') : t('Send')}</button>}
        </div>
        <div className="row-flex between" style={{ marginTop: 8 }}>
          <button className={`chip sm press ${routineMode ? 'on' : ''}`} onClick={() => setRoutineMode((v) => !v)}><Icon name="dumbbell" size={14} /> {t('Build a routine')}</button>
          {speaking && <button className="small t2 press" onClick={stopSpeaking}>{t('Stop speaking')}</button>}
        </div>
      </div>
    )}>
      <SheetHead title={t('Coach')} onClose={pop} right={msgs.length ? <button className="small t2 press" onClick={() => { ctl.current?.abort(); stopSpeaking(); setMsgs([]); }}>{t('Clear')}</button> : undefined} />
      <div className="sheet-body">
          <>
            {msgs.length === 0 && (
              <div className="stack gap12">
                <div className="small t2"><Words k="intro" text={t('Tell me what you ate or lifted, ask about your training or the app, or ask me to do something. I log it for you — and every change has an Undo.')} /></div>
                {noKey && <div className="small" style={{ color: 'var(--warn)' }}>{t('Without a Gemini key I can still log simple things, but not chat. Add one in Settings → Voice & AI.')} <button className="chip sm acc press" style={{ marginLeft: 6 }} onClick={() => push('settings', { section: 'ai' })}>{t('Add a key')}</button></div>}
                <div className="chips" style={{ margin: 0, padding: 0, flexWrap: 'wrap' }}>{chips.map((c) => <button key={c} className="chip press" onClick={() => send(c)}>{c}</button>)}</div>
              </div>
            )}
            <div className="stack gap12" style={{ marginTop: msgs.length ? 0 : 16 }}>
              {msgs.map((m) => (
                <motion.div key={m.id} layout="position"
                  // sent messages spring up out of the input; replies settle in softly
                  initial={m.role === 'user' ? { opacity: 0, y: 96, scale: 0.78, filter: 'blur(6px)' } : { opacity: 0, y: 14, filter: 'blur(8px)' }} animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                  transition={m.role === 'user' ? { type: 'spring', stiffness: 360, damping: 24, mass: 0.8, filter: { duration: 0.35 } } : { ...SOFT, filter: { duration: 0.5 } }}
                  style={{ transformOrigin: m.role === 'user' ? '100% 100%' : '0% 0%', alignSelf: m.role === 'user' ? 'flex-end' : 'stretch', maxWidth: m.role === 'user' ? '86%' : '100%' }}>
                  {m.role === 'user' && <div className="plinth-2 sent" style={{ padding: '10px 14px', borderRadius: 18 }}>{m.text}</div>}
                  {m.role === 'model' && <div className="small" style={{ lineHeight: 1.5 }} aria-live="polite">{m.text ? <Rich text={m.text} /> : <Thinking />}{m.streaming && m.text && <span className="caret" aria-hidden />}</div>}
                  {m.role === 'action' && (
                    <div className="stack gap8">
                      {m.results.map((r) => (
                        <ActionCard key={r.id} r={r} undone={m.undone.includes(r.id)} confirmed={m.confirmed.includes(r.id)}
                          onUndo={() => { r.undo?.(); buzz(8); setMsgs((x) => x.map((y) => (y.id === m.id && y.role === 'action' ? { ...y, undone: [...y.undone, r.id] } : y))); }}
                          onConfirm={() => { r.button?.run(); buzz(14); setMsgs((x) => x.map((y) => (y.id === m.id && y.role === 'action' ? { ...y, confirmed: [...y.confirmed, r.id] } : y))); }} />
                      ))}
                    </div>
                  )}
                  {m.role === 'error' && <div className="plinth-2 small" role="alert" style={{ padding: '10px 14px', color: 'var(--bad)' }}>{m.text}</div>}
                  {m.role === 'routine' && (
                    <div className="plinth" style={{ padding: 14 }}>
                      <div className="micro">{t('Proposed routine — not saved yet')}</div>
                      <div className="li-title" style={{ marginTop: 4 }}>{m.draft.name}</div>
                      {m.draft.note && <div className="xs t2" style={{ marginTop: 4 }}>{m.draft.note}</div>}
                      <div style={{ marginTop: 8 }}>{m.items.map((i) => <div key={i.id} className="row-flex between small" style={{ padding: '6px 0', borderTop: '1px solid var(--line)' }}><span className="trunc">{nameOf(i.exerciseId)}</span><span className="num t2">{i.workingSets} × {i.repMin}–{i.repMax}</span></div>)}</div>
                      {m.skipped.length > 0 && <div className="xs" style={{ color: 'var(--warn)', marginTop: 8 }}>{t('Left out (not in your exercise library): {list}', { list: m.skipped.join(', ') })}</div>}
                      {m.saved ? (
                        <div className="row-flex" style={{ gap: 8, marginTop: 12 }}><span className="small" style={{ color: 'var(--ok)' }}><Icon name="check" size={14} sw={2.4} /> {t('Created')}</span><button className="btn sm press" onClick={() => push('routine', { id: m.saved })}>{t('Open and edit')}</button></div>
                      ) : (
                        <div className="row-flex" style={{ gap: 8, marginTop: 12 }}><button className="btn primary sm press grow" onClick={() => saveRoutine(m.id)}>{t('Create routine')}</button><button className="btn sm press" onClick={() => setMsgs((x) => x.filter((y) => y.id !== m.id))}>{t('Discard')}</button></div>
                      )}
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
            <div className="xs t3" style={{ marginTop: 18 }}>{t('The Coach is an AI and can be wrong. It isn’t medical advice. Your messages and a summary of your records are sent to Google Gemini.')}</div>
            <div ref={endRef} />
          </>
      </div>
    </Sheet>
  );
}
