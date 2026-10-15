import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type SetStateAction } from 'react';
import { useIsPresent } from 'motion/react';
import { useStore, allExercises } from '../state/store';
import { useUI, haptic } from '../state/ui';
import { useAi, anyBrain, solOn } from '../state/ai';
import { useT, useLang } from '../lib/i18n';
import { Sheet, SheetHead } from '../ui/Sheet';
import { Collapse } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { kb } from '../ui/keyboard';
import { SphereSlot } from '../ui/Sphere';
import { useVoice } from '../state/voice';
import { mic } from '../lib/mic';
import { getKey } from '../lib/keys';
import { transcribe, buildPrompt, STT_MODEL, SttError } from '../lib/groq';
import { AiError, aiErrorText, type Photo, type Turn } from '../lib/gemini';
import { sttNames } from '../lib/sttNames';
import { stopSpeaking } from '../lib/tts';
import { decide, brainFor } from '../lib/agentTurn';
import { ActionCard, UndoAll, Rich, TypingDots, SpeakButton, prefetchAloud, replacedIds, sttMessage, useCoachTips, useWordReveal } from '../ui/agentUi';
import { droppedCard, runActions, type AgentResult } from '../lib/agent';
import { uid } from '../lib/nutrition';
import { onThreadChange, readThread, threadSaid, threadTurns, writeThread, type ThreadMsg } from '../lib/thread';
import { dayKey } from '../lib/dates';
import type { About } from '../lib/askAbout';
import { blobToBase64, downscale } from '../lib/photos';

/* The typing bar opens wide while you type (Omar, 13 Oct: "expands when I type on it and compresses when I'm done"): the
   camera tucks away and the pill's left edge glides over its place, then glides back when the keyboard goes. It grows a
   line taller as your words wrap (up to four lines, then they scroll inside). Drawn with moves only (styles.css
   .coach-field), never a width or height animated per frame. */
const CF_X = 60; // how far it opens: the camera's place (46 px and the 14 px gap)
const CF_LINE = 22, CF_LINES = 4, CF_MAX = CF_LINE * (CF_LINES - 1); // its lines, and how much taller it can grow
// ONE CALM MOTION for everything on the Coach (14 Oct 21:13, Omar: "even calmer and more polished… smoothly easing"):
// a critically damped spring (no overshoot, no bounce anywhere: the opening's 5 px overshoot and the growing's little
// bounce read as restless) that follows a target easing up over its first moments, so nothing jumps off from rest, and
// that lands on the spring's long tail, its speed dying away with no point where it brakes (a bezier's end read as a
// sudden stop, 14 Oct 14:54: "a more easing motion like iOS"). Sampled every 1/60 s into linear(), so the browser plays it
// at the screen's full rate. `response`: how unhurried (seconds); `ramp`: how soft the start (seconds).
const rampSpring = (response: number, ramp: number, cut = 0.0002) => {
  const k = (2 * Math.PI / response) ** 2, c = 4 * Math.PI / response, dt = 1 / 600;
  let x = 0, v = 0, t = 0; const xs = [0];
  for (let f = 1; f < 150; f++) {
    for (let i = 0; i < 10; i++) { const u = Math.min(t / ramp, 1), g = u * u * u * (u * (6 * u - 15) + 10); v += (k * (g - x) - c * v) * dt; x += v * dt; t += dt; }
    xs.push(x); if (t > ramp && 1 - x < cut && (cut > 0.0002 || Math.abs(v) < 0.005)) break; // (still to a fiftieth of a percent: a flight hands over to the real bubble; `cut`: done once that close, the last step too small to see)
  }
  xs[xs.length - 1] = 1; return xs;
};
// (each ends on two frames held exactly where it lands: a move still a ten-thousandth short on its last frame is drawn
// a hair differently from one at rest, a resized copy's letters and a disc's rim stepping by up to a fifth as it stopped;
// held there for its last frames, the moving picture and the resting one are the same, 14 Oct)
const asCurve = (xs: number[]) => { const all = [...xs, 1, 1]; return { duration: Math.round((all.length - 1) * 1000 / 60), easing: `linear(${all.map((v) => +v.toFixed(4)).join(', ')})` }; };
const MORPH = asCurve(rampSpring(0.62, 0.09)); // opening
// closing: quicker and with no tail, so the pill's edge and the camera land together with the bar riding down on the
// keyboard (on the opening's curve the edge crept on ~14 px for half a second after the bar had landed: laggy, not calm);
// ends within half a pixel of the edge's ~50 px travel
const MORPH_BACK = asCurve(rampSpring(0.4, 0.05, 0.008));
const GROW = asCurve(rampSpring(0.52, 0.07)); // a line more or less
// a sent message: its flight to its place, and the pill turning into its bubble (sooner: it has its shape before it is
// far from the field); both start soft, so the copy is seen to lift off the pill rather than be thrown
const FLY = asCurve(rampSpring(0.58, 0.09));
const FLY_SHAPE = asCurve(rampSpring(0.42, 0.07));
// said words (they were never in the field): the pill lifts into its bubble on the same motion, a touch slower, starting
// softer (the words come up inside it on the way, so the move itself has to read: the pill peels off the bar)
const FLY_SAID = asCurve(rampSpring(0.6, 0.11));
// …and its shape turns from the pill into the bubble a little sooner than it arrives, so it is the bubble's own glass for the
// last of the way (a resting bubble's picture, only moving: no colour or edge changes as it lands)
const FLY_SAID_SHAPE = asCurve(rampSpring(0.46, 0.11));
const SAID_INK = 620; // the said words' ink: full while the pill is still the pill, the bubble's own by then
const SAID_BACK = 390; // …and the bar comes back, fresh, only once the bubble has left it…
const SAID_IN = 360; // …faded in over this, eased (a straight fade read as switched on)
const SAID_OUT = 160; // (and it goes over this as the pill starts to lift: hidden at once, it left a hole as the pill rose off it)
// the emptied pill behind a sent message: it holds its shape while the flying copy's paint comes up over it (the copy starts
// see-through, so the pill's own frost is the first frame's picture: a solid copy turned its warm glow slate in one frame),
// then closes up on the copy's own shape curve as the copy lifts away, so the two read as one move (it used to close at
// once, hidden by the solid copy; held for 200 ms it showed as an empty slab under the leaving bubble)
const CLOSE = { ...FLY_SHAPE, delay: 60 };
const growVars = { '--cf-ease-g': GROW.easing, '--cf-dur-g': `${GROW.duration}ms` } as React.CSSProperties;
const morphVars = { '--cf-x': `${CF_X}px`, '--cf-max': `${CF_MAX}px`, '--cf-ease': MORPH.easing, '--cf-dur': `${MORPH.duration}ms`,
  '--cf-ease-c': MORPH_BACK.easing, '--cf-dur-c': `${MORPH_BACK.duration}ms`, '--cf-ease-k': CLOSE.easing, '--cf-dur-k': `${CLOSE.duration}ms`, '--cf-delay-k': `${CLOSE.delay}ms`, ...growVars } as React.CSSProperties;

type Msg =
  | { id: string; role: 'user' | 'model'; text: string; /** asked about something that was held (what the model got with it, and its name on the bubble) */ about?: string; aboutLabel?: string; streaming?: boolean; /** while it looks something up in the data */ status?: string; seeded?: boolean; /** a quiet line under the answer (which AI answered, and why) */ note?: string; /** when it was said */ at?: number; /** a photo was sent with it (its picture stays only while the Coach is open) */ photo?: boolean; image?: string; /** it got no answer (left out of what the model sees until it is tried again) */ failed?: boolean; /** typed: its lines as they wrapped in the field (the bubble keeps them) */ lines?: string[]; /** the pages a web search used */ sources?: { title: string; url: string }[] }
  | { id: string; role: 'error'; text: string; /** folding away (Try again was tapped) */ leaving?: boolean; /** the message that failed: Try again sends it once more (from the same bubble) */ retry?: { userId: string; text: string }; /** a key problem: a chip opens Settings */ fix?: 'settings' }
  | { id: string; role: 'action'; results: AgentResult[]; undone: string[]; confirmed: string[]; /** arrived in this visit (it animates in; a restored one stays still) */ fresh?: boolean }

/** How many of the newest saved messages are built on the tap that opens the Coach (the rest follow, see `older`). */
const TAIL = 6;
/** The Coach conversation as it was left (cards come back without their Undo: that only works right after the change). */
function loadThread(): Msg[] {
  try {
    return (readThread() as any[])
      .map((m: any) => (m.role === 'user' || m.role === 'model' ? { ...m, seeded: true, streaming: false, lines: Array.isArray(m.lines) && m.lines.every((l: unknown) => typeof l === 'string') ? m.lines : undefined }
        // a card's buttons were functions: they don't survive the trip, so a restored card has none (no dead buttons)
        : m.role === 'action' ? { ...m, fresh: false, results: (Array.isArray(m.results) ? m.results : []).map((r: any) => ({ ...r, button: undefined, more: undefined, undo: undefined })) } : m));
  } catch { return []; }
}
const saveThread = (list: Msg[]) => writeThread(list as ThreadMsg[]);

/**
 * Where the list rests at its end: its last line just above the typing bar, wherever the keyboard is. While the keyboard
 * is up (or on its way) the sheet gives the list extra room at its end (--kb-room, ui/Sheet.tsx) the size of the whole
 * keyboard; only the part the keyboard has covered so far is scrolled into.
 */
function endTop(el: HTMLElement) {
  const room = parseFloat(el.closest<HTMLElement>('.sheet')?.style.getPropertyValue('--kb-room') || '0') || 0;
  return Math.max(0, el.scrollHeight - el.clientHeight - Math.max(0, room - kb.get()));
}

/**
 * One message of the chat. A row is drawn again only when its own message changes: while an answer streams in (a new
 * piece every few hundred ms) and while you type, the other 59 rows stay as they are. Every row used to be rebuilt each
 * time, saved answers and cards included.
 */
const ChatRow = memo(function ChatRow({ m, sent, gone, setMsgs, onErr }: { m: Msg; /** sent just now, and not flown in */ sent: boolean; /** the ids of this message's previews that a newer one replaced */ gone: string; setMsgs: Dispatch<SetStateAction<Msg[]>>; /** an error row's chip: try the message again, or open Settings */ onErr: (m: Extract<Msg, { role: 'error' }>, what: 'retry' | 'settings') => void }) {
  const t = useT();
  const replaced = gone ? gone.split(',') : [];
  return (
    <div data-mid={m.id} className={sent ? 'coach-sent' : undefined}
      style={m.role === 'user' ? USER_ROW : OTHER_ROW}>
      {m.role === 'user' && (
        <div className="stack" style={{ alignItems: 'flex-end', gap: 6, maxWidth: '100%' }}>
          {m.photo && (m.image ? <img className="said-photo" src={m.image} alt={t('Your photo')} /> : <div className="said xs t2"><Icon name="camera" size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />{t('Photo')}</div>)}
          {m.aboutLabel && <div className="xs t3 said-about"><Icon name="sparkle" size={12} />{m.aboutLabel}</div>}
          {m.text && <div className="said" style={{ maxWidth: '100%' }}>{m.lines ? m.lines.map((l, i) => <span key={i} className="said-l">{l || '\u200b'}</span>) : m.text}</div>}
        </div>
      )}
      {m.role === 'model' && <CoachReply m={m} />}
      {m.role === 'action' && (
        <div className="stack gap8">
          {m.results.map((r) => (
            <ActionCard key={r.id} r={r} undone={m.undone.includes(r.id)} confirmed={m.confirmed.includes(r.id)} replaced={replaced.includes(r.id)} fresh={!!m.fresh}
              onUndo={() => { r.undo?.(); haptic('light'); setMsgs((x) => x.map((y) => (y.id === m.id && y.role === 'action' ? { ...y, undone: [...y.undone, r.id] } : y))); }}
              onConfirm={() => { r.button?.run(); haptic('confirm'); setMsgs((x) => x.map((y) => (y.id === m.id && y.role === 'action' ? { ...y, confirmed: [...y.confirmed, r.id] } : y))); }} />
          ))}
          <UndoAll results={m.results} undone={m.undone} confirmed={m.confirmed} fresh={!!m.fresh}
            onUndo={(ids) => { for (const id of ids) m.results.find((r) => r.id === id)?.undo?.(); setMsgs((x) => x.map((y) => (y.id === m.id && y.role === 'action' ? { ...y, undone: [...y.undone, ...ids] } : y))); }} />
        </div>
      )}
      {m.role === 'error' && (
        <Collapse open={!m.leaving} ms={420}>
        <div className={`plinth-2 small coach-err${m.leaving ? ' leaving' : ''}`} role="alert" style={{ padding: '10px 14px' }}>
          <div style={{ color: 'var(--bad)' }}>{m.text}</div>
          {(m.retry || m.fix) && (
            <div className="row-flex coach-err-acts" style={{ gap: 8, marginTop: 10 }}>
              {m.retry && <button className="chip sm press" onClick={() => onErr(m, 'retry')}><Icon name="repeat" size={13} />{t('Try again')}</button>}
              {m.fix === 'settings' && <button className="chip sm press" onClick={() => onErr(m, 'settings')}><Icon name="settings" size={13} />{t('Open settings')}</button>}
            </div>
          )}
        </div>
        </Collapse>
      )}
    </div>
  );
});
const USER_ROW: CSSProperties = { transformOrigin: '100% 100%', alignSelf: 'flex-end', maxWidth: '84%', display: 'flex' };
const OTHER_ROW: CSSProperties = { transformOrigin: '0% 0%', alignSelf: 'stretch', maxWidth: '100%' };

/**
 * One of the Coach's answers. It writes itself in a word at a time at a calm, steady pace (however the network delivers it),
 * each word fading up into place; the text is laid out as it will stay, so no word ever moves once shown. Below it, the
 * play button's row is held open from the first word, so the button fades in where room was already made and nothing is
 * pushed when the answer ends.
 */
function CoachReply({ m }: { m: Extract<Msg, { role: 'user' | 'model' }> }) {
  const t = useT();
  const { shown, done } = useWordReveal(m.text, !!m.streaming, !!m.seeded);
  // every word keeps its layer while the answer writes itself in (.writing, styles.css), and all of them are let go together
  // once the last one is in (each word's own drop redrew the tiles under it while the next ones came in: the conversation
  // stood still for three frames in four on the phone, 14 Oct r11)
  const [settled, setSettled] = useState(!!m.seeded);
  useEffect(() => { if (!done || settled) return; const id = setTimeout(() => setSettled(true), 1500); return () => clearTimeout(id); }, [done, settled]); // (the last word is in by then: born up to 520 ms late, 900 to come in)
  // the typing dots don't vanish when the first word comes: they melt away over it (and are then taken out)
  const typed = useRef(!shown);
  const [dotsGone, setDotsGone] = useState(false);
  // the words under the dots ("Looking at…", "Still thinking…"): the dots stay the same element the whole time (a new
  // parent rebuilt them, and they blinked out and grew back); a new line rises in while the old one fades out over it
  const said = useRef<{ now?: string; before?: string }>({});
  if (said.current.now !== m.status) said.current = { now: m.status, before: said.current.now };
  // (after every hook) no answer, only the quiet note (the built-in reader logged it): the note alone, never typing dots
  if (!m.streaming && !m.text.trim() && m.note) return <div className={`xs t3 coach-after${m.seeded ? '' : ' fresh'}`}>{m.note}</div>;
  if (!shown) return (
    <div className="coach-looking">
      <TypingDots />
      {(said.current.now || said.current.before) && (
        <div className="coach-look-cell">
          {said.current.before && <div key={`o${said.current.before}`} className="xs t2 coach-look coach-look-out" aria-hidden>{said.current.before}</div>}
          {said.current.now && <div key={said.current.now} className="xs t2 coach-look">{said.current.now}</div>}
        </div>
      )}
    </div>
  );
  return (
    <div className="coach-answer">
      {typed.current && !dotsGone && <div className="typing typing-out" aria-hidden onAnimationEnd={(e) => { if (e.target === e.currentTarget) setDotsGone(true); }}><i /><i /><i /></div>}
      {/* (the last words under the dots fade with them, never cut) */}
      {typed.current && !dotsGone && said.current.now && <div className="xs t2 coach-look coach-look-gone" aria-hidden>{said.current.now}</div>}
      <div className={`reply calm coach-reply${m.seeded ? ' still' : ''}${settled ? '' : ' writing'}`} aria-live="polite"><Rich text={shown} id={m.id} still={m.seeded} hold={!settled} /></div>
      {done && m.note && <div className={`xs t3 coach-after${m.seeded ? '' : ' fresh'}`} style={{ marginTop: 8 }}>{m.note}</div>}
      {/* a web search's pages, as small chips under the answer (they open in the browser) */}
      {done && !!m.sources?.length && (
        <div className={`coach-sources${m.seeded ? '' : ' fresh'}`} aria-label={t('Sources')}>
          {m.sources.map((x, i) => <a key={x.url} className="chip sm press src-chip" href={x.url} target="_blank" rel="noopener noreferrer" style={{ ['--i' as string]: i }}><Icon name="globe" size={12} />{x.title}</a>)}
        </div>
      )}
      <div className={`reply-foot coach-after${done ? '' : ' held'}${m.seeded ? '' : ' fresh'}`}>{done && <SpeakButton id={m.id} text={m.text} />}</div>
    </div>
  );
}

export function Coach({ props }: { props: { listen?: boolean; date?: string; mealId?: string; /** the orb screen's conversation, carried over by "Continue in Coach" */ seed?: { said: string; reply: string }[]; /** a question to ask as soon as it opens (the weekly review's button) */ ask?: string; /** opened by holding something ("Ask the Coach about this", ui/askHold.ts) */ about?: About } }) {
  const t = useT();
  const present = useIsPresent();
  const lang = useLang();
  const pop = useUI((u) => u.pop);
  const push = useUI((u) => u.push);
  const ai = useAi();
  const exercises = useStore((x) => x.exercises); // (only these: the whole store re-drew the chat on any change)
  const pool = useMemo(() => allExercises(exercises), [exercises]);
  // the conversation carries on where you left it (kept on this device); the orb screen's turns join the end of it
  const [msgs, setMsgs] = useState<Msg[]>(() => [...loadThread(), ...(props.seed ?? []).flatMap((x) => [
    ...(x.said ? [{ id: uid('m'), role: 'user' as const, text: x.said, seeded: true, at: Date.now() }] : []),
    ...(x.reply ? [{ id: uid('m'), role: 'model' as const, text: x.reply, seeded: true, at: Date.now() }] : []),
  ])]);
  const [leaving, setLeaving] = useState<Msg[] | null>(null);
  const [cleared, setCleared] = useState(false); // "New chat" was tapped: the suggestions rise in one after another
  // the suggestions step away when something is sent (they used to vanish in one frame): where they were, at the top of an
  // empty chat or under an old one
  const [tipsOut, setTipsOut] = useState<'top' | 'resume' | null>(null);
  // A long saved chat is not built all at once on the tap that opens the Coach (60 messages of word-by-word text held the
  // tap for ~90 ms on the phone): the newest ones are there from the first frame, scrolled to the bottom as always, and the
  // older ones are added above them a couple at a time once the sheet has risen, with the scroll kept exactly in place.
  const [older, setOlder] = useState(() => Math.max(0, msgs.length - TAIL));
  // (saved when the phone is idle, not in the frame the answer ends: turning 60 messages into JSON, writing it and adding to
  // the archive held the frames while the last words were still coming in; a pending save is made at once on close)
  const pendingSave = useRef<Msg[] | null>(null);
  useEffect(() => {
    if (!present || msgs.some((m) => m.role === 'model' && m.streaming)) return;
    pendingSave.current = msgs;
    const idle = (window as any).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 300));
    const cancel = (window as any).cancelIdleCallback ?? clearTimeout;
    const id = idle(() => { if (pendingSave.current) { saveThread(pendingSave.current); pendingSave.current = null; } }, { timeout: 2000 });
    return () => cancel(id);
  }, [msgs, present]);
  useEffect(() => {
    if (!present) return;
    return () => { if (pendingSave.current) { saveThread(pendingSave.current); pendingSave.current = null; } };
  }, [present]);
  // back to an old conversation after a break: the suggestions come back under it until something is sent
  const [resumed, setResumed] = useState(() => { const last = [...msgs].reverse().find((m) => 'at' in m && m.at) as { at?: number } | undefined; return msgs.length > 0 && !props.ask && !props.listen && (!!props.about || !last?.at || Date.now() - last.at > 30 * 60_000); });
  // what was held to open it: a chip over the typing bar until something is sent (× takes it off), its questions as the suggestions
  const [about, setAbout] = useState<About | null>(props.about ?? null);
  const aboutShown = useRef(about); if (about) aboutShown.current = about;
  const [input, setInput] = useState('');
  const [photo, setPhoto] = useState<{ url: string; blob: Blob } | null>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const pickPhoto = async (f?: File) => { if (!f) return; try { const blob = await downscale(f, 1280); setPhoto({ url: URL.createObjectURL(blob), blob }); haptic('light'); } catch { say({ id: uid('m'), role: 'error', text: t('Couldn’t read that image.') }); } };
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [hearing, setHearing] = useState(false);
  const listening = useRef(false); listening.current = recording || hearing;
  const draft = useRef(''); // what was already typed when you started speaking (your words are added after it)
  const ctl = useRef<AbortController | null>(null);
  const clearing = useRef<Animation | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true); // the list stays at its end (see below)
  const listMoved = useRef<(() => void) | null>(null); // a message in flight keeps to its landing place as the list moves
  const ride = useRef<((rider: HTMLElement) => { off: number; unride: () => void }) | null>(null); // …and glides with the list (see glide)
  const user = useRef(false); // a finger or a wheel is moving the list (or its fling is still running)
  const movedAt = useRef(0);
  const lastScroll = useRef(0);
  const alive = useRef(true);
  const flights = useRef(new Set<() => void>());
  const msgsRef = useRef<Msg[]>([]); msgsRef.current = msgs;
  // the orb screen added to the conversation while the Coach is open underneath: show it (and never save over it)
  const busyRef = useRef(false); busyRef.current = busy;
  useEffect(() => present ? onThreadChange(() => { if (busyRef.current) return; const next = loadThread(); msgsRef.current = next; setMsgs(next); }) : undefined, [present]);

  // Release this session when closing starts; its delayed unmount must not stop a newly opened Coach/orb session.
  useEffect(() => {
    if (!present) return;
    alive.current = true;
    return () => { alive.current = false; flights.current.forEach((cancel) => cancel()); clearing.current?.cancel(); stopSpeaking(); ctl.current?.abort(); mic.release('coach'); };
  }, [present]);
  useEffect(() => () => { for (const m of msgsRef.current) if ('image' in m && m.image) URL.revokeObjectURL(m.image); }, []);
  // The older messages are added above what you are looking at, and it stays exactly where it is.
  const placed = useRef(false);
  const fromBottom = useRef(-1);
  useLayoutEffect(() => {
    const el = bodyRef.current; if (!el) return;
    if (!placed.current) {
      // the newest messages don't fill the screen: build more of them now, before the first paint, so nothing lands
      // later above a list that isn't scrollable yet
      if (older > 0 && el.scrollHeight <= el.clientHeight + 1) { setOlder((n) => Math.max(0, n - TAIL)); return; }
      placed.current = true;
      el.scrollTop = el.scrollHeight;
    } else if (fromBottom.current >= 0) {
      el.scrollTop = el.scrollHeight - fromBottom.current; fromBottom.current = -1;
    }
    lastScroll.current = el.scrollTop;
    el.toggleAttribute('data-scrollable', el.scrollHeight > el.clientHeight + 1);
  }, [older]);
  // Saved chat is placed before the first paint (below, with the older messages); from then on the list stays at its end
  // (`pinned`) until you scroll up to read. Only your finger changes that: the list moving by itself (an answer arriving,
  // the keyboard coming or going, a message sent) never counts as "scrolled up". (It used to: the keyboard dropping after
  // a send moved the list, that read as you scrolling away, and the answer then wrote itself in under the typing bar.)
  useLayoutEffect(() => {
    const el = bodyRef.current; if (!el) return;
    if (placed.current) { el.scrollTop = endTop(el); lastScroll.current = el.scrollTop; }
    const reduce = () => document.documentElement.dataset.motion === 'reduce' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // What the list moved by itself glides the rest of the way on one continuous spring (critically damped, ~0.5 s,
    // starting from rest): the list goes to its end before the frame is drawn, so nothing new lands under the bar, and the
    // move is played back from where it was. A line that arrives while the last one is still gliding adds to the same
    // motion instead of restarting it, so the list never steps or lurches; when something shrinks away at the end (an
    // empty play-button row), the list glides down the same way. Drawn as `translate`, which adds to the `transform` the
    // sent bubble's glide plays on the list at the same time.
    const thread = el.querySelector<HTMLElement>('.coach-thread');
    // The spring is handed to the browser as a ready-made curve (Web Animations on `translate`), so the compositor draws it
    // at the screen's full rate even while the page is busy writing the next words in (it used to be stepped from script
    // every frame, so a busy frame was a missed step). A new move picks the spring up where it is on screen.
    const W = 8; // (the exact critically damped spring: x(t) = (x0 + (v0 + W x0) t) e^(-W t); 8, unhurried: ~0.7 s, was 10)
    let move: Animation | null = null, x0 = 0, v0 = 0;
    // A message in flight rides the list's glide too (the same curve on its `translate`, on the same clock): it used to
    // follow only the scroll position, so while the keyboard went down it ran ahead of its bubble (by up to 200 px) and
    // stepped back onto it as it landed.
    const riders = new Set<HTMLElement>(); let riding: Animation[] = [];
    let last: { frames: Keyframe[]; opts: KeyframeAnimationOptions } | null = null;
    const mount = (r: HTMLElement) => { if (!move || !last) return; const a = r.animate(last.frames, last.opts); if (move.startTime !== null) a.startTime = move.startTime; riding.push(a); };
    const now$ = () => { // where the glide is right now (px) and how fast it moves (px/s)
      if (!move) return { off: 0, vel: 0 };
      const t = Math.max(0, Number(move.currentTime ?? 0)) / 1000;
      const c = v0 + W * x0, e = Math.exp(-W * t);
      return { off: (x0 + c * t) * e, vel: (v0 - W * c * t) * e };
    };
    const stop = () => { const m = move; move = null; m?.cancel(); riding.forEach((a) => a.cancel()); riding = []; };
    const glide = (d: number) => {
      if (Math.abs(d) < 0.5 || reduce() || !thread) return;
      const cur = now$(); stop();
      x0 = cur.off + d; v0 = cur.vel;
      const c = v0 + W * x0;
      const pos = (t: number) => (x0 + c * t) * Math.exp(-W * t);
      let T = 0.05; while (T < 3 && (Math.abs(pos(T)) >= 0.3 || Math.abs((v0 - W * c * T) * Math.exp(-W * T)) >= 6)) T += 1 / 60;
      const n = Math.max(2, Math.ceil(T * 40));
      const frames = Array.from({ length: n + 1 }, (_, i) => ({ translate: i === n ? '0 0px' : `0 ${pos(T * i / n).toFixed(2)}px`, offset: i / n }));
      const opts = { duration: T * 1000, easing: 'linear' };
      const m = thread.animate(frames, opts);
      const at = document.timeline.currentTime; if (at !== null) m.startTime = at; // (riders share its clock)
      move = m; last = { frames, opts }; m.onfinish = () => { if (move === m) move = null; };
      riders.forEach(mount);
    };
    // (`off`: how far the glide still has to go, already in what was measured on screen)
    ride.current = (r) => { riders.add(r); mount(r); return { off: now$().off, unride: () => { riders.delete(r); } }; };
    // to the end, at once; `smooth`: and play the move back on the spring (the keyboard's ride is already smooth: 1:1)
    const pin = (smooth: boolean) => {
      const from = lastScroll.current, to = endTop(el);
      if (Math.abs(el.scrollTop - to) > 0.5) el.scrollTop = to;
      listMoved.current?.(); // (also when the browser moved it: the list grew, and the scroll event would come a frame late)
      lastScroll.current = el.scrollTop;
      if (smooth) glide(el.scrollTop - from);
    };
    // your finger on the list: whatever is still gliding becomes the scroll position (what you see stays put)
    const hold = () => {
      if (!move) return;
      const { off } = now$(); stop();
      el.scrollTop -= off; lastScroll.current = el.scrollTop;
    };
    // the finger (or a wheel) has let the list come to rest: it is pinned again if it was left at its end
    let quiet: ReturnType<typeof setTimeout> | undefined;
    const rest = () => { clearTimeout(quiet); if (!user.current) return; user.current = false; pinned.current = endTop(el) - el.scrollTop < 80; };
    const restSoon = () => { clearTimeout(quiet); quiet = setTimeout(() => { if (performance.now() - movedAt.current > 90) rest(); else restSoon(); }, 110); };
    const down = () => { clearTimeout(quiet); hold(); user.current = true; };
    const wheel = () => { down(); restSoon(); };
    el.addEventListener('touchstart', down, { passive: true });
    el.addEventListener('touchend', restSoon, { passive: true });
    el.addEventListener('touchcancel', restSoon, { passive: true });
    el.addEventListener('wheel', wheel, { passive: true });
    el.addEventListener('scrollend', rest);
    const ro = new ResizeObserver(() => {
      el.toggleAttribute('data-scrollable', el.scrollHeight > el.clientHeight + 1);
      if (pinned.current && !user.current) pin(true); else lastScroll.current = el.scrollTop;
    });
    ro.observe(el);
    if (thread) ro.observe(thread);
    // The keyboard slides over the sheet and the bar rides up on it (ui/Sheet.tsx). A list at its end rides up with it,
    // frame for frame, so its last line stays just above the bar, and comes back down with it when it leaves. Scrolled up
    // to read, it is left where it is (only the room the keyboard leaves behind goes with it).
    // (the melt above the bar, styles.css, rides with the bar too: it is told where the keyboard is each frame)
    const melt = () => el.style.setProperty('--kb-now', `${Math.round(kb.get() * 10) / 10}px`);
    melt();
    const offKb = kb.on('change', () => {
      melt();
      if (user.current) return;
      if (pinned.current) { pin(false); return; }
      const to = endTop(el);
      if (el.scrollTop > to + 0.5) { el.scrollTop = to; lastScroll.current = el.scrollTop; listMoved.current?.(); }
    });
    return () => {
      ro.disconnect(); offKb(); stop(); clearTimeout(quiet);
      el.removeEventListener('touchstart', down); el.removeEventListener('touchend', restSoon); el.removeEventListener('touchcancel', restSoon);
      el.removeEventListener('wheel', wheel); el.removeEventListener('scrollend', rest);
    };
  }, []);
  // A typed message leaves the field the way a sent iMessage does: the very words you typed, where you typed them, lift out
  // of the pill, their bubble gathers round them out of the field's inside shape, and they glide on a soft spring to their
  // place in the conversation, which moves up to make room on the same spring. The bubble keeps the field's line breaks and
  // the words are drawn at the field's size on the way (scaled down to the bubble's as they land), so nothing re-wraps or
  // jumps from one end to the other. A copy of the bubble flies above everything (the list clips its own contents) and hands
  // over to the real one where it lands. Browser-run (Web Animations on transform/opacity only), at the screen's full rate.
  const flyFrom = useRef(new Map<string, { x: number; y: number; fs: number; box: { l: number; r: number; t: number; b: number }; win: { t: number; b: number }; fresh?: boolean }>());
  const flew = useRef(new Set<string>()); // these arrive by flight, not by the bubble's own rise
  const flown = (id: string) => flew.current.has(id);
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!present || !el || !flyFrom.current.size) return;
    // the emptied pill's room under the list goes on this frame (it moves the landing place, so it goes first); the pill
    // itself holds its shape under the copy coming up over it, then closes up as the copy lifts away (CLOSE); it stays
    // wide until "Ask the Coach" comes back
    holdOpen.current = true;
    const bar = composerRef.current;
    const said = [...flyFrom.current.values()].some((f) => f.fresh);
    // (a class that points the pill's parts at that curve: changing the curve's own property on the bar restyled every
    // part of it, and on the conversation every message, a stall on the tap)
    bar?.classList.add('closing');
    fit(CLOSE);
    setTimeout(() => bar?.classList.remove('closing'), CLOSE.delay + CLOSE.duration + 40);
    // said words: the bar is hidden under the lifting pill (below) and closes up at once there, unseen (no slide of the
    // pill's edge, no camera coming in late); it fades back in whole once the bubble has gone
    // (once it has faded out under the pill, SAID_OUT: closed up while still showing, its edge and the camera jumped)
    if (said && bar) setTimeout(() => { if (!alive.current) return; holdOpen.current = false; bar.classList.add('snap'); fit(CLOSE); requestAnimationFrame(() => requestAnimationFrame(() => bar.classList.remove('snap'))); }, SAID_OUT + 10);
    for (const [id, from] of flyFrom.current) {
      flyFrom.current.delete(id);
      const bubble = el.querySelector<HTMLElement>(`[data-mid="${id}"] .said`);
      const app = document.querySelector<HTMLElement>('.app');
      if (!bubble || !app) continue;
      // the conversation goes to its end at once, then is played back up from where it was (one move, nothing jumps)
      const before = el.scrollTop;
      el.scrollTop = endTop(el); lastScroll.current = el.scrollTop;
      const lift = el.scrollTop - before;
      const B = bubble.getBoundingClientRect();
      const cs = getComputedStyle(bubble);
      const k = from.fs / parseFloat(cs.fontSize);
      // its first line starts on the field's first line, letter on letter
      const dx = from.x - (B.left + parseFloat(cs.paddingLeft) * k);
      const dy = from.y - (B.top + parseFloat(cs.paddingTop) * k);
      // the pill as it was, in the copy's own units as it starts (where its bubble comes from)
      const W = B.width, H = B.height, RS = 27 / k; // (RS: the pill's own corners)
      const x0 = (from.box.l - B.left - dx) / k, x1 = (from.box.r - B.left - dx) / k;
      const y0 = (from.box.t - B.top - dy) / k, y1 = (from.box.b - B.top - dy) / k;
      const solid = (c: string): [string, number] => { // a colour without its alpha, and the alpha
        const n = (c.match(/-?[\d.]+/g) ?? []).map(Number);
        const [r = 0, g = 0, b = 0, a = 1] = n;
        return [c.startsWith('color(') ? `color(srgb ${r} ${g} ${b})` : `rgb(${r}, ${g}, ${b})`, a];
      };
      const [fill, fillA] = solid(cs.backgroundColor), [ink, inkA] = solid(cs.color);
      const copy = document.createElement('div');
      copy.className = 'said coach-fly';
      copy.setAttribute('aria-hidden', 'true');
      Object.assign(copy.style, { left: `${B.left}px`, top: `${B.top}px`, width: `${W}px`, height: `${H}px` });
      // ONE SHAPE: it starts as the whole pill (its full width, its corners, its tint, top sheen and rim, solid: the pill's
      // colours as they look over the sheet, so nothing behind shows through), covering the pill (which closes up at once
      // under it), and springs into the bubble (its size, corners 20 and the tail's 6), its colour turning from the
      // pill's into the bubble's. A shape's size and corners can't be animated by moves alone, so it is cut into eight
      // pieces (four corners, which scale evenly so a corner stays round, and four straight pieces between them), each
      // moved and scaled on the same spring, so at every moment they make one outline. The two colours are that same set
      // of pieces twice, each under one opacity (the pill's and the bubble's), so there is only ever the one outline.
      const sh = document.createElement('i'); sh.className = 'fly-sh'; sh.style.boxShadow = cs.boxShadow;
      type Geo = { L: number; R: number; T: number; B: number; r: number; q: number };
      const g0: Geo = { L: x0, R: x1, T: y0, B: y1, r: RS, q: RS }, g1: Geo = { L: 0, R: W, T: 0, B: H, r: 20, q: 6 };
      // [x, y, width, height] of each piece (the straight ones reach 1 px under their neighbours: no hairline between them)
      const cut = ({ L, R, T, B: Bt, r, q }: Geo) => [
        [L, T, r, r], [R - r, T, r, r], [L, Bt - r, r, r], [R - q, Bt - q, q, q],
        [L + r - 1, T, Math.max(0, R - L - 2 * r) + 2, r],
        [L, T + r - 1, R - L, Math.max(0, Bt - T - 2 * r) + 2],
        [L + r - 1, Bt - r, Math.max(0, R - L - r - q) + 2, r],
        [R - q, Bt - r, q, r - q + 1],
      ];
      const c0 = cut(g0), c1 = cut(g1);
      const base = c0.map((a, i) => [Math.max(a[2], c1[i][2], 1), Math.max(a[3], c1[i][3], 1)]);
      const names = ['tl', 'tr', 'bl', 'br', 'top', 'mid', 'bot', 'side'];
      const pieces = (cls: string) => {
        const group = document.createElement('div'); group.className = `fly-shape ${cls}`;
        group.innerHTML = names.map((n, i) => `<i class="fp-${n}" style="width:${base[i][0]}px;height:${base[i][1]}px"></i>`).join('');
        return group;
      };
      const pill = pieces('fly-pill'), tone = pieces('fly-tone');
      // (the bubble's colour as it looks over the page: its own colour, solid, under one opacity that is its alpha, so the
      // eight pieces blend with whatever is behind exactly as the bubble does and never overlap at a seam. It used to be the
      // colour mixed onto a fixed navy, which is how it looks over no page in particular: it came up slate and drifted to
      // the bubble's colour on the way, 14 Oct r11)
      tone.style.setProperty('--fly-fill', fill);
      const words = document.createElement('div'); words.className = 'fly-words'; words.style.color = ink;
      bubble.childNodes.forEach((n) => words.appendChild(n.cloneNode(true)));
      // (and, as it settles in its place with only the page behind it, the bubble's own see-through glass, so the real
      // bubble taking over is the same picture: the solid colour can't match the page behind it everywhere)
      // (its colour as the bubble's own, alpha and all, not a solid colour under an opacity: the two blend a level or two
      // apart, a change you could see as the copy handed over)
      const glass = document.createElement('i'); glass.className = 'fly-end'; glass.style.background = cs.backgroundColor;
      // said words: "Transcribing…" is still in the pill as it lifts and fades as the words come up (one pill, never empty)
      let ghost: HTMLElement | null = null;
      if (from.fresh) {
        ghost = document.createElement('div'); ghost.className = 'fly-ghost'; ghost.textContent = t('Transcribing…');
        const n = Math.max(1, words.querySelectorAll('.said-l').length);
        Object.assign(ghost.style, { left: cs.paddingLeft, top: `calc(${cs.paddingTop} + ${n - 1} * ${cs.lineHeight})` });
      }
      // (said words: laid out at the bubble's width from the first frame, all lines, in a window whose top edge rides the
      // shape's top while the words in it are held still, so the growing bubble uncovers them, the top line last, and no
      // line ever pops in or shows past its edge; moves only: the window and the words move by the same amount, opposite.
      // The window's top is soft across the bubble's padding: a line comes up in it as it is uncovered, never cut by an edge)
      let reveal: HTMLElement | null = null;
      if (from.fresh) {
        reveal = document.createElement('div'); reveal.className = 'fly-reveal'; reveal.style.setProperty('--pad', cs.paddingTop);
        Object.assign(words.style, { position: 'absolute', left: `calc(40px + ${cs.paddingLeft})`, top: cs.paddingTop, width: `${W - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)}px` });
        reveal.appendChild(words);
      }
      // (said words: no pill of its own. The bar under it fades as the bubble's colour comes up in its shape, so the pill
      // dissolves into the bubble; a solid copy of the pill, cut away at 250 ms, was a second colour step on the way)
      copy.append(sh, glass, ...(from.fresh ? [] : [pill]), tone, reveal ?? words, ...(ghost ? [ghost] : []));
      app.appendChild(copy);
      // the send button as it was (the arrow) stays on top for a moment and fades as the shape starts to leave: the bar,
      // stop button and all, is then under the shape and shows where it has left (the shape is never cut by the button)
      const btn = composerRef.current?.querySelector<HTMLElement>('.coach-send');
      const ss = btn && getComputedStyle(btn);
      let stand: HTMLElement | null = null;
      if (btn && ss && parseFloat(ss.opacity) > 0.01) {
        const sr = btn.getBoundingClientRect();
        stand = btn.cloneNode(true) as HTMLElement;
        stand.className = 'coach-send on fly-send'; stand.removeAttribute('tabindex'); stand.setAttribute('aria-hidden', 'true'); // (not busy: the arrow)
        Object.assign(stand.style, { left: `${sr.left + sr.width / 2 - btn.offsetWidth / 2}px`, top: `${sr.top + sr.height / 2 - btn.offsetHeight / 2}px`, transform: ss.transform, opacity: ss.opacity });
        app.appendChild(stand);
        stand.animate([{ opacity: ss.opacity }, { opacity: 0 }], { duration: 120, easing: 'cubic-bezier(.4, 0, .6, 1)', fill: 'forwards' }); // (a fade, from the tap: the copy coming up under it no longer cuts it off)
      }
      // it joins a glide the list is still finishing, so its place is where the bubble will be once that is done
      const rider = ride.current?.(copy); const top0 = B.top - (rider?.off ?? 0); copy.style.top = `${top0}px`;
      bubble.style.visibility = 'hidden';
      const at = document.timeline.currentTime;
      const animations: Animation[] = [];
      const go = (a: Animation) => { if (at !== null) a.startTime = at; animations.push(a); return a; };
      // the real button (stop, now) waits hidden under the shape until the shape has risen clear of it, then fades in
      // (shown at once, a sliver of it peeked out under the shape's rounded corner as it left)
      // (said words: the whole bar waits hidden, then comes back together: field, camera and the stop button)
      if (from.fresh) {
        // (it fades out under the lifting pill rather than vanishing, and comes back whole once the bubble has gone)
        const T = SAID_BACK + SAID_IN;
        const hold = (o: string | number, from: string | number = o): Keyframe[] => [{ opacity: from, easing: 'cubic-bezier(.4, 0, .6, 1)' }, { opacity: 0, offset: SAID_OUT / T }, { opacity: 0, offset: SAID_BACK / T, easing: 'cubic-bezier(.25, 0, .25, 1)' }, { opacity: o }];
        // (each comes back to how it is on the closed bar: the camera is hidden on the open one, and coming back to that it
        // stayed hidden until the hold ended, an empty seat for a quarter of a second)
        const back = (e: Element | null | undefined) => { if (!e) return; const now = getComputedStyle(e).opacity; go((e as HTMLElement).animate(hold(e.classList.contains('coach-cam') ? 1 : now, now), { duration: T, easing: 'linear' })); };
        // (the camera fades on its own glass, never on its slot: a fading slot cut the camera's frost off from the page
        // until the fade ended, then the frost popped back in; its shadow fades on the slot's own ::before)
        composerRef.current?.querySelectorAll('.cf-tint, .cf-sh, .cf-glass, .cf-text, .coach-cam').forEach((e) => back(e)); if (btn) go(btn.animate(hold(1, getComputedStyle(btn).opacity), { duration: T, easing: 'linear' })); // (the button was fading in from hidden: its own value now is not where it ends)
        const slot = composerRef.current?.querySelector<HTMLElement>('.coach-cam-slot');
        if (slot) go(slot.animate(hold(1), { duration: T, easing: 'linear', pseudoElement: '::before' }));
      } else if (btn) go(btn.animate([{ opacity: 0 }, { opacity: 0, offset: 0.74 }, { opacity: 1 }], { duration: 680, easing: 'linear' }));
      const opts = { duration: from.fresh ? FLY_SAID.duration : FLY.duration, easing: from.fresh ? FLY_SAID.easing : FLY.easing, fill: 'forwards' as const };
      const shape = { duration: from.fresh ? FLY_SAID_SHAPE.duration : FLY_SHAPE.duration, easing: from.fresh ? FLY_SAID_SHAPE.easing : FLY_SHAPE.easing, fill: 'forwards' as const };
      const fade = (ms: number, delay = 0) => ({ duration: ms, delay, easing: 'cubic-bezier(.3, 0, .2, 1)', fill: 'backwards' as const });
      const inked = (a: Animation) => { a.finished.then(() => { words.style.color = cs.color; a.cancel(); }, () => {}); return a; };
      const flight = go(copy.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${k})` }, { transform: 'none' }], opts));
      const place = (c: number[], i: number) => `translate(${c[0]}px, ${c[1]}px) scale(${c[2] / base[i][0]}, ${c[3] / base[i][1]})`;
      for (const group of from.fresh ? [tone] : [pill, tone]) [...group.children].forEach((p, i) => go((p as HTMLElement).animate([{ transform: place(c0[i], i) }, { transform: place(c1[i], i) }], shape)));
      const sx = (x1 - x0) / W, sy = (y1 - y0) / H;
      [
        // its colour turns from the pill's into the bubble's as it leaves the pill: the bubble's colour comes up in the shape
        // (to its own alpha: see --fly-fill) as the pill under it goes
        go(tone.animate([{ opacity: 0 }, { opacity: fillA }], from.fresh ? { duration: 240, easing: 'cubic-bezier(.3, 0, .2, 1)', fill: 'both' } : { ...fade(200, 40), fill: 'both' })),
        // (typed: the copy's solid pill comes up over the real one, which holds its shape meanwhile (CLOSE), over 200 ms
        // rather than replacing it: the real pill's frost takes the colour of whatever is behind it, warm over the
        // palette's glow with the keyboard up, and the solid copy, drawn for an average page, turned it slate in one frame,
        // a flash at the bar; 60 ms was still a step on the phone's frames. It goes under the bubble's colour over 200 ms:
        // cut in 40 ms it was a step under a see-through bubble)
        ...(from.fresh ? [] : [go(pill.animate([{ opacity: 0, easing: 'cubic-bezier(.4, 0, .2, 1)' }, { opacity: 1, offset: 200 / 450 }, { opacity: 1, offset: 250 / 450, easing: 'cubic-bezier(.4, 0, .6, 1)' }, { opacity: 0 }], { duration: 450, easing: 'linear', fill: 'forwards' }))]),
        // once it has the bubble's shape (its corners and size done, two frames held there), the eight pieces give way to the
        // bubble's own glass in one frame: the same colour over the same page, so nothing changes but the edges, drawn as the
        // resting bubble draws them (a 200 ms cross-fade of the two was a double layer of tint, a colour drift on the way)
        go(glass.animate([{ opacity: 1 }, { opacity: 1 }], { duration: 1, delay: shape.duration, fill: 'forwards' })),
        go(tone.animate([{ opacity: 0 }, { opacity: 0 }], { duration: 1, delay: shape.duration, fill: 'forwards' })),
        // (typed: the emptied bar stays drawn under it the whole way: the shape starts as the pill, over the pill)
        go(sh.animate([{ transform: `translate(${x0}px, ${y0}px) scale(${sx}, ${sy})` }, { transform: 'none' }], shape)),
        // its shadow comes in with it, over the real pill's own, rather than doubling it on the first frame (said words: as
        // the shape becomes the bubble, so the bubble's shadow never shows round an outline that isn't there yet)
        go(sh.animate([{ opacity: 0 }, { opacity: 1 }], from.fresh ? { duration: 420, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'backwards' } : { duration: 200, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'backwards' })),
        // the field's bright ink settles to the bubble's softer one; said words (never in the field) come up inside the
        // pill as it lifts, softly, while it is still the pill, and are the bubble's ink by the time it is the bubble
        // (once there, the ink becomes the bubble's own colour, alpha and all, under no opacity, as the real bubble draws it:
        // the copy's last frame and the bubble's first are then the same letters, not a level apart at every edge)
        inked(from.fresh
          ? go(words.animate([{ opacity: 1 }, { opacity: 1, offset: 0.7 }, { opacity: inkA }], { duration: SAID_INK, easing: 'linear', fill: 'both' }))
          : go(words.animate([{ opacity: 1 }, { opacity: inkA }], { ...fade(380, 60), fill: 'both' }))),
      ];
      // said words: uncovered by the growing bubble (above), and coming in as "Transcribing…" goes: it fades out over
      // 110 ms from the moment the pill starts to change, the words come in over 260 ms from 80 ms on, eased (the two are
      // never both readable at once: one is under 30% whenever the other is over it)
      if (reveal) {
        const top = Math.max(0, y0);
        go(reveal.animate([{ transform: `translateY(${top}px)` }, { transform: 'none' }], shape));
        go(words.animate([{ transform: `translateY(${-top}px)` }, { transform: 'none' }], shape));
        go(reveal.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, delay: 80, easing: 'cubic-bezier(.2, 0, .2, 1)', fill: 'backwards' }));
        // (and settle the last few pixels up into place as they come, on a soft ease: they arrive, they don't appear)
        go(words.animate([{ transform: 'translateY(4px)' }, { transform: 'none' }], { duration: 560, delay: 80, easing: 'cubic-bezier(.2, 0, 0, 1)', fill: 'backwards', composite: 'add' }));
        // (from where the field's own "Transcribing…" was, if a quick answer caught it still fading in)
        const was = composerRef.current?.querySelectorAll<HTMLElement>('.cf-status')[1];
        if (ghost) go(ghost.animate([{ opacity: was ? getComputedStyle(was).opacity : 1 }, { opacity: 0 }], { duration: 110, easing: 'cubic-bezier(.3, 0, .7, 1)', fill: 'both' }));
      }
      if (stand) setTimeout(() => stand?.remove(), 140);
      // lines that were scrolled out of a long draft's view come in on the way, rather than appearing over the chat
      if (!from.fresh) [...words.children].forEach((line, i) => {
        const ly = from.y + i * CF_LINE;
        if (ly < from.win.t - 2 || ly + CF_LINE > from.win.b + 2) go((line as HTMLElement).animate([{ opacity: 0 }, { opacity: 1 }], fade(260, 60)));
      });
      const thread = el.querySelector<HTMLElement>('.coach-thread');
      if (thread && lift > 0.5) go(thread.animate([{ transform: `translate3d(0, ${lift}px, 0)` }, { transform: 'none' }], { ...opts, fill: 'none' }));
      // anything that scrolls the conversation on the way (the answer arriving) moves the landing place with it
      const scroll0 = el.scrollTop;
      const follow = () => { copy.style.top = `${top0 - (el.scrollTop - scroll0)}px`; };
      // (told in the same frame when the list is moved from here, the keyboard's ride above all: the scroll event comes a
      // frame late, and the copy trailed its landing place by that frame while the keyboard went down)
      el.addEventListener('scroll', follow, { passive: true }); listMoved.current = follow;
      // "Ask the Coach" (and the cursor) come back once the pill has mostly closed up behind the words. Sent while typing,
      // the keyboard stays up, as in iMessage, ready for the next message (it used to go down as the message landed, and
      // the whole conversation rode down with it); sent with the keyboard down, the pill's left edge glides back and the
      // camera returns in the same move.
      const field = inputRef.current; field?.classList.add('sent-away');
      const settle = () => { holdOpen.current = false; field?.classList.remove('sent-away'); fit(); };
      const back = setTimeout(from.fresh ? () => field?.classList.remove('sent-away') : settle, from.fresh ? SAID_OUT + 10 : 140);
      let landed = false;
      const cancel = () => { animations.forEach((a) => a.cancel()); stand?.remove(); land(); };
      const land = () => { if (landed) return; landed = true; flights.current.delete(cancel); rider?.unride(); el.removeEventListener('scroll', follow); if (listMoved.current === follow) listMoved.current = null; clearTimeout(back); if (alive.current && holdOpen.current) settle(); bubble.style.visibility = ''; copy.remove(); };
      flights.current.add(cancel);
      flight.finished.then(land, land);
    }
  });
  const begun = useRef(false);
  useEffect(() => {
    if (!present || !older || !placed.current) return;
    let id = 0;
    const more = () => { const el = bodyRef.current; if (el) fromBottom.current = el.scrollHeight - el.scrollTop; setOlder((n) => Math.max(0, n - 2)); };
    const idle = 'requestIdleCallback' in window ? window.requestIdleCallback : null;
    // the first ones wait until the sheet has risen; then two at a time, whenever the phone has a moment
    const wait = setTimeout(() => { id = idle ? idle(more, { timeout: 400 }) : window.setTimeout(more, 16); }, begun.current ? 0 : 700);
    begun.current = true;
    return () => { clearTimeout(wait); if (idle) window.cancelIdleCallback(id); else clearTimeout(id); };
  }, [older, present]);


  const say = (m: Msg) => setMsgs((x) => [...x, m]);
  // the fade is let go only once the old messages are out of the page (letting it go first showed them again for a frame)
  const cleared$ = useRef<Animation | null>(null);
  const finishClear = () => {
    const animation = clearing.current; clearing.current = null;
    if (animation) { animation.onfinish = null; cleared$.current = animation; }
    setLeaving(null);
  };
  useLayoutEffect(() => {
    if (leaving || !cleared$.current) return;
    cleared$.current.cancel(); cleared$.current = null;
    const thread = bodyRef.current?.querySelector<HTMLElement>('.coach-thread'); if (thread) thread.style.pointerEvents = '';
  }, [leaving]);
  const clearChat = () => {
    if (clearing.current) return;
    const previous = msgsRef.current;
    ctl.current?.abort(); stopSpeaking();
    // Clear the conversation now; only its visible text waits for the brief exit.
    msgsRef.current = []; setMsgs([]); saveThread([]); setResumed(false); setOlder(0); setCleared(true);
    const thread = bodyRef.current?.querySelector<HTMLElement>('.coach-thread');
    const reduce = document.documentElement.dataset.motion === 'reduce' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!thread || reduce) return;
    setLeaving(previous.slice(older)); // only what was on screen (older saved messages not built yet stay out)
    thread.style.pointerEvents = 'none';
    const animation = thread.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translate3d(0, -4px, 0)' }], { duration: 280, easing: 'cubic-bezier(.4, 0, .7, 1)', fill: 'forwards' });
    clearing.current = animation;
    animation.onfinish = () => { if (alive.current) finishClear(); };
  };
  const orb = (p: 'idle' | 'listening' | 'processing' | 'confirmed' | 'error') => useVoice.getState().go(p);
  useEffect(() => present ? () => { if (useVoice.getState().phase !== 'idle') useVoice.getState().go('idle'); } : undefined, [present]);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  // How many lines your words take (a hidden copy of them at the field's text width, read once per change): the pill grows
  // by whole lines, and the conversation's end moves up with it (--grow: the fade above the bar, on the same spring;
  // --grow-pad: the room under the last message, at once, and the list glides up on its own spring).
  const grown = useRef(-1);
  const fitKey = useRef(''), fieldW = useRef(0);
  const holdOpen = useRef(false); // a message just sent: the bar stays as it was until it settles (see the flight)
  const fit = (curve: { duration: number; easing: string; delay?: number } = GROW, text?: string) => {
    const ta = inputRef.current, m = measureRef.current, bar = composerRef.current, body = bodyRef.current;
    if (!ta || !m || !bar) return;
    const val = text ?? ta.value; // (`text`: grow for words about to be shown, Coach dictation)
    // Open wide while it has the keyboard, and while there are words in it (as on iOS: a draft keeps the bar wide, so its
    // lines never re-wrap under the camera coming back). Set straight on the bar: a state change here re-rendered the
    // whole conversation on every tap into the field and out of it.
    const open = document.activeElement === ta || val.length > 0 || holdOpen.current || listening.current;
    bar.classList.toggle('open', open);
    // (the words are measured again only when they or the field's width changed: each measure is a layout of the page,
    // and on a send it ran three times in the tap)
    const key = `${open}|${fieldW.current}|${val || ta.placeholder}`;
    if (key === fitKey.current) return;
    fitKey.current = key;
    const cs = getComputedStyle(ta);
    m.style.width = `${ta.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)}px`;
    m.textContent = `${val || ta.placeholder}\u200b`;
    const all = Math.max(1, Math.round(m.offsetHeight / CF_LINE)), lines = Math.min(CF_LINES, all);
    bar.classList.toggle('cf-full', all > CF_LINES); // (only then can it scroll: a scroller of its own otherwise came and went with the keyboard)
    const mid = (lines - 1) * CF_LINE;
    if (mid === grown.current) return;
    // The words ride the pill's edge: their box takes its new height at once, and they are played back from where they
    // were on the pill's own spring, so the line that moves up rises with the top edge, 16 px inside it, never cut by it
    // (the box's window is inset from the rim: a new line comes up into it from inside the pill, as text does on iOS).
    const was = grown.current;
    grown.current = mid;
    const still = document.documentElement.dataset.motion === 'reduce' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (was >= 0 && !still) {
      const now = ta.getAnimations().find((a) => a.id === 'cf-grow');
      const off = now ? new DOMMatrixReadOnly(getComputedStyle(ta).transform).f : 0;
      now?.cancel();
      const a = ta.animate([{ transform: `translateY(${off + mid - was}px)` }, { transform: 'translateY(0px)' }], { duration: curve.duration, easing: curve.easing, delay: curve.delay ?? 0, fill: 'backwards' });
      a.id = 'cf-grow';
    }
    bar.style.setProperty('--mid', `${mid}px`);
    bar.style.setProperty('--mid-k', String((mid + 4) / (CF_MAX + 4)));
    bar.style.setProperty('--sh-y', String((54 + mid) / 54));
    body?.style.setProperty('--grow', `${mid}px`); body?.style.setProperty('--grow-pad', `${mid}px`);
  };
  // The field's own line breaks, read off its hidden copy (which wraps exactly as the field does): the sent bubble keeps
  // them, so the words land line for line as they were typed. `first`: the field line the kept ones start on (blank lines
  // around the words are left out, as the message leaves them out).
  const fieldLines = (value: string) => {
    const ta = inputRef.current, m = measureRef.current;
    if (!ta || !m || !value) return null;
    const cs = getComputedStyle(ta);
    m.style.width = `${ta.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)}px`;
    m.textContent = value;
    const node = m.firstChild;
    if (!node || node.nodeType !== Node.TEXT_NODE) return null;
    const r = document.createRange(), all: string[] = [];
    let start = 0, top = NaN;
    for (let i = 0; i < value.length; i++) {
      if (value[i] === '\n') { all.push(value.slice(start, i)); start = i + 1; top = NaN; continue; }
      r.setStart(node, i); r.setEnd(node, i + 1);
      const y = r.getBoundingClientRect().top;
      if (Number.isNaN(top)) top = y;
      else if (y > top + CF_LINE / 2) { all.push(value.slice(start, i)); start = i; top = y; }
    }
    all.push(value.slice(start));
    const lines = all.map((l) => l.replace(/\s+$/, ''));
    let first = 0, end = lines.length;
    while (first < end && !lines[first].trim()) first++;
    while (end > first && !lines[end - 1].trim()) end--;
    return end > first ? { lines: lines.slice(first, end), first } : null;
  };
  const openBar = () => fit();
  useLayoutEffect(() => fit(), [input, recording, hearing]);
  // the shadow under the pill is stretched rather than redrawn: how much wider the open pill is than the resting one
  useLayoutEffect(() => {
    const el = fieldRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => { const w = el.offsetWidth; if (w) el.style.setProperty('--cf-k', String((w + CF_X) / w)); fieldW.current = w; grown.current = -1; fit(); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const autoClose = useRef(!!props.listen); // a command spoken from the orb slips away once it has been done
  const recRef = useRef<() => void>(() => {});

  /** The conversation so far as the model sees it (cards become a one-line note of what was done, with each item's id). */
  // (the message being answered is sent on its own: it was in here too after a photo's wait, and went to the model twice)
  const turnsFor = (skip?: string): Turn[] => threadTurns((msgsRef.current as ThreadMsg[]).filter((m) => m.id !== skip), useStore.getState().settings.dayStartHour);

  const undoLast = () => {
    for (let i = msgsRef.current.length - 1; i >= 0; i--) {
      const m = msgsRef.current[i];
      if (m.role !== 'action') continue;
      const r = [...m.results].reverse().find((x) => x.undo && !m.undone.includes(x.id) && (!x.pending || m.confirmed.includes(x.id)));
      if (r) { r.undo!(); setMsgs((x) => x.map((y) => (y.id === m.id && y.role === 'action' ? { ...y, undone: [...y.undone, r.id] } : y))); return; }
    }
  };

  /** One turn: the model (or, without an AI key, the local reader) says what to do; we do it; the cards show it. */
  const agentTurn = async (text: string, signal: AbortSignal, photo: Photo | undefined, userId: string) => {
    const st = useStore.getState();
    const today = dayKey(Date.now(), st.settings.dayStartHour);
    const placeholder = uid('m');
    say({ id: placeholder, role: 'model', text: '', streaming: true });
    // a long wait is said, never a silent spinner: "Still thinking…" at 8 s, "Slow connection…" at 20 s (a look-up's own
    // words are left alone)
    const waits = [t('Still thinking…'), t('Slow connection…')];
    const waitSay = (s: string) => { if (alive.current) setMsgs((all) => all.map((m) => (m.id === placeholder && m.role === 'model' && !m.text && (!m.status || waits.includes(m.status)) ? { ...m, status: s } : m))); };
    const slow = [setTimeout(() => waitSay(waits[0]), 8000), setTimeout(() => waitSay(waits[1]), 20000)];
    try {
    const where = props.mealId || props.date ? `The user opened this from the Food tab${props.date ? ` (day ${props.date})` : ''}${props.mealId ? `, meal ${props.mealId}` : ''}: foods go there unless they say otherwise.` : 'The user opened this from the main screen.';
    const history = turnsFor(userId); // the conversation so far (the orb screen's turns included)
    // the answer streams in as the model writes it, into the same message that then stays (nothing re-mounts or re-animates)
    const d = await decide(photo ? `[photo] ${text}` : text, { lang, t, pool, history, where, signal, surface: 'coach', photo, said: threadSaid(msgsRef.current as ThreadMsg[]), onStatus: (x) => { if (alive.current) setMsgs((all) => all.map((m) => (m.id === placeholder && m.role === 'model' ? { ...m, status: x || undefined } : m))); }, onReply: (r) => { if (alive.current) setMsgs((x) => x.map((m) => (m.id === placeholder && m.role === 'model' ? { ...m, text: r } : m))); } });
    let { reply } = d; const { note, actions } = d;
    if (d.wantsUndo) { undoLast(); if (!actions.length && !reply) reply = t('Undone.'); }
    const results = actions.length ? await runActions(actions, { t, lang, today, brain: brainFor({ big: false, surface: 'coach', signal }), date: props.date, mealId: props.mealId, photo: !!photo, onStatus: (x) => { if (alive.current) setMsgs((all) => all.map((m) => (m.id === placeholder && m.role === 'model' ? { ...m, status: x || undefined } : m))); } }) : [];
    if (d.dropped) results.push(droppedCard(t)); // (never silent: part of the answer was unreadable)
    if (!alive.current) return;
    // the answer is the message; a note about who answered sits under it, quieter. It is never the answer itself: never read
    // aloud and never saved as something the Coach said (with no answer it stands alone, as that small grey line)
    const said = reply;
    setMsgs((x) => {
      const base = said || note ? x.map((m) => (m.id === placeholder ? { ...m, text: said, note: note || undefined, streaming: false, status: undefined, ...(d.sources.length && reply ? { sources: d.sources } : {}) } as Msg : m)) : x.filter((m) => m.id !== placeholder);
      return results.length ? [...base, { id: uid('m'), role: 'action', results, undone: [], confirmed: [], fresh: true }] : base;
    });
    // green "Done" only when something was actually logged or changed
    const acted = d.wantsUndo || results.some((r) => r.kind !== 'miss' && r.kind !== 'nav');
    if (acted) { haptic('success'); orb('confirmed'); setTimeout(() => { if (alive.current && useVoice.getState().phase === 'confirmed') orb('idle'); }, 1200); } else orb('idle');
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
    } finally { slow.forEach(clearTimeout); }
  };

  // ── when it fails: Try again (the same words, from the same bubble), Open settings (a key problem) ──
  const runTurn = async (id: string, text: string, pic: { url: string; blob: Blob } | null) => {
    setBusy(true); stopSpeaking(); orb('processing');
    ctl.current = new AbortController();
    const signal = ctl.current.signal;
    try {
      await agentTurn(text || t('What is this?'), signal, pic ? { mime: 'image/jpeg', data: await blobToBase64(pic.blob) } : undefined, id);
      if (alive.current) setMsgs((x) => x.map((m) => (m.id === id && m.role === 'user' && m.failed ? { ...m, failed: undefined } : m)));
    } catch (e: any) {
      if (!alive.current) return;
      const stopped = e?.code === 'aborted';
      const key = e instanceof AiError && (e.code === 'badkey' || e.code === 'nokey');
      setMsgs((x) => {
        // a half-written answer that was cut off is taken away (it was not the answer), and the question is marked so the
        // model doesn't read it as answered
        const last = x[x.length - 1];
        const base = last && last.role === 'model' && last.streaming ? (stopped && last.text.trim() ? x.map((m, i) => (i === x.length - 1 ? { ...m, streaming: false } as Msg : m)) : x.slice(0, -1)) : x;
        if (stopped) return base;
        // (the chip says Try again: the words don't say it a second time)
        const why = key ? aiErrorText(e, t) : aiErrorText(e, t).replace(new RegExp(`\\s*${t('Try again')}\\.?$`), '');
        return [...base.map((m) => (m.id === id && m.role === 'user' ? { ...m, failed: true } as Msg : m)), { id: uid('m'), role: 'error', text: why, ...(key ? { fix: 'settings' as const } : { retry: { userId: id, text } }) }];
      });
    } finally {
      if (alive.current) {
        setBusy(false); if (['processing', 'listening'].includes(useVoice.getState().phase)) orb('idle');
        // typed while it was thinking: sent now
        if (queued.current) { queued.current = false; setQueuedOn(false); setTimeout(() => { if (alive.current && inputRef.current?.value.trim()) sendRef.current(); }, 60); } // (the newest send: this one still sees it busy)
      }
    }
  };
  const onErrRef = useRef<(m: Extract<Msg, { role: 'error' }>, what: 'retry' | 'settings') => void>(() => {});
  onErrRef.current = (m, what) => {
    haptic('light');
    if (what === 'settings') { push('settings', { section: 'ai' }); return; }
    if (busy || !m.retry) return;
    const { userId, text } = m.retry;
    // the row folds away (it never just vanishes) while the question is asked again
    setMsgs((x) => x.map((y) => (y.id === m.id && y.role === 'error' ? { ...y, leaving: true } : y)));
    setTimeout(() => { if (alive.current) setMsgs((x) => x.filter((y) => y.id !== m.id)); }, 480);
    void runTurn(userId, text, null);
  };
  const onErr = useCallback((m: Extract<Msg, { role: 'error' }>, what: 'retry' | 'settings') => onErrRef.current(m, what), []);
  const queued = useRef(false);
  const [queuedOn, setQueuedOn] = useState(false);

  const send = async (raw?: string, spoken = false) => {
    const text = (raw ?? input).trim();
    const pic = raw === undefined ? photo : null; // a suggestion chip or dictation sends words only
    if (!alive.current || (!text && !pic)) return;
    // typed while it is still answering: kept in the field and sent the moment the answer is done
    if (busy) { if (raw === undefined && text) { queued.current = true; setQueuedOn(true); haptic('light'); } return; }
    if (clearing.current) finishClear();
    pinned.current = true; user.current = false;
    const id = uid('m');
    const field = inputRef.current;
    const still = document.documentElement.dataset.motion === 'reduce' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const wrap = (raw === undefined || spoken) && text && !pic && field && !still ? fieldLines(raw ?? input) : null;
    if (wrap && field) { // typed or said: it leaves from the field
      const fr = field.getBoundingClientRect(), fs = getComputedStyle(field), pill = fieldRef.current?.getBoundingClientRect() ?? fr;
      flew.current.add(id);
      const mid = Math.max(0, grown.current);
      // where its first line is in the field (the box is played on the pill's spring, its rect has that in it), the
      // whole pill (its bubble starts as the pill) and the part of the field the words show in
      const pad = parseFloat(fs.paddingTop), lt = fr.left + parseFloat(fs.paddingLeft);
      flyFrom.current.set(id, {
        // (said words that were never in the field rise with their last line on the field's)
        x: lt, y: raw === undefined || field.value === raw ? fr.top + pad - field.scrollTop + wrap.first * CF_LINE : fr.bottom - pad - wrap.lines.length * CF_LINE, fs: parseFloat(fs.fontSize),
        box: { l: fr.left, r: pill.right, t: pill.bottom - 54 - mid, b: pill.bottom },
        win: { t: pill.bottom - 54 - mid + 10, b: pill.bottom - 10 },
        fresh: raw !== undefined && !field.value.trim(),
      });
    }
    const reduceTips = still || leaving;
    if (!reduceTips && (msgsRef.current.length === 0 || resumed)) setTipsOut(msgsRef.current.length === 0 ? 'top' : 'resume');
    setInput(''); setPhoto(null); setResumed(false);
    // about something that was held: the model gets what it is with the words; the bubble shows only its name
    const ab = about; setAbout(null);
    say({ id, role: 'user', text, at: Date.now(), ...(wrap ? { lines: wrap.lines } : {}), ...(pic ? { photo: true, image: pic.url } : {}), ...(ab ? { about: ab.detail, aboutLabel: ab.label } : {}) });
    await runTurn(id, ab ? `[about: ${ab.detail}] ${text}` : text, pic);
  };

  // ── voice input through Groq (same single-owner mic as dictation) ──
  // Tap the orb and speak: the orb listens (its ring follows your voice: nothing else on the bar moves for it), the pill
  // opens wide and says "Listening…", and its arrow is there to stop and send. It stops by itself when you go quiet (or
  // tap the orb or the arrow); Whisper hears the whole recording, and the pill itself lifts away into the chat as your
  // message, your words coming up inside it on the way (they never stop in the field first: 14 Oct, Omar, "the words
  // don't have to come in the text box, just seamless"). Tap the field instead and it stops there and leaves your words in
  // the field to fix. (Words shown live as you speak, 14 Oct, didn't work on his phone and were taken out.)
  const join = (a: string, b: string) => [a.trim(), b.trim()].filter(Boolean).join(' ');
  const finishSaid = (text: string, mode: 'send' | 'edit') => {
    if (mode === 'edit') { setInput(text); requestAnimationFrame(() => { const f = inputRef.current; if (f) { f.focus(); f.setSelectionRange(f.value.length, f.value.length); } }); return; }
    // (added to a draft you had typed: the whole message is shown in the field a moment, then leaves as typed words do)
    if (draft.current.trim()) { setInput(text); setTimeout(() => { if (alive.current) send(text, true); }, 260); } else send(text, true);
  };
  const toggleRec = async (mode: 'send' | 'edit' = 'send') => {
    if (!alive.current || busy || hearing) return;
    if (recording) {
      setRecording(false); setHearing(true); orb(mode === 'edit' ? 'idle' : 'processing');
      const base = draft.current;
      const blob = await mic.stopRecording();
      if (!alive.current) return;
      mic.release('coach');
      try {
        if (!blob) throw new SttError('failed');
        const st = useAi.getState();
        const words = (await transcribe(blob, { key: getKey('groq'), model: STT_MODEL[st.stt], language: st.voiceLang === 'auto' ? 'auto' : st.voiceLang, prompt: buildPrompt(sttNames(pool)) })).trim();
        if (!alive.current) return;
        if (words) finishSaid(join(base, words), mode); else say({ id: uid('m'), role: 'error', text: t('Didn’t catch anything. Try again.') });
      } catch (e) {
        if (!alive.current) return;
        say({ id: uid('m'), role: 'error', text: sttMessage(e instanceof SttError ? e.code : 'failed', t) });
      } finally { if (alive.current) { setHearing(false); if (mode === 'edit') orb('idle'); } }
      return;
    }
    stopSpeaking();
    const r = await mic.acquire('coach');
    if (!alive.current) return;
    if (!r.ok || !mic.startRecording('coach')) { mic.release('coach'); say({ id: uid('m'), role: 'error', text: r.ok ? t('This browser can’t record audio.') : t('The microphone isn’t available. Check the permission, or type.') }); return; }
    draft.current = input;
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
    if (!present || !recording) return;
    let heard = 0, quiet = 0; const t0 = performance.now();
    const id = setInterval(() => {
      const lv = mic.level();
      if (lv > 0.16) { heard += 80; quiet = 0; } else if (lv < 0.09) quiet += 80;
      if ((heard >= 240 && quiet >= 900) || performance.now() - t0 > 40000) { clearInterval(id); recRef.current(); }
    }, 80);
    return () => clearInterval(id);
  }, [recording, present]);
  const noKey = !anyBrain(ai);
  const coachTips = useCoachTips(3);
  const tips = about ? about.asks.map((a) => ({ icon: about.icon, label: a, prompt: a })) : coachTips;
  // the "AI can be wrong" note: said once, on the first open (it also lives in Settings → Privacy)
  const [noteSeen] = useState(() => { try { return localStorage.getItem('aven.coachNote') === '1'; } catch { return true; } });
  useEffect(() => { if (msgs.length) try { localStorage.setItem('aven.coachNote', '1'); } catch { /* ignore */ } }, [msgs.length]);

  // the suggestions: on an empty chat at the top; when you come back to an old chat, under it (until you send something)
  const shown = leaving ?? msgs;
  const listed = older ? shown.slice(older) : shown;
  // a newer preview of the same thing (tomorrow's plan, the week) replaces the older one: only the newest can be applied
  const replaced = useMemo(() => replacedIds(msgs.filter((m): m is Extract<Msg, { role: 'action' }> => m.role === 'action')), [msgs]);
  const resumeHead = <div className="micro trunc" style={{ margin: '22px 0 10px' }}>{about ? t('About {x}', { x: about.title }) : t('Today')}</div>;
  const tipsBlock = (
              <div className="stack gap12">
                {noKey && <div className="small" style={{ color: 'var(--nokey, var(--warn))' }}>{t('Add an AI key to chat.')} <button className="chip sm acc press" style={{ marginLeft: 6 }} onClick={() => push('settings', { section: 'ai' })}>{t('Add a key')}</button></div>}
                <div className={`tips${cleared ? ' fresh' : ''}`}>{tips.map((c, i) => (
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
        {/* asked about something that was held: its name over the typing bar (× takes it off); it folds away when sent */}
        <Collapse open={!!about} ms={420} className="coach-about-wrap">
          {aboutShown.current && (
            <div className="coach-about">
              <span className="coach-about-ic"><Icon name={aboutShown.current.icon} size={16} /></span>
              <span className="grow coach-about-t"><span className="xs t3">{t('Asking about')}</span><span className="small trunc">{aboutShown.current.label}</span></span>
              <button className="icon-btn flat sm press" aria-label={t('Remove')} onClick={() => { haptic('light'); setAbout(null); }}><Icon name="close" size={16} /></button>
            </div>
          )}
        </Collapse>
        <input ref={camRef} type="file" accept="image/*" hidden onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = ''; }} />
        <div className="coach-composer" ref={composerRef} style={morphVars}>
          {/* the orb is the Coach's microphone: it flies in from the tab bar, listens to you, thinks while it answers */}
          <button className="press coach-orb frost-seat" aria-label={recording ? t('Stop and send') : t('Speak')} disabled={busy || hearing} onClick={() => (ai.hasGroq && mic.supported ? toggleRec() : push('settings', { section: 'ai' }))}
            style={{ position: 'relative', width: 50, height: 50, flex: 'none', borderRadius: 999 }}>
            <i className={`voice-ring ${recording ? 'on' : ''}`} />
            <SphereSlot id="coach" priority={5} style={{ position: 'absolute', inset: -4 }} />
          </button>
          {/* the camera: a label, a machine, a program screenshot — anything to ask about */}
          <span className="coach-cam-slot"><button className="icon-btn press coach-cam frost-ctl" aria-label={t('Send a photo')} disabled={busy || recording || hearing} onClick={() => camRef.current?.click()}><Icon name="camera" size={21} /></button></span>
          <div className="grow coach-field" ref={fieldRef}>
            {/* the pill: one frost that never moves (only its outline does), a tint drawn in two halves that slide over each
                other, and a shadow that stretches — so opening it is moves only */}
            <div className="cf-measure" ref={measureRef} aria-hidden="true" />{/* (first: under the layers, so it never gets one of its own) */}
            <i className="cf-sh" /><i className="cf-glass" />
            <i className="cf-tint"><i className="cf-l cf-b" /><i className="cf-r cf-b" /><i className="cf-l cf-m" /><i className="cf-r cf-m" /><i className="cf-l cf-t" /><i className="cf-r cf-t" /></i>
            <div className="cf-text"><textarea ref={inputRef} className={`input${recording || hearing ? ' quiet' : ''}`} rows={1} onFocus={openBar} onBlur={openBar} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              onPointerDown={(e) => { if (!listening.current) return; e.preventDefault(); if (recording) toggleRec('edit'); /* (tap your words while speaking: it stops and leaves them to fix) */ }}
              enterKeyHint="send" placeholder={t('Ask the Coach')} aria-label={t('Message the Coach')} readOnly={recording || hearing} />
              {/* while you speak the field's word fades across, never swaps: "Ask the Coach", "Listening…", "Transcribing…" */}
              <span className={`cf-status${recording ? ' on' : ''}`} aria-hidden="true">{t('Listening…')}</span>
              <span className={`cf-status${hearing ? ' on' : ''}`} aria-hidden="true">{t('Transcribing…')}</span></div>
            {/* Send is an arrow inside the field, there only when there is something to send (Stop while it works) */}
            {/* (while it answers: Stop when the field is empty; typed words wait, dimmed, and go when the answer is done) */}
            <button className={`coach-send press ${busy || input.trim() || photo || recording ? 'on' : ''} ${busy && !input.trim() ? 'busy' : ''} ${busy && input.trim() && queuedOn ? 'queued' : ''}`} onMouseDown={(e) => e.preventDefault() /* the field keeps the keyboard (it stays up after a send) */}
              aria-label={busy && !input.trim() ? t('Stop') : recording ? t('Stop and send') : t('Send')} tabIndex={busy || input.trim() || photo || recording ? 0 : -1} onClick={() => (busy && !input.trim() ? ctl.current?.abort() : recording ? toggleRec('send') : hearing ? undefined : send())}>
              {/* send turns into stop (and back) by a short cross-fade with a little turn, not a cut. While you speak it is the
                  arrow (stop and send); once you have stopped it steps aside while your words are heard (the orb thinks) */}
              <span className="cs-ico cs-go"><Icon name="arrowUp" size={18} sw={2.6} /></span>
              <span className="cs-ico cs-stop"><Icon name="close" size={18} sw={2.6} /></span>
            </button>
          </div>
        </div>
      </div>
    )}>
      <SheetHead title={t('Coach')} onClose={pop} right={<button className={`small t2 press coach-new${shown.length ? '' : ' gone'}`} onClick={clearChat} tabIndex={shown.length ? 0 : -1} aria-hidden={!shown.length}>{t('New chat')}</button>} />
      <div className="sheet-body coach-body" data-kb-own ref={bodyRef} style={growVars} onScroll={(e) => {
        const el = e.currentTarget;
        if (user.current) { movedAt.current = performance.now(); pinned.current = endTop(el) - el.scrollTop < 80; }
        lastScroll.current = el.scrollTop;
      }}>
          <>
            {shown.length === 0 ? tipsBlock : tipsOut === 'top' && <div className="coach-tips-out" inert onAnimationEnd={(e) => { if (e.target === e.currentTarget) setTipsOut(null); }}>{tipsBlock}</div>}
            {/* (in a clip: the list's glides are drawn as moves, and a moved list made the scroll area taller while it moved,
                so the list's end was chased mid-flight, a second glide and a jump; clipped, moves never change its size) */}
            <div className="coach-clip">
              <div className="stack coach-thread" style={{ gap: 16, marginTop: shown.length ? 0 : 16 }}>
                {listed.map((m) => <ChatRow key={m.id} m={m} sent={m.role === 'user' && !m.seeded && !flown(m.id)} gone={m.role === 'action' ? m.results.filter((r) => replaced.has(r.id)).map((r) => r.id).join(',') : ''} setMsgs={setMsgs} onErr={onErr} />)}
              </div>
            </div>
            {resumed && shown.length > 0 ? <div className="coach-resume">{resumeHead}{tipsBlock}</div>
              : tipsOut === 'resume' && <div className="coach-resume coach-tips-out" inert onAnimationEnd={(e) => { if (e.target === e.currentTarget) setTipsOut(null); }}>{resumeHead}{tipsBlock}</div>}
            {!noteSeen && shown.length === 0 && <div className={`xs t2${cleared ? ' coach-note-fresh' : ''}`} style={{ marginTop: 18 }}>{solOn(ai) ? t('AI can be wrong, and isn’t medical advice. Messages go to OpenAI (GPT-6.1 Sol).') : t('AI can be wrong, and isn’t medical advice. Messages go to Google Gemini.')}</div>}
          </>
      </div>
    </Sheet>
  );
}
