import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStore, allExercises } from '../state/store';
import { useUI, buzz } from '../state/ui';
import { useAi, anyBrain, solOn } from '../state/ai';
import { useT, useLang } from '../lib/i18n';
import { Sheet, SheetHead } from '../ui/Sheet';
import { Icon } from '../ui/Icon';
import { SphereSlot } from '../ui/Sphere';
import { useVoice } from '../state/voice';
import { mic } from '../lib/mic';
import { getKey } from '../lib/keys';
import { transcribe, buildPrompt, STT_MODEL, SttError } from '../lib/groq';
import { aiErrorText, type Photo, type Turn } from '../lib/gemini';
import { stopSpeaking } from '../lib/tts';
import { decide, brainFor } from '../lib/agentTurn';
import { ActionCard, Rich, TypingDots, SpeakButton, prefetchAloud, sttMessage, useCoachTips, cardsNote } from '../ui/agentUi';
import { runActions, type AgentResult } from '../lib/agent';
import { uid } from '../lib/nutrition';
import { dayKey } from '../lib/dates';
import { blobToBase64, downscale } from '../lib/photos';

type Msg =
  | { id: string; role: 'user' | 'model'; text: string; streaming?: boolean; seeded?: boolean; /** a quiet line under the answer (which AI answered, and why) */ note?: string; /** when it was said */ at?: number; /** a photo was sent with it (its picture stays only while the Coach is open) */ photo?: boolean; image?: string }
  | { id: string; role: 'error'; text: string }
  | { id: string; role: 'action'; results: AgentResult[]; undone: string[]; confirmed: string[] }

const THREAD = 'aven.coach';
/** The Coach conversation as it was left (cards come back without their Undo: that only works right after the change). */
function loadThread(): Msg[] {
  try {
    const v = JSON.parse(localStorage.getItem(THREAD) || '[]');
    return (Array.isArray(v) ? v : []).filter((m: any) => m && typeof m.id === 'string' && ['user', 'model', 'action', 'error'].includes(m.role))
      .map((m: any) => (m.role === 'user' || m.role === 'model' ? { ...m, seeded: true, streaming: false }
        // a card's buttons were functions: they don't survive the trip, so a restored card has none (no dead buttons)
        : m.role === 'action' ? { ...m, results: (Array.isArray(m.results) ? m.results : []).map((r: any) => ({ ...r, button: undefined, more: undefined, undo: undefined })) } : m));
  } catch { return []; }
}
function saveThread(list: Msg[]) {
  try { localStorage.setItem(THREAD, JSON.stringify(list.slice(-60).map((m) => ('image' in m && m.image ? { ...m, image: undefined } : m)))); } catch { /* storage full: the chat just won't come back */ }
}

/** Let a word or bold phrase finish before it arrives, so streamed fragments never reshape text already shown. */
function streamingText(text: string): string {
  const complete = text.replace(/\S+$/, '');
  return (complete.match(/\*\*/g)?.length ?? 0) % 2 ? complete.slice(0, complete.lastIndexOf('**')) : complete;
}

export function Coach({ props }: { props: { listen?: boolean; date?: string; mealId?: string; /** the orb screen's conversation, carried over by "Continue in Coach" */ seed?: { said: string; reply: string }[]; /** a question to ask as soon as it opens (the weekly review's button) */ ask?: string } }) {
  const t = useT();
  const lang = useLang();
  const pop = useUI((u) => u.pop);
  const push = useUI((u) => u.push);
  const ai = useAi();
  const s = useStore();
  const pool = useMemo(() => allExercises(s.exercises), [s.exercises]);
  // the conversation carries on where you left it (kept on this device); the orb screen's turns join the end of it
  const [msgs, setMsgs] = useState<Msg[]>(() => [...loadThread(), ...(props.seed ?? []).flatMap((x) => [
    ...(x.said ? [{ id: uid('m'), role: 'user' as const, text: x.said, seeded: true, at: Date.now() }] : []),
    ...(x.reply ? [{ id: uid('m'), role: 'model' as const, text: x.reply, seeded: true, at: Date.now() }] : []),
  ])]);
  useEffect(() => { if (!msgs.some((m) => m.role === 'model' && m.streaming)) saveThread(msgs); }, [msgs]);
  // back to an old conversation after a break: the suggestions come back under it until something is sent
  const [resumed, setResumed] = useState(() => { const last = [...msgs].reverse().find((m) => 'at' in m && m.at) as { at?: number } | undefined; return msgs.length > 0 && !props.ask && !props.listen && (!last?.at || Date.now() - last.at > 30 * 60_000); });
  const [input, setInput] = useState('');
  const [photo, setPhoto] = useState<{ url: string; blob: Blob } | null>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const pickPhoto = async (f?: File) => { if (!f) return; try { const blob = await downscale(f, 1280); setPhoto({ url: URL.createObjectURL(blob), blob }); buzz(8); } catch { say({ id: uid('m'), role: 'error', text: t('Couldn’t read that image.') }); } };
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [hearing, setHearing] = useState(false);
  const ctl = useRef<AbortController | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const scrolling = useRef(false);
  const lastScroll = useRef(0);
  const alive = useRef(true);
  const msgsRef = useRef<Msg[]>([]); msgsRef.current = msgs;

  useEffect(() => { alive.current = true; return () => { alive.current = false; stopSpeaking(); ctl.current?.abort(); mic.release('coach'); for (const m of msgsRef.current) if ('image' in m && m.image) URL.revokeObjectURL(m.image); }; }, []);
  // Saved chat is placed before the first paint; new lines follow smoothly until you scroll up to read.
  useLayoutEffect(() => {
    const el = bodyRef.current; if (!el) return;
    el.scrollTop = el.scrollHeight; lastScroll.current = el.scrollTop;
    el.toggleAttribute('data-scrollable', el.scrollHeight > el.clientHeight + 1);
    const ro = new ResizeObserver(() => {
      el.toggleAttribute('data-scrollable', el.scrollHeight > el.clientHeight + 1);
      if (!following.current || el.scrollHeight - el.clientHeight - el.scrollTop <= 1) return;
      const reduce = document.documentElement.dataset.motion === 'reduce' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      scrolling.current = !reduce;
      el.scrollTo({ top: el.scrollHeight, behavior: reduce ? 'instant' : 'smooth' });
    });
    ro.observe(el);
    const thread = el.querySelector('.coach-thread'); if (thread) ro.observe(thread);
    const settled = () => { if (el.scrollHeight - el.clientHeight - el.scrollTop < 80) { scrolling.current = false; following.current = true; } };
    el.addEventListener('scrollend', settled);
    return () => { ro.disconnect(); el.removeEventListener('scrollend', settled); };
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
    const today = dayKey(Date.now(), useStore.getState().settings.dayStartHour);
    for (const m of msgsRef.current) {
      // something said on an earlier day is marked so, so "today" in an old message isn't taken for today
      const old = m.role === 'user' && m.at && dayKey(m.at, useStore.getState().settings.dayStartHour) !== today ? `(said on ${dayKey(m.at, useStore.getState().settings.dayStartHour)}) ` : '';
      if (m.role === 'user' || m.role === 'model') push(m.role, old + (m.role === 'user' && m.photo ? `[photo] ${m.text}` : m.text));
      else if (m.role === 'action') push('model', cardsNote(m.results, m.confirmed, m.undone));
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

  /** One turn: the model (or, without an AI key, the local reader) says what to do; we do it; the cards show it. */
  const agentTurn = async (text: string, signal: AbortSignal, photo?: Photo) => {
    const st = useStore.getState();
    const today = dayKey(Date.now(), st.settings.dayStartHour);
    const placeholder = uid('m');
    say({ id: placeholder, role: 'model', text: '', streaming: true });
    const where = props.mealId || props.date ? `The user opened this from the Food tab${props.date ? ` (day ${props.date})` : ''}${props.mealId ? `, meal ${props.mealId}` : ''}: foods go there unless they say otherwise.` : 'The user opened this from the main screen.';
    const history = turnsFor(''); // the conversation so far (an empty text adds no turn)
    // the answer streams in as the model writes it, into the same message that then stays (nothing re-mounts or re-animates)
    const d = await decide(photo ? `[photo] ${text}` : text, { lang, t, pool, history, where, signal, surface: 'coach', photo, onReply: (r) => { if (alive.current) setMsgs((x) => x.map((m) => (m.id === placeholder && m.role === 'model' ? { ...m, text: r } : m))); } });
    let { reply } = d; const { note, actions } = d;
    if (d.wantsUndo) { undoLast(); if (!actions.length && !reply) reply = t('Undone.'); }
    const results = actions.length ? await runActions(actions, { t, lang, today, brain: brainFor({ big: false, surface: 'coach', signal }), date: props.date, mealId: props.mealId }) : [];
    if (!alive.current) return;
    // the answer is the message; a note about who answered sits under it, quieter (and is never read aloud)
    const said = reply || note;
    setMsgs((x) => {
      const base = said ? x.map((m) => (m.id === placeholder ? { ...m, text: said, note: reply ? note || undefined : undefined, streaming: false } as Msg : m)) : x.filter((m) => m.id !== placeholder);
      return results.length ? [...base, { id: uid('m'), role: 'action', results, undone: [], confirmed: [] }] : base;
    });
    // green "Done" only when something was actually logged or changed
    const acted = d.wantsUndo || results.some((r) => r.kind !== 'miss' && r.kind !== 'nav');
    if (acted) { buzz([12, 40, 18] as any); orb('confirmed'); setTimeout(() => { if (useVoice.getState().phase === 'confirmed') orb('idle'); }, 1200); } else orb('idle');
    if (said.trim()) prefetchAloud(said); // read aloud only when you tap play
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
    const pic = raw === undefined ? photo : null; // a suggestion chip or dictation sends words only
    if ((!text && !pic) || busy) return;
    following.current = true;
    setInput(''); setPhoto(null); setResumed(false); setBusy(true); stopSpeaking(); orb('processing');
    say({ id: uid('m'), role: 'user', text, at: Date.now(), ...(pic ? { photo: true, image: pic.url } : {}) });
    ctl.current = new AbortController();
    const signal = ctl.current.signal;
    try {
      await agentTurn(text || t('What is this?'), signal, pic ? { mime: 'image/jpeg', data: await blobToBase64(pic.blob) } : undefined);
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
  // opened with a question (the weekly review): ask it once the sheet has risen
  const sendRef = useRef<(raw?: string) => void>(() => {});
  sendRef.current = send;
  useEffect(() => {
    if (!props.ask) return;
    const id = setTimeout(() => { if (alive.current) sendRef.current(props.ask); }, 380);
    return () => clearTimeout(id);
    // eslint-disable-next-line
  }, []);
  // opened from the orb: start listening straight away (or, without speech-to-text, open the keyboard)
  useEffect(() => {
    if (!props.listen) return;
    const id = setTimeout(() => { if (!alive.current) return; if (useAi.getState().hasGroq && mic.supported) recRef.current(); else inputRef.current?.focus(); }, 420);
    return () => clearTimeout(id);
    // eslint-disable-next-line
  }, []);
  // stop by itself once you have spoken and gone quiet for 0.9 s (it used to wait 1.4 s — a dead moment after your last word)
  useEffect(() => {
    if (!recording) return;
    let heard = 0, quiet = 0; const t0 = performance.now();
    const id = setInterval(() => {
      const lv = mic.level();
      if (lv > 0.16) { heard += 80; quiet = 0; } else if (lv < 0.09) quiet += 80;
      if ((heard >= 240 && quiet >= 900) || performance.now() - t0 > 40000) { clearInterval(id); recRef.current(); }
    }, 80);
    return () => clearInterval(id);
  }, [recording]);

  const noKey = !anyBrain(ai);
  const tips = useCoachTips(3);
  // the "AI can be wrong" note: said once, on the first open (it also lives in Settings → Privacy)
  const [noteSeen] = useState(() => { try { return localStorage.getItem('aven.coachNote') === '1'; } catch { return true; } });
  useEffect(() => { if (msgs.length) try { localStorage.setItem('aven.coachNote', '1'); } catch { /* ignore */ } }, [msgs.length]);

  // the suggestions: on an empty chat at the top; when you come back to an old chat, under it (until you send something)
  const tipsBlock = (
              <div className="stack gap12">
                {noKey && <div className="small" style={{ color: 'var(--warn)' }}>{t('Add an AI key to chat.')} <button className="chip sm acc press" style={{ marginLeft: 6 }} onClick={() => push('settings', { section: 'ai' })}>{t('Add a key')}</button></div>}
                <div className="tips">{tips.map((c, i) => (
                  <button key={c.prompt} className="tip press" style={{ ['--i' as string]: i }} onClick={() => send(c.prompt)}>
                    <span className="tip-ic"><Icon name={c.icon} size={18} /></span>
                    <span className="grow" style={{ textAlign: 'left', minWidth: 0 }}><span className="tip-l">{c.label}</span>{c.prompt !== c.label && <span className="tip-p">{c.prompt}</span>}</span>
                    <Icon name="chevR" size={16} style={{ color: 'var(--tx3)', flex: 'none' }} />
                  </button>
                ))}</div>
              </div>
  );
  return (
    <Sheet onClose={pop} size="full" instant label={t('Coach')} z={100} foot={(
      <div className="coach-foot">
        {photo && (
          <div className="coach-photo">
            <img src={photo.url} alt="" />
            <span className="xs t2 grow">{t('Ask about this photo, or just send it')}</span>
            <button className="icon-btn flat sm press" aria-label={t('Remove photo')} onClick={() => { URL.revokeObjectURL(photo.url); setPhoto(null); }}><Icon name="close" size={16} /></button>
          </div>
        )}
        <input ref={camRef} type="file" accept="image/*" hidden onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = ''; }} />
        <div className="coach-composer">
          {/* the orb is the Coach's microphone: it flies in from the tab bar, listens to you, thinks while it answers */}
          <button className="press" aria-label={recording ? t('Stop and send') : t('Speak')} disabled={busy || hearing} onClick={() => (ai.hasGroq && mic.supported ? toggleRec() : push('settings', { section: 'ai' }))}
            style={{ position: 'relative', width: 50, height: 50, flex: 'none', borderRadius: 999 }}>
            <i className={`voice-ring ${recording ? 'on' : ''}`} />
            <SphereSlot id="coach" priority={5} style={{ position: 'absolute', inset: -4 }} />
          </button>
          {/* the camera: a label, a machine, a program screenshot — anything to ask about */}
          <button className="icon-btn flat press coach-cam" aria-label={t('Send a photo')} disabled={busy || recording || hearing} onClick={() => camRef.current?.click()}><Icon name="camera" size={21} /></button>
          <div className="grow coach-field">
            <input ref={inputRef} className="input" style={{ paddingRight: 54 }} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={recording ? t('Listening… tap the mic to send') : hearing ? t('Transcribing…') : t('Ask the Coach')} aria-label={t('Message the Coach')} disabled={recording || hearing} />
            {/* Send is an arrow inside the field, there only when there is something to send (Stop while it works) */}
            <button className={`coach-send press ${busy || input.trim() || photo ? 'on' : ''}`} aria-label={busy ? t('Stop') : t('Send')} tabIndex={busy || input.trim() || photo ? 0 : -1} onClick={() => (busy ? ctl.current?.abort() : send())}>
              <Icon name={busy ? 'close' : 'arrowUp'} size={18} sw={2.6} />
            </button>
          </div>
        </div>
      </div>
    )}>
      <SheetHead title={t('Coach')} onClose={pop} right={msgs.length ? <button className="small t2 press" onClick={() => { ctl.current?.abort(); stopSpeaking(); setMsgs([]); }}>{t('New chat')}</button> : undefined} />
      <div className="sheet-body coach-body" ref={bodyRef} onScroll={(e) => {
        const el = e.currentTarget;
        if (el.scrollTop < lastScroll.current - 1) scrolling.current = false;
        following.current = scrolling.current || el.scrollHeight - el.clientHeight - el.scrollTop < 80;
        lastScroll.current = el.scrollTop;
      }}>
          <>
            {msgs.length === 0 && tipsBlock}
            <div className="stack coach-thread" style={{ gap: 16, marginTop: msgs.length ? 0 : 16 }}>
              {msgs.map((m) => (
                <div key={m.id} className={m.role === 'user' && !m.seeded ? 'coach-sent' : undefined}
                  style={{ transformOrigin: m.role === 'user' ? '100% 100%' : '0% 0%', alignSelf: m.role === 'user' ? 'flex-end' : 'stretch', maxWidth: m.role === 'user' ? '84%' : '100%', display: m.role === 'user' ? 'flex' : undefined }}>
                  {m.role === 'user' && (
                    <div className="stack" style={{ alignItems: 'flex-end', gap: 6, maxWidth: '100%' }}>
                      {m.photo && (m.image ? <img className="said-photo" src={m.image} alt={t('Your photo')} /> : <div className="said xs t2"><Icon name="camera" size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />{t('Photo')}</div>)}
                      {m.text && <div className="said" style={{ maxWidth: '100%' }}>{m.text}</div>}
                    </div>
                  )}
                  {m.role === 'model' && (m.text ? (
                    <div>
                      <div className={`reply calm coach-reply${m.seeded ? ' still' : ''}`} aria-live="polite"><Rich text={m.streaming ? streamingText(m.text) : m.text} id={m.id} stagger={160} />{m.streaming && <span className="caret" aria-hidden />}</div>
                      {!m.streaming && m.note && <div className="xs t3" style={{ marginTop: 8 }}>{m.note}</div>}
                      {!m.streaming && <div className="reply-foot"><SpeakButton id={m.id} text={m.text} /></div>}
                    </div>
                  ) : <TypingDots />)}
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
                </div>
              ))}
            </div>
            {resumed && msgs.length > 0 && <div className="coach-resume"><div className="micro" style={{ margin: '22px 0 10px' }}>{t('Today')}</div>{tipsBlock}</div>}
            {!noteSeen && msgs.length === 0 && <div className="xs t3" style={{ marginTop: 18 }}>{solOn(ai) ? t('AI can be wrong, and isn’t medical advice. Messages go to OpenAI (GPT-6.1 Sol).') : t('AI can be wrong, and isn’t medical advice. Messages go to Google Gemini.')}</div>}
          </>
      </div>
    </Sheet>
  );
}
