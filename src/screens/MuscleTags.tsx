import { useMemo, type CSSProperties } from 'react';
import { useStore, exerciseMap } from '../state/store';
import { useT } from '../lib/i18n';
import type { MuscleGroup, Routine } from '../lib/types';
import { MUSCLE_LABEL } from './workout/common';

/** The muscles a routine works, as small quiet bubbles under its title (first two, then "+n"). Labels, not buttons. */
export function MuscleTags({ routine, style }: { routine: Routine; style?: CSSProperties }) {
  const t = useT();
  const exercises = useStore((s) => s.exercises);
  const muscles = useMemo(() => {
    const m = exerciseMap(exercises);
    return [...new Set(routine.items.map((i) => m.get(i.exerciseId)?.muscles[0]).filter(Boolean))] as MuscleGroup[];
  }, [exercises, routine.items]);
  if (!muscles.length) return null;
  return (
    <div className="chips" style={{ margin: 0, padding: 0, gap: 6, flexWrap: 'nowrap', overflow: 'hidden', minWidth: 0, ...style }}>
      {muscles.slice(0, 2).map((m) => <span key={m} className="chip sm" style={{ flex: 'none' }}>{t(MUSCLE_LABEL[m])}</span>)}
      {muscles.length > 2 && <span className="chip sm num" style={{ flex: 'none' }}>+{muscles.length - 2}</span>}
    </div>
  );
}
