import { useMemo } from 'react';
import { exerciseMap, plannedFor } from '../state/store';
import { useUI, buzz } from '../state/ui';
import { useT, useLang } from '../lib/i18n';
import { addDays, diffDays, fmtDate, startOfWeek } from '../lib/dates';
import { MUSCLES, setsPerMuscle } from '../lib/stats';
import { historyOf, incrementFor, suggestProgression } from '../lib/workout';
import { fmtNum, kgToDisplay } from '../lib/units';
import { Icon } from '../ui/Icon';
import type { AppData, MuscleGroup, PersonalRecord, RecordKind, Routine } from '../lib/types';
import { exName, MUSCLE_LABEL } from './workout/common';

/** The cards Today can show below the workout, in the order you set in Settings → Today. */
export type TodayCard = 'targets' | 'week' | 'muscles' | 'records' | 'weight';
export const TODAY_CARDS: TodayCard[] = ['targets', 'week', 'muscles', 'records', 'weight'];
/** Your order, with any card it doesn't know yet (added in a later version) at the end. */
export function cardOrder(saved: string[] | undefined): TodayCard[] {
  const known = (saved ?? []).filter((k): k is TodayCard => (TODAY_CARDS as string[]).includes(k));
  return [...new Set([...known, ...TODAY_CARDS])];
}

/**
 * The next workout on the plan, today's if it isn't done yet: when, what, and the first lifts with the weight × reps to
 * aim for (the same progression the workout fills in when it starts). So you know what to beat before you get there.
 */
export function nextPlanned(d: AppData, today: string): { date: string; routine: Routine } | null {
  for (let i = 0; i < 14; i++) {
    const date = addDays(today, i);
    const p = plannedFor(d, date, today);
    if (!p) continue;
    const routine = d.routines.find((r) => r.id === p.routineId);
    if (!routine?.items.length) continue;
    if (i === 0 && (d.active || d.sessions.some((x) => x.date === today && (x.routineId === routine.id || x.plannedDate === today)))) continue;
    return { date, routine };
  }
  return null;
}

export function NextTargets({ d, today }: { d: AppData; today: string }) {
  const t = useT();
  const lang = useLang();
  const setTab = useUI((u) => u.setTab);
  const next = useMemo(() => nextPlanned(d, today), [d.schedule, d.routines, d.sessions, d.active, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const u = d.settings.units.weight;
  const rows = useMemo(() => {
    if (!next) return [];
    const map = exerciseMap(d.exercises);
    return next.routine.items.map((item) => {
      const ex = map.get(item.exerciseId);
      if (!ex) return null;
      if (ex.logType !== 'weightReps') return { id: item.id, name: exName(ex, lang), main: `${item.workingSets} × ${item.repMin}–${item.repMax}`, up: null as string | null, first: false };
      const inc = incrementFor(ex, d.increments, d.settings.plateStep);
      const sug = suggestProgression(ex, historyOf(ex.id, d.sessions), { min: item.repMin, max: item.repMax }, inc);
      const s1 = sug.sets?.[0];
      if (sug.kind === 'first' || !s1 || s1.weightKg === undefined) return { id: item.id, name: exName(ex, lang), main: `${item.workingSets} × ${item.repMin}–${item.repMax}`, up: null, first: true };
      return {
        id: item.id, name: exName(ex, lang), first: false,
        main: `${fmtNum(kgToDisplay(s1.weightKg, u), lang, 2)} ${u} × ${s1.reps}`,
        up: sug.kind === 'add-weight' ? `+${fmtNum(kgToDisplay(inc, u), lang, 2)} ${u}` : sug.kind === 'add-reps' ? t('+1 rep') : null,
      };
    }).filter((r): r is NonNullable<typeof r> => !!r);
  }, [next, d.exercises, d.sessions, d.increments, d.settings.plateStep, u, lang, t]);
  if (!next || !rows.length) return null;
  const n = diffDays(today, next.date);
  const when = n === 0 ? t('Today') : n === 1 ? t('Tomorrow') : fmtDate(next.date, lang, { weekday: 'long' });
  const shown = rows.slice(0, 4);
  return (
    <section className="plinth tc-card press" onClick={() => setTab('train')} role="button" aria-label={t('Targets for {name}', { name: next.routine.name })}>
      <div className="row-flex between">
        <div className="micro">{t('Up next')} · {when}</div>
        <div className="small t2 trunc" style={{ maxWidth: '55%' }}>{next.routine.name}</div>
      </div>
      <div className="tc-rows">
        {shown.map((r) => (
          <div key={r.id} className="tc-row">
            <span className="trunc">{r.name}</span>
            <span className="num tc-val">{r.up && <span className="tc-up">{r.up}</span>}<span className={r.first ? 't3' : undefined}>{r.main}</span></span>
          </div>
        ))}
      </div>
      {rows.length > shown.length && <div className="xs t3" style={{ marginTop: 6 }}>{t('+{n} more', { n: rows.length - shown.length })}</div>}
    </section>
  );
}

/**
 * Hard sets per muscle so far this week (main muscle 1, helpers ½ — the same count the Coach uses), against the usual
 * guideline of about 10 sets a week to grow: a bar for each muscle trained (lit once it reaches 10), and one quiet line
 * naming the ones not trained yet. Nothing is guessed.
 */
const TARGET = 10, FULL = 20;
const SHOWN: MuscleGroup[] = MUSCLES.filter((m) => m !== 'forearms');
export function MusclesWeek({ d, today }: { d: AppData; today: string }) {
  const t = useT();
  const lang = useLang();
  const setTab = useUI((u) => u.setTab);
  const from = startOfWeek(today, d.settings.weekStart);
  const sets = useMemo(() => {
    const map = exerciseMap(d.exercises);
    return setsPerMuscle(d.sessions, (id) => map.get(id)?.muscles, from, today);
  }, [d.sessions, d.exercises, from, today]);
  if (!d.sessions.some((x) => x.status === 'done')) return null;
  const hit = SHOWN.filter((m) => sets[m] > 0).sort((x, y) => sets[y] - sets[x]);
  const not = SHOWN.filter((m) => sets[m] === 0);
  return (
    <section className="plinth tc-card press" onClick={() => setTab('progress')} role="button" aria-label={t('Muscles this week')}>
      <div className="row-flex between">
        <div className="micro">{t('Muscles this week')}</div>
        <div className="xs t3">{t('sets · aim {n}+', { n: TARGET })}</div>
      </div>
      {hit.length > 0 ? (
        <div className="tc-muscles">
          {hit.map((m) => {
            const v = sets[m];
            return (
              <div key={m} className={`tc-m${v >= TARGET ? ' hit' : ''}`}>
                <div className="row-flex between xs"><span className="trunc">{t(MUSCLE_LABEL[m])}</span><span className="num">{fmtNum(v, lang, v % 1 ? 1 : 0)}</span></div>
                <div className="tc-bar"><i style={{ transform: `scaleX(${Math.min(1, v / FULL)})` }} /><b style={{ left: `${(TARGET / FULL) * 100}%` }} /></div>
              </div>
            );
          })}
        </div>
      ) : <div className="small t2" style={{ marginTop: 8 }}>{t('Nothing trained yet this week.')}</div>}
      {hit.length > 0 && not.length > 0 && <div className="xs t3" style={{ marginTop: 10 }}>{t('Not yet: {list}', { list: not.map((m) => t(MUSCLE_LABEL[m])).join(' · ') })}</div>}
    </section>
  );
}

/** Your newest records (last 30 days), one per exercise: what, how much, how much better, and when. */
const KIND_ORDER: RecordKind[] = ['weight', 'reps', 'e1rm', 'volume', 'duration', 'distance'];
export function RecentRecords({ d, today }: { d: AppData; today: string }) {
  const t = useT();
  const lang = useLang();
  const push = useUI((u) => u.push);
  const u = d.settings.units.weight;
  const list = useMemo(() => {
    const from = addDays(today, -30);
    const out: { r: PersonalRecord; sessionId: string }[] = [];
    const seen = new Set<string>();
    const sessions = d.sessions.filter((x) => x.date >= from && x.records?.length).sort((a, b) => b.date.localeCompare(a.date) || b.startedAt - a.startedAt);
    for (const s of sessions) {
      const best = new Map<string, PersonalRecord>();
      for (const r of s.records!) {
        const cur = best.get(r.exerciseId);
        if (!cur || KIND_ORDER.indexOf(r.kind) < KIND_ORDER.indexOf(cur.kind)) best.set(r.exerciseId, r);
      }
      for (const r of best.values()) { if (seen.has(r.exerciseId)) continue; seen.add(r.exerciseId); out.push({ r, sessionId: s.id }); }
      if (out.length >= 3) break;
    }
    return out.slice(0, 3);
  }, [d.sessions, today]);
  if (!list.length) return null;
  const map = exerciseMap(d.exercises);
  // a best-set-volume record is shown as the set itself (80 kg × 8), not as a total that reads like a weight
  const setOf = (r: PersonalRecord, sid: string) => d.sessions.find((x) => x.id === sid)?.exercises.flatMap((e) => e.sets).find((x) => x.id === r.setId);
  const val = (r: PersonalRecord, v: number) => r.kind === 'reps' ? `${v} ${t('reps')}` : r.kind === 'duration' ? `${v} s` : r.kind === 'distance' ? `${fmtNum(v / 1000, lang, 2)} km` : `${fmtNum(kgToDisplay(v, u), lang, r.kind === 'e1rm' ? 1 : 2)} ${u}`;
  const ago = (date: string) => { const n = diffDays(date, today); return n === 0 ? t('Today') : n === 1 ? t('Yesterday') : n < 7 ? fmtDate(date, lang, { weekday: 'short' }) : fmtDate(date, lang, { day: 'numeric', month: 'short' }); };
  return (
    <section className="plinth tc-card" aria-label={t('Recent records')}>
      <div className="row-flex between"><div className="micro">{t('Recent records')}</div><Icon name="bolt" size={15} style={{ color: 'var(--gold)' }} /></div>
      <div className="tc-rows">
        {list.map(({ r, sessionId }) => {
          const ex = map.get(r.exerciseId);
          const date = d.sessions.find((x) => x.id === sessionId)?.date ?? today;
          const gain = r.previous !== undefined && r.kind !== 'volume' ? r.value - r.previous : null;
          const vs = r.kind === 'volume' ? setOf(r, sessionId) : undefined;
          return (
            <button key={r.exerciseId} className="tc-row press" onClick={() => { buzz(6); push('sessionDetail', { id: sessionId }); }}>
              <span className="trunc">{ex ? exName(ex, lang) : '?'} <span className="t3 xs">· {ago(date)}</span></span>
              <span className="num tc-val">{gain !== null && gain > 0 && <span className="tc-up gold">+{val(r, Math.round(gain * 100) / 100)}</span>}{vs ? `${fmtNum(kgToDisplay(vs.weightKg ?? 0, u), lang, 2)} ${u} × ${vs.reps}` : val(r, r.value)}{r.kind === 'e1rm' && <span className="xs t3" style={{ fontWeight: 500 }}>1RM</span>}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
