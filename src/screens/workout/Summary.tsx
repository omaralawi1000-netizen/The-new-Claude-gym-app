import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { odoCols, plan, play } from './finishMoment';
import { saveWorkoutAsRoutine } from './actions';

const REC_LABEL: Record<RecordKind, string> = { weight: 'Heaviest set', e1rm: 'Estimated 1RM', volume: 'Best set volume', reps: 'Most reps', duration: 'Longest hold', distance: 'Longest distance' };

function Stat({ label, text, unit }: { label: string; text: string; unit?: string }) {
  return <div className="sum-stat" data-fm="tile"><div className="micro">{label}</div><div className="display display-md num" style={{ marginTop: 4 }}><Odo text={text} /><span className="t3 small" style={{ fontFamily: 'var(--f-ui)', fontStretch: '100%', fontWeight: 600 }}> {unit}</span></div></div>;
}

/** A number drawn as an odometer: each digit a column that rolls up to land on itself (finishMoment.ts plays it). At rest,
 * and with reduced motion, it simply shows the number. */
function Odo({ text }: { text: string }) {
  return (
    <span className="odo" aria-label={text} role="text">
      {odoCols(text).map((c, i) => c.travel > 0
        ? <span key={i} className="odo-c" aria-hidden><span className="odo-s" data-travel={c.travel} style={{ transform: `translate3d(0, ${-c.travel * 1.15}em, 0)` }}>{Array.from({ length: c.travel + 1 }, (_, k) => <span key={k}>{k % 10}</span>)}</span></span>
        : <span key={i} className="odo-k" aria-hidden>{c.ch}</span>)}
    </span>
  );
}

const celebrated = new Set<string>(); // a session's moment is felt once, not again when its summary is reopened
const reduced = () => document.documentElement.dataset.motion === 'reduce' || (document.documentElement.dataset.motion !== 'full' && matchMedia('(prefers-reduced-motion: reduce)').matches);

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
  const texts = ses ? [fmtDuration(elapsedMs(ses) / 1000), fmtNum(Math.round(kgToDisplay(sessionVolume(ses.exercises), u.weight)), lang, 0), String(sessionSetCount(ses.exercises)), String(ses.exercises.length)] : [];
  const fm = useMemo(() => plan(texts), [texts.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  // The choreography and its haptics start together the moment the sheet's contents are attached (they arrive a beat after
  // the sheet starts rising, see Sheet's "late"), before that frame is painted, so nothing is ever seen in its resting
  // place first. Felt as the medal lands, then as each number settles; felt once per session.
  const stop = useRef<(() => void) | null>(null);
  const body = useCallback((el: HTMLDivElement | null) => {
    if (!el || stop.current || !ses) return;
    const big: 'record' | 'finish' = recs.length ? 'record' : 'finish';
    const feel = !celebrated.has(ses.id); celebrated.add(ses.id);
    if (reduced()) { if (feel) haptic(big); stop.current = () => {}; return; }
    const anim = play(el, fm);
    const ids = feel ? [setTimeout(() => haptic(big), fm.medalLand * 1000), ...fm.settles.map((t) => setTimeout(() => haptic('tick'), t * 1000))] : [];
    stop.current = () => { anim(); ids.forEach(clearTimeout); };
  }, [ses?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => stop.current?.(), []);
  if (!ses) return null;
  const hEx = headline?.exerciseId ? exMap.get(headline.exerciseId) : undefined;
  const line = headline ? t(headline.key, { ...headline.vars, exercise: hEx ? exName(hEx, lang) : '' }) : '';
  const saveRoutine = () => {
    const r = saveWorkoutAsRoutine(ses, { name: ses.name || t('Workout') });
    haptic('saved'); toast(t('Saved as routine'), { tone: 'ok', actionLabel: t('Undo'), onAction: r.undo });
  };
  return (
    <Sheet onClose={closeAll} tall label={t('Workout summary')} z={60} foot={<div className="row-flex" style={{ gap: 10 }}><button className="btn grow press" onClick={() => push('sessionDetail', { id: ses.id })}>{t('Details')}</button><button className="btn primary grow press" onClick={() => { haptic('light'); backupAfterWorkout(); closeAll(); }}>{t('Done')}</button></div>}>
      <SheetHead title={t('Nice work')} sub={`${ses.name || t('Workout')} · ${fmtDate(ses.date, lang)}`} onClose={closeAll} />
      <div className="sheet-body" ref={body}>
        {/* the medal turns in like a coin as the sheet rises; gold with the count when records fell (finishMoment.ts) */}
        <div className={`sum-medal${recs.length ? ' gold' : ''}`} aria-label={recs.length ? t(recs.length === 1 ? '1 new record' : '{n} new records', { n: recs.length }) : undefined}>
          {recs.length > 0 && Array.from({ length: 12 }, (_, i) => <i key={i} aria-hidden className="sum-ray" data-fm="ray" style={{ rotate: `${i * 30}deg` }} />)}
          <span className="sum-halo" data-fm="halo" aria-hidden />
          <span className="sum-halo" data-fm="settle" aria-hidden />
          <span className="sum-disc" data-fm="disc">
            <span className="sum-face">{recs.length ? <span className="display num">{recs.length}</span> : <Icon name="check" size={38} />}</span>
            <span className="sum-sheen" data-fm="sheen" aria-hidden />
          </span>
        </div>
        {recs.length > 0 && <div className="micro" data-fm="label" style={{ margin: '-6px 0 16px', textAlign: 'center', color: 'var(--gold)' }}>{recs.length === 1 ? t('New personal record') : t('New personal records')}</div>}
        <div className="plinth dots" data-fm="card" style={{ padding: 18, borderRadius: 'var(--r-lg)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          <Stat label={t('Time')} text={texts[0]} />
          <Stat label={t('Volume')} text={texts[1]} unit={u.weight} />
          <Stat label={t('Sets')} text={texts[2]} />
          <Stat label={t('Exercises')} text={texts[3]} />
        </div>
        {line && <p className="sum-line display">{line.split(' ').map((w, i) => <Fragment key={i}><span data-fm="word" className="sum-word">{w}</span>{' '}</Fragment>)}</p>}

        {recs.length === 0 ? null : (
          <div className="stack gap8" style={{ marginTop: 22 }}>
            {recs.map((r, i) => {
              const ex = exMap.get(r.exerciseId);
              const vset = r.kind === 'volume' ? ses.exercises.flatMap((e) => e.sets).find((q) => q.id === r.setId && q.reps) : undefined;
              const fv = (v: number) => vset && v === r.value ? `${fmtNum(kgToDisplay(vset.weightKg ?? 0, u.weight), lang, 2)} ${u.weight} × ${vset.reps}` : r.kind === 'reps' ? String(v) : r.kind === 'duration' ? `${v}s` : r.kind === 'distance' ? `${fmtNum(v / 1000, lang, 2)} km` : `${fmtNum(kgToDisplay(v, u.weight), lang, r.kind === 'e1rm' ? 1 : 2)} ${u.weight}`;
              return (
                <div key={i} data-fm="after" className="plinth" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ width: 34, height: 34, borderRadius: 12, background: 'var(--gold)', color: '#3a2a05', display: 'grid', placeItems: 'center' }}><Icon name="bolt" size={18} /></span>
                  <div className="grow"><div className="li-title small">{ex ? exName(ex, lang) : ''}</div><div className="xs t2">{t(REC_LABEL[r.kind])}{r.kind === 'e1rm' ? ` · ${t('estimate')}` : ''}</div></div>
                  <div style={{ textAlign: 'right' }} className="num"><div style={{ fontWeight: 700 }}>{fv(r.value)}</div><div className="xs t3">{vset ? `${fmtNum(kgToDisplay(r.value, u.weight), lang, 0)} ${u.weight} · ${t('was')} ${fmtNum(kgToDisplay(r.previous!, u.weight), lang, 0)}` : `${t('was')} ${fv(r.previous!)}`}</div></div>
                </div>
              );
            })}
          </div>
        )}

        {/* the rest of the screen rises gently with the sheet, under the moment, never pulling the eye from it */}
        <div data-fm="rest">
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
