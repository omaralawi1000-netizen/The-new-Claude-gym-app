import { useMemo, useState } from 'react';
import { useStore, exerciseMap } from '../../state/store';
import { haptic, useUI } from '../../state/ui';
import { useT, useLang } from '../../lib/i18n';
import { dayKey } from '../../lib/dates';
import { fmtNum, kgToDisplay } from '../../lib/units';
import { applyStallChange, liftHint, workoutLines, type BriefLine, type LiftHint, type Move } from '../../lib/coachWorkout';
import type { Exercise, SessionExercise, WorkoutSession } from '../../lib/types';
import { Icon, type IconName } from '../../ui/Icon';
import { Collapse } from '../../ui/kit';
import { exName } from './common';

// a briefing hidden with ✕ stays hidden for that workout (also after the app is closed and opened again)
const KEY = 'aven.briefHidden';
const hiddenFor = () => { try { return localStorage.getItem(KEY) ?? ''; } catch { return ''; } };

const ICON: Record<BriefLine['kind'], IconName> = { record: 'bolt', stall: 'repeat', lastNote: 'note', wrestle: 'wrestle', health: 'info' };
type T = (k: string, v?: Record<string, string | number>) => string;

/** "+2.5 kg" / "+1 rep" against last time. */
export function moveText(m: Move, unit: 'kg' | 'lb', lang: 'en' | 'da', t: T): string {
  if (m.kg) return `+${fmtNum(kgToDisplay(m.kg, unit), lang, 2)} ${unit}`;
  return m.reps === 1 ? t('+1 rep') : t('+{n} reps', { n: m.reps ?? 0 });
}

function useFmt() {
  const t = useT();
  const lang = useLang();
  const unit = useStore((s) => s.settings.units.weight);
  const set = (kg: number | undefined, reps: number) => `${kg !== undefined ? `${fmtNum(kgToDisplay(kg, unit), lang, 2)} ${unit} × ` : ''}${reps}`;
  return { t, lang, set };
}

/** The words of one line (without the lift's name). */
function lineText(l: BriefLine, t: T, set: (kg: number | undefined, reps: number) => string): string {
  if (l.kind === 'health') return l.text;
  if (l.kind === 'wrestle') return t('Wrestling tomorrow: keep the legs a little lighter');
  const h = l.hint;
  if (l.kind === 'record' && h.record) return t('{set} would be your heaviest yet', { set: set(h.record.kg, h.record.reps) });
  if (l.kind === 'stall' && h.stall) return t('Stuck at {from} · try {to} today', { from: set(h.stall.from.kg, h.stall.from.reps), to: set(h.stall.to.kg, h.stall.to.reps) });
  if (l.kind === 'lastNote' && h.lastNote) return t('Last time: {note}', { note: h.lastNote });
  return '';
}

/**
 * "Today" at the top of a planned workout (List view): what is about the whole workout — a health note, wrestling tomorrow
 * on a heavy leg day. Each lift's own line sits on its card instead, so nothing is said twice. Nothing applies → no card at
 * all. Computed once when the workout opens; folds away on the first tick, or with ✕.
 */
export function Briefing({ a, exMap }: { a: WorkoutSession; exMap: Map<string, Exercise> }) {
  const { t, lang, set } = useFmt();
  const started = useStore((s) => !!s.active?.exercises.some((e) => e.sets.some((x) => x.done)));
  const [hidden, setHidden] = useState(() => hiddenFor() === a.id);
  // already under way when it is drawn (reopened mid-workout): it stays out of the way
  const [late] = useState(started);
  const lines = useMemo(() => { const st = useStore.getState(); return workoutLines(st, a, dayKey(Date.now(), st.settings.dayStartHour), exMap); }, [a.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (late || !a.routineId || !lines.length) return null;
  const hide = () => { haptic('light'); setHidden(true); try { localStorage.setItem(KEY, a.id); } catch { /* fine */ } };
  return (
    <Collapse open={!hidden && !started} ms={620} className="wk-brief-wrap">
      <div className="plinth wk-brief" aria-label={t('Today')}>
        <div className="wk-brief-head">
          <span className="micro">{t('Today')}</span>
          <button className="icon-btn flat sm press wk-brief-x" aria-label={t('Hide the briefing')} onClick={hide}><Icon name="close" size={15} /></button>
        </div>
        {lines.map((l, i) => {
          const ex = 'exerciseId' in l ? exMap.get(l.exerciseId) : undefined;
          return (
            <div key={i} className={`wk-brief-line ${l.kind}`}>
              <Icon name={ICON[l.kind]} size={15} />
              <span className="grow">{ex && <b>{exName(ex, lang)}</b>}{ex && ' · '}{lineText(l, t, set)}</span>
            </div>
          );
        })}
      </div>
    </Collapse>
  );
}

/**
 * The same lines on a lift's own card (List and Focus), where you are when they matter: a record within reach, a stalled
 * lift with "Use it" (puts the change in its open sets, Undo), last time's note. `workout`: the lines about the whole
 * workout too (the first Focus page, where the Today card isn't seen).
 */
export function LiftHints({ se, ex, workout }: { se: SessionExercise; ex?: Exercise; workout?: boolean }) {
  const { t, set } = useFmt();
  const toast = useUI((u) => u.toast);
  const sessions = useStore((s) => s.sessions.length);
  const h: LiftHint = useMemo(() => liftHint(useStore.getState(), se, ex), [se.id, ex?.id, sessions]); // eslint-disable-line react-hooks/exhaustive-deps
  const whole = useMemo(() => {
    if (!workout) return [];
    const st = useStore.getState();
    return st.active ? workoutLines(st, st.active, dayKey(Date.now(), st.settings.dayStartHour), exerciseMap(st.exercises)) : [];
  }, [workout]);
  const [used, setUsed] = useState(false);
  const lines: BriefLine[] = [
    ...whole,
    ...(h.stall ? [{ kind: 'stall' as const, exerciseId: se.exerciseId, hint: h }] : []),
    ...(h.record ? [{ kind: 'record' as const, exerciseId: se.exerciseId, hint: h }] : []),
    ...(h.lastNote ? [{ kind: 'lastNote' as const, exerciseId: se.exerciseId, hint: h }] : []),
  ];
  if (!lines.length) return null;
  const use = () => {
    const st = useStore.getState();
    if (!st.active || !h.stall) return;
    const r = applyStallChange(st.active, se.id, h.stall.to);
    haptic('confirm');
    st.mutateActive(() => r.next);
    setUsed(true);
    toast(t('Set to {set}', { set: set(h.stall.to.kg, h.stall.to.reps) }), { actionLabel: t('Undo'), onAction: () => { useStore.getState().mutateActive(r.undo); setUsed(false); } });
  };
  return (
    <div className="wk-hints">
      {lines.map((l, i) => (
        <div key={i} className={`wk-hint ${l.kind}`}>
          <Icon name={ICON[l.kind]} size={14} />
          <span className="grow">{lineText(l, t, set)}</span>
          {l.kind === 'stall' && !used && !se.sets.every((x) => x.done) && <button className="chip sm press" onClick={use}>{t('Use it')}</button>}
        </div>
      ))}
    </div>
  );
}
