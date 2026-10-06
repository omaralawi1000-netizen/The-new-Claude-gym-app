import { useState } from 'react';
import { useStore, exerciseMap } from '../state/store';
import { exName } from './workout/common';
import { useUI, buzz } from '../state/ui';
import { useT, useLang } from '../lib/i18n';
import { MEMORY_MAX } from '../state/defaults';
import type { MemoryKind, MemoryNote } from '../lib/types';
import { Icon } from '../ui/Icon';
import { Collapse } from '../ui/kit';
import { AnimatePresence } from 'motion/react';

const KIND_LABEL: Record<MemoryKind, string> = { goal: 'Goal', preference: 'Preference', health: 'Body', schedule: 'Schedule', gear: 'Gym', food: 'Food', other: 'Note' };

/**
 * Settings → Coach memory: everything the Coach keeps about you, in plain words. It adds to this when you tell it something
 * lasting; here you can read it, reword it, add your own or remove anything. It is sent with every question to the AI.
 */
export function CoachMemory() {
  const t = useT();
  const memory = useStore((s) => s.memory);
  const [draft, setDraft] = useState('');
  const full = memory.length >= MEMORY_MAX;
  const add = () => {
    const text = draft.trim().slice(0, 240);
    if (!text || full) return;
    useStore.getState().addMemory({ text, kind: 'other' });
    setDraft(''); buzz(8);
  };
  return (
    <div className="stack gap16">
      <div className="small t2">{t('The Coach reads this before every answer. It adds to it when you tell it something lasting, like how you train or what to avoid. Change or remove anything.')}</div>
      {memory.length === 0 && (
        <div className="plinth-2 small t2" style={{ padding: 14 }}>{t('Nothing yet. Try telling the Coach: “I don’t do a separate leg day, wrestling covers my legs.”')}</div>
      )}
      <div className="stack gap8">
        <AnimatePresence initial={false}>
          {memory.map((m) => <Collapse key={m.id} appear><MemoryRow m={m} /></Collapse>)}
        </AnimatePresence>
      </div>
      <div className="field">
        <label htmlFor="mem-add">{t('Add something the Coach should know')}</label>
        <div className="row-flex" style={{ gap: 8 }}>
          <input id="mem-add" className="input grow" value={draft} maxLength={240} disabled={full} placeholder={t('e.g. Training for a wrestling tournament in March')} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
          <button className="icon-btn acc press" aria-label={t('Add')} disabled={!draft.trim() || full} onClick={add}><Icon name="plus" size={20} /></button>
        </div>
        <div className="xs t3">{full ? t('Memory is full. Remove something first.') : t('{n} of {max}', { n: memory.length, max: MEMORY_MAX })}</div>
      </div>
      <div className="xs t3">{t('Saved on this device and in your backups. Sent with each question to the AI you use (Gemini or GPT-6.1 Sol).')}</div>
    </div>
  );
}

function MemoryRow({ m }: { m: MemoryNote }) {
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
  const remove = () => {
    const gone = useStore.getState().removeMemory(m.id);
    buzz(10);
    if (gone) useUI.getState().toast(t('Removed from memory'), { actionLabel: t('Undo'), onAction: () => useStore.getState().restoreMemory(gone) });
  };
  return (
    <div className="plinth-2 mem-row">
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="micro" style={{ marginBottom: 4 }}>{t(KIND_LABEL[m.kind] ?? 'Note')}</div>
        {edit === null
          ? <button className="mem-text" onClick={() => setEdit(m.text)} aria-label={`${t('Edit')}: ${m.text}`}>{m.text}</button>
          : <textarea className="input mem-edit" autoFocus value={edit} maxLength={240} rows={2} onChange={(e) => setEdit(e.target.value)} onBlur={save} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); } if (e.key === 'Escape') { e.stopPropagation(); setEdit(null); } }} />}
        {about.length > 0 && <div className="xs t3" style={{ marginTop: 4 }}><Icon name="dumbbell" size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />{about.join(' · ')}</div>}
      </div>
      <button className="icon-btn flat sm press" aria-label={t('Remove')} onClick={remove}><Icon name="trash" size={17} /></button>
    </div>
  );
}
