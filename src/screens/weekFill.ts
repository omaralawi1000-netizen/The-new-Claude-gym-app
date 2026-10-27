/**
 * After a workout, today's circle in Today's week strip fills the first time you see it, and the week's count rolls up
 * (alive plan step 2, E). Until then the strip is drawn as it was before the workout: the summary covers Today while the
 * session is already saved, so without this the circle would show filled, then shrink and fill again.
 *
 * A workout counts here when its summary opens (only finishing a workout opens one) for today, and the day had nothing in it
 * before: no other workout, no wrestling. A second workout, or a day wrestling already filled, plays nothing.
 * Kept in memory only: opening the app later simply shows the filled circle.
 */
import { useEffect, useSyncExternalStore, type RefObject } from 'react';
import { useUI } from '../state/ui';
import { useStore } from '../state/store';
import { stageDepth } from '../ui/engage';

let pending: string | null = null; // finished today, not yet seen on Today
const played = new Set<string>(); // seen: drawn by the fill (its disc) for as long as the app runs
let fresh: string | null = null; // just played: its animation runs once, on the next draw
let ver = 0;
const subs = new Set<() => void>();
const bump = () => { ver++; subs.forEach((f) => f()); };

function look() {
  for (const o of useUI.getState().overlays) {
    const id = o.type === 'summary' ? (o.props?.sessionId as string | undefined) : undefined;
    if (!id || id === pending || played.has(id)) continue;
    const d = useStore.getState();
    const s = d.sessions.find((x) => x.id === id);
    if (!s || Date.now() - (s.endedAt ?? 0) > 5 * 60000) continue; // (an older workout's summary: nothing to fill)
    const empty = !d.sessions.some((x) => x.id !== id && x.date === s.date) && !d.activities.some((x) => x.date === s.date && x.kind === 'wrestling');
    if (!empty) continue;
    pending = id; bump();
  }
}
let on = false;
function start() { if (on) return; on = true; useUI.subscribe((u, p) => { if (u.overlays !== p.overlays) look(); }); look(); }

/** the strip's view of it: the workout to leave out while it waits, the one the disc draws, and whether that one is new */
export function useWeekFill() {
  start();
  useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => ver);
  return { pending, played, fresh };
}

/** the strip was seen with nothing over it: fill it now */
export function playWeekFill() {
  if (!pending) return;
  played.add(pending); fresh = pending; pending = null; bump();
}
/** the fill has started on screen: a later draw keeps it still */
export function weekFillStarted() { fresh = null; }

/**
 * Fills it once the strip is really seen: nine tenths of it on screen, nothing over Today (the summary and its close have
 * gone), the page still (not sliding in, fading, rising or scrolling), for a quarter of a second. Checked ten times a second,
 * and only while a fill waits on Today.
 */
export function useFillWhenSeen(ref: RefObject<HTMLElement | null>, on: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!on || !el) return;
    let seen = false, calm = 0, at = '', timer = 0;
    const io = new IntersectionObserver(([e]) => { seen = e.intersectionRatio >= 0.9; }, { threshold: [0, 0.9, 1] });
    io.observe(el);
    const still = () => {
      if (!seen || document.hidden || useUI.getState().overlays.length || stageDepth.get() > 0.001) return false;
      const r = el.getBoundingClientRect();
      const now = `${Math.round(r.left * 2)},${Math.round(r.top * 2)}`;
      const moved = now !== at; at = now;
      if (moved) return false;
      for (let n = el.parentElement; n; n = n.parentElement) if (getComputedStyle(n).opacity !== '1') return false;
      return !document.getAnimations().some((a) => a.playState === 'running' && a.effect instanceof KeyframeEffect
        && a.effect.target instanceof Element && a.effect.target.contains(el));
    };
    const tick = () => {
      calm = still() ? calm + 1 : 0;
      if (calm >= 3) { playWeekFill(); return; }
      timer = window.setTimeout(tick, 90);
    };
    timer = window.setTimeout(tick, 90);
    return () => { io.disconnect(); clearTimeout(timer); };
  }, [ref, on]);
}
