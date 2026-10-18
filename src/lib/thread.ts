/**
 * One conversation for the orb and the Coach. The Coach's chat is kept on the phone (`aven.coach`); what is said at the orb
 * screen is added to the end of it, so "log a banana" at the orb and "move it to lunch" in the Coach (or the other way round)
 * is one conversation. Both build what the model sees from it the same way.
 */
import type { Turn } from './gemini';
import type { AgentResult } from './agent';
import type { SaidLine } from './agentLookup';
import { cardsNote } from '../ui/agentUi';
import { dayKey } from './dates';
import { uid } from './nutrition';
import { archive, archived, type ArchivedMsg } from './archive';

export const THREAD_KEY = 'aven.coach';
/** Messages kept on the phone (the oldest drop off). */
export const THREAD_MAX = 60;

/** A saved message, as the Coach stores it (the Coach's own type has a few more display-only fields). */
export type ThreadMsg =
  | { id: string; role: 'user' | 'model'; text: string; at?: number; photo?: boolean; note?: string; [k: string]: unknown }
  | { id: string; role: 'error'; text: string }
  | { id: string; role: 'action'; results: AgentResult[]; undone: string[]; confirmed: string[] };

export function readThread(): ThreadMsg[] {
  try {
    const v = JSON.parse(localStorage.getItem(THREAD_KEY) || '[]');
    return (Array.isArray(v) ? v : []).filter((m: any) => m && typeof m.id === 'string' && ['user', 'model', 'action', 'error'].includes(m.role));
  } catch { return []; }
}

export function writeThread(list: ThreadMsg[]) {
  // everything said is also kept for good (lib/archive.ts), past the 60 the chat holds
  try { archive(toArchived(list)); } catch { /* the chat still saves */ }
  try { localStorage.setItem(THREAD_KEY, JSON.stringify(list.slice(-THREAD_MAX).map((m) => ('image' in m && m.image ? { ...m, image: undefined } : m)))); } catch { /* storage full: the chat just won't come back */ }
}

const listeners = new Set<() => void>();
/** Someone else (the orb screen) added to the conversation: an open Coach reloads it. */
export function onThreadChange(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }
const changed = () => listeners.forEach((fn) => { try { fn(); } catch { /* a listener's problem stays its own */ } });

/** The orb screen finished a turn: what was said, the answer and its cards join the conversation. Returns the cards' id. */
export function appendExchange(x: { said: string; reply: string; results: AgentResult[]; at?: number; /** it got no answer: why (the Coach shows it with Try again, and the model doesn't read it as answered) */ failed?: string }): string | null {
  const at = x.at ?? Date.now();
  const add: ThreadMsg[] = [];
  const userId = uid('m');
  if (x.said.trim()) add.push({ id: userId, role: 'user', text: x.said, at, ...(x.failed ? { failed: true } : {}) });
  if (x.failed && x.said.trim()) add.push({ id: uid('m'), role: 'error', text: x.failed, retry: { userId, text: x.said } } as ThreadMsg);
  if (x.reply.trim()) add.push({ id: uid('m'), role: 'model', text: x.reply, at });
  const cardsId = x.results.length ? uid('m') : null;
  // a card's buttons and Undo are functions: only what it says is kept (the orb keeps the live ones while it is open)
  if (cardsId) add.push({ id: cardsId, role: 'action', results: x.results.map((r) => ({ ...r, undo: undefined, button: undefined, more: undefined })), undone: [], confirmed: [] });
  if (!add.length) return null;
  writeThread([...readThread(), ...add]);
  changed();
  return cardsId;
}

/** Tried again at the orb: the unanswered copy kept for the Coach goes (the new try adds the question again). */
export function dropFailed(said: string) {
  const list = readThread();
  const i = list.map((m) => m.role === 'user' && m.failed && m.text === said).lastIndexOf(true);
  if (i < 0) return;
  writeThread(list.filter((m, k) => k !== i && !(k === i + 1 && m.role === 'error')));
  changed();
}

/** A card from the orb was undone or confirmed later: the conversation says so too (the model reads it). */
export function markInThread(cardsId: string | null | undefined, resultId: string, field: 'undone' | 'confirmed') {
  if (!cardsId) return;
  const list = readThread();
  let hit = false;
  const next = list.map((m) => (m.id === cardsId && m.role === 'action' && !m[field].includes(resultId) ? ((hit = true), { ...m, [field]: [...m[field], resultId] }) : m));
  if (!hit) return;
  writeThread(next);
  changed();
}

/** The conversation as the model sees it: the last `max` turns, cards as one-line notes (with each item's [ref …]). */
export function threadTurns(list: ThreadMsg[], dayStartHour: number, max = 14): Turn[] {
  const out: Turn[] = [];
  const push = (role: 'user' | 'model', t: string) => { if (!t.trim()) return; const last = out[out.length - 1]; if (last && last.role === role) last.parts[0].text += `\n${t}`; else out.push({ role, parts: [{ text: t }] }); };
  const today = dayKey(Date.now(), dayStartHour);
  for (const m of list) {
    // a message that got no answer (it failed) is left out: the model would read it as answered, and a Try again would
    // then send it twice
    if (m.role === 'user' && m.failed) continue;
    // something said on an earlier day is marked so, so "today" in an old message isn't taken for today
    if (m.role === 'user' || m.role === 'model') {
      const old = m.role === 'user' && m.at && dayKey(m.at, dayStartHour) !== today ? `(said on ${dayKey(m.at, dayStartHour)}) ` : '';
      const about = m.role === 'user' && typeof m.about === 'string' ? `[about: ${m.about}] ` : '';
      push(m.role, old + about + (m.role === 'user' && m.photo ? `[photo] ${m.text}` : m.text));
    } else if (m.role === 'action') push('model', cardsNote(m.results, m.confirmed, m.undone));
  }
  const tail = out.slice(-max);
  return tail[0]?.role === 'model' ? tail.slice(1) : tail;
}

/** The chat's messages as the archive keeps them: text, with each card as its one-line note (and its state). */
export function toArchived(list: ThreadMsg[]): ArchivedMsg[] {
  let at = 0; // a message without its own time took place when the one before it did
  const out: ArchivedMsg[] = [];
  for (const m of list) {
    if (m.role === 'user' || m.role === 'model') {
      if (typeof m.at === 'number') at = m.at; else if (!at) at = Date.now();
      if (m.text.trim()) out.push({ id: m.id, at, role: m.role, text: m.text });
    } else if (m.role === 'action') {
      if (!at) at = Date.now();
      const note = cardsNote(m.results, m.confirmed, m.undone);
      if (note) out.push({ id: m.id, at, role: 'cards', text: note });
    }
  }
  return out;
}

/** Everything said, oldest first: the whole archive plus anything in the chat not archived yet. For the `conversations`
 *  look-up ("what did I say about my knee?"). */
export function threadSaid(list: ThreadMsg[]): SaidLine[] {
  const kept = archived();
  const ids = new Set(kept.map((m) => m.id));
  const extra = toArchived(list).filter((m) => !ids.has(m.id));
  return extra.length ? [...kept, ...extra].sort((a, b) => a.at - b.at) : [...kept];
}
