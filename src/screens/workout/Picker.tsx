import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useStore, allExercises } from '../../state/store';
import { useUI, buzz } from '../../state/ui';
import { useT, useLang } from '../../lib/i18n';
import type { Equipment, Exercise, LogType, MuscleGroup, Movement } from '../../lib/types';
import { MUSCLES, EQUIPMENT, MOVEMENTS } from '../../data/exercises';
import { matchExercises } from '../../lib/workoutText';
import { Icon } from '../../ui/Icon';
import { Seg } from '../../ui/kit';
import { Sheet, SheetHead, SOFT } from '../../ui/Sheet';
import { EQUIP_LABEL, MOVE_LABEL, MUSCLE_LABEL, exName } from './common';
import { addExercises, replaceExercise } from './actions';
import { uid } from '../../lib/nutrition';
import { equipmentSet, substitutesFor } from './subs';

interface PickerProps { mode: 'add' | 'replace' | 'pick'; seId?: string; forExercise?: Exercise; onPick?: (ids: string[]) => void; single?: boolean }

export function ExercisePicker({ props }: { props: PickerProps }) {
  const t = useT();
  const lang = useLang();
  const s = useStore();
  const pop = useUI((u) => u.pop);
  const push = useUI((u) => u.push);
  const all = allExercises(s.exercises);
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null);
  const [equip, setEquip] = useState<Equipment | null>(null);
  const [move, setMove] = useState<Movement | null>(null);
  const [mine, setMine] = useState(false);
  const [more, setMore] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const access = equipmentSet(s.settings.profile.equipment);
  const single = props.mode === 'replace' || !!props.single;

  const list = useMemo(() => {
    let l: Exercise[] = q.trim() ? matchExercises(q, all, lang, 60).map((x) => x.ex) : [...all].sort((a, b) => exName(a, lang).localeCompare(exName(b, lang), lang));
    if (muscle) l = l.filter((e) => e.muscles.includes(muscle));
    if (equip) l = l.filter((e) => e.equipment.includes(equip));
    if (move) l = l.filter((e) => e.movement === move);
    if (mine) l = l.filter((e) => e.equipment.some((x) => access.has(x)));
    return l;
  }, [q, muscle, equip, move, mine, all, lang, access]);

  const subs = props.mode === 'replace' && props.forExercise ? substitutesFor(props.forExercise, all, access).slice(0, 4) : [];

  const choose = (e: Exercise) => {
    buzz(8);
    if (single) {
      if (props.mode === 'replace' && props.seId) replaceExercise(props.seId, e.id);
      props.onPick?.([e.id]);
      pop();
    } else setSel((x) => (x.includes(e.id) ? x.filter((y) => y !== e.id) : [...x, e.id]));
  };
  const confirm = () => {
    if (props.onPick) props.onPick(sel); else addExercises(sel);
    pop();
  };

  return (
    <Sheet onClose={pop} tall label={t('Exercises')} z={110} foot={!single ? <button className="btn primary block press" disabled={!sel.length} onClick={confirm}>{sel.length ? t('Add {n} exercises', { n: sel.length }) : t('Select exercises')}</button> : undefined}>
      <SheetHead title={props.mode === 'replace' ? t('Replace exercise') : t('Add exercises')} sub={props.mode === 'replace' && props.forExercise ? exName(props.forExercise, lang) : undefined} onClose={pop} />
      <div style={{ padding: '0 20px 10px' }}>
        <div style={{ position: 'relative' }}>
          <Icon name="search" size={18} style={{ position: 'absolute', left: 14, top: 15, color: 'var(--tx3)' }} />
          <input className="input" style={{ paddingLeft: 42 }} placeholder={t('Search exercises')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('Search exercises')} />
        </div>
        <div className="chips" style={{ marginTop: 12 }}>
          {MUSCLES.filter((m) => m !== 'cardio').map((m) => <button key={m} className={`chip sm press ${muscle === m ? 'on' : ''}`} onClick={() => setMuscle(muscle === m ? null : m)}>{t(MUSCLE_LABEL[m])}</button>)}
        </div>
        <button className="row-flex press xs t2" style={{ marginTop: 10, gap: 6 }} onClick={() => setMore((v) => !v)} aria-expanded={more}><Icon name="filter" size={15} /> {t('More filters')}{(equip || move || mine) && <span className="accent"> · {[equip && t(EQUIP_LABEL[equip]), move && t(MOVE_LABEL[move]), mine && t('my equipment')].filter(Boolean).join(', ')}</span>}</button>
        <AnimatePresence initial={false}>
          {more && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={SOFT} style={{ overflow: 'hidden' }}>
              <div className="lbl" style={{ margin: '10px 0 6px' }}>{t('Equipment')}</div>
              <div className="chips">{EQUIPMENT.map((e) => <button key={e} className={`chip sm press ${equip === e ? 'on' : ''}`} onClick={() => setEquip(equip === e ? null : e)}>{t(EQUIP_LABEL[e])}</button>)}</div>
              <div className="lbl" style={{ margin: '10px 0 6px' }}>{t('Movement')}</div>
              <div className="chips">{MOVEMENTS.map((e) => <button key={e} className={`chip sm press ${move === e ? 'on' : ''}`} onClick={() => setMove(move === e ? null : e)}>{t(MOVE_LABEL[e])}</button>)}</div>
              <button className={`chip sm press ${mine ? 'acc' : ''}`} style={{ marginTop: 10 }} onClick={() => setMine((v) => !v)}><Icon name={mine ? 'check' : 'plus'} size={14} /> {t('Only what my equipment allows')}</button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="sheet-body" style={{ paddingTop: 0 }}>
        {subs.length > 0 && !q && (
          <div style={{ marginBottom: 14 }}>
            <div className="micro" style={{ margin: '6px 0' }}>{t('Suggested substitutes')}</div>
            <div className="xs t3" style={{ marginBottom: 6 }}>{t('Same main muscle and movement; equipment you have comes first.')}</div>
            <div className="list">{subs.map((e) => <Row key={e.id} e={e} lang={lang} t={t} sel={false} single={single} onClick={() => choose(e)} />)}</div>
          </div>
        )}
        <div className="micro" style={{ margin: '6px 0' }}>{list.length} {t('exercises')}</div>
        <div className="list">{list.map((e) => <Row key={e.id} e={e} lang={lang} t={t} sel={sel.includes(e.id)} single={single} onClick={() => choose(e)} onInfo={() => push('exercise', { id: e.id })} />)}</div>
        {list.length === 0 && (
          <div className="empty"><div className="display display-sm">{t('No exercise found')}</div><div className="small" style={{ margin: '6px auto 14px', maxWidth: 260 }}>{t('Create it once and it stays in your library.')}</div>
            <button className="btn primary press" onClick={() => push('exerciseEditor', { name: q, onSaved: (id: string) => choose(useStore.getState().exercises.find((x) => x.id === id)!) })}><Icon name="plus" size={18} /> {t('Create exercise')}</button></div>
        )}
        {list.length > 0 && <button className="btn block press" style={{ marginTop: 16 }} onClick={() => push('exerciseEditor', { name: q, onSaved: (id: string) => { if (!single) setSel((x) => [...x, id]); } })}><Icon name="plus" size={18} /> {t('Create custom exercise')}</button>}
      </div>
    </Sheet>
  );
}

function Row({ e, lang, t, sel, single, onClick, onInfo }: { e: Exercise; lang: 'en' | 'da'; t: (k: string) => string; sel: boolean; single: boolean; onClick: () => void; onInfo?: () => void }) {
  return (
    <div className="li" style={{ padding: 0 }}>
      <button className="grow press" style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', padding: '10px 0', minHeight: 60 }} onClick={onClick} aria-pressed={single ? undefined : sel}>
        {!single && <span style={{ width: 26, height: 26, borderRadius: 9, display: 'grid', placeItems: 'center', background: sel ? 'var(--ac)' : 'var(--s3)', color: 'var(--ac-ink)', flex: 'none', transition: 'background .15s' }}>{sel && <Icon name="check" size={16} sw={2.6} />}</span>}
        <span className="grow" style={{ minWidth: 0 }}>
          <span className="li-title trunc" style={{ display: 'block' }}>{exName(e, lang)}{e.custom && <span className="chip sm acc" style={{ marginLeft: 8, height: 20 }}>{t('Custom')}</span>}</span>
          <span className="li-sub trunc" style={{ display: 'block' }}>{e.muscles.slice(0, 2).map((m) => t(MUSCLE_LABEL[m])).join(' · ')} · {e.equipment.slice(0, 2).map((m) => t(EQUIP_LABEL[m])).join(', ')}</span>
        </span>
      </button>
      {onInfo && <button className="icon-btn flat sm" aria-label={t('Exercise details')} onClick={onInfo}><Icon name="info" size={18} /></button>}
    </div>
  );
}

export function ExerciseEditor({ props }: { props: { name?: string; id?: string; onSaved?: (id: string) => void } }) {
  const t = useT();
  const s = useStore();
  const pop = useUI((u) => u.pop);
  const toast = useUI((u) => u.toast);
  const ex = props.id ? s.exercises.find((e) => e.id === props.id) : undefined;
  const [name, setName] = useState(ex?.name ?? props.name ?? '');
  const [muscles, setMuscles] = useState<MuscleGroup[]>(ex?.muscles ?? []);
  const [equipment, setEquipment] = useState<Equipment[]>(ex?.equipment ?? ['bodyweight']);
  const [movement, setMovement] = useState<Movement>(ex?.movement ?? 'isolation');
  const [logType, setLogType] = useState<LogType>(ex?.logType ?? 'weightReps');
  const [steps, setSteps] = useState((ex?.instructions ?? []).join('\n'));
  const valid = name.trim().length > 1 && muscles.length > 0;
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const save = () => {
    if (!valid) return;
    const e: Exercise = { id: ex?.id ?? uid('cx'), name: name.trim(), muscles, equipment: equipment.length ? equipment : ['other'], movement, logType, instructions: steps.split('\n').map((x) => x.trim()).filter(Boolean), custom: true };
    s.upsertExercise(e);
    toast(t('Saved “{name}”', { name: e.name }), { tone: 'ok' });
    pop();
    props.onSaved?.(e.id);
  };
  return (
    <Sheet onClose={pop} tall label={t('Custom exercise')} z={130} foot={<button className="btn primary block press" disabled={!valid} onClick={save}>{t('Save exercise')}</button>}>
      <SheetHead title={ex ? t('Edit exercise') : t('New exercise')} onClose={pop} />
      <div className="sheet-body">
        <div className="field"><label htmlFor="ex-name">{t('Name')}</label><input id="ex-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
        <div className="lbl" style={{ margin: '18px 0 8px' }}>{t('Muscles (first tapped = primary)')}</div>
        <div className="chips" style={{ flexWrap: 'wrap', margin: 0, padding: 0 }}>{MUSCLES.map((m) => <button key={m} className={`chip sm press ${muscles[0] === m ? 'on' : muscles.includes(m) ? 'acc' : ''}`} onClick={() => setMuscles(toggle(muscles, m))}>{t(MUSCLE_LABEL[m])}</button>)}</div>
        <div className="lbl" style={{ margin: '18px 0 8px' }}>{t('Equipment')}</div>
        <div className="chips" style={{ flexWrap: 'wrap', margin: 0, padding: 0 }}>{EQUIPMENT.map((m) => <button key={m} className={`chip sm press ${equipment.includes(m) ? 'acc' : ''}`} onClick={() => setEquipment(toggle(equipment, m))}>{t(EQUIP_LABEL[m])}</button>)}</div>
        <div className="lbl" style={{ margin: '18px 0 8px' }}>{t('Movement')}</div>
        <div className="chips" style={{ flexWrap: 'wrap', margin: 0, padding: 0 }}>{MOVEMENTS.map((m) => <button key={m} className={`chip sm press ${movement === m ? 'on' : ''}`} onClick={() => setMovement(m)}>{t(MOVE_LABEL[m])}</button>)}</div>
        <div className="lbl" style={{ margin: '18px 0 8px' }}>{t('How is it logged?')}</div>
        <Seg value={logType} onChange={setLogType} options={[{ value: 'weightReps', label: t('Load × reps') }, { value: 'bodyweightReps', label: t('Reps') }, { value: 'duration', label: t('Time') }]} />
        <div className="chips" style={{ margin: '8px 0 0', padding: 0, flexWrap: 'wrap' }}>
          <button className={`chip sm press ${logType === 'assisted' ? 'on' : ''}`} onClick={() => setLogType('assisted')}>{t('Assisted')}</button>
          <button className={`chip sm press ${logType === 'distance' ? 'on' : ''}`} onClick={() => setLogType('distance')}>{t('Distance')}</button>
        </div>
        <div className="field" style={{ marginTop: 18 }}><label htmlFor="ex-steps">{t('Instructions (one step per line, optional)')}</label><textarea id="ex-steps" className="input" style={{ minHeight: 110 }} value={steps} onChange={(e) => setSteps(e.target.value)} /></div>
      </div>
    </Sheet>
  );
}
