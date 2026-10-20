import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useStore, exerciseMap } from '../state/store';
import { useLang, useT } from '../lib/i18n';
import type { MuscleGroup, Routine } from '../lib/types';
import { MUSCLE_LABEL } from './workout/common';

/**
 * The muscles a routine works, as small quiet bubbles under its title (first two, then "+n"). Labels, not buttons.
 * When the names don't fit the room (long names, Danish, a narrow card), fewer are named and "+n" counts the rest, so a
 * bubble is never cut by the edge.
 */
export function MuscleTags({ routine, style }: { routine: Routine; style?: CSSProperties }) {
  const t = useT();
  const exercises = useStore((s) => s.exercises);
  const muscles = useMemo(() => {
    const m = exerciseMap(exercises);
    return [...new Set(routine.items.map((i) => m.get(i.exerciseId)?.muscles[0]).filter(Boolean))] as MuscleGroup[];
  }, [exercises, routine.items]);
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.round(el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [muscles.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  const lang = useLang();
  const key = `${w}|${muscles.join()}|${lang}`;
  const [fit, setFit] = useState({ key: '', n: 2 });
  const n = fit.key === key ? fit.n : 2;
  useLayoutEffect(() => {
    const el = ref.current, last = el?.lastElementChild;
    if (!el || !last || n === 0) return;
    if (last.getBoundingClientRect().right > el.getBoundingClientRect().right + 0.5) setFit({ key, n: n - 1 });
  });
  if (!muscles.length) return null;
  const rest = muscles.length - Math.min(n, muscles.length);
  return (
    <div ref={ref} className="chips" style={{ margin: 0, padding: 0, gap: 6, flexWrap: 'nowrap', overflow: 'hidden', minWidth: 0, ...style }}>
      {muscles.slice(0, n).map((m) => <span key={m} className="chip sm" style={{ flex: 'none' }}>{t(MUSCLE_LABEL[m])}</span>)}
      {rest > 0 && <span className="chip sm num" style={{ flex: 'none' }}>+{rest}</span>}
    </div>
  );
}
