import { useMemo } from 'react';
import { useStore, exerciseMap, allExercises } from '../../state/store';
import { useUI } from '../../state/ui';
import { useT, useLang } from '../../lib/i18n';
import { Sheet, SheetHead } from '../../ui/Sheet';
import { Icon } from '../../ui/Icon';
import { Stepper } from '../../ui/kit';
import { MuscleMap } from './MuscleMap';
import { Figure, figureFor } from './Figure';
import { EQUIP_LABEL, MOVE_LABEL, MUSCLE_LABEL, exName, exSteps, fmtSet } from './common';
import { bestsFor, countable, epley, historyOf, incrementFor, repRange, suggestProgression } from '../../lib/workout';
import { fmtDate } from '../../lib/dates';
import { displayToKg, fmtNum, kgToDisplay } from '../../lib/units';
import { LineChart } from '../../ui/charts';
import { equipmentSet, substitutesFor } from './subs';
import { addExercises } from './actions';
import type { Exercise } from '../../lib/types';

type IconName = string;

/**
 * One exercise, in the order you need it: the movement (moving figure, or the muscle picture where there's no figure yet)
 * and what it works; what to do next time (or today, in a workout) with your last time and bests beside it; how to do it;
 * how it's going; then the rest (recent sessions, swaps, this exercise's weight jump).
 */
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
  // in a workout that has this exercise, the plan is for today and uses today's rep range
  const inWorkout = s.active?.exercises.find((e) => e.exerciseId === props.id);
  const past = useMemo(() => historyOf(props.id, s.sessions), [props.id, s.sessions]);
  if (!ex) return null;
  const subs = substitutesFor(ex, allExercises(s.exercises), equipmentSet(s.settings.profile.equipment)).slice(0, 3);
  const wt = `${u.weight}`;
  const kgTxt = (kg: number, d = 2) => `${fmtNum(kgToDisplay(kg, u.weight), lang, d)} ${wt}`;
  const lastSession = [...history].reverse().find((h) => h.exercises.some((e) => e.exerciseId === props.id && e.sets.some(countable)));
  const lastSet = past[0]?.sets.filter(countable)[0];
  const reps = ex.logType === 'weightReps' || ex.logType === 'bodyweightReps' || ex.logType === 'assisted';
  const sugg = reps ? suggestProgression(ex, past, repRange(inWorkout?.sets ?? past[0]?.sets ?? []), incrementFor(ex, s.increments, s.settings.plateStep)) : undefined;
  const target = sugg?.sets?.[0];
  const rv = sugg?.reasonVars ?? {};
  const reason = !sugg ? '' : sugg.kind === 'add-weight' ? t('+{inc} · set 1 hit {max}', { inc: kgTxt(Number(rv.inc)), max: rv.max ?? '' })
    : sugg.kind === 'add-reps' ? (rv.reps !== undefined ? t('Aim for {reps} reps', { reps: rv.reps }) : t('Same weight · +1 rep'))
    : sugg.kind === 'hold' ? t('Same weight · build set 1 to {min}', { min: rv.min ?? '' })
    : sugg.kind === 'stalled' ? t('Stalled at {w} · 3 sessions', { w: kgTxt(Number(rv.w)) })
    : t('First time · aim {min}–{max} reps', { min: rv.min ?? '', max: rv.max ?? '' });
  const REASON_ICON = { 'add-weight': 'arrowUp', 'add-reps': 'plus', hold: 'repeat', stalled: 'info', first: 'sparkle' } as const;
  // the stats beside the plan, by how the exercise is logged
  const stats: { label: string; value: string; sub?: string }[] = [];
  if (lastSet && lastSession) stats.push({ label: t('Last time'), value: fmtSet(lastSet, ex, u, lang, t), sub: fmtDate(lastSession.date, lang, { day: 'numeric', month: 'short' }) });
  if (history.length > 0) {
    if (ex.logType === 'weightReps') stats.push({ label: t('Heaviest'), value: kgTxt(best.weight) }, { label: t('Est. 1RM'), value: kgTxt(best.e1rm, 1) });
    if (ex.logType === 'bodyweightReps' || ex.logType === 'assisted') stats.push({ label: t('Most reps'), value: String(best.reps) });
    if (ex.logType === 'duration') stats.push({ label: t('Longest hold'), value: `${best.duration}s` });
    if (ex.logType === 'distance') stats.push({ label: t('Longest distance'), value: `${fmtNum(u.distance === 'mi' ? best.distance / 1609.344 : best.distance / 1000, lang, 2)} ${u.distance}` });
  }
  // one line on how it's going, from the first point on the chart to the last
  const trend = series.length >= 2 ? (() => {
    const d = series[series.length - 1].y - series[0].y, since = series[0].label;
    const n = `${fmtNum(Math.abs(d), lang, 1)} ${wt}`;
    return Math.abs(d) < 0.25 ? t('Steady since {date}', { date: since }) : d > 0 ? t('Up {n} since {date}', { n, date: since }) : t('Down {n} since {date}', { n, date: since });
  })() : '';
  const kind = figureFor(ex);
  const steps = exSteps(ex, lang);
  return (
    <Sheet onClose={pop} tall label={exName(ex, lang)} z={115}
      foot={s.active ? <button className="btn primary block press" onClick={() => { addExercises([ex.id]); toast(t('Added to workout'), { tone: 'ok' }); pop(); }}><Icon name="plus" size={18} /> {t('Add to current workout')}</button> : undefined}>
      <SheetHead title={exName(ex, lang)} sub={[...ex.equipment.map((q) => t(EQUIP_LABEL[q])), t(MOVE_LABEL[ex.movement])].join(' · ')} onClose={pop} right={ex.custom ? <button className="icon-btn flat press" aria-label={t('Edit')} onClick={() => push('exerciseEditor', { id: ex.id })}><Icon name="edit" /></button> : undefined} />
      <div className="sheet-body">
        {/* the movement: the figure doing it, or the muscles it works where there's no figure yet */}
        <div className={`exd-stage${kind ? '' : ' map'}`} aria-hidden>{kind ? <Figure ex={ex} kind={kind} active /> : <MuscleMap muscles={ex.muscles} size={124} />}</div>
        <div className="exd-works" aria-label={t('Works')}>
          {ex.muscles.map((m, i) => <span key={m} className={`chip sm${i === 0 ? ' acc' : ''}`}>{t(MUSCLE_LABEL[m])}</span>)}
        </div>

        {(sugg || stats.length > 0) && (
          <section className="plinth exd-plan">
            {sugg && (
              <>
                <Head icon={REASON_ICON[sugg.kind]} accent>{inWorkout ? t('Today') : t('Next time')}</Head>
                {target && sugg.kind !== 'first'
                  ? <div className="display display-md num exd-target">{ex.logType === 'weightReps' && target.weightKg !== undefined ? <>{fmtNum(kgToDisplay(target.weightKg, u.weight), lang, 2)}<span className="exd-unit">{wt}</span><span className="exd-x">×</span>{target.reps}</> : <>{target.reps}<span className="exd-unit">{t('reps')}</span></>}</div>
                  : sugg.kind === 'add-reps' && rv.reps !== undefined ? <div className="display display-md num exd-target">{rv.reps}<span className="exd-unit">{t('reps')}</span></div> : null}
                <div className="small t2 exd-reason">{sugg.sets && sugg.sets.length > 1 && sugg.kind !== 'first' ? `${t('{n} sets', { n: sugg.sets.length })} · ${reason}` : reason}</div>
              </>
            )}
            {stats.length > 0 && (
              <div className={`exd-stats${sugg ? ' lined' : ''}`}>
                {stats.map((x) => <div key={x.label} className="exd-stat"><div className="xs t3">{x.label}</div><div className="exd-stat-v num">{x.value}</div>{x.sub && <div className="xs t3">{x.sub}</div>}</div>)}
              </div>
            )}
          </section>
        )}

        <Head icon="list">{t('How to do it')}</Head>
        {steps.length === 0 ? <div className="small t2">{t('No instructions yet.')}</div> : (
          <ol className="exd-steps">
            {steps.map((st, i) => <li key={i}><span className="exd-n num">{i + 1}</span><span>{st}</span></li>)}
          </ol>
        )}

        {series.length >= 2 && (
          <>
            <Head icon="progress">{t('Progress')}</Head>
            <div className="plinth exd-chart">
              <div className="small" style={{ fontWeight: 600 }}>{trend}</div>
              <LineChart points={series} height={150} fmtY={(v) => fmtNum(v, lang, 0)} seriesLabel={t('Estimated 1RM')} />
            </div>
          </>
        )}
        {history.length > 0 && (
          <>
            <Head icon="clock">{t('Recent sessions')}</Head>
            <div className="list">
              {history.slice(-3).reverse().map((h) => {
                const sets = h.exercises.filter((e) => e.exerciseId === props.id).flatMap((e) => e.sets).filter((x) => x.done);
                return <button key={h.id} className="li press" style={{ alignItems: 'flex-start' }} onClick={() => push('sessionDetail', { id: h.id })}><div className="grow" style={{ textAlign: 'left' }}><div className="li-title small">{fmtDate(h.date, lang, { weekday: 'short', day: 'numeric', month: 'short' })}</div><div className="li-sub num">{sets.map((x) => `${x.type === 'warmup' ? 'W ' : ''}${fmtSet(x, ex, u, lang, t)}`).join(' · ')}</div></div><Icon name="chevR" size={16} /></button>;
              })}
            </div>
          </>
        )}
        {subs.length > 0 && (
          <>
            <Head icon="swap">{t('Swap for')}</Head>
            <div className="list">{subs.map((e) => <button key={e.id} className="li press" onClick={() => push('exercise', { id: e.id })}><div className="grow" style={{ textAlign: 'left' }}><div className="li-title small">{exName(e, lang)}</div><div className="li-sub">{e.equipment.map((q) => t(EQUIP_LABEL[q])).join(', ')}</div></div><Icon name="chevR" size={16} /></button>)}</div>
          </>
        )}
        {ex.logType === 'weightReps' && <><Head icon="settings">{t('Settings')}</Head><WeightJump ex={ex} /></>}
      </div>
    </Sheet>
  );
}

/** A section title: a small icon and an all-caps label. */
function Head({ icon, accent, children }: { icon: IconName; accent?: boolean; children: React.ReactNode }) {
  return <div className={`micro exd-head${accent ? ' accent' : ''}`}><Icon name={icon} size={14} sw={2.2} />{children}</div>;
}

/** How much weight progression adds for this exercise (saved per exercise; matching the default clears it). */
function WeightJump({ ex }: { ex: Exercise }) {
  const t = useT();
  const s = useStore();
  const u = s.settings.units.weight;
  const def = incrementFor(ex, {}, s.settings.plateStep);
  const kg = incrementFor(ex, s.increments, s.settings.plateStep);
  const step = 0.5;
  const shown = Math.round(kgToDisplay(kg, u) / step) * step;
  return (
    <div className="row-flex between" style={{ gap: 12 }}>
      <div style={{ minWidth: 0 }}><div style={{ fontWeight: 600 }}>{t('Weight jump')}</div><div className="xs t3" style={{ marginTop: 2 }}>{t('Added when set 1 reaches the top of the rep range')}</div></div>
      <Stepper value={shown} step={step} min={step} max={u === 'lb' ? 50 : 25} unit={u}
        onChange={(v) => { const next = displayToKg(v, u); s.setIncrement(ex.id, Math.abs(next - def) < 0.01 ? undefined : next); }} />
    </div>
  );
}
