import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { AnimatePresence } from 'motion/react';
import { useStore, exerciseMap } from '../../state/store';
import { useUI, buzz } from '../../state/ui';
import { useT, useLang } from '../../lib/i18n';
import type { Routine, RoutineItem } from '../../lib/types';
import { uid } from '../../lib/nutrition';
import { Sheet, SheetHead } from '../../ui/Sheet';
import { Icon } from '../../ui/Icon';
import { Collapse, Stepper } from '../../ui/kit';
import { flip } from '../../ui/flip';
import { exName, MUSCLE_LABEL } from './common';
import { fmtDuration } from '../../lib/dates';

export function newItem(exerciseId: string, logType?: string): RoutineItem {
  const timed = logType === 'duration' || logType === 'distance';
  return { id: uid('ri'), exerciseId, warmupSets: 0, workingSets: timed ? 1 : 3, repMin: 8, repMax: 12, restSec: 90 };
}

export function RoutineEditor({ props }: { props: { id?: string } }) {
  const t = useT();
  const lang = useLang();
  const s = useStore();
  const pop = useUI((u) => u.pop);
  const push = useUI((u) => u.push);
  const toast = useUI((u) => u.toast);
  const exMap = exerciseMap(s.exercises);
  const existing = props.id ? s.routines.find((r) => r.id === props.id) : undefined;
  const [name, setName] = useState(existing?.name ?? '');
  const [items, setItems] = useState<RoutineItem[]>(existing?.items ?? []);
  const [note, setNote] = useState(existing?.note ?? '');
  const [open, setOpen] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const firstIds = useRef(new Set((existing?.items ?? []).map((i) => i.id))); // exercises added later grow in
  const valid = name.trim().length > 0 && items.length > 0;
  const upd = (id: string, p: Partial<RoutineItem>) => setItems((x) => x.map((i) => (i.id === id ? { ...i, ...p } : i)));
  const move = (id: string, d: -1 | 1) => flip(listRef.current, () => setItemsSync((x) => { const l = [...x]; const i = l.findIndex((y) => y.id === id); const j = i + d; if (j < 0 || j >= l.length) return x; [l[i], l[j]] = [l[j], l[i]]; return l; }));
  // the move is drawn in the same frame the FLIP measures (see ui/flip.ts)
  const setItemsSync = (fn: (x: RoutineItem[]) => RoutineItem[]) => flushSync(() => setItems(fn));
  const link = (id: string) => setItems((x) => { const l = x.map((i) => ({ ...i })); const i = l.findIndex((y) => y.id === id); if (i >= l.length - 1) return x; const a = l[i], b = l[i + 1]; if (a.supersetGroup && a.supersetGroup === b.supersetGroup) { b.supersetGroup = undefined; if (!l.some((y, k) => k !== i && y.supersetGroup === a.supersetGroup)) a.supersetGroup = undefined; } else { const g = a.supersetGroup ?? uid('ss'); a.supersetGroup = g; b.supersetGroup = g; } return l; });
  const save = () => {
    if (!valid) return;
    const r: Routine = { id: existing?.id ?? uid('rt'), name: name.trim(), items, note: note.trim() || undefined, createdAt: existing?.createdAt ?? Date.now(), updatedAt: Date.now() };
    s.upsertRoutine(r);
    buzz(12);
    toast(t('Routine saved'), { tone: 'ok' });
    pop();
  };
  const del = () => { if (!existing) return; const r = s.deleteRoutine(existing.id); pop(); if (r) toast(t('Routine deleted'), { actionLabel: t('Undo'), onAction: () => s.restoreRoutine(r) }); };
  return (
    <Sheet onClose={pop} tall label={t('Routine')} z={100} foot={<button className="btn primary block press" disabled={!valid} onClick={save}>{t('Save routine')}</button>}>
      <SheetHead title={existing ? t('Edit routine') : t('New routine')} onClose={pop} />
      <div className="sheet-body">
        <div className="field"><label htmlFor="rt-name">{t('Name')}</label><input id="rt-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('e.g. Push day')} /></div>
        <div className="lbl" style={{ margin: '20px 0 8px' }}>{t('Exercises')}</div>
        {items.length === 0 && <div className="small t2" style={{ padding: '4px 0 12px' }}>{t('Add the exercises for this session.')}</div>}
        <div ref={listRef}>
        <AnimatePresence initial={false}>
          {items.map((i, idx) => {
            const ex = exMap.get(i.exerciseId);
            const isOpen = open === i.id;
            const timed = ex && (ex.logType === 'duration' || ex.logType === 'distance');
            const linkedNext = i.supersetGroup && items[idx + 1]?.supersetGroup === i.supersetGroup;
            return (
              <Collapse key={i.id} appear={!firstIds.current.has(i.id)}>
              <div data-flip={i.id} className="plinth" style={{ padding: '12px 12px', marginBottom: linkedNext ? 4 : 10, borderLeft: i.supersetGroup ? '3px solid var(--ac)' : undefined }}>
                <div className="row-flex" style={{ gap: 8 }}>
                  <button className="grow press" style={{ textAlign: 'left', minWidth: 0 }} onClick={() => setOpen(isOpen ? null : i.id)} aria-expanded={isOpen}>
                    <div className="li-title trunc">{ex ? exName(ex, lang) : '?'}</div>
                    <div className="li-sub num">{timed ? `${i.workingSets} ${i.workingSets === 1 ? t('set') : t('sets')}` : `${i.warmupSets ? `${i.warmupSets} W + ` : ''}${i.workingSets} × ${i.repMin}–${i.repMax}`} · {t('rest')} {fmtDuration(i.restSec)}{i.supersetGroup ? ` · ${t('superset')}` : ''}</div>
                  </button>
                  <button className="icon-btn flat sm" aria-label={t('Move up')} disabled={idx === 0} onClick={() => move(i.id, -1)} style={{ opacity: idx === 0 ? 0.3 : 1 }}><Icon name="arrowUp" size={17} /></button>
                  <button className="icon-btn flat sm" aria-label={t('Move down')} disabled={idx === items.length - 1} onClick={() => move(i.id, 1)} style={{ opacity: idx === items.length - 1 ? 0.3 : 1 }}><Icon name="arrowDown" size={17} /></button>
                </div>
                {/* opens by its grid row (Collapse): only this card grows, the ones below just move — nothing vanishes or
                    jumps (it used to animate height with every card re-measuring itself) */}
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <Collapse key="edit" appear ms={300}>
                      <div className="rt-grid">
                        <Cell label={t('Working sets')}><Stepper compact label={t('Working sets')} value={i.workingSets} min={1} max={12} onChange={(v) => upd(i.id, { workingSets: v })} /></Cell>
                        {!timed && <Cell label={t('Warm-up sets')}><Stepper compact label={t('Warm-up sets')} value={i.warmupSets} min={0} max={6} onChange={(v) => upd(i.id, { warmupSets: v })} /></Cell>}
                        {!timed && <Cell label={t('Min reps')}><Stepper compact label={t('Min reps')} value={i.repMin} min={1} max={i.repMax} onChange={(v) => upd(i.id, { repMin: v })} /></Cell>}
                        {!timed && <Cell label={t('Max reps')}><Stepper compact label={t('Max reps')} value={i.repMax} min={i.repMin} max={60} onChange={(v) => upd(i.id, { repMax: v })} /></Cell>}
                        <Cell label={t('Rest')}><Stepper compact label={t('Rest')} value={i.restSec} min={15} max={600} step={15} fmt={(v) => fmtDuration(v)} onChange={(v) => upd(i.id, { restSec: v })} /></Cell>
                      </div>
                      <div className="stack gap12" style={{ paddingTop: 14 }}>
                        <div className="row-flex" style={{ gap: 8, flexWrap: 'wrap' }}>
                          {idx < items.length - 1 && <button className="chip sm press" onClick={() => link(i.id)}><Icon name="link" size={14} /> {linkedNext ? t('Unlink superset') : t('Superset with next')}</button>}
                          <button className="chip sm press" style={{ color: 'var(--bad)' }} onClick={() => { setItems((x) => x.filter((y) => y.id !== i.id)); }}><Icon name="trash" size={14} /> {t('Remove')}</button>
                        </div>
                        {ex && <div className="xs t3">{ex.muscles.map((m) => t(MUSCLE_LABEL[m])).join(' · ')}</div>}
                      </div>
                    </Collapse>
                  )}
                </AnimatePresence>
              </div>
              </Collapse>
            );
          })}
        </AnimatePresence>
        </div>
        <button className="btn block press" onClick={() => push('exercisePicker', { mode: 'pick', onPick: (ids: string[]) => setItems((x) => [...x, ...ids.map((id) => newItem(id, exMap.get(id)?.logType))]) })}><Icon name="plus" size={18} /> {t('Add exercises')}</button>
        <div className="field" style={{ marginTop: 18 }}><label htmlFor="rt-note">{t('Notes')}</label><textarea id="rt-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('Optional')} /></div>
        {existing && <button className="btn sm danger press" style={{ marginTop: 18 }} onClick={del}><Icon name="trash" size={16} /> {t('Delete routine')}</button>}
      </div>
    </Sheet>
  );
}

/** One setting in the exercise's editor: its name above, the stepper below — two to a row, all lined up. */
function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="rt-cell"><span className="micro">{label}</span>{children}</div>;
}
