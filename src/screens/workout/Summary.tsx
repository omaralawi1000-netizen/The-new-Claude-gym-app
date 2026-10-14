import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useStore, exerciseMap } from '../../state/store';
import { useUI, haptic } from '../../state/ui';
import { useT, useLang } from '../../lib/i18n';
import { Icon } from '../../ui/Icon';
import { NumInput } from '../../ui/kit';
import { Sheet, SheetHead, SOFT } from '../../ui/Sheet';
import { elapsedMs, sessionSetCount, sessionVolume, sessionHeadline, countable } from '../../lib/workout';
import { fmtDate, fmtDuration, fmtDurationLong } from '../../lib/dates';
import { backupAfterWorkout } from '../../lib/drive';
import { displayToKg, fmtNum, kgToDisplay } from '../../lib/units';
import type { RecordKind, WorkoutSession } from '../../lib/types';
import { exName, fmtSet } from './common';
import { saveWorkoutAsRoutine } from './actions';

const REC_LABEL: Record<RecordKind, string> = { weight: 'Heaviest set', e1rm: 'Estimated 1RM', volume: 'Best set volume', reps: 'Most reps', duration: 'Longest hold', distance: 'Longest distance' };

function Stat({ label, value, unit, i }: { label: string; value: React.ReactNode; unit?: string; i: number }) {
  return <div className="sum-stat" style={{ animationDelay: `${FIRST + i * STEP}s` }}><div className="micro">{label}</div><div className="display display-md num" style={{ marginTop: 4 }}>{value}<span className="t3 small" style={{ fontFamily: 'var(--f-ui)', fontStretch: '100%', fontWeight: 600 }}> {unit}</span></div></div>;
}

// The finish moment, like an award, in one continuous movement from the tap: the medal and the numbers' card rise with the
// sheet itself (no empty beat, nothing popping in), the first number already counting while the sheet still rises; the
// numbers overlap as they arrive, and each one settles on its final value exactly SETTLE after it starts, STEP apart, which
// is when its tick is felt (so four distinct ticks, never one blur); then one line says what this session meant.
const MEDAL = 0, CARD = 0, STEP = 0.26, FIRST = 0.2, SETTLE = 0.6;
const LINE = FIRST + 3 * STEP + SETTLE + 0.15;
const celebrated = new Set<string>(); // a session's moment is felt once, not again when its summary is reopened
const reduced = () => document.documentElement.dataset.motion === 'reduce' || matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * A number that counts up from zero once, after `delay` seconds, and shows its final value exactly SETTLE later whatever its
 * size (a 1 and a 1,200 land on the same beat: the count runs longer the fewer steps it has). Writes its own text (no
 * re-render per frame).
 */
function CountUp({ to, delay, format }: { to: number; delay: number; format: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current; if (!el || reduced()) return;
    el.textContent = format(0);
    let raf = 0;
    const id = setTimeout(() => {
      const t0 = performance.now();
      // the eased count (1 − (1 − k)³) reads as final once within half a step of `to`
      const kFinal = to > 0.5 ? 1 - Math.cbrt(0.5 / to) : 1;
      const dur = Math.min(4, SETTLE / kFinal) * 1000;
      const step = (t: number) => {
        const k = Math.min(1, (t - t0) / dur);
        if (performance.now() - t0 >= SETTLE * 1000) { el.textContent = format(to); return; }
        el.textContent = format(to * (1 - Math.pow(1 - k, 3)));
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, delay * 1000);
    return () => { clearTimeout(id); cancelAnimationFrame(raf); el.textContent = format(to); };
  }, [to]); // eslint-disable-line react-hooks/exhaustive-deps
  return <span ref={ref}>{format(to)}</span>;
}

/** Shown right after finishing. Numbers come from the saved session — what you checked off, nothing assumed. */
export function Summary({ props }: { props: { sessionId: string } }) {
  const t = useT();
  const lang = useLang();
  const s = useStore();
  const closeAll = useUI((u) => u.closeAll);
  const push = useUI((u) => u.push);
  const toast = useUI((u) => u.toast);
  const ses = s.sessions.find((x) => x.id === props.sessionId);
  const exMap = exerciseMap(s.exercises);
  const u = s.settings.units;
  const routine = ses?.routineId ? s.routines.find((r) => r.id === ses.routineId) : undefined;
  const recs = ses?.records ?? [];
  const rows = useMemo(() => (ses ? ses.exercises.map((e) => ({ e, ex: exMap.get(e.exerciseId) })) : []), [ses, exMap]);
  const headline = useMemo(() => (ses ? sessionHeadline(ses, s.sessions, (kg) => `${fmtNum(Math.round(kgToDisplay(kg, u.weight)), lang, 0)} ${u.weight}`) : null), [ses?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!ses || celebrated.has(ses.id)) return;
    celebrated.add(ses.id);
    const big: 'record' | 'finish' = recs.length ? 'record' : 'finish';
    if (reduced()) { haptic(big); return; }
    const ids = [setTimeout(() => haptic(big), (MEDAL + 0.35) * 1000), ...[0, 1, 2, 3].map((i) => setTimeout(() => haptic('tick'), (FIRST + i * STEP + SETTLE) * 1000))];
    return () => { ids.forEach(clearTimeout); celebrated.delete(ses.id); };
  }, [ses?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!ses) return null;
  const hEx = headline?.exerciseId ? exMap.get(headline.exerciseId) : undefined;
  const line = headline ? t(headline.key, { ...headline.vars, exercise: hEx ? exName(hEx, lang) : '' }) : '';
  const at = (d: number) => FIRST + d * STEP;
  const saveRoutine = () => {
    const r = saveWorkoutAsRoutine(ses, { name: ses.name || t('Workout') });
    haptic('saved'); toast(t('Saved as routine'), { tone: 'ok', actionLabel: t('Undo'), onAction: r.undo });
  };
  return (
    <Sheet onClose={closeAll} tall label={t('Workout summary')} z={60} foot={<div className="row-flex" style={{ gap: 10 }}><button className="btn grow press" onClick={() => push('sessionDetail', { id: ses.id })}>{t('Details')}</button><button className="btn primary grow press" onClick={() => { haptic('light'); backupAfterWorkout(); closeAll(); }}>{t('Done')}</button></div>}>
      <SheetHead title={t('Nice work')} sub={`${ses.name || t('Workout')} · ${fmtDate(ses.date, lang)}`} onClose={closeAll} />
      <div className="sheet-body">
        {/* the medal: lands once, a ring of its light opens outward, a sheen crosses it; gold with the count when records fell */}
        <div className={`sum-medal${recs.length ? ' gold' : ''}`} style={{ ['--d' as string]: `${MEDAL}s` }} aria-label={recs.length ? t(recs.length === 1 ? '1 new record' : '{n} new records', { n: recs.length }) : undefined}>
          {recs.length > 0 && Array.from({ length: 12 }, (_, i) => <i key={i} aria-hidden className="sum-ray" style={{ rotate: `${i * 30}deg`, animationDelay: `${MEDAL + 0.3 + i * 0.03}s` }} />)}
          <span className="sum-halo" aria-hidden />
          <span className="sum-halo settle" aria-hidden style={{ animationDelay: `${LINE + 0.1}s` }} />
          <span className="sum-disc">
            {recs.length ? <span className="display num">{recs.length}</span> : <Icon name="check" size={38} />}
            <span className="sum-sheen" aria-hidden />
          </span>
        </div>
        {recs.length > 0 && <div className="micro sum-line-in" style={{ margin: '-6px 0 16px', textAlign: 'center', color: 'var(--gold)', ['--d' as string]: `${MEDAL + 0.5}s` }}>{recs.length === 1 ? t('New personal record') : t('New personal records')}</div>}
        <div className="plinth dots sum-card" style={{ animationDelay: `${CARD}s`, padding: 18, borderRadius: 'var(--r-lg)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          <Stat i={0} label={t('Time')} value={<CountUp to={elapsedMs(ses) / 1000} delay={at(0)} format={fmtDuration} />} />
          <Stat i={1} label={t('Volume')} value={<CountUp to={kgToDisplay(sessionVolume(ses.exercises), u.weight)} delay={at(1)} format={(n) => fmtNum(Math.round(n), lang, 0)} />} unit={u.weight} />
          <Stat i={2} label={t('Sets')} value={<CountUp to={sessionSetCount(ses.exercises)} delay={at(2)} format={(n) => String(Math.round(n))} />} />
          <Stat i={3} label={t('Exercises')} value={<CountUp to={ses.exercises.length} delay={at(3)} format={(n) => String(Math.round(n))} />} />
        </div>
        {line && <p className="sum-line display" style={{ ['--d' as string]: `${LINE}s` }}>{line}</p>}


        {recs.length === 0 ? null : (
          <div className="stack gap8" style={{ marginTop: 22 }}>
            {recs.map((r, i) => {
              const ex = exMap.get(r.exerciseId);
              const vset = r.kind === 'volume' ? ses.exercises.flatMap((e) => e.sets).find((q) => q.id === r.setId && q.reps) : undefined;
              const fv = (v: number) => vset && v === r.value ? `${fmtNum(kgToDisplay(vset.weightKg ?? 0, u.weight), lang, 2)} ${u.weight} × ${vset.reps}` : r.kind === 'reps' ? String(v) : r.kind === 'duration' ? `${v}s` : r.kind === 'distance' ? `${fmtNum(v / 1000, lang, 2)} km` : `${fmtNum(kgToDisplay(v, u.weight), lang, r.kind === 'e1rm' ? 1 : 2)} ${u.weight}`;
              return (
                <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SOFT, delay: LINE + 0.35 + i * 0.08 }} className="plinth" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ width: 34, height: 34, borderRadius: 12, background: 'var(--gold)', color: '#3a2a05', display: 'grid', placeItems: 'center' }}><Icon name="bolt" size={18} /></span>
                  <div className="grow"><div className="li-title small">{ex ? exName(ex, lang) : ''}</div><div className="xs t2">{t(REC_LABEL[r.kind])}{r.kind === 'e1rm' ? ` · ${t('estimate')}` : ''}</div></div>
                  <div style={{ textAlign: 'right' }} className="num"><div style={{ fontWeight: 700 }}>{fv(r.value)}</div><div className="xs t3">{vset ? `${fmtNum(kgToDisplay(r.value, u.weight), lang, 0)} ${u.weight} · ${t('was')} ${fmtNum(kgToDisplay(r.previous!, u.weight), lang, 0)}` : `${t('was')} ${fv(r.previous!)}`}</div></div>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* the rest of the screen rises gently with the sheet, under the moment, never pulling the eye from it */}
        <div className="sum-rest">
        <div className="micro" style={{ margin: '24px 0 8px' }}>{t('Planned vs done')}</div>
        <div className="list">
          {rows.map(({ e, ex }) => {
            const planned = routine?.items.find((i) => i.exerciseId === e.exerciseId);
            const done = e.sets.filter(countable);
            return (
              <div key={e.id} className="li" style={{ alignItems: 'flex-start' }}>
                <div className="grow"><div className="li-title small">{ex ? exName(ex, lang) : ''}</div>
                  <div className="li-sub num">{done.map((x) => fmtSet(x, ex, u, lang, t)).join(' · ') || '—'}</div>
                  {planned && <div className="xs t3 num">{t('Plan')}: {planned.workingSets} × {planned.repMin}–{planned.repMax}{done.length >= planned.workingSets ? ' ✓' : ` · ${planned.workingSets - done.length} ${t('short')}`}</div>}
                </div>
              </div>
            );
          })}
        </div>
        <div className="field" style={{ marginTop: 20 }}><label htmlFor="s-note">{t('Session note')}</label><textarea id="s-note" className="input" defaultValue={ses.note ?? ''} placeholder={t('How did it feel?')} onBlur={(e) => s.mutateSession(ses.id, (x) => ({ ...x, note: e.target.value.trim() || undefined }))} /></div>
        {!ses.routineId && <button className="btn block press" style={{ marginTop: 14 }} onClick={saveRoutine}><Icon name="copy" size={18} /> {t('Save as routine')}</button>}
        </div>
      </div>
    </Sheet>
  );
}

/** Saved session: every set stays editable; deletions are undoable. */
export function SessionDetail({ props }: { props: { id: string } }) {
  const t = useT();
  const lang = useLang();
  const s = useStore();
  const pop = useUI((u) => u.pop);
  const push = useUI((u) => u.push);
  const toast = useUI((u) => u.toast);
  const ses = s.sessions.find((x) => x.id === props.id);
  const exMap = exerciseMap(s.exercises);
  const u = s.settings.units;
  const [choosing, setChoosing] = useState(false);
  if (!ses) return null;
  const patch = (seId: string, setId: string, p: Partial<WorkoutSession['exercises'][number]['sets'][number]>) =>
    s.mutateSession(ses.id, (x) => ({ ...x, exercises: x.exercises.map((e) => (e.id === seId ? { ...e, sets: e.sets.map((q) => (q.id === setId ? { ...q, ...p } : q)) } : e)) }));
  const delSet = (seId: string, setId: string) => {
    const before = ses;
    s.mutateSession(ses.id, (x) => ({ ...x, exercises: x.exercises.map((e) => (e.id === seId ? { ...e, sets: e.sets.filter((q) => q.id !== setId) } : e)).filter((e) => e.sets.length > 0) }));
    toast(t('Set deleted'), { actionLabel: t('Undo'), onAction: () => s.mutateSession(ses.id, () => before) });
  };
  const delSession = () => {
    const x = s.deleteSession(ses.id);
    pop();
    if (x) toast(t('Workout deleted'), { actionLabel: t('Undo'), onAction: () => s.restoreSession(x) });
  };
  // save what you did as a routine for your plan: a new one, or (when it came from a routine) that routine's new version
  const source = ses.routineId ? s.routines.find((r) => r.id === ses.routineId) : undefined;
  const saveAs = (into?: string) => {
    setChoosing(false);
    const r = saveWorkoutAsRoutine(ses, { name: ses.name || t('Workout'), into });
    haptic('saved');
    toast(into ? t('Routine updated') : t('Saved as routine'), { tone: 'ok', actionLabel: t('Undo'), onAction: r.undo });
    push('routine', { id: r.id });
  };
  const repeat = () => {
    if (s.active) { toast(t('Finish your current workout first'), { tone: 'bad' }); return; }
    const r = s.startWorkout({ fromSession: ses });
    if (r) { useUI.getState().closeAll(); setTimeout(() => push('workout', { origin: 'none' }), 50); }
  };
  return (
    <Sheet onClose={pop} tall label={ses.name} z={100}>
      <SheetHead title={ses.name || t('Workout')} sub={`${fmtDate(ses.date, lang, { weekday: 'long', day: 'numeric', month: 'long' })} · ${fmtDurationLong(elapsedMs(ses) / 1000, lang)}`} onClose={pop} />
      <div className="sheet-body">
        <div className="row-flex" style={{ gap: 8, marginBottom: choosing ? 10 : 16 }}>
          <button className="btn sm press" onClick={repeat}><Icon name="repeat" size={16} /> {t('Repeat')}</button>
          <button className={`btn sm press ${choosing ? 'primary' : ''}`} aria-expanded={source ? choosing : undefined} onClick={() => (source ? setChoosing((v) => !v) : saveAs())}><Icon name="list" size={16} /> {t('Save as routine')}</button>
          <span className="grow" />
          <button className="icon-btn flat sm press" aria-label={t('Delete')} onClick={delSession} style={{ color: 'var(--bad)' }}><Icon name="trash" size={18} /></button>
        </div>
        <AnimatePresence initial={false}>
          {choosing && source && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={SOFT} style={{ overflow: 'hidden' }}>
              <div className="row-flex" style={{ gap: 8, paddingBottom: 16, flexWrap: 'wrap' }}>
                <button className="chip press" onClick={() => saveAs(source.id)}>{t('Update {routine}', { routine: source.name })}</button>
                <button className="chip press" onClick={() => saveAs()}>{t('Save as new')}</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {ses.records && ses.records.length > 0 && <div className="chip acc" style={{ marginBottom: 14 }}><Icon name="bolt" size={14} /> {ses.records.length} {ses.records.length === 1 ? t('record') : t('records')}</div>}
        {ses.exercises.map((e) => {
          const ex = exMap.get(e.exerciseId);
          let wi = 0;
          return (
            <div key={e.id} className="plinth" style={{ padding: 14, marginBottom: 12, borderRadius: 'var(--r-lg)' }}>
              <button className="display display-sm press" style={{ textAlign: 'left' }} onClick={() => ex && push('exercise', { id: ex.id })}>{ex ? exName(ex, lang) : ''}</button>
              {e.note && <div className="small t2" style={{ marginTop: 6 }}>{e.note}</div>}
              <div style={{ marginTop: 8 }}>
                {e.sets.map((x) => {
                  if (x.type === 'working') wi++;
                  const lt = ex?.logType ?? 'weightReps';
                  return (
                    <div key={x.id} className="row-flex" style={{ gap: 8, padding: '5px 0', borderTop: '1px solid var(--line)' }}>
                      <span style={{ width: 28, fontWeight: 700, color: x.type === 'warmup' ? 'var(--ac-text)' : 'var(--tx2)' }}>{x.type === 'warmup' ? 'W' : wi}</span>
                      {(lt === 'weightReps' || lt === 'bodyweightReps' || lt === 'assisted') ? <>
                        <div style={{ flex: 1 }}><NumInput value={x.weightKg === undefined ? undefined : Math.round(kgToDisplay(x.weightKg, u.weight) * 100) / 100} max={2} unit={u.weight} onChange={(v) => patch(e.id, x.id, { weightKg: v === undefined ? undefined : displayToKg(v, u.weight) })} label={t('Weight')} /></div>
                        <div style={{ flex: 1 }}><NumInput value={x.reps} max={0} unit={t('reps')} onChange={(v) => patch(e.id, x.id, { reps: v })} label={t('Reps')} /></div>
                      </> : <div className="grow num small">{fmtSet(x, ex, u, lang, t)}</div>}
                      <button className="icon-btn flat sm press" aria-label={t('Delete set')} onClick={() => delSet(e.id, x.id)}><Icon name="trash" size={16} /></button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        <div className="field" style={{ marginTop: 10 }}><label htmlFor="sd-note">{t('Session note')}</label><textarea id="sd-note" className="input" defaultValue={ses.note ?? ''} onBlur={(e) => s.mutateSession(ses.id, (x) => ({ ...x, note: e.target.value.trim() || undefined }))} /></div>
      </div>
    </Sheet>
  );
}
