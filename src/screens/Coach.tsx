import { useEffect, useMemo, useRef, useState } from 'react';
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
import { aiErrorText, type Turn } from '../lib/gemini';
import { speak, stopSpeaking, onSpeaking, FALLBACK_TTS } from '../lib/tts';
import { decide, agentModels } from '../lib/agentTurn';
import { BOUNCY } from '../ui/motion';
import { ActionCard, Rich, Thinking, sttMessage, useCoachTips } from '../ui/agentUi';
import { runActions, type AgentResult } from '../lib/agent';
import { uid } from '../lib/nutrition';
import { dayKey } from '../lib/dates';

type Msg =
  | { id: string; role: 'user' | 'model'; text: string; streaming?: boolean }
  | { id: string; role: 'error'; text: string }
  | { id: string; role: 'action'; results: AgentResult[]; undone: string[]; confirmed: string[] }

export function Coach({ props }: { props: { listen?: boolean; date?: string; mealId?: string } }) {
  const t = useT();
  const lang = useLang();
  const pop = useUI((u) => u.pop);
  const push = useUI((u) => u.push);
  const ai = useAi();
  const s = useStore();
  const pool = useMemo(() => allExercises(s.exercises), [s.exercises]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [hearing, setHearing] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const ctl = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  const msgsRef = useRef<Msg[]>([]); msgsRef.current = msgs;

  useEffect(() => { alive.current = true; const off = onSpeaking(setSpeaking); return () => { alive.current = false; off(); stopSpeaking(); ctl.current?.abort(); mic.release('coach'); }; }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [msgs]);


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
    const placeholder = uid('m');
    say({ id: placeholder, role: 'model', text: '', streaming: true });
    const where = props.mealId || props.date ? `The user opened this from the Food tab${props.date ? ` (day ${props.date})` : ''}${props.mealId ? `, meal ${props.mealId}` : ''}: foods go there unless they say otherwise.` : 'The user opened this from the main screen.';
    const history = turnsFor(''); // the conversation so far (an empty text adds no turn)
    const d = await decide(text, { lang, t, pool, history, where, signal });
    let { reply } = d; const { note, actions } = d;
    if (d.wantsUndo) { undoLast(); if (!actions.length && !reply) reply = t('Undone.'); }
    const results = actions.length ? await runActions(actions, { t, lang, today, brain: g.hasGemini ? { key: getKey('gemini'), models: agentModels(false), signal } : null, date: props.date, mealId: props.mealId }) : [];
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
    say({ id: uid('m'), role: 'user', text });
    ctl.current = new AbortController();
    const signal = ctl.current.signal;
    try {
      await agentTurn(text, signal);
    } catch (e: any) {
      if (!alive.current) return;
      const stopped = e?.code === 'aborted';
      setMsgs((x) => {
        const last = x[x.length - 1];
        const base = last && last.role === 'model' && last.streaming ? (last.text.trim() ? x.map((m, i) => (i === x.length - 1 ? { ...m, streaming: false } as Msg : m)) : x.slice(0, -1)) : x;
        return stopped ? base : [...base, { id: uid('m'), role: 'error', text: aiErrorText(e, t) }];
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

  const noKey = !ai.hasGemini;
  const tips = useCoachTips(3);
  // the "AI can be wrong" note: said once, on the first open (it also lives in Settings → Privacy)
  const [noteSeen] = useState(() => { try { return localStorage.getItem('aven.coachNote') === '1'; } catch { return true; } });
  useEffect(() => { if (msgs.length) try { localStorage.setItem('aven.coachNote', '1'); } catch { /* ignore */ } }, [msgs.length]);

  return (
    <Sheet onClose={pop} tall label={t('Coach')} z={100} foot={(
      <div>
        <div className="row-flex" style={{ gap: 8 }}>
          {/* the orb is the Coach's microphone: it flies in from the tab bar, listens to you, thinks while it answers */}
          <button className="press" aria-label={recording ? t('Stop and send') : t('Speak')} disabled={busy || hearing} onClick={() => (ai.hasGroq && mic.supported ? toggleRec() : push('settings', { section: 'ai' }))}
            style={{ position: 'relative', width: 50, height: 50, flex: 'none', borderRadius: 999 }}>
            <i className={`voice-ring ${recording ? 'on' : ''}`} />
            <SphereSlot id="coach" priority={5} style={{ position: 'absolute', inset: -4 }} />
          </button>
          <div className="grow" style={{ position: 'relative' }}>
            <input ref={inputRef} className="input" style={{ paddingRight: 54 }} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={recording ? t('Listening… tap the mic to send') : hearing ? t('Transcribing…') : t('Ask the Coach')} aria-label={t('Message the Coach')} disabled={recording || hearing} />
            {/* Send is an arrow inside the field, there only when there is something to send (Stop while it works) */}
            <button className={`coach-send press ${busy || input.trim() ? 'on' : ''}`} aria-label={busy ? t('Stop') : t('Send')} tabIndex={busy || input.trim() ? 0 : -1} onClick={() => (busy ? ctl.current?.abort() : send())}>
              <Icon name={busy ? 'close' : 'arrowUp'} size={18} sw={2.6} />
            </button>
          </div>
        </div>
        {speaking && <div className="row-flex" style={{ marginTop: 8, justifyContent: 'center' }}><button className="small t2 press" onClick={stopSpeaking}>{t('Stop speaking')}</button></div>}
      </div>
    )}>
      <SheetHead title={t('Coach')} onClose={pop} right={msgs.length ? <button className="small t2 press" onClick={() => { ctl.current?.abort(); stopSpeaking(); setMsgs([]); }}>{t('Clear')}</button> : undefined} />
      <div className="sheet-body">
          <>
            {msgs.length === 0 && (
              <div className="stack gap12">
                <div className="small t2">{t('Log, change or ask anything.')}</div>
                {noKey && <div className="small" style={{ color: 'var(--warn)' }}>{t('Add a Gemini key to chat.')} <button className="chip sm acc press" style={{ marginLeft: 6 }} onClick={() => push('settings', { section: 'ai' })}>{t('Add a key')}</button></div>}
                <div className="tips">{tips.map((c, i) => (
                  <button key={c.prompt} className="tip press" style={{ ['--i' as string]: i }} onClick={() => send(c.prompt)}>
                    <span className="tip-ic"><Icon name={c.icon} size={18} /></span>
                    <span className="grow" style={{ textAlign: 'left', minWidth: 0 }}><span className="tip-l">{c.label}</span>{c.prompt !== c.label && <span className="tip-p">{c.prompt}</span>}</span>
                    <Icon name="chevR" size={16} style={{ color: 'var(--tx3)', flex: 'none' }} />
                  </button>
                ))}</div>
              </div>
            )}
            <div className="stack gap12" style={{ marginTop: msgs.length ? 0 : 16 }}>
              {msgs.map((m) => (
                <motion.div key={m.id} layout="position"
                  // sent messages spring up out of the input; replies settle in softly
                  initial={m.role === 'user' ? { opacity: 0, y: 96, scale: 0.78, filter: 'blur(6px)' } : { opacity: 0, y: 14, filter: 'blur(8px)' }} animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', transitionEnd: { filter: 'none' } }}
                  transition={m.role === 'user' ? { ...BOUNCY, filter: { duration: 0.35 } } : { ...SOFT, filter: { duration: 0.5 } }}
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
                </motion.div>
              ))}
            </div>
            {!noteSeen && <div className="xs t3" style={{ marginTop: 18 }}>{t('The Coach is an AI and can be wrong. It isn’t medical advice. Your messages and a summary of your records are sent to Google Gemini.')}</div>}
            <div ref={endRef} />
          </>
      </div>
    </Sheet>
  );
}
