/**
 * The whole conversation, kept. The chat on screen holds its last 60 messages (thread.ts); everything ever said to the Coach
 * or the orb is also written here, on this phone only (IndexedDB `aven-chat`), as text: what was said, the answer, and each
 * card as its one-line note. The `conversations` look-up searches all of it ("what did I say about my knee in August?"),
 * Settings → Coach memory shows it, and backups carry it (additive: an old backup simply has none).
 *
 * The look-ups are synchronous, so the archive is read once (at start, when the phone is idle) and kept in memory; writes go
 * to memory at once and to the database in the background. Without IndexedDB (tests, a locked-down browser) it lives in
 * memory only.
 */
import { fold } from './foodText';

export interface ArchivedMsg { id: string; at: number; role: 'user' | 'model' | 'cards'; text: string }

const DB = 'aven-chat';
const STORE = 'msgs';
/** Kept forever in practice: about 3 MB a year of heavy use. The oldest go only past this. */
export const ARCHIVE_MAX = 20000;

let cache: ArchivedMsg[] = [];
const byId = new Map<string, ArchivedMsg>();
let loaded: Promise<void> | null = null;
const listeners = new Set<() => void>();
export function onArchiveChange(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }
const changed = () => listeners.forEach((fn) => { try { fn(); } catch { /* its own problem */ } });

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
const hasIdb = () => typeof indexedDB !== 'undefined';
async function write(fn: (s: IDBObjectStore) => void): Promise<void> {
  if (!hasIdb()) return;
  const db = await open();
  await new Promise<void>((res, rej) => { const tx = db.transaction(STORE, 'readwrite'); fn(tx.objectStore(STORE)); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
  db.close();
}

const valid = (m: any): m is ArchivedMsg => m && typeof m.id === 'string' && typeof m.at === 'number' && typeof m.text === 'string' && ['user', 'model', 'cards'].includes(m.role);
function put(list: ArchivedMsg[]) {
  for (const m of list) {
    const had = byId.get(m.id);
    if (had) Object.assign(had, m); else { byId.set(m.id, m); cache.push(m); }
  }
  cache.sort((a, b) => a.at - b.at);
  if (cache.length > ARCHIVE_MAX) { const gone = cache.splice(0, cache.length - ARCHIVE_MAX); gone.forEach((g) => byId.delete(g.id)); }
}

/** Reads the archive into memory (once). Messages written before it finished are kept. */
export function loadArchive(): Promise<void> {
  if (loaded) return loaded;
  loaded = (async () => {
    if (!hasIdb()) return;
    try {
      const db = await open();
      const all = await new Promise<unknown[]>((res, rej) => { const r = db.transaction(STORE, 'readonly').objectStore(STORE).getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      db.close();
      put(all.filter(valid));
      changed();
    } catch { /* unreadable: it starts again from what is said now */ }
  })();
  return loaded;
}

/** Everything kept, oldest first. */
export const archived = (): readonly ArchivedMsg[] => cache;
export const archiveSize = () => cache.length;

/** Adds or updates messages (a card's note changes when it is applied or undone). Only real changes are written. */
export function archive(list: ArchivedMsg[]) {
  const fresh = list.filter((m) => valid(m) && m.text.trim() && byId.get(m.id)?.text !== m.text);
  if (!fresh.length) return;
  const clean = fresh.map((m) => ({ id: m.id, at: byId.get(m.id)?.at ?? m.at, role: m.role, text: m.text.slice(0, 4000) }));
  put(clean);
  changed();
  write((s) => clean.forEach((m) => s.put(m))).catch(() => { /* kept in memory for this visit */ });
}

/** A backup's conversation, merged in (what is here already stays). */
export function importArchive(list: unknown) {
  if (!Array.isArray(list)) return;
  const add = list.filter(valid).filter((m) => !byId.has(m.id));
  if (!add.length) return;
  put(add);
  changed();
  write((s) => add.forEach((m) => s.put(m))).catch(() => {});
}

/** Forgets the whole conversation (Coach memory → Delete, or Delete all data). */
export async function clearArchive() {
  cache = []; byId.clear(); changed();
  await write((s) => s.clear()).catch(() => {});
}

/** Words that say nothing about what was talked about (English and Danish). */
const STOP = new Set('the and for you your that this with what when did was are have has had how about from into just like can not but all any its our out who why will would could should there their them they then than been some much many more most very also only i me my we a an to of in on at is it be do so no yes og det der den til for med som har var jeg du mig min mit hvad hvordan hvornar om fra paa pa er ikke men kan vil skal sig sin sit han hun vi de et en af at da nu'.split(' '));
const words = (s: string) => fold(s).split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));

export interface FoundSay { at: number; role: ArchivedMsg['role']; text: string; /** the answer or question next to it */ beside?: { role: ArchivedMsg['role']; text: string } }

/**
 * The best matches for `query` (every word scored, a word's start counts: "knæ" finds "knæet"), newest wins a tie, each with
 * the message beside it so the answer comes with its question. No query: the latest messages in the range.
 */
export function searchArchive(list: readonly Pick<ArchivedMsg, 'at' | 'role' | 'text'>[], query: string | null, from?: string | null, to?: string | null, max = 12): FoundSay[] {
  const day = (at: number) => { const d = new Date(at); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const inRange = list.map((m, i) => ({ m, i })).filter(({ m }) => (!from || day(m.at) >= from) && (!to || day(m.at) <= to));
  const q = query ? words(query) : [];
  const scored = q.length
    ? inRange.map((x) => { const ws = words(x.m.text); const hit = q.filter((w) => ws.some((v) => v.startsWith(w) || (w.length > 4 && v.startsWith(w.slice(0, -1))))).length; return { ...x, score: hit / q.length + (x.m.role === 'user' ? 0.05 : 0) }; }).filter((x) => x.score >= 0.5)
    : inRange.slice(-max).map((x) => ({ ...x, score: 1 }));
  const best = [...scored].sort((a, b) => b.score - a.score || b.m.at - a.m.at).slice(0, max).sort((a, b) => a.m.at - b.m.at);
  return best.map(({ m, i }) => {
    const n = m.role === 'user' ? list[i + 1] : list[i - 1];
    const beside = n && n.role !== m.role && Math.abs(n.at - m.at) < 30 * 60_000 ? { role: n.role, text: n.text } : undefined;
    return { at: m.at, role: m.role, text: m.text, beside };
  });
}
