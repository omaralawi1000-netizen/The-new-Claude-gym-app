import { memo, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { motion, type MotionValue } from 'motion/react';
import { useStore } from '../../state/store';
import { useT, useLang } from '../../lib/i18n';
import type { Exercise, SessionExercise, SetRecord, WorkoutSession } from '../../lib/types';
import { usePager } from '../../ui/pager';
import { MuscleMap } from './MuscleMap';
import { Figure, figureFor } from './Figure';
import { exName } from './common';
import { focusPageNow, nextSetOf, setFocusPage, subscribeFocusPage } from './rest';
import { ExerciseBlock, useActive } from './Active';
import { ImgGlow } from '../../ui/Glows';
import { WorkoutNote } from './Briefing';

const GAP = 16; // between pages, as in the iOS photo viewer: you see the edge of the next one only while you swipe

/** Where to go after a set of `seId` is ticked: its superset partner's turn, else the first set not yet done. */
function nextFocus(a: WorkoutSession | null | undefined, seId: string): string | null {
  if (!a) return null;
  const se = a.exercises.find((e) => e.id === seId);
  if (se?.supersetGroup) {
    const group = a.exercises.filter((e) => e.supersetGroup === se.supersetGroup);
    const at = group.findIndex((e) => e.id === seId);
    for (let k = 1; k <= group.length; k++) {
      const g = group[(at + k) % group.length];
      if (g.sets.some((x) => !x.done)) return g.id;
    }
  }
  return nextSetOf(a)?.se.id ?? null;
}
const doneIn = (a: WorkoutSession | null | undefined, seId: string) => a?.exercises.find((e) => e.id === seId)?.sets.filter((x) => x.done).length ?? 0;

/**
 * The exercise to do after the one on `seId`, for the bar while you look at it: its superset partner whose turn comes,
 * else the next one in the list (round to the top) that still has sets to do. The bar shows this instead of repeating the
 * row that is already highlighted on the page.
 */
export function upNextOf(a: WorkoutSession | null | undefined, seId: string): { se: SessionExercise; set: SetRecord } | null {
  if (!a) return null;
  const at = a.exercises.findIndex((e) => e.id === seId);
  if (at < 0) return null;
  const se = a.exercises[at];
  const order = se.supersetGroup ? a.exercises.filter((e) => e.supersetGroup === se.supersetGroup && e.id !== seId) : [];
  for (let k = 1; k < a.exercises.length; k++) order.push(a.exercises[(at + k) % a.exercises.length]);
  for (const e of order) { const set = e.sets.find((x) => !x.done); if (e.id !== seId && set) return { se: e, set }; }
  return null;
}

// Which exercise the Focus view shows, for the bar (and for the Coach's "current set"): its tiny store lives in rest.ts.
const setShown = setFocusPage;
export const useFocusPage = () => useSyncExternalStore(subscribeFocusPage, focusPageNow);

export type FocusApi = { jumpToSet: (setId: string) => void };

const reducedMotion = () => document.documentElement.dataset.motion === 'reduce'
  || (document.documentElement.dataset.motion !== 'full' && matchMedia('(prefers-reduced-motion: reduce)').matches);

/**
 * The exercise on the page you're looking at is about to be removed: a still copy of its page stays where it is and fades
 * away while the next exercise's page rises in under it (it used to be swapped in one frame). Call before removing.
 */
export function fadeOutPage(seId: string) {
  const page = document.querySelector<HTMLElement>('.wk-focus.on .wk-page.cur');
  const pager = page?.closest<HTMLElement>('.wk-pager');
  if (!page || !pager || !page.querySelector(`[data-flip="${CSS.escape(seId)}"]`) || reducedMotion()) return;
  const r = page.getBoundingClientRect(), pr = pager.getBoundingClientRect();
  const ghost = page.cloneNode(true) as HTMLElement;
  ghost.setAttribute('aria-hidden', 'true'); ghost.inert = true;
  Object.assign(ghost.style, { position: 'absolute', left: `${r.left - pr.left}px`, top: `${r.top - pr.top}px`, width: `${r.width}px`, height: `${r.height}px`, zIndex: '2', pointerEvents: 'none' });
  pager.appendChild(ghost);
  ghost.scrollTop = page.scrollTop;
  const a = ghost.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.97)' }], { duration: 460, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' });
  a.onfinish = a.oncancel = () => ghost.remove();
  arriving = true;
}
// set by fadeOutPage: the page that takes the removed one's place rises in
let arriving = false;

/**
 * Focus view: one exercise fills the screen, the next one a swipe away. A stage for the movement on top (the muscle
 * picture until the figures exist), then the exercise's own card, so the sets tick exactly as in the list. When its last
 * set is ticked the view waits a moment, so the tick is seen, and glides on to the next exercise.
 */
export const FocusView = memo(function FocusView({ exMap, onMenu, pad, apiRef }: { exMap: Map<string, Exercise>; onMenu: (id: string) => void; pad: MotionValue<string>; apiRef: React.MutableRefObject<FocusApi | null> }) {
  const t = useT();
  const lang = useLang();
  const exs = useActive()?.exercises ?? [];
  const exsRef = useRef(exs); exsRef.current = exs;
  const viewport = useRef<HTMLDivElement>(null), track = useRef<HTMLDivElement>(null);
  // open on the exercise you're on (the one with the next set to do)
  const [index, setIndex] = useState(() => { const id = nextSetOf(useStore.getState().active)?.se.id; return Math.max(0, exs.findIndex((e) => e.id === id)); });
  const pill = useRef<HTMLElement>(null);
  // while the finger moves, only the pill moves (no re-render mid-swipe); the dots catch up when the page settles
  const pillTo = (i: number) => { if (pill.current) pill.current.style.transform = `translateX(${i * 16}px)`; };
  const curId = useRef<string | undefined>(exs[index]?.id);
  // Pages are built in the background, nearest first, and once built they stay: a page you swipe onto must already be drawn,
  // an empty card for a moment (just its title) was the old stand-in showing. At first only the page itself, so entering is
  // one card's work; the neighbours follow once it has arrived, then the rest one at a time, only while nothing moves.
  const [win, setWin] = useState<Set<number>>(() => new Set([index]));
  const winRef = useRef(win); winRef.current = win;
  const moving = useRef(false), at = useRef(index);
  const grow = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Building a page is a long frame, and a long frame in the middle of a glide is a stutter: wait until nothing is moving.
  const growTo = (i: number, ms: number) => {
    clearTimeout(grow.current);
    const step = () => {
      if (moving.current || pager.current.dragging()) { grow.current = setTimeout(step, 250); return; }
      const w = winRef.current, n = exsRef.current.length;
      let next = -1;
      for (let d = 0; d < n && next < 0; d++) for (const j of [i + d, i - d]) if (j >= 0 && j < n && !w.has(j)) { next = j; break; }
      if (next < 0) return;
      setWin(new Set([...w, next]));
      grow.current = setTimeout(step, 320);
    };
    grow.current = setTimeout(step, ms);
  };
  useEffect(() => { growTo(index, 750); return () => { clearTimeout(grow.current); setShown(null); }; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const flashSet = useRef<string | null>(null);
  const flash = (setId: string) => {
    const row = viewport.current?.querySelector<HTMLElement>(`.wk-page.cur [data-set="${setId}"]`);
    if (!row) return;
    row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    row.classList.remove('wk-flash'); void row.offsetWidth; row.classList.add('wk-flash');
  };
  const pager = usePager(viewport, track, {
    count: exs.length, gap: GAP, initial: index,
    // a page the finger is bringing in that isn't built yet (a fast flick through several): build it now, a hitch beats an empty card
    onNear: (i) => { pillTo(i); if (i !== at.current) moving.current = true; if (!winRef.current.has(i)) setWin(new Set([...winRef.current, i])); },
    onSettle: (i) => {
      moving.current = false; at.current = i;
      setIndex(i); curId.current = exsRef.current[i]?.id; setShown(curId.current ?? null);
      growTo(i, 380);
      const f = flashSet.current; flashSet.current = null;
      if (f) requestAnimationFrame(() => flash(f));
    },
  });
  const go = (i: number, auto = false) => {
    setWin((w) => (w.has(i) ? w : new Set([...w, i])));
    moving.current = true;
    pager.current.go(i, auto);
  };

  // an exercise added, removed or moved: stay on the one you were on
  const ids = exs.map((e) => e.id).join(',');
  useLayoutEffect(() => {
    let i = exs.findIndex((e) => e.id === curId.current);
    const replaced = i < 0;
    if (i < 0) i = Math.min(index, exs.length - 1);
    if (i < 0) return;
    if (replaced && arriving) (track.current?.children[i] as HTMLElement | undefined)?.animate([{ opacity: 0, transform: 'translateY(14px)', offset: 0 }], { duration: 620, delay: 90, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'both' });
    arriving = false;
    curId.current = exs[i].id; at.current = i; setShown(curId.current);
    if (i !== index) { setIndex(i); setWin((w) => new Set([...w, i])); }
    pager.current.place(i); growTo(i, 500); // a page that moved in the list may not be built yet
  }, [ids]); // eslint-disable-line react-hooks/exhaustive-deps

  // the last set of the exercise you're on is ticked (or a superset partner's turn has come): glide on, after a beat
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = useStore.subscribe((s, prev) => {
      const cur = curId.current;
      if (!cur || s.active === prev.active || doneIn(s.active, cur) <= doneIn(prev.active, cur)) return;
      const to = nextFocus(s.active, cur);
      const i = to && to !== cur ? exsRef.current.findIndex((e) => e.id === to) : -1;
      clearTimeout(timer);
      if (i < 0) return;
      timer = setTimeout(() => { if (!pager.current.dragging() && curId.current === cur) go(i, true); }, 900);
    });
    return () => { off(); clearTimeout(timer); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  apiRef.current = {
    jumpToSet: (setId) => {
      const i = exsRef.current.findIndex((e) => e.sets.some((x) => x.id === setId));
      if (i < 0) return;
      if (i === index && !pager.current.dragging()) { flash(setId); return; }
      flashSet.current = setId; go(i);
    },
  };

  if (exs.length === 0) return null;
  return (
    <>
      {/* one dot per exercise: the pill slides to the one you're on, filled dots are done */}
      <div className="wk-dots" role="tablist" aria-label={t('Exercises')}>
        {exs.map((se, i) => {
          const ex = exMap.get(se.exerciseId);
          const done = se.sets.length > 0 && se.sets.every((x) => x.done);
          return <button key={se.id} role="tab" aria-selected={i === index} className={`wk-dot${done ? ' done' : ''}`} onClick={() => go(i)}
            aria-label={`${ex ? exName(ex, lang) : t('Exercise')} · ${t('{n} of {m}', { n: i + 1, m: exs.length })}`}><i /></button>;
        })}
        <i ref={pill} className="wk-dot-pill" aria-hidden style={{ transform: `translateX(${index * 16}px)` }} />
      </div>
      <div ref={viewport} className="wk-pager">
        <div ref={track} className="wk-track" style={{ gap: GAP }}>
          {exs.map((se, i) => <Page key={se.id} se={se} ex={exMap.get(se.exerciseId)} full={win.has(i)} cur={i === index} onMenu={onMenu} pad={pad} first={i === 0} />)}
        </div>
      </div>
    </>
  );
});

const Page = memo(function Page({ se, ex, full, cur, onMenu, pad, first }: { se: SessionExercise; ex?: Exercise; full: boolean; cur: boolean; onMenu: (id: string) => void; pad: MotionValue<string>; /** the first page also says what is about the whole workout (the List's Today card isn't seen here) */ first?: boolean }) {
  const lang = useLang();
  const t = useT();
  return (
    <motion.div className={`wk-page hide-scroll${cur ? ' cur' : ''}`} style={{ paddingBottom: pad }} aria-hidden={!cur || undefined} inert={!cur || undefined}>
      {/* the movement's stage: a figure doing it (Figure.tsx), or the muscles it works where there is no figure yet */}
      <div className="wk-stage" aria-hidden><ImgGlow />{(() => { const k = figureFor(ex); return k ? <Figure ex={ex} kind={k} active={cur} /> : ex && <MuscleMap muscles={ex.muscles} size={104} />; })()}</div>
      {full
        ? <>{first && <WorkoutNote />}<ExerciseBlock se={se} ex={ex} onMenu={onMenu} linkedPrev={false} linkedNext={false} /></>
        : <div className="wk-page-ghost"><div className="plinth"><div className="display display-sm wk-ex-title">{ex ? exName(ex, lang) : t('Unknown exercise')}</div></div></div>}
    </motion.div>
  );
});
