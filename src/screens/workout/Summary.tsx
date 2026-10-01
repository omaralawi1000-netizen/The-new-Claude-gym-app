import { useMemo } from 'react';
import { motion } from 'motion/react';
import { useStore, exerciseMap } from '../../state/store';
import { useUI, buzz } from '../../state/ui';
import { useT, useLang } from '../../lib/i18n';
import { Icon } from '../../ui/Icon';
import { Count, NumInput } from '../../ui/kit';
import { Sheet, SheetHead, SOFT } from '../../ui/Sheet';
import { elapsedMs, sessionSetCount, sessionVolume, countable } from '../../lib/workout';
import { fmtDate, fmtDuration } from '../../lib/dates';
import { displayToKg, fmtNum, kgToDisplay } from '../../lib/units';
import type { RecordKind, WorkoutSession } from '../../lib/types';
import { exName, fmtSet } from './common';
import { uid } from '../../lib/nutrition';

const REC_LABEL: Record<RecordKind, string> = { weight: 'Heaviest set', e1rm: 'Estimated 1RM', volume: 'Best set volume', reps: 'Most reps', duration: 'Longest hold', distance: 'Longest distance' };

function Stat({ label, value, unit }: { label: string; value: React.ReactNode; unit?: string }) {
  return <div><div className="micro">{label}</div><div className="display display-md num" style={{ marginTop: 4 }}>{value}<span className="t3 small" style={{ fontFamily: 'var(--f-ui)', fontStretch: '100%', fontWeight: 600 }}> {unit}</span></div></div>;
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
  if (!ses) return null;
  const saveRoutine = () => {
    const id = uid('rt');
    s.upsertRoutine({ id, name: ses.name || t('Workout'), createdAt: Date.now(), updatedAt: Date.now(), items: ses.exercises.map((e) => { const w = e.sets.filter(countable); return { id: uid('ri'), exerciseId: e.exerciseId, warmupSets: e.sets.filter((x) => x.type === 'warmup').length, workingSets: Math.max(1, w.length), repMin: Math.max(1, Math.min(...w.map((x) => x.reps ?? 8), 8)), repMax: Math.max(...w.map((x) => x.reps ?? 10), 10), restSec: e.restSec ?? s.settings.restDefaultSec, supersetGroup: e.supersetGroup }; }) });
    toast(t('Saved as routine'), { tone: 'ok' });
  };
  return (
    <Sheet onClose={closeAll} tall label={t('Workout summary')} z={60} foot={<div className="row-flex" style={{ gap: 10 }}><button className="btn grow press" onClick={() => push('sessionDetail', { id: ses.id })}>{t('Details')}</button><button className="btn primary grow press" onClick={() => { buzz(8); closeAll(); }}>{t('Done')}</button></div>}>
      <SheetHead title={t('Nice work')} sub={`${ses.name || t('Workout')} · ${fmtDate(ses.date, lang)}`} onClose={closeAll} />
      <div className="sheet-body">
        <div className="plinth dots" style={{ padding: 18, borderRadius: 'var(--r-lg)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          <Stat label={t('Time')} value={fmtDuration(elapsedMs(ses) / 1000)} />
          <Stat label={t('Volume')} value={<Count value={kgToDisplay(sessionVolume(ses.exercises), u.weight)} format={(n) => fmtNum(Math.round(n), lang, 0)} />} unit={u.weight} />
          <Stat label={t('Sets')} value={sessionSetCount(ses.exercises)} />
          <Stat label={t('Exercises')} value={ses.exercises.length} />
        </div>

        <div className="micro" style={{ margin: '24px 0 8px' }}>{t('Personal records')}</div>
        {recs.length === 0 ? null : (
          <div className="stack gap8">
            {recs.map((r, i) => {
              const ex = exMap.get(r.exerciseId);
              const fv = (v: number) => r.kind === 'reps' ? String(v) : r.kind === 'duration' ? `${v}s` : r.kind === 'distance' ? `${fmtNum(v / 1000, lang, 2)} km` : `${fmtNum(kgToDisplay(v, u.weight), lang, r.kind === 'e1rm' ? 1 : 2)} ${u.weight}`;
              return (
                <motion.div key={i} initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ ...SOFT, delay: 0.15 + i * 0.07 }} className="plinth" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ width: 34, height: 34, borderRadius: 12, background: 'var(--ac)', color: 'var(--ac-ink)', display: 'grid', placeItems: 'center' }}><Icon name="bolt" size={18} /></span>
                  <div className="grow"><div className="li-title small">{ex ? exName(ex, lang) : ''}</div><div className="xs t2">{t(REC_LABEL[r.kind])}{r.kind === 'e1rm' ? ` · ${t('estimate')}` : ''}</div></div>
                  <div style={{ textAlign: 'right' }} className="num"><div style={{ fontWeight: 700 }}>{fv(r.value)}</div><div className="xs t3">{t('was')} {fv(r.previous!)}</div></div>
                </motion.div>
              );
            })}
          </div>
        )}

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
  const repeat = () => {
    if (s.active) { toast(t('Finish your current workout first'), { tone: 'bad' }); return; }
    const r = s.startWorkout({ fromSession: ses });
    if (r) { useUI.getState().closeAll(); setTimeout(() => push('workout', { origin: 'none' }), 50); }
  };
  return (
    <Sheet onClose={pop} tall label={ses.name} z={100}>
      <SheetHead title={ses.name || t('Workout')} sub={`${fmtDate(ses.date, lang, { weekday: 'long', day: 'numeric', month: 'long' })} · ${fmtDuration(elapsedMs(ses) / 1000)}`} onClose={pop} />
      <div className="sheet-body">
        <div className="row-flex" style={{ gap: 8, marginBottom: 16 }}>
          <button className="btn sm press" onClick={repeat}><Icon name="repeat" size={16} /> {t('Repeat')}</button>
          <button className="btn sm danger press" onClick={delSession}><Icon name="trash" size={16} /> {t('Delete')}</button>
        </div>
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
                      <button className="icon-btn flat sm" aria-label={t('Delete set')} onClick={() => delSet(e.id, x.id)}><Icon name="trash" size={16} /></button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        <div className="field" style={{ marginTop: 10 }}><label htmlFor="sd-note">{t('Session note')}</label><textarea id="sd-note" className="input" defaultValue={ses.note ?? ''} onBlur={(e) => s.mutateSession(ses.id, (x) => ({ ...x, note: e.target.value.trim() || undefined }))} /></div>
        <div className="xs t3" style={{ marginTop: 10 }}>{t('Edits change this record only. Personal-record flags are not recalculated.')}</div>
      </div>
    </Sheet>
  );
}
