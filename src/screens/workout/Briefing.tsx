import { useMemo, useState } from 'react';
import { useStore } from '../../state/store';
import { haptic } from '../../state/ui';
import { useT, useLang } from '../../lib/i18n';
import { dayKey } from '../../lib/dates';
import { fmtNum, kgToDisplay } from '../../lib/units';
import { briefing, trimOneSet, untrim, type Move } from '../../lib/coachWorkout';
import type { Exercise, WorkoutSession } from '../../lib/types';
import { Icon, type IconName } from '../../ui/Icon';
import { Collapse } from '../../ui/kit';
import { exName } from './common';

// a briefing hidden with ✕ stays hidden for that workout (also after the app is closed and opened again)
const KEY = 'aven.briefHidden';
const hiddenFor = () => { try { return localStorage.getItem(KEY) ?? ''; } catch { return ''; } };

const FLAG_ICON: Record<string, IconName> = { tired: 'moon', fresh: 'sparkle', wrestle: 'wrestle', note: 'info' };

/** "+2.5 kg" / "+1 rep" against last time. */
export function moveText(m: Move, unit: 'kg' | 'lb', lang: 'en' | 'da', t: (k: string, v?: Record<string, string | number>) => string): string {
  if (m.kg) return `+${fmtNum(kgToDisplay(m.kg, unit), lang, 2)} ${unit}`;
  return m.reps === 1 ? t('+1 rep') : t('+{n} reps', { n: m.reps ?? 0 });
}

/**
 * The briefing at the top of a planned workout: today's key targets, anything worth knowing today, one focus. Computed once
 * when the workout opens (the app's own numbers, no AI). It folds away as the first set is ticked, or with ✕.
 */
export function Briefing({ a, exMap }: { a: WorkoutSession; exMap: Map<string, Exercise> }) {
  const t = useT();
  const lang = useLang();
  const unit = useStore((s) => s.settings.units.weight);
  const started = useStore((s) => !!s.active?.exercises.some((e) => e.sets.some((x) => x.done)));
  const [hidden, setHidden] = useState(() => hiddenFor() === a.id);
  // already under way when it is drawn (reopened mid-workout): it stays out of the way
  const [late] = useState(started);
  const b = useMemo(() => { const st = useStore.getState(); return briefing(st, a, dayKey(Date.now(), st.settings.dayStartHour), exMap); }, [a.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [trim, setTrim] = useState<{ undo: () => void; n: number } | null>(null);
  if (late || !a.routineId || (!b.targets.length && !b.flags.length)) return null;
  const name = (id: string) => { const ex = exMap.get(id); return ex ? exName(ex, lang) : ''; };
  const w = (kg?: number) => (kg === undefined ? '' : `${fmtNum(kgToDisplay(kg, unit), lang, 2)} ${unit} × `);
  const hide = () => { haptic('light'); setHidden(true); try { localStorage.setItem(KEY, a.id); } catch { /* fine */ } };
  const lighter = () => {
    const st = useStore.getState();
    const before = st.active;
    if (!before) return;
    const r = trimOneSet(before);
    if (!r.removed.length) return;
    haptic('confirm');
    st.mutateActive(() => r.next);
    setTrim({ n: r.removed.length, undo: () => { const now = useStore.getState().active; if (now?.id === before.id) useStore.getState().mutateActive((x) => untrim(x, r.removed)); setTrim(null); } });
  };
  return (
    <Collapse open={!hidden && !started} ms={460} className="wk-brief-wrap">
      <div className="plinth wk-brief" aria-label={t('Today’s briefing')}>
        <div className="wk-brief-head">
          <span className="micro">{t('Today’s briefing')}</span>
          <button className="icon-btn flat sm press wk-brief-x" aria-label={t('Hide the briefing')} onClick={hide}><Icon name="close" size={15} /></button>
        </div>
        {b.targets.map((x) => (
          <div key={x.exerciseId} className="wk-brief-row">
            <span className="grow wk-brief-name">{name(x.exerciseId)}</span>
            <span className="num wk-brief-num">{w(x.kg)}{x.reps}</span>
            {x.up && <span className="wk-brief-up num">{moveText(x.up, unit, lang, t)}</span>}
          </div>
        ))}
        {b.flags.map((f, i) => (
          <div key={i} className={`wk-brief-flag ${f.kind}`}>
            <Icon name={FLAG_ICON[f.kind]} size={15} />
            <div className="grow">
              <div className="small">{f.kind === 'note' ? f.key : t(f.key, f.vars)}</div>
              {f.reasons?.length ? <div className="xs t2">{f.reasons.map((r) => t(r.key, r.vars)).join(' · ')}</div> : null}
              {f.kind === 'tired' && (trim
                ? <div className="row-flex xs wk-brief-done"><Icon name="check" size={13} /> <span className="grow">{trim.n === 1 ? t('1 set taken off') : t('{n} sets taken off', { n: trim.n })}</span><button className="chip sm press" onClick={trim.undo}>{t('Undo')}</button></div>
                : <button className="chip sm press wk-brief-act" onClick={lighter}>{t('One set less per lift')}</button>)}
            </div>
          </div>
        ))}
        {b.focus && <div className="small t2 wk-brief-focus">{t(b.focus.key, b.focus.exerciseId ? { exercise: name(b.focus.exerciseId) } : undefined)}</div>}
      </div>
    </Collapse>
  );
}
