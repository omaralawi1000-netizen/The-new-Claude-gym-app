import { useDeferredValue, useMemo, useState, useSyncExternalStore } from 'react';
import { useStore, exerciseMap } from '../state/store';
import { exName } from './workout/common';
import { useUI, haptic } from '../state/ui';
import { useT, useLang } from '../lib/i18n';
import { dayKey, fmtDate } from '../lib/dates';
import { MEMORY_MAX } from '../state/defaults';
import type { MemoryKind, MemoryNote } from '../lib/types';
import { Icon } from '../ui/Icon';
import { Collapse } from '../ui/kit';
import { AnimatePresence } from 'motion/react';
import { archived, archiveSize, clearArchive, onArchiveChange, searchArchive } from '../lib/archive';
import { writeThread } from '../lib/thread';
import { dismissRule, learnedRules, type Rule } from '../lib/ledger';
import { mealName } from '../lib/derive';
import { specOf } from '../lib/settingSpec';
import { goalShort, goalState } from '../lib/goals';
import { fmtNum, kgToDisplay } from '../lib/units';

const KIND_GROUP: Record<MemoryKind, string> = { goal: 'Goals', health: 'Body', schedule: 'Schedule', preference: 'Preferences', gear: 'Gym', food: 'Food', other: 'Notes' };
const GROUP_ORDER: MemoryKind[] = ['goal', 'health', 'schedule', 'preference', 'gear', 'food', 'other'];

/**
 * Settings → Coach memory: everything the Coach keeps about you, in plain words. It adds to this when you tell it something
 * lasting; here you can read it, reword it, add your own or remove anything. It is sent with every question to the AI.
 */
export function CoachMemory() {
  const t = useT();
  const memory = useStore((s) => s.memory);
  const [draft, setDraft] = useState('');
  const full = memory.length >= MEMORY_MAX;
  const today = dayKey(Date.now(), useStore((s) => s.settings.dayStartHour));
  const groups = useMemo(() => {
    const by = new Map<MemoryKind | 'ended', MemoryNote[]>();
    for (const m of memory) { const k = (m.until && m.until < today) || m.goal?.status ? 'ended' : m.kind; (by.get(k) ?? by.set(k, []).get(k)!).push(m); }
    return [...GROUP_ORDER, 'ended' as const].filter((k) => by.has(k)).map((k) => [k, by.get(k)!] as const);
  }, [memory, today]);
  const add = () => {
    const text = draft.trim().slice(0, 240);
    if (!text || full) return;
    useStore.getState().addMemory({ text, kind: 'other' });
    setDraft(''); haptic('saved');
  };
  return (
    <div className="stack gap16">
      <div className="small t2">{t('The Coach reads this before every answer. It adds to it when you tell it something lasting, like how you train or what to avoid. Change or remove anything.')}</div>
      {memory.length === 0 && (
        <div className="plinth-2 small t2" style={{ padding: 14 }}>{t('Nothing yet. Try telling the Coach: “I don’t do a separate leg day, wrestling covers my legs.”')}</div>
      )}
      {/* by kind, in a fixed order (goals first); a temporary note that has ended goes last, under "Ended" */}
      {groups.map(([k, list]) => (
        <div key={k} className="stack gap8">
          <div className="micro mem-group">{k === 'ended' ? t('Ended') : t(KIND_GROUP[k])}</div>
          <AnimatePresence initial={false}>
            {list.map((m) => <Collapse key={m.id} appear><MemoryRow m={m} ended={k === 'ended'} /></Collapse>)}
          </AnimatePresence>
        </div>
      ))}
      <div className="field">
        <label htmlFor="mem-add">{t('Add something the Coach should know')}</label>
        <div className="row-flex" style={{ gap: 8 }}>
          <input id="mem-add" className="input grow" value={draft} maxLength={240} disabled={full} placeholder={t('e.g. Training for a wrestling tournament in March')} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
          <button className="icon-btn acc press" aria-label={t('Add')} disabled={!draft.trim() || full} onClick={add}><Icon name="plus" size={20} /></button>
        </div>
        <div className="xs t3">{full ? t('Memory is full. Remove something first.') : t('{n} of {max}', { n: memory.length, max: MEMORY_MAX })}</div>
      </div>
      <div className="xs t3">{t('Saved on this device and in your backups. Sent with each question to the AI you use (Gemini or GPT-6.1 Sol).')}</div>
      <Learned />
      <ChatHistory />
    </div>
  );
}

/**
 * What the Coach has learned from what you kept, undid and corrected (lib/ledger.ts): each rule says where it came from, and
 * Forget drops it for good. Only something that happened twice becomes a rule.
 */
function Learned() {
  const t = useT();
  const lang = useLang();
  const exs = useStore((s) => s.exercises);
  const meals = useStore((s) => s.settings.meals);
  const [rules, setRules] = useState<Rule[]>(() => learnedRules());
  if (!rules.length) return null;
  const ex = (id: string) => { const e = exerciseMap(exs).get(id); return e ? exName(e, lang) : id; };
  const meal = (id: string) => { const m = meals.find((x) => x.id === id); return m ? mealName(m, lang) : id; };
  const text = (r: Rule) => r.kind === 'move' ? t('Logs {food} at {meal}', { food: r.a, meal: meal(r.b!) })
    : r.kind === 'swap' ? t('Prefers {to} to {from}', { to: ex(r.b!), from: ex(r.a) })
    : r.kind === 'avoid' ? t('Leaves {ex} out of planned days', { ex: ex(r.a) })
    : t('Changes {setting} only when you ask', { setting: t(specOf(r.a)?.label ?? r.a) });
  const why = (r: Rule) => r.kind === 'move' ? t('You moved it there {n} times', { n: r.count }) : r.kind === 'swap' ? t('You swapped it {n} times', { n: r.count }) : r.kind === 'avoid' ? t('You took back {n} planned days with it', { n: r.count }) : t('You changed it back {n} times', { n: r.count });
  const forget = (r: Rule) => { dismissRule(r.id); haptic('light'); setRules((x) => x.filter((y) => y.id !== r.id)); };
  return (
    <section className="stack gap8" aria-label={t('Learned from you')}>
      <div className="micro" style={{ marginTop: 8 }}>{t('Learned from you')}</div>
      <AnimatePresence initial={false}>
        {rules.map((r) => (
          <Collapse key={r.id} appear>
            <div className="plinth-2 mem-row">
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="small">{text(r)}</div>
                <div className="xs t3" style={{ marginTop: 2 }}>{why(r)}</div>
              </div>
              <button className="btn sm ghost press" onClick={() => forget(r)}>{t('Forget')}</button>
            </div>
          </Collapse>
        ))}
      </AnimatePresence>
    </section>
  );
}

/**
 * Everything ever said to the Coach and the orb (lib/archive.ts): searchable here, and by the Coach itself when you ask
 * "what did I say about…". Kept on this phone and in backups; only the parts the Coach looks up are ever sent.
 */
function ChatHistory() {
  const t = useT();
  const lang = useLang();
  const n = useSyncExternalStore(onArchiveChange, archiveSize, archiveSize);
  const [q, setQ] = useState('');
  const dq = useDeferredValue(q.trim());
  const [sure, setSure] = useState(false);
  const found = useMemo(() => searchArchive(archived(), dq || null, null, null, dq ? 30 : 12).reverse(), [dq, n]); // newest first
  if (!n) return null;
  const first = archived()[0]?.at;
  const forget = async () => { writeThread([]); await clearArchive(); setSure(false); setQ(''); haptic('light'); useUI.getState().toast(t('Conversation history deleted')); };
  return (
    <section className="stack gap8" aria-label={t('Conversation history')}>
      <div className="micro" style={{ marginTop: 8 }}>{t('Conversation history')}</div>
      <div className="xs t2">{t('{n} messages kept since {date}. The Coach searches them when you ask what you said before.', { n, date: first ? new Date(first).toLocaleDateString(lang === 'da' ? 'da-DK' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '' })}</div>
      <input className="input" type="search" value={q} placeholder={t('Search what you said')} aria-label={t('Search what you said')} onChange={(e) => setQ(e.target.value)} />
      <div className="stack gap8">
        <AnimatePresence initial={false}>
          {found.map((m) => (
            <Collapse key={`${m.at}:${m.text.slice(0, 24)}`} appear>
              <div className="plinth-2 chat-hit">
                <div className="xs t3 num">{new Date(m.at).toLocaleString(lang === 'da' ? 'da-DK' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {m.role === 'user' ? t('You') : t('Coach')}</div>
                <div className="small" style={{ marginTop: 2 }}>{m.text.length > 280 ? `${m.text.slice(0, 280)}…` : m.text}</div>
                {m.beside && <div className="xs t2" style={{ marginTop: 4 }}>↳ {m.beside.text.length > 160 ? `${m.beside.text.slice(0, 160)}…` : m.beside.text}</div>}
              </div>
            </Collapse>
          ))}
        </AnimatePresence>
        {dq && !found.length && <div className="xs t3">{t('Nothing found.')}</div>}
      </div>
      {!sure
        ? <button className="btn ghost sm press" style={{ alignSelf: 'flex-start' }} onClick={() => setSure(true)}><Icon name="trash" size={15} /> {t('Delete conversation history')}</button>
        : <div className="row-flex" style={{ gap: 8 }}><button className="btn danger sm grow press" onClick={forget}>{t('Yes, delete it')}</button><button className="btn sm grow press" onClick={() => setSure(false)}>{t('Keep')}</button></div>}
    </section>
  );
}

function MemoryRow({ m, ended = false }: { m: MemoryNote; ended?: boolean }) {
  const t = useT();
  const [edit, setEdit] = useState<string | null>(null);
  const lang = useLang();
  const exs = useStore((s) => s.exercises);
  const about = (m.exerciseIds ?? []).map((id) => exerciseMap(exs).get(id)).filter(Boolean).map((e) => exName(e!, lang));
  const save = () => {
    const text = (edit ?? '').trim();
    if (text && text !== m.text) useStore.getState().updateMemory(m.id, { text: text.slice(0, 240) });
    setEdit(null);
  };
  const [history, setHistory] = useState(false);
  const day = (at: number) => new Date(at).toLocaleDateString(lang === 'da' ? 'da-DK' : 'en-GB', { day: 'numeric', month: 'short' });
  const remove = () => {
    const gone = useStore.getState().removeMemory(m.id);
    haptic('light');
    if (gone) useUI.getState().toast(t('Removed from memory'), { actionLabel: t('Undo'), onAction: () => useStore.getState().restoreMemory(gone) });
  };
  return (
    <div className={`plinth-2 mem-row${ended ? ' ended' : ''}`}>
      <div className="grow" style={{ minWidth: 0 }}>
        {/* (the group says what kind it is; this line says only when: until, ended, reworded) */}
        {(m.until || m.updatedAt) && (
          <div className="xs t3 num" style={{ marginBottom: 4 }}>
            {[m.until && (ended ? t('Ended {date}', { date: fmtDate(m.until, lang, { day: 'numeric', month: 'short' }) }) : t('Until {date}', { date: fmtDate(m.until, lang, { weekday: 'short', day: 'numeric', month: 'short' }) })), m.updatedAt && t('updated {date}', { date: day(m.updatedAt) })].filter(Boolean).join(' · ')}
          </div>
        )}
        {edit === null
          ? <button className="mem-text" onClick={() => setEdit(m.text)} aria-label={`${t('Edit')}: ${m.text}`}>{m.text}</button>
          : <textarea className="input mem-edit" autoFocus value={edit} maxLength={240} rows={2} onChange={(e) => setEdit(e.target.value)} onBlur={save} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); } if (e.key === 'Escape') { e.stopPropagation(); setEdit(null); } }} />}
        {about.length > 0 && <div className="xs t3" style={{ marginTop: 4 }}><Icon name="dumbbell" size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />{about.join(' · ')}</div>}
        {m.goal && <GoalLine m={m} />}
        {!!m.was?.length && (
          <>
            <button className="xs t3 mem-hist-btn press" aria-expanded={history} onClick={() => setHistory((x) => !x)}>{history ? t('Hide earlier wording') : t('Earlier wording ({n})', { n: m.was.length })}</button>
            <Collapse open={history}>
              <div className="stack gap4 mem-hist">{m.was.map((w) => <div key={w.at} className="xs t2"><span className="num t3">{day(w.at)}</span> · <s>{w.text}</s></div>)}</div>
            </Collapse>
          </>
        )}
      </div>
      <button className="icon-btn flat sm press" aria-label={t('Remove')} onClick={remove}><Icon name="trash" size={17} /></button>
    </div>
  );
}

/** Where a goal stands (lib/goals.ts): "81.9 → 80 kg · on pace · by 16 Nov", or when it was reached or dropped. */
function GoalLine({ m }: { m: MemoryNote }) {
  const t = useT();
  const lang = useLang();
  const u = useStore((s) => s.settings.units.weight);
  // (drawn again when a weigh-in, a workout or a meal comes in while the screen is open)
  useStore((s) => s.weights); useStore((s) => s.sessions); useStore((s) => s.entries);
  const g = m.goal!;
  const day = (x: string) => fmtDate(x, lang, { day: 'numeric', month: 'short' });
  let text: string;
  // (an ended goal without its day, from an older backup: no line rather than an invalid date)
  if (g.status) text = !g.endedOn ? '' : g.status === 'done' ? t('Reached {date}', { date: day(g.endedOn) }) : t('Dropped {date}', { date: day(g.endedOn) });
  else {
    const s = useStore.getState();
    const st = goalState(s, m, dayKey(Date.now(), s.settings.dayStartHour));
    const short = st ? goalShort(st, t, (kg) => `${fmtNum(kgToDisplay(kg, u), lang, 1)} ${u}`) : '';
    // (the date only when the note's words don't already say it)
    text = [short, g.by && !m.text.includes(g.by) && t('by {date}', { date: day(g.by) })].filter(Boolean).join(' · ');
  }
  if (!text) return null;
  return <div className="xs t3 num" style={{ marginTop: 4 }}><Icon name={g.metric === 'lift' ? 'bolt' : 'scale'} size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />{text}</div>;
}
