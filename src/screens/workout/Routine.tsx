import { memo, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { AnimatePresence } from 'motion/react';
import { useStore, exerciseMap } from '../../state/store';
import { useUI, buzz } from '../../state/ui';
import { useT, useLang } from '../../lib/i18n';
import type { Exercise, Lang, Routine, RoutineItem } from '../../lib/types';
import { uid } from '../../lib/nutrition';
import { Sheet, SheetHead } from '../../ui/Sheet';
import { Icon } from '../../ui/Icon';
import { Collapse, Stepper } from '../../ui/kit';
import { flip } from '../../ui/flip';
import { startDragSort } from '../../ui/dragSort';
import { exName, MUSCLE_LABEL } from './common';
import { fmtDuration } from '../../lib/dates';

export function newItem(exerciseId: string, logType?: string): RoutineItem {
  const timed = logType === 'duration' || logType === 'distance';
  return { id: uid('ri'), exerciseId, warmupSets: 0, workingSets: timed ? 1 : 3, repMin: 8, repMax: 12, restSec: 90 };
}

export function RoutineEditor({ props }: { props: { id?: string } }) {
  const t = useT();
  const lang = useLang();
  const exercises = useStore((x) => x.exercises);
  const routines = useStore((x) => x.routines);
  const pop = useUI((u) => u.pop);
  const push = useUI((u) => u.push);
  const toast = useUI((u) => u.toast);
  const exMap = exerciseMap(exercises);
  const existing = props.id ? routines.find((r) => r.id === props.id) : undefined;
  const [name, setName] = useState(existing?.name ?? '');
  const [items, setItems] = useState<RoutineItem[]>(existing?.items ?? []);
  const [note, setNote] = useState(existing?.note ?? '');
  const [open, setOpen] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const firstIds = useRef(new Set((existing?.items ?? []).map((i) => i.id))); // exercises added later grow in
  const valid = name.trim().length > 0 && items.length > 0;
  // One set of actions for every card, made once: a card redraws only when its own exercise changes (a + on one stepper
  // used to redraw the whole editor).
  const act = useMemo<CardActions>(() => ({
    toggle: (id) => setOpen((o) => (o === id ? null : id)),
    upd: (id, p) => setItems((x) => x.map((i) => (i.id === id ? { ...i, ...p } : i))),
    // the move is drawn in the same frame the FLIP measures (see ui/flip.ts)
    move: (id, d) => flip(listRef.current, () => flushSync(() => setItems((x) => { const l = [...x]; const i = l.findIndex((y) => y.id === id); const j = i + d; if (j < 0 || j >= l.length) return x; [l[i], l[j]] = [l[j], l[i]]; return l; }))),
    drag: (e, id) => startDragSort(e, listRef.current, id, (from, to) => setItems((x) => { const l = [...x]; const [it] = l.splice(from, 1); l.splice(to, 0, it); return l; })),
    link: (id) => setItems((x) => { const l = x.map((i) => ({ ...i })); const i = l.findIndex((y) => y.id === id); if (i >= l.length - 1) return x; const a = l[i], b = l[i + 1]; if (a.supersetGroup && a.supersetGroup === b.supersetGroup) { b.supersetGroup = undefined; if (!l.some((y, k) => k !== i && y.supersetGroup === a.supersetGroup)) a.supersetGroup = undefined; } else { const g = a.supersetGroup ?? uid('ss'); a.supersetGroup = g; b.supersetGroup = g; } return l; }),
    remove: (id) => { buzz(10); setOpen(null); setItems((x) => x.filter((y) => y.id !== id)); },
  }), []);
  const save = () => {
    if (!valid) return;
    const r: Routine = { id: existing?.id ?? uid('rt'), name: name.trim(), items, note: note.trim() || undefined, createdAt: existing?.createdAt ?? Date.now(), updatedAt: Date.now() };
    useStore.getState().upsertRoutine(r);
    buzz(12);
    toast(t('Routine saved'), { tone: 'ok' });
    pop();
  };
  const del = () => { if (!existing) return; const st = useStore.getState(); const r = st.deleteRoutine(existing.id); pop(); if (r) toast(t('Routine deleted'), { actionLabel: t('Undo'), onAction: () => useStore.getState().restoreRoutine(r) }); };
  return (
    <Sheet onClose={pop} tall label={t('Routine')} z={100} foot={<button className="btn primary block press" disabled={!valid} onClick={save}>{t('Save routine')}</button>}>
      <SheetHead title={existing ? t('Edit routine') : t('New routine')} onClose={pop} />
      <div className="sheet-body">
        <div className="field"><label htmlFor="rt-name">{t('Name')}</label><input id="rt-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('e.g. Push day')} /></div>
        <div className="lbl" style={{ margin: '20px 0 8px' }}>{t('Exercises')}</div>
        {items.length === 0 && <div className="small t2" style={{ padding: '4px 0 12px' }}>{t('Add the exercises for this session.')}</div>}
        <div ref={listRef}>
        <AnimatePresence initial={false}>
          {items.map((i, idx) => (
            <Collapse key={i.id} appear={!firstIds.current.has(i.id)}>
              <RoutineCard item={i} ex={exMap.get(i.exerciseId)} lang={lang} isOpen={open === i.id} first={idx === 0} last={idx === items.length - 1}
                linkedNext={!!i.supersetGroup && items[idx + 1]?.supersetGroup === i.supersetGroup} act={act} />
            </Collapse>
          ))}
        </AnimatePresence>
        </div>
        <button className="btn block press" onClick={() => push('exercisePicker', { mode: 'pick', onPick: (ids: string[]) => setItems((x) => [...x, ...ids.map((id) => newItem(id, exMap.get(id)?.logType))]) })}><Icon name="plus" size={18} /> {t('Add exercises')}</button>
        <div className="field" style={{ marginTop: 18 }}><label htmlFor="rt-note">{t('Notes')}</label><textarea id="rt-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('Optional')} /></div>
        {existing && <button className="btn sm danger press" style={{ marginTop: 18 }} onClick={del}><Icon name="trash" size={16} /> {t('Delete routine')}</button>}
      </div>
    </Sheet>
  );
}

interface CardActions {
  toggle: (id: string) => void; upd: (id: string, p: Partial<RoutineItem>) => void; move: (id: string, d: -1 | 1) => void;
  drag: (e: React.PointerEvent, id: string) => void; link: (id: string) => void; remove: (id: string) => void;
}

/**
 * One exercise in the routine. Closed: grip · name and its plan · chevron. Open: its settings as a short list (name left,
 * slim stepper right) and a quiet row of actions. Dragging the grip lifts the card and moves it (ui/dragSort.ts).
 */
const RoutineCard = memo(function RoutineCard({ item: i, ex, lang, isOpen, first, last, linkedNext, act }: { item: RoutineItem; ex: Exercise | undefined; lang: Lang; isOpen: boolean; first: boolean; last: boolean; linkedNext: boolean; act: CardActions }) {
  const t = useT();
  const timed = !!ex && (ex.logType === 'duration' || ex.logType === 'distance');
  const summary = timed ? `${i.workingSets} ${i.workingSets === 1 ? t('set') : t('sets')} · ${t('rest')} ${fmtDuration(i.restSec)}` : `${i.warmupSets ? `${i.warmupSets} W + ` : ''}${i.workingSets} × ${i.repMin}–${i.repMax} · ${t('rest')} ${fmtDuration(i.restSec)}`;
  return (
    <div data-flip={i.id} className={`plinth rt-card${isOpen ? ' open' : ''}${i.supersetGroup ? ' ss' : ''}${linkedNext ? ' ss-next' : ''}`}>
      <div className="rt-head">
        {/* the grip: press and drag to move the exercise (the sheet doesn't follow this finger) */}
        <button className="rt-grip" data-no-swipe aria-label={t('Drag to reorder')} onPointerDown={(e) => act.drag(e, i.id)}><Icon name="grip" size={18} /></button>
        <button className="rt-toggle" onClick={() => act.toggle(i.id)} aria-expanded={isOpen}>
          <span className="li-title trunc">{ex ? exName(ex, lang) : '?'}</span>
          {/* closed: the plan in one line; open: the muscles it trains (the numbers are right below) */}
          <span className="rt-sub">
            <span className="li-sub num trunc rt-sum">{summary}{i.supersetGroup ? ` · ${t('superset')}` : ''}</span>
            <span className="li-sub trunc rt-mus" aria-hidden={!isOpen}>{ex ? ex.muscles.map((m) => t(MUSCLE_LABEL[m])).join(' · ') : ''}</span>
          </span>
        </button>
        <Icon name="chevD" size={18} className="rt-chev" />
      </div>
      {/* opens by its grid row (Collapse): only this card grows, the ones below just move */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <Collapse key="edit" appear ms={360}>
            <div className="rt-rows">
              <Row label={timed ? t('Sets') : t('Working sets')}><Stepper compact label={t('Working sets')} value={i.workingSets} min={1} max={12} onChange={(v) => act.upd(i.id, { workingSets: v })} /></Row>
              {!timed && <Row label={t('Warm-up sets')}><Stepper compact label={t('Warm-up sets')} value={i.warmupSets} min={0} max={6} onChange={(v) => act.upd(i.id, { warmupSets: v })} /></Row>}
              {!timed && <Row label={t('Reps')}>
                <div className="rt-range">
                  <Stepper compact label={t('Min reps')} value={i.repMin} min={1} max={i.repMax} onChange={(v) => act.upd(i.id, { repMin: v })} />
                  <span className="t3" aria-hidden>–</span>
                  <Stepper compact label={t('Max reps')} value={i.repMax} min={i.repMin} max={60} onChange={(v) => act.upd(i.id, { repMax: v })} />
                </div>
              </Row>}
              <Row label={t('Rest')}><Stepper compact label={t('Rest')} value={i.restSec} min={15} max={600} step={15} fmt={(v) => fmtDuration(v)} onChange={(v) => act.upd(i.id, { restSec: v })} /></Row>
            </div>
            <div className="rt-actions">
              {!last && <button className={`chip sm press${linkedNext ? ' on' : ''}`} onClick={() => act.link(i.id)}><Icon name="link" size={14} /> {linkedNext ? t('Unlink superset') : t('Superset with next')}</button>}
              <span className="grow" />
              <button className="icon-btn flat sm press" aria-label={t('Move up')} disabled={first} onClick={() => act.move(i.id, -1)}><Icon name="arrowUp" size={17} /></button>
              <button className="icon-btn flat sm press" aria-label={t('Move down')} disabled={last} onClick={() => act.move(i.id, 1)}><Icon name="arrowDown" size={17} /></button>
              <button className="icon-btn flat sm press rt-del" aria-label={t('Remove')} onClick={() => act.remove(i.id)}><Icon name="trash" size={17} /></button>
            </div>
          </Collapse>
        )}
      </AnimatePresence>
    </div>
  );
});

/** One setting in the exercise's editor: its name on the left, the stepper on the right — every stepper lines up. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="rt-row"><span className="rt-lbl">{label}</span>{children}</div>;
}
