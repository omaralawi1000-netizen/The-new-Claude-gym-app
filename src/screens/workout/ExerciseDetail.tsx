import { useMemo } from 'react';
import { useStore, exerciseMap, allExercises } from '../../state/store';
import { useUI } from '../../state/ui';
import { useT, useLang } from '../../lib/i18n';
import { Sheet, SheetHead } from '../../ui/Sheet';
import { Icon } from '../../ui/Icon';
import { MuscleMap } from './MuscleMap';
import { EQUIP_LABEL, MOVE_LABEL, MUSCLE_LABEL, exName, exSteps, fmtSet } from './common';
import { bestsFor, countable, epley } from '../../lib/workout';
import { fmtDate } from '../../lib/dates';
import { fmtNum, kgToDisplay } from '../../lib/units';
import { LineChart } from '../../ui/charts';
import { equipmentSet, substitutesFor } from './subs';
import { addExercises } from './actions';

export function ExerciseDetail({ props }: { props: { id: string } }) {
  const t = useT();
  const lang = useLang();
  const s = useStore();
  const pop = useUI((u) => u.pop);
  const push = useUI((u) => u.push);
  const toast = useUI((u) => u.toast);
  const ex = exerciseMap(s.exercises).get(props.id);
  const u = s.settings.units;
  const history = useMemo(() => s.sessions.filter((x) => x.exercises.some((e) => e.exerciseId === props.id)), [s.sessions, props.id]);
  const best = bestsFor(props.id, s.sessions);
  const series = history.map((h) => {
    const sets = h.exercises.filter((e) => e.exerciseId === props.id).flatMap((e) => e.sets).filter(countable);
    const top = sets.reduce((m, x) => Math.max(m, x.weightKg && x.reps && x.reps <= 12 ? epley(x.weightKg, x.reps) : 0), 0);
    return { x: h.startedAt, y: kgToDisplay(top, u.weight), label: fmtDate(h.date, lang, { day: 'numeric', month: 'short' }) };
  }).filter((p) => p.y > 0);
  if (!ex) return null;
  const subs = substitutesFor(ex, allExercises(s.exercises), equipmentSet(s.settings.profile.equipment)).slice(0, 4);
  const wt = `${u.weight}`;
  return (
    <Sheet onClose={pop} tall label={exName(ex, lang)} z={115}
      foot={s.active ? <button className="btn primary block press" onClick={() => { addExercises([ex.id]); toast(t('Added to workout'), { tone: 'ok' }); pop(); }}><Icon name="plus" size={18} /> {t('Add to current workout')}</button> : undefined}>
      <SheetHead title={exName(ex, lang)} sub={ex.muscles.map((m) => t(MUSCLE_LABEL[m])).join(' · ')} onClose={pop} right={ex.custom ? <button className="icon-btn flat" aria-label={t('Edit')} onClick={() => push('exerciseEditor', { id: ex.id })}><Icon name="edit" /></button> : undefined} />
      <div className="sheet-body">
        <div className="plinth dots" style={{ padding: 14, borderRadius: 'var(--r-lg)', display: 'grid', placeItems: 'center' }}><MuscleMap muscles={ex.muscles} size={130} /></div>
        <div className="chips" style={{ margin: '14px 0 0', padding: 0, flexWrap: 'wrap' }}>
          {ex.equipment.map((q) => <span key={q} className="chip sm">{t(EQUIP_LABEL[q])}</span>)}<span className="chip sm">{t(MOVE_LABEL[ex.movement])}</span>
        </div>

        <div className="micro" style={{ margin: '22px 0 8px' }}>{t('How to')}</div>
        {exSteps(ex, lang).length === 0 ? <div className="small t2">{t('No instructions yet.')}</div> : (
          <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {exSteps(ex, lang).map((st, i) => <li key={i} style={{ display: 'flex', gap: 12 }}><span className="display display-sm accent num" style={{ width: 22 }}>{i + 1}</span><span style={{ flex: 1 }}>{st}</span></li>)}
          </ol>
        )}

        <div className="micro" style={{ margin: '24px 0 8px' }}>{t('Your records')}</div>
        {history.length === 0 ? <div className="small t2">{t('Nothing logged yet.')}</div> : (
          <div className="plinth" style={{ padding: '4px 14px' }}>
            {ex.logType === 'weightReps' && <>
              <RecRow label={t('Heaviest set')} def={t('Heaviest weight lifted for 1+ reps')} value={`${fmtNum(kgToDisplay(best.weight, u.weight), lang, 2)} ${wt}`} />
              <RecRow label={t('Estimated 1RM')} def={t('Epley: weight × (1 + reps ÷ 30), sets of up to 12 reps — an estimate, not a tested max')} value={`${fmtNum(kgToDisplay(best.e1rm, u.weight), lang, 1)} ${wt}`} est />
              <RecRow label={t('Best set volume')} def={t('Weight × reps in one working set')} value={`${fmtNum(Math.round(kgToDisplay(best.volume, u.weight)), lang, 0)} ${wt}`} />
            </>}
            {(ex.logType === 'bodyweightReps' || ex.logType === 'assisted') && <RecRow label={t('Most reps in a set')} def={t('Highest reps in one working set')} value={String(best.reps)} />}
            {ex.logType === 'duration' && <RecRow label={t('Longest hold')} def={t('Longest single working set')} value={`${best.duration}s`} />}
            {ex.logType === 'distance' && <RecRow label={t('Longest distance')} def={t('Longest single working set')} value={`${fmtNum(u.distance === 'mi' ? best.distance / 1609.344 : best.distance / 1000, lang, 2)} ${u.distance}`} />}
          </div>
        )}
        {series.length >= 2 && (
          <div style={{ marginTop: 16 }}>
            <div className="micro" style={{ marginBottom: 6 }}>{t('Estimated 1RM over time')} ({wt})</div>
            <LineChart points={series} fmtY={(v) => fmtNum(v, lang, 0)} seriesLabel={t('Estimated 1RM')} />
          </div>
        )}
        {history.length > 0 && (
          <>
            <div className="micro" style={{ margin: '22px 0 6px' }}>{t('Recent sessions')}</div>
            <div className="list">
              {history.slice(-5).reverse().map((h) => {
                const sets = h.exercises.filter((e) => e.exerciseId === props.id).flatMap((e) => e.sets).filter((x) => x.done);
                return <button key={h.id} className="li press" style={{ alignItems: 'flex-start' }} onClick={() => push('sessionDetail', { id: h.id })}><div className="grow" style={{ textAlign: 'left' }}><div className="li-title small">{fmtDate(h.date, lang, { weekday: 'short', day: 'numeric', month: 'short' })}</div><div className="li-sub num">{sets.map((x) => `${x.type === 'warmup' ? 'W ' : ''}${fmtSet(x, ex, u, lang, t)}`).join(' · ')}</div></div><Icon name="chevR" size={16} /></button>;
              })}
            </div>
          </>
        )}
        {subs.length > 0 && (
          <>
            <div className="micro" style={{ margin: '22px 0 6px' }}>{t('Substitutions')}</div>
            <div className="xs t3" style={{ marginBottom: 4 }}>{t('Same main muscle and movement; equipment you have comes first.')}</div>
            <div className="list">{subs.map((e) => <button key={e.id} className="li press" onClick={() => push('exercise', { id: e.id })}><div className="grow" style={{ textAlign: 'left' }}><div className="li-title small">{exName(e, lang)}</div><div className="li-sub">{e.equipment.map((q) => t(EQUIP_LABEL[q])).join(', ')}</div></div><Icon name="chevR" size={16} /></button>)}</div>
          </>
        )}
      </div>
    </Sheet>
  );
}

function RecRow({ label, def, value, est }: { label: string; def: string; value: string; est?: boolean }) {
  const t = useT();
  return (
    <div style={{ padding: '12px 0', borderTop: '1px solid var(--line)' }} className="row-flex between">
      <div style={{ minWidth: 0 }}><div style={{ fontWeight: 600 }}>{label}{est && <span className="chip sm" style={{ marginLeft: 8, height: 20 }}>{t('estimate')}</span>}</div><div className="xs t3" style={{ marginTop: 2, maxWidth: 210 }}>{def}</div></div>
      <div className="display display-md num">{value}</div>
    </div>
  );
}
