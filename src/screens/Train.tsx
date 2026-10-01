import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { useStore, exerciseMap, allExercises, plannedFor, missedWorkouts } from '../state/store';
import { useUI, buzz } from '../state/ui';
import { useT, useLang } from '../lib/i18n';
import { addDays, fmtDate, fmtDuration, fmtWeekdayShort, startOfWeek, weekdayOf } from '../lib/dates';
import { useToday } from '../lib/derive';
import { Icon } from '../ui/Icon';
import { Empty, Seg } from '../ui/kit';
import { elapsedMs, sessionVolume } from '../lib/workout';
import { fmtNum, kgToDisplay } from '../lib/units';
import { exName, MUSCLE_LABEL } from './workout/common';
import { estMinutes } from './Today';
import { matchExercises } from '../lib/workoutText';
import { MUSCLES } from '../data/exercises';
import type { MuscleGroup, Routine } from '../lib/types';
import { SOFT } from '../ui/Sheet';

export function TrainScreen() {
  const t = useT();
  const tab = useUI((u) => u.trainTab);
  const setTab = useUI((u) => u.setTrainTab);
  return (
    <div className="screen">
      <header>
        <Seg value={tab} onChange={setTab} options={[{ value: 'plan', label: t('Plan') }, { value: 'library', label: t('Library') }, { value: 'history', label: t('History') }]} />
      </header>
      {tab === 'plan' && <PlanTab />}
      {tab === 'library' && <LibraryTab />}
      {tab === 'history' && <HistoryTab />}
    </div>
  );
}

function PlanTab() {
  const t = useT();
  const lang = useLang();
  const s = useStore();
  const push = useUI((u) => u.push);
  const toast = useUI((u) => u.toast);
  const today = useToday();
  const exMap = exerciseMap(s.exercises);
  const weekStart = startOfWeek(today, s.settings.weekStart);
  const missed = useMemo(() => missedWorkouts(s, today), [s.schedule, s.routines, s.sessions, today]);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(weekStart, i);
    return { d, p: plannedFor(s, d, today), done: s.sessions.some((x) => x.date === d) };
  });
  const start = (r: Routine) => {
    if (s.active) { push('workout', { origin: 'pill' }); return; }
    buzz(12);
    s.startWorkout({ routine: r, plannedDate: plannedFor(s, today, today)?.routineId === r.id ? today : undefined });
    push('workout', { origin: 'none' });
  };
  const dup = (r: Routine) => { const id = crypto.randomUUID(); s.upsertRoutine({ ...r, id, name: `${r.name} ${t('copy')}`, items: r.items.map((i) => ({ ...i, id: crypto.randomUUID() })), createdAt: Date.now(), updatedAt: Date.now() }); toast(t('Duplicated'), { tone: 'ok' }); };
  return (
    <>
      <section>
        <div className="plinth" style={{ padding: 10, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {days.map(({ d, p, done }) => {
            const r = p ? s.routines.find((x) => x.id === p.routineId) : undefined;
            const isToday = d === today;
            return (
              <button key={d} className="press" onClick={() => push('schedule', { focusDate: d })} aria-label={`${fmtDate(d, lang)}${r ? `: ${r.name}` : ''}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '8px 0', borderRadius: 14, background: isToday ? 'var(--ac-soft)' : 'transparent' }}>
                <span className="micro" style={{ color: isToday ? 'var(--ac-text)' : undefined }}>{fmtWeekdayShort(weekdayOf(d), lang, true)}</span>
                <span className="num" style={{ fontWeight: 650, fontSize: 15 }}>{Number(d.slice(8))}</span>
                <span style={{ width: 26, height: 26, borderRadius: 9, display: 'grid', placeItems: 'center', background: done ? 'var(--ac)' : r ? 'var(--s3)' : 'transparent', color: done ? 'var(--ac-ink)' : 'var(--tx2)', fontSize: 11, fontWeight: 700, boxShadow: !done && !r ? 'inset 0 0 0 1px var(--line)' : undefined }}>{done ? <Icon name="check" size={14} sw={3} /> : r ? r.name.slice(0, 1).toUpperCase() : ''}</span>
              </button>
            );
          })}
        </div>
      </section>

      {missed.length > 0 && (
        <section className="plinth-2" style={{ padding: 14 }}>
          {missed.map((m) => { const r = s.routines.find((x) => x.id === m.routineId); return (
            <div key={m.date} className="row-flex between" style={{ padding: '6px 0' }}>
              <div className="small"><b>{r?.name}</b> · <span className="t2">{fmtDate(m.date, lang, { weekday: 'long', day: 'numeric', month: 'short' })}</span></div>
              <button className="chip sm acc press" onClick={() => push('rescheduleSheet', { date: m.date, routineId: m.routineId })}>{t('Reschedule')}</button>
            </div>); })}
        </section>
      )}

      <section>
        <div className="row-flex" style={{ gap: 10, justifyContent: 'flex-end', marginBottom: 14 }}>
          <button className="icon-btn press" aria-label={t('Schedule')} onClick={() => push('schedule')}><Icon name="calendar" /></button>
          <button className="icon-btn press" aria-label={t('New')} onClick={() => push('routine', {})}><Icon name="plus" /></button>
        </div>
        {s.routines.length === 0 ? (
          <Empty icon="dumbbell" title={t('No routines yet')} action={<div className="row-flex" style={{ gap: 8, justifyContent: 'center' }}><button className="btn primary press" onClick={() => push('routine', {})}>{t('Build a routine')}</button><button className="btn press" onClick={() => push('onboarding', { starterOnly: true })}>{t('Starter plan')}</button></div>} />
        ) : (
          <div className="stack gap12">
            {s.routines.map((r) => {
              const muscles = [...new Set(r.items.map((i) => exMap.get(i.exerciseId)?.muscles[0]).filter(Boolean))] as MuscleGroup[];
              const last = [...s.sessions].reverse().find((x) => x.routineId === r.id);
              return (
                <div key={r.id} className="plinth" style={{ padding: 16, borderRadius: 'var(--r-lg)' }}>
                  <div className="row-flex between" style={{ alignItems: 'flex-start' }}>
                    <button className="grow press" style={{ textAlign: 'left' }} onClick={() => push('routine', { id: r.id })}>
                      <div className="display" style={{ fontSize: 44, fontStyle: 'italic', lineHeight: 0.95 }}>{r.name}</div>
                      <div className="small t2 num" style={{ marginTop: 6 }}>{r.items.length} · ~{estMinutes(r)} min{last ? ` · ${fmtDate(last.date, lang, { day: 'numeric', month: 'short' })}` : ''}</div>
                    </button>
                    <button className="icon-btn flat" aria-label={t('Duplicate')} onClick={() => dup(r)}><Icon name="copy" size={19} /></button>
                  </div>
                  <div className="row-flex between" style={{ marginTop: 14 }}>
                    <div className="chips" style={{ margin: 0, padding: 0, gap: 6, flexWrap: 'wrap', overflow: 'visible', minWidth: 0, flex: 1 }}>{muscles.slice(0, 3).map((m) => <span key={m} className="chip sm">{t(MUSCLE_LABEL[m])}</span>)}</div>
                    <div className="row-flex" style={{ gap: 8, flex: 'none' }}>
                      <button className="icon-btn press" aria-label={t('Schedule')} onClick={() => push('schedule', { routineId: r.id })}><Icon name="calendar" /></button>
                      <button className="icon-btn acc press" style={{ width: 54, height: 54 }} aria-label={s.active ? t('Resume current') : t('Start')} onClick={() => start(r)}><Icon name="play" size={22} /></button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
      <section className="row-flex" style={{ justifyContent: 'center' }}>
        <button className="btn press" onClick={() => push('activity', {})}><Icon name="run" size={18} /> {t('Log cardio or recovery')}</button>
      </section>
    </>
  );
}

function LibraryTab() {
  const t = useT();
  const lang = useLang();
  const s = useStore();
  const push = useUI((u) => u.push);
  const all = allExercises(s.exercises);
  const [q, setQ] = useState('');
  const [m, setM] = useState<MuscleGroup | null>(null);
  const list = useMemo(() => {
    let l = q.trim() ? matchExercises(q, all, lang, 80).map((x) => x.ex) : [...all].sort((a, b) => exName(a, lang).localeCompare(exName(b, lang), lang));
    if (m) l = l.filter((e) => e.muscles.includes(m));
    return l;
  }, [q, m, all, lang]);
  return (
    <>
      <div>
        <div style={{ position: 'relative' }}>
          <Icon name="search" size={18} style={{ position: 'absolute', left: 14, top: 15, color: 'var(--tx3)' }} />
          <input className="input" style={{ paddingLeft: 42 }} placeholder={t('Search exercises')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('Search exercises')} />
        </div>
        <div className="chips" style={{ marginTop: 12 }}>{MUSCLES.map((x) => <button key={x} className={`chip sm press ${m === x ? 'on' : ''}`} onClick={() => setM(m === x ? null : x)}>{t(MUSCLE_LABEL[x])}</button>)}</div>
      </div>
      <div className="list">
        {list.map((e) => (
          <button key={e.id} className="li press" onClick={() => push('exercise', { id: e.id })}>
            <div className="grow" style={{ textAlign: 'left', minWidth: 0 }}><div className="li-title trunc">{exName(e, lang)}{e.custom && <span className="chip sm acc" style={{ marginLeft: 8, height: 20 }}>{t('Custom')}</span>}</div><div className="li-sub trunc">{e.muscles.slice(0, 2).map((x) => t(MUSCLE_LABEL[x])).join(' · ')}</div></div><Icon name="chevR" size={16} style={{ color: 'var(--tx3)' }} />
          </button>
        ))}
      </div>
      {list.length === 0 && <Empty title={t('No exercise found')} action={<button className="btn primary press" onClick={() => push('exerciseEditor', { name: q })}>{t('Create exercise')}</button>} />}
      {list.length > 0 && <button className="btn block press" onClick={() => push('exerciseEditor', {})}><Icon name="plus" size={18} /> {t('Custom exercise')}</button>}
    </>
  );
}

function HistoryTab() {
  const t = useT();
  const lang = useLang();
  const s = useStore();
  const push = useUI((u) => u.push);
  const u = s.settings.units;
  type Row = { at: number; date: string; node: React.ReactNode };
  const rows: Row[] = [
    ...s.sessions.map((x) => ({ at: x.endedAt ?? x.startedAt, date: x.date, node: (
      <button key={x.id} className="li press" onClick={() => push('sessionDetail', { id: x.id })}>
        <span style={{ width: 40, height: 40, borderRadius: 13, background: 'var(--s2)', display: 'grid', placeItems: 'center', flex: 'none', boxShadow: 'inset 0 0 0 1px var(--line)' }}><Icon name="dumbbell" size={19} /></span>
        <div className="grow" style={{ textAlign: 'left', minWidth: 0 }}><div className="li-title trunc">{x.name || t('Workout')}{x.records && x.records.length > 0 && <span className="chip sm acc" style={{ marginLeft: 8, height: 20 }}>{x.records.length} PR</span>}</div><div className="li-sub num">{fmtDate(x.date, lang, { weekday: 'short', day: 'numeric', month: 'short' })} · {fmtDuration(elapsedMs(x) / 1000)} · {fmtNum(Math.round(kgToDisplay(sessionVolume(x.exercises), u.weight)), lang, 0)} {u.weight}</div></div><Icon name="chevR" size={16} style={{ color: 'var(--tx3)' }} />
      </button>) })),
    ...s.activities.map((x) => ({ at: x.at, date: x.date, node: (
      <div key={x.id} className="li">
        <span style={{ width: 40, height: 40, borderRadius: 13, background: 'var(--s2)', display: 'grid', placeItems: 'center', flex: 'none', boxShadow: 'inset 0 0 0 1px var(--line)' }}><Icon name="run" size={19} /></span>
        <div className="grow"><div className="li-title">{t(({ run: 'Run', walk: 'Walk', cycle: 'Cycle', swim: 'Swim', row: 'Row', hike: 'Hike', mobility: 'Mobility', warmup: 'Warm-up', recovery: 'Recovery', other: 'Activity' } as any)[x.kind])}</div><div className="li-sub num">{fmtDate(x.date, lang, { weekday: 'short', day: 'numeric', month: 'short' })} · {Math.round(x.durationSec / 60)} min{x.distanceM ? ` · ${fmtNum(u.distance === 'mi' ? x.distanceM / 1609.344 : x.distanceM / 1000, lang, 2)} ${u.distance}` : ''}{x.note ? ` · ${x.note}` : ''}</div></div>
        <button className="icon-btn flat sm" aria-label={t('Delete')} onClick={() => { const a = s.removeActivity(x.id); if (a) useUI.getState().toast(t('Deleted'), { actionLabel: t('Undo'), onAction: () => s.restoreActivity(a) }); }}><Icon name="trash" size={16} /></button>
      </div>) })),
  ].sort((a, b) => b.at - a.at);
  return (
    <>
      <div className="row-flex" style={{ gap: 8 }}>
        <button className="btn sm press" onClick={() => push('activity', {})}><Icon name="plus" size={16} /> {t('Log cardio / recovery')}</button>
      </div>
      {rows.length === 0 ? <Empty icon="clock" title={t('No history yet')} /> : (
        <motion.div layout transition={SOFT} className="list">{rows.map((r) => r.node)}</motion.div>
      )}
    </>
  );
}
