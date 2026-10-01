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
import { FALLBACK_MODELS, aiErrorText, aiRoutine, streamChat, withFallback, type Turn } from '../lib/gemini';
import { speak, stopSpeaking, onSpeaking, FALLBACK_TTS } from '../lib/tts';
import { buildCoachContext, COACH_SYSTEM, exerciseNames, mapRoutineItems, profileLine } from '../lib/coachContext';
import type { RoutineDraft } from '../lib/aiValidate';
import { uid } from '../lib/nutrition';
import { dayKey } from '../lib/dates';
import type { Routine } from '../lib/types';

type Msg =
  | { id: string; role: 'user' | 'model'; text: string; streaming?: boolean }
  | { id: string; role: 'error'; text: string }
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

export function Coach() {
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
  const patchLast = (f: (m: Msg) => Msg) => setMsgs((x) => x.map((m, i) => (i === x.length - 1 ? f(m) : m)));

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
        const st = useStore.getState();
        const names = new Map(pool.map((e) => [e.id, e.name]));
        const system = `${COACH_SYSTEM(lang)}\n\nDATA (computed on this device just now):\n${buildCoachContext(st, dayKey(Date.now(), st.settings.dayStartHour), (id) => names.get(id) ?? id)}`;
        const history: Turn[] = [...msgsRef.current, { id: '', role: 'user' as const, text }]
          .filter((m): m is Extract<Msg, { role: 'user' | 'model' }> => m.role === 'user' || m.role === 'model').slice(-12)
          .map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
        say({ id: uid('m'), role: 'model', text: '', streaming: true });
        const full = await withFallback(models(true), (model) => streamChat({ key, model, system, contents: history, signal, onText: (tx) => alive.current && patchLast((m) => (m.role === 'model' ? { ...m, text: tx } : m)) }));
        if (!alive.current) return;
        patchLast((m) => (m.role === 'model' ? { ...m, text: full, streaming: false } : m));
        if (useAi.getState().speak) speakOut(full);
        orb('confirmed'); setTimeout(() => { if (useVoice.getState().phase === 'confirmed') orb('idle'); }, 1200);
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
      } catch (e) { if (alive.current) say({ id: uid('m'), role: 'error', text: e instanceof SttError && e.code === 'badkey' ? t('Groq rejected the key. Check it in Settings → Voice & AI.') : e instanceof SttError && e.code === 'offline' ? t('You’re offline.') : t('Couldn’t transcribe that. Try again, or type it.') }); }
      finally { if (alive.current) setHearing(false); }
      return;
    }
    stopSpeaking();
    const r = await mic.acquire('coach');
    if (!r.ok || !mic.startRecording('coach')) { mic.release('coach'); say({ id: uid('m'), role: 'error', text: r.ok ? t('This browser can’t record audio.') : t('The microphone isn’t available. Check the permission, or type.') }); return; }
    setRecording(true); orb('listening');
  };

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
  const chips = [t('How is my week going?'), t('Am I eating enough protein?'), t('What should I train next?'), t('Is my weight moving the right way?')];
  const nameOf = (id: string) => pool.find((e) => e.id === id)?.name ?? id;

  return (
    <Sheet onClose={pop} tall label={t('Coach')} z={100} foot={noKey ? undefined : (
      <div>
        <div className="row-flex" style={{ gap: 8 }}>
          {/* the orb is the Coach's microphone: it flies in from the tab bar, listens to you, thinks while it answers */}
          <button className="press" aria-label={recording ? t('Stop and send') : t('Speak')} disabled={busy || hearing} onClick={() => (ai.hasGroq && mic.supported ? toggleRec() : push('settings', { section: 'ai' }))}
            style={{ position: 'relative', width: 50, height: 50, flex: 'none', borderRadius: 999, boxShadow: recording ? '0 0 0 2px var(--ac), 0 0 24px -4px var(--ac)' : 'none', transition: 'box-shadow .3s' }}>
            <SphereSlot id="coach" priority={5} style={{ position: 'absolute', inset: -4 }} />
          </button>
          <input className="input grow" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
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
        {noKey ? (
          <div className="stack gap12" style={{ textAlign: 'center', padding: '24px 6px' }}>
            <div className="display display-sm">{t('The Coach needs a Gemini key')}</div>
            <div className="small t2">{t('Add a free Gemini key and the Coach can answer from your own training, food and weight records. Everything else in Aven works without it.')}</div>
            <button className="btn primary press" onClick={() => push('settings', { section: 'ai' })}><Icon name="sparkle" size={18} /> {t('Add a key')}</button>
          </div>
        ) : (
          <>
            {msgs.length === 0 && (
              <div className="stack gap12">
                <div className="small t2"><Words k="intro" text={t('Ask anything about your training, food or weight. I only see a short summary computed on your device — I can advise, but I never change your data.')} /></div>
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
        )}
      </div>
    </Sheet>
  );
}
