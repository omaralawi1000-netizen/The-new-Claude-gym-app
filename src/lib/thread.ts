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
  try { localStorage.setItem(THREAD_KEY, JSON.stringify(list.slice(-THREAD_MAX).map((m) => ('image' in m && m.image ? { ...m, image: undefined } : m)))); } catch { /* storage full: the chat just won't come back */ }
}

const listeners = new Set<() => void>();
/** Someone else (the orb screen) added to the conversation: an open Coach reloads it. */
export function onThreadChange(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }
const changed = () => listeners.forEach((fn) => { try { fn(); } catch { /* a listener's problem stays its own */ } });

/** The orb screen finished a turn: what was said, the answer and its cards join the conversation. Returns the cards' id. */
export function appendExchange(x: { said: string; reply: string; results: AgentResult[]; at?: number }): string | null {
  const at = x.at ?? Date.now();
  const add: ThreadMsg[] = [];
  if (x.said.trim()) add.push({ id: uid('m'), role: 'user', text: x.said, at });
  if (x.reply.trim()) add.push({ id: uid('m'), role: 'model', text: x.reply, at });
  const cardsId = x.results.length ? uid('m') : null;
  // a card's buttons and Undo are functions: only what it says is kept (the orb keeps the live ones while it is open)
  if (cardsId) add.push({ id: cardsId, role: 'action', results: x.results.map((r) => ({ ...r, undo: undefined, button: undefined, more: undefined })), undone: [], confirmed: [] });
  if (!add.length) return null;
  writeThread([...readThread(), ...add]);
  changed();
  return cardsId;
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
    // something said on an earlier day is marked so, so "today" in an old message isn't taken for today
    if (m.role === 'user' || m.role === 'model') {
      const old = m.role === 'user' && m.at && dayKey(m.at, dayStartHour) !== today ? `(said on ${dayKey(m.at, dayStartHour)}) ` : '';
      push(m.role, old + (m.role === 'user' && m.photo ? `[photo] ${m.text}` : m.text));
    } else if (m.role === 'action') push('model', cardsNote(m.results, m.confirmed, m.undone));
  }
  const tail = out.slice(-max);
  return tail[0]?.role === 'model' ? tail.slice(1) : tail;
}

/** Everything said, oldest first: for the `conversations` look-up ("what did I say about my knee?"). */
export function threadSaid(list: ThreadMsg[]): SaidLine[] {
  let at = 0; // an answer without its own time took place when its question did
  return list.filter((m): m is Extract<ThreadMsg, { role: 'user' | 'model' }> => m.role === 'user' || m.role === 'model')
    .map((m) => { if (typeof m.at === 'number') at = m.at; return { at, role: m.role, text: m.text }; });
}
