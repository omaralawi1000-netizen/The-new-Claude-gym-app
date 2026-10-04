import { useState } from 'react';
import { useStore } from '../../state/store';
import { useUI, buzz } from '../../state/ui';
import { useT, useLang } from '../../lib/i18n';
import { Sheet, SheetHead } from '../../ui/Sheet';
import { Icon } from '../../ui/Icon';
import { NumInput, Seg, Stepper } from '../../ui/kit';
import { addDays, fmtDate, fmtWeekdayShort, relativeDay } from '../../lib/dates';
import { useToday } from '../../lib/derive';
import type { ActivityKind } from '../../lib/types';
import { displayToM } from '../../lib/units';
import { ACTIVITY_KINDS as KINDS, ACTIVITY_LABEL as KIND_LABEL, INTENSITY_LABEL } from '../../lib/activity';

export function Schedule({ props }: { props: { focusDate?: string; routineId?: string } }) {
  const t = useT();
  const lang = useLang();
  const s = useStore();
  const pop = useUI((u) => u.pop);
  const toast = useUI((u) => u.toast);
  const today = useToday();
  const sch = s.schedule;
  const routines = s.routines;
  const order = [...Array(7)].map((_, i) => (s.settings.weekStart + i) % 7);
  const setDay = (wd: number, id: string | null) => { buzz(6); s.setSchedule({ weekly: { ...sch.weekly, [wd]: id } }); };
  const fd = props.focusDate;
  const fdPlanned = fd ? (sch.overrides.find((o) => o.date === fd)?.routineId ?? (sch.cleared.includes(fd) ? null : sch.mode === 'weekly' ? sch.weekly[new Date(fd + 'T12:00:00').getDay()] : undefined)) : undefined;
  const setOne = (id: string | null) => {
    if (!fd) return;
    const overrides = sch.overrides.filter((o) => o.date !== fd);
    const cleared = sch.cleared.filter((d) => d !== fd);
    if (id) overrides.push({ date: fd, routineId: id }); else cleared.push(fd);
    s.setSchedule({ overrides, cleared });
    toast(t('Updated {day}', { day: fmtDate(fd, lang, { weekday: 'long' }) }), { tone: 'ok' });
  };
  return (
    <Sheet onClose={pop} tall label={t('Schedule')} z={100}>
      <SheetHead title={t('Schedule')} sub={props.routineId ? routines.find((r) => r.id === props.routineId)?.name : undefined} onClose={pop} />
      <div className="sheet-body">
        {fd && (
          <div className="plinth" style={{ padding: 14, marginBottom: 18 }}>
            <div className="micro">{t('Just this day')} · {relativeDay(fd, today, lang) ?? fmtDate(fd, lang, { weekday: 'long', day: 'numeric', month: 'short' })}</div>
            <div className="chips" style={{ marginTop: 10, margin: '10px -14px 0', padding: '0 14px' }}>
              <button className={`chip press ${fdPlanned === null ? 'on' : ''}`} onClick={() => setOne(null)}>{t('Rest')}</button>
              {routines.map((r) => <button key={r.id} className={`chip press ${fdPlanned === r.id ? 'on' : ''}`} onClick={() => setOne(r.id)}>{r.name}</button>)}
            </div>
            <div className="xs t3" style={{ marginTop: 8 }}>{t('One-off change. Your repeating plan stays the same.')}</div>
          </div>
        )}
        <div className="lbl" style={{ marginBottom: 8 }}>{t('Repeating plan')}</div>
        <Seg value={sch.mode} onChange={(m) => s.setSchedule({ mode: m })} options={[{ value: 'weekly', label: t('Fixed weekdays') }, { value: 'rotation', label: t('Flexible rotation') }]} />
        {routines.length === 0 && <div className="small t2" style={{ marginTop: 16 }}>{t('Create a routine first, then schedule it here.')}</div>}
        {sch.mode === 'weekly' ? (
          <div style={{ marginTop: 16 }}>
            {order.map((wd) => (
              <div key={wd} style={{ padding: '10px 0', borderTop: '1px solid var(--line)' }}>
                <div className="row-flex" style={{ gap: 10 }}>
                  <div className="display display-sm" style={{ width: 52 }}>{fmtWeekdayShort(wd, lang)}</div>
                  <div className="chips grow" style={{ margin: 0, padding: 0 }}>
                    <button className={`chip sm press ${!sch.weekly[wd] ? 'on' : ''}`} onClick={() => setDay(wd, null)}>{t('Rest')}</button>
                    {routines.map((r) => <button key={r.id} className={`chip sm press ${sch.weekly[wd] === r.id ? 'on' : ''}`} onClick={() => setDay(wd, r.id)}>{r.name}</button>)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ marginTop: 16 }}>
            {sch.rotation.order.map((id, i) => { const r = routines.find((x) => x.id === id); if (!r) return null; return (
              <div key={id + i} className="row-flex" style={{ gap: 10, padding: '10px 0', borderTop: '1px solid var(--line)' }}>
                <span className="display display-sm accent num" style={{ width: 22 }}>{i + 1}</span><div className="grow li-title">{r.name}{sch.rotation.pointer % Math.max(1, sch.rotation.order.length) === i && <span className="chip sm acc" style={{ marginLeft: 8, height: 20 }}>{t('next')}</span>}</div>
                <button className="icon-btn flat sm" aria-label={t('Move up')} disabled={i === 0} style={{ opacity: i === 0 ? 0.3 : 1 }} onClick={() => { const o = [...sch.rotation.order]; [o[i - 1], o[i]] = [o[i], o[i - 1]]; s.setSchedule({ rotation: { ...sch.rotation, order: o } }); }}><Icon name="arrowUp" size={17} /></button>
                <button className="icon-btn flat sm" aria-label={t('Remove')} onClick={() => s.setSchedule({ rotation: { ...sch.rotation, order: sch.rotation.order.filter((_, j) => j !== i), pointer: 0 } })}><Icon name="close" size={17} /></button>
              </div>); })}
            <div className="chips" style={{ marginTop: 12, margin: '12px 0 0', padding: 0, flexWrap: 'wrap' }}>
              {routines.map((r) => <button key={r.id} className="chip sm press" onClick={() => s.setSchedule({ rotation: { ...sch.rotation, order: [...sch.rotation.order, r.id] } })}><Icon name="plus" size={14} /> {r.name}</button>)}
            </div>
            <div className="row-flex between" style={{ marginTop: 18 }}><span className="small t2">{t('Target sessions per week')}</span><Stepper value={sch.rotation.perWeek} min={1} max={7} onChange={(v) => s.setSchedule({ rotation: { ...sch.rotation, perWeek: v } })} /></div>
          </div>
        )}
      </div>
    </Sheet>
  );
}

export function Reschedule({ props }: { props: { date: string; routineId: string } }) {
  const t = useT();
  const lang = useLang();
  const s = useStore();
  const pop = useUI((u) => u.pop);
  const push = useUI((u) => u.push);
  const toast = useUI((u) => u.toast);
  const today = useToday();
  const r = s.routines.find((x) => x.id === props.routineId);
  const move = (to: string) => {
    const before = JSON.parse(JSON.stringify(s.schedule));
    s.rescheduleMissed(props.date, props.routineId, to);
    pop();
    toast(t('Moved {name} to {day}', { name: r?.name ?? '', day: relativeDay(to, today, lang) ?? fmtDate(to, lang, { weekday: 'long' }) }), { tone: 'ok', actionLabel: t('Undo'), onAction: () => s.setSchedule(before) });
  };
  return (
    <Sheet onClose={pop} label={t('Reschedule')} z={100}>
      <SheetHead title={t('Reschedule')} sub={`${r?.name ?? ''} · ${fmtDate(props.date, lang, { weekday: 'long', day: 'numeric', month: 'short' })}`} onClose={pop} />
      <div className="sheet-body">
        <div className="stack gap8">
          <button className="btn primary block press" onClick={() => move(today)}>{t('Do it today')}</button>
          <button className="btn block press" onClick={() => move(addDays(today, 1))}>{t('Tomorrow')}</button>
          <button className="btn block press" onClick={() => push('datePicker', { value: today, title: t('Move to…'), marks: 'train', onPick: (d: string) => move(d) })}><Icon name="calendar" size={18} /> {t('Pick a day')}</button>
          <button className="btn ghost block press" onClick={() => { const before = JSON.parse(JSON.stringify(s.schedule)); s.skipPlanned(props.date); pop(); toast(t('Skipped'), { actionLabel: t('Undo'), onAction: () => s.setSchedule(before) }); }}>{t('Skip it')}</button>
        </div>
        <div className="xs t3" style={{ marginTop: 14 }}>{t('Your workout history is never changed by moving or skipping.')}</div>
      </div>
    </Sheet>
  );
}


export function ActivityLog({ props }: { props: { kind?: ActivityKind } }) {
  const t = useT();
  const lang = useLang();
  const s = useStore();
  const pop = useUI((u) => u.pop);
  const toast = useUI((u) => u.toast);
  const today = useToday();
  const [kind, setKindRaw] = useState<ActivityKind>(props.kind ?? 'run');
  const [min, setMin] = useState<number | undefined>(props.kind === 'wrestling' ? 60 : 30);
  const [dist, setDist] = useState<number | undefined>(undefined);
  const [rounds, setRounds] = useState<number | undefined>(undefined);
  const [intensity, setIntensity] = useState<1 | 2 | 3>(2);
  const [note, setNote] = useState('');
  const [date, setDate] = useState(today);
  const setKind = (k: ActivityKind) => { if (k === 'wrestling' && kind !== 'wrestling' && min === 30) setMin(60); setKindRaw(k); };
  const wrestling = kind === 'wrestling';
  const cardio = ['run', 'walk', 'cycle', 'swim', 'row', 'hike'].includes(kind);
  const u = s.settings.units.distance;
  const save = () => {
    if (!min || min <= 0) return;
    const a = s.addActivity({ date, kind, durationSec: Math.round(min * 60), distanceM: cardio && dist ? displayToM(dist, u) : undefined, rounds: wrestling && rounds ? Math.round(rounds) : undefined, intensity: wrestling ? intensity : undefined, note: note.trim() || undefined });
    buzz(12);
    pop();
    toast(wrestling ? t('Wrestling logged') : t('Activity logged'), { tone: 'ok', actionLabel: t('Undo'), onAction: () => s.removeActivity(a.id) });
  };
  return (
    <Sheet onClose={pop} label={wrestling ? t('Wrestling') : t('Log activity')} z={100} foot={<button className="btn primary block press" disabled={!min} onClick={save}>{wrestling ? t('Save session') : t('Save activity')}</button>}>
      <SheetHead title={wrestling ? t('Wrestling') : t('Log activity')} onClose={pop} />
      <div className="sheet-body">
        <div className="chips" style={{ flexWrap: 'wrap', margin: 0, padding: 0 }}>{KINDS.map((k) => <button key={k} className={`chip press ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>{k === 'wrestling' && <Icon name="wrestle" size={15} />}{t(KIND_LABEL[k])}</button>)}</div>
        {wrestling ? (
          <>
            <div className="field" style={{ marginTop: 20 }}><label>{t('Mat time')}</label>
              <div className="chips" style={{ margin: '0 0 8px', padding: 0 }}>{[30, 45, 60, 90, 120].map((m) => <button key={m} className={`chip sm press ${min === m ? 'on' : ''}`} onClick={() => setMin(m)}>{m} min</button>)}</div>
              <NumInput value={min} onChange={setMin} unit="min" max={0} label={t('Mat time')} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 12, marginTop: 14 }}>
              <div className="field"><label>{t('Rounds')}</label><NumInput value={rounds} onChange={setRounds} unit="" max={0} placeholder={t('optional')} label={t('Rounds')} /></div>
              <div className="field"><label>{t('Intensity')}</label><Seg value={intensity} onChange={setIntensity} options={([1, 2, 3] as const).map((v) => ({ value: v, label: t(INTENSITY_LABEL[v]) }))} /></div>
            </div>
          </>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: cardio ? '1fr 1fr' : '1fr', gap: 12, marginTop: 18 }}>
            <div className="field"><label>{t('Duration')}</label><NumInput value={min} onChange={setMin} unit="min" max={0} /></div>
            {cardio && <div className="field"><label>{t('Distance')}</label><NumInput value={dist} onChange={setDist} unit={u} max={2} placeholder={t('optional')} /></div>}
          </div>
        )}
        <div className="field" style={{ marginTop: 14 }}><label>{t('Note')}</label><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={wrestling ? t('What you drilled, who you rolled with…') : t('Optional')} /></div>
        <div className="chips" style={{ marginTop: 14 }}>
          {[0, -1, -2].map((n) => { const d = addDays(today, n); return <button key={n} className={`chip sm press ${date === d ? 'on' : ''}`} onClick={() => setDate(d)}>{relativeDay(d, today, lang) ?? fmtDate(d, lang, { weekday: 'short' })}</button>; })}
        </div>
      </div>
    </Sheet>
  );
}
