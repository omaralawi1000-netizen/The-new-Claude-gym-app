import { createContext, memo, startTransition, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { useStore, exerciseMap } from '../../state/store';
import { useUI, haptic } from '../../state/ui';
import { useT, useLang } from '../../lib/i18n';
import type { Exercise, SessionExercise, SetRecord, WorkoutSession } from '../../lib/types';
import { Icon } from '../../ui/Icon';
import { Collapse, NumInput, Stepper } from '../../ui/kit';
import { Roll } from '../../ui/Roll';
import { flip } from '../../ui/flip';
import { Sheet, SheetHead, SOFT, useOverlayZ } from '../../ui/Sheet';
import { beatLastTime, newBest, elapsedMs, historyOf, incrementFor, lastPerformance, repRange, sessionSetCount, sessionVolume, suggestProgression, countable } from '../../lib/workout';
import { fmtDuration } from '../../lib/dates';
import { displayToKg, kgToDisplay, fmtNum, displayToM, mToDisplay } from '../../lib/units';
import { useNow } from '../../lib/hooks';
import { setWorkoutOpener } from '../../ui/workoutOpen';
import { nextSetOf, offerRestAlerts, prepareRestAudio, unlockRestAudio } from './rest';
import { addSet, deleteSet, moveExercise, patchExercise, patchSet, removeExercise, startRest, adjustRest, skipRest, toggleSuperset } from './actions';
import { exName, fmtSet, MUSCLE_LABEL } from './common';
import { SphereSlot, mirrorOrb, orbPress, orbTap } from '../../ui/Sphere';
import { useSwipeDown } from '../../ui/swipe';
import { Mirror, mirrorProgress, trackCover, warmStage, type Engage } from '../../ui/engage';
import { readRGB, setBarTint } from '../../ui/statusBar';
import { kb, keyboardGoal, onKeyboardGoal, rideFocus } from '../../ui/keyboard';
import { viewportH } from '../../ui/viewport';
import { BOUNCY, SURFACE, SURFACE_EXIT } from '../../ui/motion';
import { FocusView, fadeOutPage, upNextOf, useFocusPage, type FocusApi } from './Focus';
import { morphBack, morphLand, morphStart, type Morph } from './morph';

/** False while the workout is minimised (kept alive but hidden): its clocks stop ticking. */
const WkLive = createContext(true);
/**
 * The workout as it was the moment it was finished or discarded, while its window slides away (WorkoutHost). The store has
 * no active workout any more by then; without this the whole window and the sheet on it vanished in one frame.
 */
export const WkFrozen = createContext<WorkoutSession | null>(null);
/** The id of the empty stand-in the window is built ahead with, before any workout exists (WorkoutHost). */
export const WK_GHOST = 'wk-ahead';
/** The live workout, or the one just ended while it leaves the screen. */
export function useActive(): WorkoutSession | null {
  const frozen = useContext(WkFrozen);
  const live = useStore((s) => s.active);
  return frozen ?? live;
}

/**
 * The live workout: a full-height card that rises over the page (which steps back behind it), like Apple Music's player.
 * Kept alive between openings (WorkoutHost): `open` false slides it away and then hides it.
 */
export function ActiveWorkout({ props, open = true, onGone, vanish = false }: { props: { origin?: 'hero' | 'pill' | 'none' }; open?: boolean; onGone?: () => void; /** close without the slide (it is already hidden under the finish sheet) */ vanish?: boolean }) {
  const t = useT();
  const lang = useLang();
  // narrow selections: the screen re-renders when the session changes, not on every store write
  const a = useActive();
  const exercises = useStore((s) => s.exercises);
  const weightUnit = useStore((s) => s.settings.units.weight);
  const pop = useUI((u) => u.pop);
  const push = useUI((u) => u.push);
  const swap = useUI((u) => u.swap);
  const toast = useUI((u) => u.toast);
  const reduce = useReducedMotion();
  const dialogRef = useRef<HTMLDivElement>(null);
  const dragY = useMotionValue(0);
  const swipeV = useRef(0);
  useSwipeDown(dialogRef, dragY, (v) => { swipeV.current = v ?? 0; close(swipeV.current || dragY.getVelocity()); }, { threshold: 130 });
  // Presented like an iOS sheet: the whole window rises from the bottom edge of the screen to the top while the page behind
  // steps back and dims, and sinks back down when you close it or drag it away from anywhere. One number (`p`, the finger
  // included in `eFinger`) drives the window, the page behind, the dim and the orb. Only a transform moves: nothing is
  // blurred, clipped, faded or laid out on the way.
  const H = viewportH;
  const p = useMotionValue(0);
  // it travels a little past the bottom edge: a spring's last few percent take a while, and the window's top edge (and its
  // shadow) used to hang just under the tab bar for that long after closing. Its colour reaches 48 px above that edge
  // (--wk-lead, styles.css), so that much further too: v0.1.97 left that band lying over the tab bar at the end of a minimise
  const LEAD = 48;
  const sheetTop = (pp: number) => (1 - pp) * (H + 64 + LEAD);
  const sheetT = useTransform(p, (pp) => `translateY(${sheetTop(pp).toFixed(2)}px)`);
  const dragT = useTransform(dragY, (d) => Math.max(0, d) + Math.min(0, d) * 0.15);
  const dialogY = useTransform([p, dragY], ([pp, d]: number[]) => sheetTop(pp) + Math.max(0, d) + Math.min(0, d) * 0.15); // how far the content is displaced (for the orb)
  const eFinger = useTransform([p, dragY], ([pp, d]: number[]) => Math.min(1, Math.max(0, pp - Math.max(0, d) / H)));
  const engage = useMemo(() => ({ e: eFinger, shift: dialogY }), [eFinger, dialogY]);
  const depthId = useId();
  // A full page, not a pop-up: it rises over the page as it is (nothing behind steps back or dims), and its own top fades
  // from the status bar's colour like every tab's page, so the bar reads as part of it. The bar takes the workout's own tint
  // (the one the tabs would give its hue) in the frames its top edge passes under the bar, and the tab's back as it leaves:
  // whatever is under the bar, the bar is its colour. Only the bar changes (theme-color); nothing on the page is restyled.
  const tintOf = (el: Element | null, mix = 'var(--bar-mix)') => {
    if (!el) return null;
    const probe = document.createElement('i');
    probe.style.cssText = `position:absolute;width:0;height:0;pointer-events:none;color:color-mix(in srgb, var(--h1) ${mix}, var(--bg))`;
    el.appendChild(probe); const c = readRGB(getComputedStyle(probe).color); probe.remove();
    return c;
  };
  const tints = useRef<{ tab: number[]; wk: number[] } | null>(null);
  const takeTints = () => {
    const tab = tintOf(document.querySelector('.app')), wk = tintOf(dialogRef.current);
    if (!tab || !wk) return;
    tints.current = { tab, wk };
    // the page's own top is that colour, fixed (written on the strip itself: a variable on the window would restyle
    // everything in it, in the tap)
    topRef.current?.style.setProperty('--wk-bar', `rgb(${wk.map(Math.round).join(' ')})`);
  };
  useEffect(() => {
    let last = -1;
    const at = 1 - LEAD / (H + 64 + LEAD); // the progress where that colour reaches the screen's top
    return eFinger.on('change', (v) => {
      const t = tints.current; if (!t) return;
      const k = Math.min(1, Math.max(0, (v - (at - 0.015)) / 0.03));
      if (k === last) return; last = k;
      setBarTint([0, 1, 2].map((i) => t.tab[i] + (t.wk[i] - t.tab[i]) * k) as [number, number, number], 0, false);
    });
  }, [eFinger, H]);
  // the shadow along the page's top edge is there while it travels and gone as it lands (a page at rest has no edge to shade)
  // (and while it is down by the bottom edge, so it never lies over the tab bar at the end of a minimise)
  const shade = (pp: number) => Math.min(1, Math.max(0, (1 - pp) / 0.3), Math.max(0, pp / 0.12));
  const shadeO = useTransform(eFinger, shade);
  const shadeRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLElement>(null);
  useEffect(() => trackCover(depthId, eFinger), [depthId, eFinger]); // and stops being drawn while the window covers it
  const sheetRef = useRef<HTMLDivElement>(null);
  // high refresh rate: the window, the dim and the page behind also run by the browser on the identical spring
  const mirror = useRef<Mirror | null>(null); if (!mirror.current) mirror.current = new Mirror();
  const vanishRef = useRef(vanish); vanishRef.current = vanish;
  const runMirror = (p0: number, p1: number, sp: { stiffness: number; damping: number; mass?: number }, vel: number) => {
    const m = mirror.current!; m.cancel();
    if (reduce || (p1 === 0 && vanishRef.current)) return;
    m.add(
      mirrorProgress(sheetRef.current, p0, p1, sp, vel, (pp) => ({ transform: `translateY(${sheetTop(pp).toFixed(2)}px)` })),
      mirrorProgress(shadeRef.current, p0, p1, sp, vel, (pp) => ({ transform: `translateY(${sheetTop(pp).toFixed(2)}px)`, opacity: String(shade(pp)) }), [0.12, 0.7]),
      mirrorOrb(sheetRef.current, p0, p1, sp, vel, sheetTop),
    );
  };
  useEffect(() => { const off = dragY.on('change', () => mirror.current!.cancel()); return () => { off(); mirror.current!.cancel(); }; }, [dragY]);
  // Closing starts the very moment you let go: the window's own animation is set going first (on the compositor), and only
  // after the next frame has been drawn is the app told the workout is closed — re-rendering the page behind, the tab bar
  // and the resume bar takes a phone a good while, and before, nothing moved until it was done (the pause after a tap).
  const closing = useRef<Promise<void> | null>(null);
  const startClose = (v = 0): Promise<void> => {
    if (closing.current) return closing.current;
    // the finger's offset becomes progress, then it carries on at the finger's speed — back into the bar or card it came from
    const e0 = eFinger.get();
    p.set(e0); dragY.set(0);
    const vel = -v / H;
    runMirror(e0, 0, SURFACE_EXIT, vel);
    // under the finish sheet: no slide, just a soft crossfade of what still shows above the sheet into the page behind. The
    // page is drawn again first (warmStage; behind a full cover it is not drawn at all, and fading over it showed black,
    // then the page cut in), two frames before the fade starts, then the window is put away.
    let fade: Animation | undefined;
    const c = vanishRef.current && !reduce
      ? new Promise<void>((ok) => { warmStage(true); requestAnimationFrame(() => requestAnimationFrame(() => {
        fade = dialogRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 700, easing: 'ease-in-out', fill: 'forwards' });
        (fade?.finished ?? Promise.resolve()).then(() => { p.set(0); ok(); }, () => ok());
      })); })
      : animate(p, 0, reduce || vanishRef.current ? { duration: 0.01 } : { ...SURFACE_EXIT, velocity: vel });
    closing.current = new Promise<void>((done) => { c.then(() => { done(); if (fade) requestAnimationFrame(() => fade?.cancel()); }, () => done()); });
    void closing.current.then(() => warmStage(false));
    return closing.current;
  };
  // a press on Minimise that never became a tap lets the page behind rest again
  const warmUp = () => { warmStage(true); setTimeout(() => { if (!closing.current) warmStage(false); }, 1000); };
  const close = (v = 0) => {
    if (closing.current) return;
    startClose(v);
    requestAnimationFrame(() => setTimeout(() => { if (useUI.getState().overlays.some((o) => o.type === 'workout')) useUI.getState().pop(); }, 0));
  };

  // the keyboard slides over the page (it no longer resizes it): the list gets that much more room at its end, so the last
  // set's fields can still be scrolled above the keys, and the rest timer rides on top of the keyboard
  const bodyPad = useTransform(kb, (v) => `calc(var(--sab) + 150px + ${v}px)`);
  // focus pages end just above the bar (the list keeps extra room to scroll its last card up); the stage takes the rest
  const focusPad = useTransform(kb, (v) => `calc(var(--sab) + 112px + ${v}px)`);
  const exMap = useMemo(() => exerciseMap(exercises), [exercises]);
  const [menu, setMenu] = useState<string | null>(null);
  // another screen on top of the workout (the exercise list, an exercise's page): the window's slow colour stands still under it.
  // The bar stays where it is under any pop-up, as a tab bar does on iOS: the pop-up simply rises over it (it used to drop
  // out of sight first and come back up after, two motions where one will do). Not for the orb's screen or the Coach.
  const covered = useUI((u) => { const top = u.overlays[u.overlays.length - 1]; return !!top && top.type !== 'workout' && top.type !== 'voice' && top.type !== 'coach' && u.overlays.some((o) => o.type === 'workout'); });
  const [confirm, setConfirm] = useState<null | 'finish' | 'discard'>(null);
  const finishBtn = useRef<HTMLButtonElement>(null);
  const pointToFinish = () => { const b = finishBtn.current; if (!b) return; b.classList.remove('nudge'); void b.offsetWidth; b.classList.add('nudge'); };
  const [renaming, setRenaming] = useState(false);
  // List or Focus (one exercise per page, Focus.tsx). Remembered on this phone. Focus is built when you go to it and kept
  // until it has faded out, so leaving it is the same calm crossfade as arriving.
  const [view, setView] = useState<'list' | 'focus'>(() => {
    const pick = useStore.getState().settings.workoutView; // Settings → Training: always List, always Focus, or the last one used
    if (pick === 'list' || pick === 'focus') return pick;
    try { return localStorage.getItem('aven.wkView') === 'focus' ? 'focus' : 'list'; } catch { return 'list'; }
  });
  const [focusBuilt, setFocusBuilt] = useState(view === 'focus');
  const [focusIn, setFocusIn] = useState(view === 'focus');
  const focusApi = useRef<FocusApi | null>(null);
  // the card of the exercise you're on travels between the two views as one object (morph.ts); `shared` while it does
  const morph = useRef<Morph | null>(null);
  const focusEl = useRef<HTMLDivElement>(null);
  const [shared, setShared] = useState<null | 'in' | 'back'>(null);
  const switchView = () => {
    const next = view === 'list' ? 'focus' : 'list';
    if (next === 'focus') {
      const a0 = useStore.getState().active;
      morph.current = morphStart(body.current, nextSetOf(a0)?.se.id ?? a0?.exercises[0]?.id);
      setShared(morph.current ? 'in' : null);
    } else {
      morph.current = null;
      setShared(morphBack(body.current, focusEl.current) ? 'back' : null);
    }
    setView(next);
    try { localStorage.setItem('aven.wkView', next); } catch { /* ignore */ }
  };
  useEffect(() => {
    if (view === 'focus') {
      setFocusBuilt(true);
      // one frame in its starting place first, so it rises in instead of appearing
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setFocusIn(true)));
      return () => cancelAnimationFrame(id);
    }
    setFocusIn(false);
    // 'back' stays until the next switch: the list's fade-in holds its end, and removing it would drop the cards' layers (a flicker)
    const id = setTimeout(() => { setFocusBuilt(false); setShared((v) => (v === 'back' ? v : null)); }, 700);
    return () => clearTimeout(id);
  }, [view]);
  // Focus has been laid out and is being shown this frame: its card takes over from the list's, from exactly there
  useLayoutEffect(() => {
    if (!focusIn || !morph.current) return;
    // 'in' stays until the next switch, like 'back': the dots and stage rise in and hold their end (dropping the class as
    // they finished took their layers away, a flicker over the whole page)
    morphLand(focusEl.current, morph.current); morph.current = null;
  }, [focusIn]);
  // Opening is started before the first paint, so the browser-run half is already going when the rest of the window's setup
  // work runs. Closing — the chevron, a swipe, Back, or another screen taking its place — slides it down; then it is hidden
  // (kept, so the next opening is only the slide).
  const [hidden, setHidden] = useState(!open);
  const openRef = useRef(open); openRef.current = open;
  const onGoneRef = useRef(onGone); onGoneRef.current = onGone;
  const opening = useRef<{ stop: () => void } | null>(null);
  const startOpen = () => {
    closing.current = null;
    // un-park it now, before the orb's flight measures where its slot will be (React would only do it after this effect)
    dialogRef.current?.classList.remove('wk-off');
    const from = p.get();
    opening.current?.stop();
    opening.current = animate(p, 1, reduce ? { duration: 0.01 } : SURFACE);
    runMirror(from, 1, SURFACE, 0);
    takeTints();
  };
  // waiting minimised: a tap on the resume bar or button starts the slide at once (ui/workoutOpen.ts)
  useEffect(() => (!open && hidden ? setWorkoutOpener(startOpen) : undefined));
  useLayoutEffect(() => {
    if (open) {
      if (!opening.current) startOpen(); // (already sliding when the tap started it)
      // the rest of "shown" (its clocks ticking again, its role) as a render that yields: set at once, here, it re-rendered
      // the whole window a second time inside the tap, before the slide's first frame
      startTransition(() => setHidden(false));
      return () => { opening.current?.stop(); opening.current = null; };
    }
    setMenu(null); setConfirm(null); setRenaming(false);
    const el = document.activeElement as HTMLElement | null;
    if (el && dialogRef.current?.contains(el)) el.blur();
    (closing.current ?? startClose(swipeV.current || dragY.getVelocity())).then(() => { if (!openRef.current) { setHidden(true); onGoneRef.current?.(); } });
    // eslint-disable-next-line
  }, [open]);
  // the keyboard is up: it slides over the bar (the bar stays put, it no longer drops out of sight before the keyboard rises),
  // so a running rest keeps counting in the header instead. Told by the keyboard itself, not by a field having focus: a field
  // keeps its focus when Android's back hides the keyboard, and the header then showed the rest twice.
  const [typing, setTyping] = useState(() => keyboardGoal() > 0);
  useEffect(() => onKeyboardGoal((px) => setTyping(px > 0)), []);
  // the field you tapped rides up with the keyboard, on its curve, as far as needed (the list, or Focus's page, scrolls)
  useEffect(() => { const el = dialogRef.current; return el ? rideFocus(el, (f) => f.closest<HTMLElement>('.wk-page, .wk-list')) : undefined; }, []);
  const body = useRef<HTMLDivElement>(null);
  // the list never moves sideways: CSS stops a finger, this stops scrollIntoView and friends (a "set done" ring scaling past
  // the right edge used to make room to slide into)
  useEffect(() => {
    const el = body.current; if (!el) return;
    const home = () => { if (el.scrollLeft) el.scrollLeft = 0; };
    el.addEventListener('scroll', home, { passive: true });
    return () => el.removeEventListener('scroll', home);
  }, [!a]); // eslint-disable-line react-hooks/exhaustive-deps
  const z = useOverlayZ(60);
  // where to open from is fixed at mount; where to close into is measured on every render (the card may have scrolled)
  // Render the first exercises at once and the rest a few at a time after the opening animation — no long task while
  // the surface is growing (that was the stutter/flicker on Start), and no single big hitch afterwards either.
  // The window opens first with just its header; the exercises then come in one after another once it has landed,
  // so no frame of the opening has to build the list.
  // The first two exercises are there from the very first frame (they fill the window as it opens, so nothing below them
  // ever shows first and then jumps); the rest follow one by one once the window has landed, and the buttons under the
  // list only appear after the whole list, so they are never pushed down while you look at them.
  const total0 = a?.exercises.length ?? 0;
  // The tap draws only the window and its header (one light frame, so the slide starts at once); the first two exercises
  // follow on the next two frames, while the window is still mostly below the screen edge — the slide itself runs on the
  // compositor, so this work never shows as a stutter. Building them in the tap was most of the pause after it.
  const [shown, setShown] = useState(0);
  const lead = Math.min(2, total0);
  useEffect(() => {
    if (shown >= lead) return;
    const id = requestAnimationFrame(() => setShown((n) => Math.max(n, Math.min(lead, n + 1))));
    return () => cancelAnimationFrame(id);
  }, [shown, lead]);
  const [ready, setReady] = useState(false);

  const listDoneAtOpen = useRef(total0 <= 2);
  // the exercises drawn in the very first frame ride up with the window; any that arrive after it fade in
  const firstIds = useRef(new Set((a?.exercises ?? []).slice(0, 2).map((e) => e.id)));
  const [listDone, setListDone] = useState(listDoneAtOpen.current); // stays true once the list has been complete (adding an exercise later never hides the buttons)
  useEffect(() => { if (!listDone && shown >= total0) setListDone(true); }, [shown, total0, listDone]);
  // once the opening has built the list, an exercise that joins it (added, or brought back by Undo) unfolds into place
  const listSettled = useRef(false);
  useEffect(() => { if (listDone) listSettled.current = true; }, [listDone]);
  // built ahead for a workout not started yet (WorkoutHost): the one you start takes this window over, and its list comes in
  // exactly as on a first opening
  const sid = a?.id ?? null;
  const [sidSeen, setSidSeen] = useState(sid);
  if (sidSeen !== sid) {
    setSidSeen(sid);
    if (sidSeen === WK_GHOST) {
      listDoneAtOpen.current = total0 <= 2;
      firstIds.current = new Set((a?.exercises ?? []).slice(0, 2).map((e) => e.id));
      listSettled.current = false;
      setListDone(listDoneAtOpen.current); setShown(0);
    }
  }
  // the rest-over sound, made while nothing else is happening: once the list is built (made as soon as the window had
  // landed, it ran while the rest of the list was still arriving, ~11 ms at once on the phone)
  useEffect(() => { if (ready && listDone) prepareRestAudio(); }, [ready, listDone]);
  useEffect(() => {
    if (sid === WK_GHOST) return; // (nothing to stage yet)
    if (p.get() >= 0.97) { setReady(true); return; }
    const off = p.on('change', (v) => { if (v >= 0.97) { setReady(true); off(); } });
    const fallback = setTimeout(() => setReady(true), 900);
    return () => { off(); clearTimeout(fallback); };
    // eslint-disable-next-line
  }, [sid === WK_GHOST]);
  useEffect(() => {
    if (!ready || shown < lead || shown >= total0) return;
    const id = setTimeout(() => setShown((n) => n + 1), 70);
    return () => clearTimeout(id);
  }, [ready, shown, total0, lead]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ov = useUI.getState().overlays;
      if (ov[ov.length - 1]?.type !== 'workout' || document.querySelector('.sheet')) return; // a sheet above the workout (or one of its own menus) handles its own Escape
      if (e.key === 'Escape' && !(e.target as HTMLElement)?.closest?.('input,textarea')) close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pop]);

  if (!a) return null; // finish/discard own the navigation

  const total = sessionSetCount(a.exercises, false);
  const done = sessionSetCount(a.exercises, true);
  const paused = !!a.pausedAt;

  const finish = () => {
    if (done === 0) { setConfirm('discard'); return; }
    if (done < total) { setConfirm('finish'); return; }
    haptic('confirm'); doFinish();
  };
  const doFinish = () => {
    const r = useStore.getState().finishActive();
    if (r) swap(1, 'summary', { sessionId: r.id }); // its medal lands with the finish (or record) feel
  };
  // the bar's "next set": scroll it into the middle and let it glow for a moment
  const jumpTo = (setId: string) => {
    if (view === 'focus' && focusApi.current) { focusApi.current.jumpToSet(setId); return; }
    const row = body.current?.querySelector<HTMLElement>(`[data-set="${setId}"]`);
    if (!row) return;
    row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    row.classList.remove('wk-flash'); void row.offsetWidth; row.classList.add('wk-flash');
  };
  const doDiscard = () => {
    const d = useStore.getState().discardActive();
    pop();
    if (d) toast(t('Workout discarded'), { actionLabel: t('Undo'), onAction: () => useStore.getState().restoreActive(d), duration: 8000 });
  };

  const menuEx = menu ? a.exercises.find((e) => e.id === menu) : undefined;

  return (
    <>
      <motion.div
        role={hidden ? undefined : 'dialog'} aria-modal={hidden ? undefined : 'true'} aria-label={t('Active workout')} aria-hidden={hidden || undefined}
        ref={dialogRef} data-hue="train" className={`wk-card${hidden ? ' wk-off' : ''}`} style={{ zIndex: z, y: dragT }}
      >
        <WkLive.Provider value={!hidden}>
        <motion.div ref={shadeRef} className="wk-shade" aria-hidden style={{ transform: sheetT, opacity: shadeO }} />
        <motion.div ref={sheetRef} className="wk-sheet" style={{ transform: sheetT }}>
          <div className="wk-solid" aria-hidden><div className="aurora-lite"><Breath hold={paused || covered} /></div><i ref={topRef} className="wk-top" /></div>
        <div className="wk-window" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, paddingTop: 'var(--sat)' }}>
          {/* header */}
          {/* no backdrop of its own: the list scrolls in its own box below, so the header sits straight on the window's light
              (a solid band here cut the colour field off in a hard line under the grabber) */}
          <div className="wk-head-wrap" style={{ touchAction: 'none' }}>
            <div className="wk-head">
              {/* the finger is down: the page behind starts drawing itself again (unseen) so the window can move the moment it lifts */}
              <button className="icon-btn flat press wk-min" aria-label={t('Minimise workout')} onPointerDown={warmUp} onPointerCancel={() => warmStage(false)} onClick={() => close()}><Icon name="chevD" /></button>
              <div className="wk-head-mid">
                {renaming ? (
                  <input className="input" autoFocus style={{ minHeight: 34, padding: '4px 10px' }} defaultValue={a.name} onBlur={(e) => { useStore.getState().mutateActive((x) => ({ ...x, name: e.target.value.trim() })); setRenaming(false); }} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} aria-label={t('Workout name')} />
                ) : (
                  <button className="wk-title display press" onClick={() => setRenaming(true)}>{a.name || t('Workout')}</button>
                )}
                {/* the clock and the tally on one line: time, sets, volume */}
                <div className="wk-meta num">
                  <span className={`wk-clock${paused ? ' paused' : ''}`}><Clock /></span>
                  <span className="wk-meta-rest">{total ? <><Roll text={String(done)} />/{total} {t('sets')}{done > 0 && <> · <Roll text={fmtNum(Math.round(kgToDisplay(sessionVolume(a.exercises), weightUnit)), lang, 0)} /> {weightUnit}</>}</> : t('No sets yet')}</span>
                  {paused && <span className="wk-paused">{t('Paused')}</span>}
                  {typing && a.rest && <RestInline />}
                </div>
              </div>
              {a.exercises.length > 0 && (
                <button className="icon-btn flat press wk-view" onClick={switchView} aria-label={view === 'list' ? t('Focus view') : t('List view')} aria-pressed={view === 'focus'}>
                  <Icon name={view === 'list' ? 'focus' : 'list'} size={20} />
                </button>
              )}
              <button className="icon-btn flat press wk-pause" onClick={() => { haptic('light'); paused ? useStore.getState().resumeActive() : useStore.getState().pauseActive(); }} aria-label={paused ? t('Resume') : t('Pause')}>
                <Icon name={paused ? 'play' : 'pause'} size={18} />
              </button>
              {/* the one Finish: muted until a set is logged, then the accent; it glows once every set is ticked */}
              <button ref={finishBtn} className={`btn sm press wk-finish ${total > 0 && done === total ? 'primary ready' : 'muted'}`} onClick={finish}>{t('Finish')}</button>
            </div>
            {/* grows by scaling (the compositor's job); it animated its width, which made every set ticked lay the page out again */}
            <div className="wk-progress"><i style={{ transform: `scaleX(${total ? done / total : 0})` }} /></div>
          </div>

          {/* body: the list, and Focus over it when chosen (the list stays, faded out, so switching back keeps your place) */}
          <div className="wk-views">
          <motion.div ref={body} style={{ flex: 1, overflowY: 'auto', padding: '4px 16px 0', paddingBottom: bodyPad, overscrollBehavior: 'contain' }} className={`hide-scroll wk-list${a.exercises.length === 0 ? ' is-empty' : ''}${view === 'focus' && a.exercises.length > 0 && (focusIn || shared !== 'in') ? ' wk-away' : ''}${shared === 'back' ? ' back' : ''}`}>
            {a.exercises.length === 0 && (
              // nothing yet: one calm, centred moment (a soft mark, the line, then the button) instead of a top-heavy
              // block over an empty half screen
              <div className="wk-empty">
                <div className="wk-empty-mark" aria-hidden><Icon name="dumbbell" size={40} /></div>
                <div className="display display-sm" style={{ fontStyle: 'italic' }}>{t('Empty session')}</div>
                <div className="small t2" style={{ marginTop: 6 }}>{t('Add your first exercise, or tell the orb what you did.')}</div>
              </div>
            )}
            {/* plain blocks: an exercise added later (or brought back by Undo) unfolds, a removed one folds away (Collapse), so the
                list below opens and closes around it instead of jumping — nothing re-measures the page */}
            <AnimatePresence initial={false}>
              {a.exercises.slice(0, shown).map((se, idx) => (
                <Collapse key={se.id} appear={listSettled.current}>
                  <ExerciseBlock se={se} ex={exMap.get(se.exerciseId)} onMenu={setMenu} appear={!firstIds.current.has(se.id)}
                    linkedPrev={!!(idx > 0 && se.supersetGroup && a.exercises[idx - 1].supersetGroup === se.supersetGroup)}
                    linkedNext={!!(idx < a.exercises.length - 1 && se.supersetGroup && a.exercises[idx + 1].supersetGroup === se.supersetGroup)} />
                </Collapse>
              ))}
            </AnimatePresence>
            {listDone && (
            <motion.div initial={listDoneAtOpen.current ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={SOFT}>
            <button className={`btn block press${a.exercises.length === 0 ? ' primary' : ''}`} style={{ marginTop: a.exercises.length ? 20 : 4 }} onClick={() => push('exercisePicker', { mode: 'add' })}><Icon name="plus" size={18} /> {t('Add exercise')}</button>
            <button className="btn ghost danger block press" style={{ marginTop: 10 }} onClick={() => setConfirm('discard')}>{t('Discard workout')}</button>
            </motion.div>
            )}
          </motion.div>
          {focusBuilt && a.exercises.length > 0 && (
            <div ref={focusEl} className={`wk-focus${focusIn && view === 'focus' ? ' on' : ''}${shared === 'in' ? ' shared' : ''}`}>
              <FocusView exMap={exMap} onMenu={setMenu} pad={focusPad} apiRef={focusApi} />
            </div>
          )}
          </div>

          {/* the workout's own dock, where the tab bar sits: what's next, the rest timer, and the orb */}
          <WorkoutBar engage={engage} exMap={exMap} focus={view === 'focus'} onDone={pointToFinish} onJump={jumpTo} />
          </div>
        </div>
          </motion.div>
        </WkLive.Provider>
        </motion.div>

      <AnimatePresence>
        {menuEx && <ExerciseMenu key="menu" se={menuEx} ex={exMap.get(menuEx.exerciseId)} onClose={() => setMenu(null)} />}
        {confirm && (
          <Sheet key="confirm" size="small" onClose={() => setConfirm(null)} label={confirm === 'finish' ? t('Finish workout?') : t('Discard workout?')} nested>
            <SheetHead title={confirm === 'finish' ? t('Finish workout?') : t('Discard workout?')} onClose={() => setConfirm(null)} />
            <div className="sheet-body">
              {/* the session at a glance, then one clear choice */}
              <div className="wk-end-stats">
                <div><span className="micro">{t('Time')}</span><b className="num">{fmtDuration(elapsedMs(a) / 1000)}</b></div>
                <div><span className="micro">{t('Sets')}</span><b className="num">{done}<span className="t3">/{total}</span></b></div>
                <div><span className="micro">{t('Volume')}</span><b className="num">{fmtNum(Math.round(kgToDisplay(sessionVolume(a.exercises), weightUnit)), lang, 0)}<span className="t3"> {weightUnit}</span></b></div>
              </div>
              <p className="small t2 wk-end-note">{confirm === 'finish' ? t(total - done === 1 ? '1 set isn’t ticked. Only the ticked ones are saved.' : '{n} sets aren’t ticked. Only the ticked ones are saved.', { n: total - done }) : t('Nothing has been logged yet. You can undo this right after.')}</p>
              <div className="stack gap8">
                {confirm === 'finish' ? (
                  <button className="btn primary block press wk-end-btn" style={{ ['--i' as string]: 0 }} onClick={() => { haptic('confirm'); setConfirm(null); doFinish(); }}>{done === 1 ? t('Finish and save 1 set') : t('Finish and save {n} sets', { n: done })}</button>
                ) : (
                  <button className="btn block danger press wk-end-btn" style={{ ['--i' as string]: 0 }} onClick={() => { haptic('confirm'); setConfirm(null); doDiscard(); }}>{t('Discard workout')}</button>
                )}
                <button className="btn block ghost press wk-end-btn" style={{ ['--i' as string]: 1 }} onClick={() => setConfirm(null)}>{t('Keep training')}</button>
              </div>
            </div>
          </Sheet>
        )}
      </AnimatePresence>
    </>
  );
}

/**
 * The workout's living light: the top light of the window breathes very slowly (a stepped opacity change, about 14
 * tiny steps a second, so it never redraws the screen every frame) and grows warmer as the session goes on, fully warm after
 * an hour. Off with Settings → Background glow → Off (it lives in the colour field); it holds still while the workout is
 * paused, minimised, or another screen covers it. Only opacity changes; the bar's frost sits far below it.
 */
function Breath({ hold }: { hold: boolean }) {
  const a = useActive();
  const live = useContext(WkLive);
  const now = useNow(60_000, !!a && live && !hold);
  const warm = a ? Math.min(1, elapsedMs(a, now) / 3_600_000) : 0;
  return <i className={`wk-breath${hold || !live ? ' hold' : ''}`} style={{ ['--warm' as string]: warm.toFixed(3) }}><b /></i>;
}

/** A number that rolls up (or down) when it changes, like the steppers; still on the first draw. */
// The ticking parts live in their own small components, so the clock re-renders a line of text four times a
// second instead of the whole workout screen.
function Clock() {
  const a = useActive();
  const live = useContext(WkLive);
  const now = useNow(250, !!a && live);
  return <>{a ? fmtDuration(elapsedMs(a, now) / 1000) : ''}</>;
}

/** The rest timer as a few words in the header, while the keyboard is up. */
function RestInline() {
  const t = useT();
  const a = useActive();
  const live = useContext(WkLive);
  const now = useNow(250, !!a?.rest && live);
  if (!a?.rest) return null;
  const left = (a.pausedAt ? a.rest.endsAt : a.rest.endsAt - now) / 1000;
  return <span className="wk-rest-inline" style={{ color: left <= 0 ? 'var(--ok)' : 'var(--ac-text)', fontWeight: 650 }}> · {left <= 0 ? t('Rest over') : `${t('Rest')} ${fmtDuration(Math.ceil(left))}`}</span>;
}

/**
 * The workout's own dock, in the tab bar's place and material. On the left, what's next ("Next · Set 3 · 80 kg × 8" over
 * the exercise): tap it and the list scrolls to that set. While you rest the whole bar fills with the accent as the rest
 * passes, under the time; tap it then for −15 / +15 / Skip. When the rest is over it turns green — "Go · Bench Press" — and
 * stays so until that set is ticked. The orb sits at its right end: tap it to say your sets. It is there from the first
 * frame, so the orb glides into it with the window instead of jumping to a button at the end of the list.
 */
function WorkoutBar({ engage, exMap, focus, onDone, onJump }: { engage: Engage; exMap: Map<string, Exercise>; focus: boolean; onDone: () => void; onJump: (setId: string) => void }) {
  const t = useT();
  const lang = useLang();
  const push = useUI((u) => u.push);
  const a = useActive();
  const unit = useStore((s) => s.settings.units.weight);
  const live = useContext(WkLive);
  const now = useNow(250, !!a?.rest && !a?.pausedAt && live);
  const [panel, setPanel] = useState(false);
  useEffect(() => { if (!panel) return; const id = setTimeout(() => setPanel(false), 4000); return () => clearTimeout(id); }, [panel, a?.rest?.endsAt, a?.rest?.total]);
  const resting = !!a?.rest;
  useEffect(() => { if (!resting) setPanel(false); }, [resting]);
  const page = useFocusPage();
  if (!a) return null;
  const nx = nextSetOf(a);
  // In Focus, when the next set is on the page you're looking at, that row is already highlighted there: the bar tells you
  // what comes after this exercise instead, and a tap glides to it.
  const after = focus && nx && !a.rest && page === nx.se.id ? upNextOf(a, nx.se.id) : null;
  const shown = after ?? nx;
  const ex = shown ? exMap.get(shown.se.exerciseId) : undefined;
  const name = ex ? exName(ex, lang) : '';
  const rest = a.rest;
  const left = rest ? (a.pausedAt ? rest.endsAt : rest.endsAt - now) / 1000 : 0;
  const over = !!rest && left <= 0;
  const kg = shown ? (shown.set.weightKg ?? shown.set.target?.weightKg) : undefined;
  const reps = shown ? (shown.set.reps ?? shown.set.target?.repMax) : undefined;
  const target0 = [kg !== undefined ? `${fmtNum(kgToDisplay(kg, unit), lang, 2)} ${unit}` : '', reps ? `× ${reps}` : ''].filter(Boolean).join(' ');
  // up next with nothing planned for its weight or reps: how many sets it holds
  const leftN = after ? after.se.sets.filter((x) => !x.done).length : 0;
  const target = target0 || (after ? `${leftN} ${t(leftN === 1 ? 'set' : 'sets')}` : '');
  const setWord = nx ? (nx.label === 'W' ? t('Warm-up') : `${t('Set')} ${nx.label}`) : '';
  const empty = !a.exercises.some((e) => e.sets.length > 0);
  // every set ticked: done, even while a rest is still counting (there's nothing left to rest for)
  const state: 'next' | 'rest' | 'go' | 'done' | 'empty' = empty ? 'empty' : !nx ? 'done' : rest ? (over ? 'go' : 'rest') : 'next';
  const tap = () => {
    if (state === 'rest') setPanel((v) => !v);
    else if (state === 'done') onDone();
    else if (state === 'empty') { orbTap(1); push('voice', { mode: 'workout' }); }
    else if (shown) onJump(shown.set.id);
  };
  const ofN = nx ? nx.se.sets.filter((x) => x.type === 'working').length : 0;
  const top = state === 'next' ? (after ? t('Up next') : `${t('Next set')} · ${nx!.label === 'W' ? t('Warm-up') : t('{n} of {m}', { n: nx!.label, m: ofN })}`)
    : state === 'rest' ? (panel ? (a.pausedAt ? `${t('Rest')} · ${t('Paused')}` : t('Rest')) : nx ? `${t('Rest')} · ${t('Next')}: ${name}` : t('Rest'))
    : state === 'go' ? `${t('Rest over')}${nx ? ` · ${setWord}` : ''}`
    : state === 'empty' ? `“${t('Bench press 80 kg for 8, 8, 6')}”`
    : t('All sets done');
  const big = state === 'next' ? name
    : state === 'rest' ? (a.pausedAt && !panel ? `${fmtDuration(Math.ceil(left))} · ${t('Paused')}` : fmtDuration(Math.ceil(left)))
    : state === 'go' ? (nx ? name : t('Go'))
    : state === 'empty' ? t('Tell the orb what you did')
    : `${sessionSetCount(a.exercises, true)} ${t('sets')} · ${fmtNum(Math.round(kgToDisplay(sessionVolume(a.exercises), unit)), lang, 0)} ${unit}`;
  return (
    <div className="wk-bar-wrap">
      {/* never re-keyed: the orb's slot lives in here, and remounting it made the orb leave and land again (a tick, a hop) */}
      <div className={`wk-bar ${state}`}>
        {/* the frost, tint and rim are a layer of their own under everything: the orb's button and the words sit beside it,
            not inside the blurred element (Chrome on the phone drew a darker square where the orb is) */}
        <span className="wk-bar-even" aria-hidden />
        <span className="wk-bar-surface glass" aria-hidden />
        <span className="wk-bar-clip" aria-hidden><RestFill state={state} endsAt={rest?.endsAt} total={rest?.total} paused={!!a.pausedAt} /></span>
        <button className="wk-bar-main press" onClick={tap} aria-expanded={state === 'rest' ? panel : undefined}
          aria-label={state === 'rest' ? `${t('Rest')} ${fmtDuration(Math.ceil(left))}` : `${top}. ${big}${(state === 'next' || state === 'go') && target ? `, ${target}` : ''}`}>
          <SwapText k={`${state}${after ? after.se.id : ''}`} tone={state}>
            <span className="wk-bar-top">{top}</span>
            <span className="wk-bar-big num">{state === 'next' || (state === 'go' && nx) ? <><Fit className="wk-bar-name" text={name} />{target && <span className="wk-bar-tgt">{target}</span>}</>
              : state === 'rest' ? (!a.pausedAt && left <= 3
                // the last three seconds swell on each tick; before that the seconds roll down
                ? <span key={Math.ceil(left)} className="wk-tick">{big}</span> : <Roll key="r" text={big} />)
              : state === 'done' ? <Roll text={big} /> : big}</span>
          </SwapText>
        </button>
        <button className="wk-bar-orb" aria-label={t('Dictate sets')} onPointerDown={() => orbPress(true)} onPointerUp={() => orbPress(false)} onPointerCancel={() => orbPress(false)} onPointerLeave={() => orbPress(false)}
          onClick={() => { orbTap(1); push('voice', { mode: 'workout' }); }}>
          <SphereSlot id="workout" priority={5} engage={engage} style={{ position: 'absolute', inset: -4 }} />
        </button>
        {/* −15 / +15 / Skip slide in inside the bar itself, beside the time (a pill floating above it covered the sets) */}
        <AnimatePresence>
          {panel && state === 'rest' && (
            <motion.div key="ctl" className="wk-bar-ctl" initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={SOFT}>
              <button className="wk-ctl press num" onClick={() => { haptic('select'); adjustRest(-15); }} aria-label={t('15 seconds less')}>−15</button>
              <button className="wk-ctl press num" onClick={() => { haptic('select'); adjustRest(15); }} aria-label={t('15 seconds more')}>+15</button>
              <button className="wk-ctl skip press" onClick={() => { haptic('light'); skipRest(); setPanel(false); }}>{t('Skip')}</button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/** Text measured off the page (Fit). */
let measureCtx: CanvasRenderingContext2D | null = null;
const measurer = () => (measureCtx ??= document.createElement('canvas').getContext('2d')!);
/**
 * One line that ends in a clean "…" when it doesn't fit, never in "Press, …" (the browser's own ellipsis keeps a trailing
 * comma or space). Measured only when the text or the room for it changes.
 */
function Fit({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const cut = (n: number) => `${text.slice(0, n).replace(/[\s,.;:·–—-]+$/u, '')}…`;
    // Nothing is read from the page here. The room is read when the browser reports the line's size, right after its own
    // layout (free then), and the shorter tries are measured off the page. Reading widths here laid the whole window out an
    // extra time (and once per try), in the tap that ticks a set and in the first frame of opening.
    let whole = true, font = '', spacing = '', parentW = -1;
    const fit = () => {
      const room = el.clientWidth;
      if (el.scrollWidth <= room + 0.5) return;
      const c = measurer();
      if (!font) { const cs = getComputedStyle(el); font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`; spacing = cs.letterSpacing; }
      c.font = font; c.letterSpacing = spacing;
      const fits = (n: number) => c.measureText(cut(n)).width <= room - 1;
      let lo = 1, hi = text.length - 1; // the longest start that fits with its "…"
      while (lo < hi) { const m = (lo + hi + 1) >> 1; if (fits(m)) lo = m; else hi = m - 1; }
      whole = false; el.textContent = cut(lo);
    };
    // the line shrinks to a cut name, so only the whole name tells the room; the room changes only with the parent's width
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        if (e.target === el) { if (whole) fit(); continue; }
        const w = e.contentRect.width;
        if (parentW >= 0 && w !== parentW) reset();
        parentW = w;
      }
    });
    const reset = () => { whole = true; el.textContent = text; ro.unobserve(el); ro.observe(el); };
    el.textContent = text;
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);
    if (document.fonts && document.fonts.status !== 'loaded') void document.fonts.ready.then(() => { if (el.isConnected) { font = ''; reset(); } });
    return () => ro.disconnect();
  }, [text]);
  return <span ref={ref} className={className} />;
}

/**
 * The bar's two lines, swapped as one: when what the bar says changes (a set ticked, the rest over, skipped), the old
 * words fade up and out while the new ones rise in, in the same place. The old lines used to be removed at once, so the
 * bar stood empty for a frame or two before the new ones faded in.
 */
function SwapText({ k, tone, children }: { k: string; tone: string; children: React.ReactNode }) {
  const cur = useRef<{ k: string; tone: string; node: React.ReactNode }>({ k, tone, node: children });
  const [gone, setGone] = useState<{ k: string; tone: string; node: React.ReactNode; n: number } | null>(null);
  const n = useRef(0);
  if (cur.current.k !== k) {
    const was = cur.current;
    n.current++;
    // derived during render (React's "store info from previous renders"): the old lines are drawn in the same frame the new ones arrive
    setGone({ ...was, n: n.current });
  }
  cur.current = { k, tone, node: children };
  useEffect(() => {
    if (!gone) return;
    const id = setTimeout(() => setGone((g) => (g && g.n === gone.n ? null : g)), 420);
    return () => clearTimeout(id);
  }, [gone]);
  return (
    <>
      {gone && gone.k !== k && <span key={`g${gone.n}`} className={`wk-bar-txt t-${gone.tone} out`} aria-hidden>{gone.node}</span>}
      <span key={k} className={`wk-bar-txt t-${tone}`}>{children}</span>
    </>
  );
}

/**
 * The rest bar's fill. The browser grows it from where the rest stands to the end in one linear animation (compositor,
 * full refresh rate), instead of the page re-aiming it four times a second. It restarts only when the rest itself changes
 * (started, ±15, paused, resumed); when a rest is skipped it slides back instead of vanishing.
 */
function RestFill({ state, endsAt, total, paused }: { state: string; endsAt?: number; total?: number; paused: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const anim = useRef<{ a: Animation; from: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const prev = anim.current;
    if (state === 'rest' && endsAt !== undefined && total) {
      const leftMs = paused ? endsAt : endsAt - Date.now();
      const from = Math.min(1, Math.max(0, 1 - leftMs / (total * 1000)));
      const a = el.animate([{ transform: `translateX(${(from - 1) * 100}%)` }, { transform: 'translateX(0%)' }], { duration: Math.max(1, leftMs), easing: 'linear', fill: 'forwards' });
      if (paused) a.pause();
      anim.current = { a, from };
      prev?.a.cancel();
      return;
    }
    if (state === 'go') return; // it ended at full: the CSS keeps it there, glowing in the accent
    anim.current = null;
    if (!prev) return;
    const pr = prev.a.effect?.getComputedTiming().progress ?? 1;
    const now = prev.from + (1 - prev.from) * Math.min(1, pr);
    prev.a.cancel();
    if (now > 0.01) el.animate([{ transform: `translateX(${(now - 1) * 100}%)` }, { transform: 'translateX(-100%)' }], { duration: 300, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
  }, [state, endsAt, total, paused]);
  return <i ref={ref as React.RefObject<HTMLElement>} className="wk-bar-fill" />;
}

// ── exercise block ──────────────────────────────────────────

// memoised: ticking a set re-renders that exercise only
export const ExerciseBlock = memo(function ExerciseBlock({ se, ex, linkedPrev, linkedNext, onMenu, appear }: { se: SessionExercise; ex?: Exercise; linkedPrev: boolean; linkedNext: boolean; onMenu: (id: string) => void; appear?: boolean }) {
  const t = useT();
  const lang = useLang();
  const settings = useStore((s) => s.settings);
  const allSessions = useStore((s) => s.sessions);
  // while a just-finished workout slides away, its own saved copy must not become its "last time" (the Prev column and
  // the plan line changed under your eyes as it left)
  const frozen = useContext(WkFrozen);
  const sessions = useMemo(() => (frozen ? allSessions.filter((x) => x.id !== frozen.id) : allSessions), [allSessions, frozen]);
  const push = useUI((u) => u.push);
  const last = useMemo(() => lastPerformance(se.exerciseId, sessions), [se.exerciseId, sessions]);
  const lastWorking = last?.sets.filter(countable) ?? [];
  const increments = useStore((s) => s.increments);
  const sugg = useMemo(() => (ex && ex.logType === 'weightReps' ? suggestProgression(ex, historyOf(se.exerciseId, sessions), repRange(se.sets), incrementFor(ex, increments, settings.plateStep)) : undefined),
    [ex, se.exerciseId, sessions, se.sets, increments, settings.plateStep]); // eslint-disable-line react-hooks/exhaustive-deps
  const u = settings.units;
  let workIdx = -1;
  // sets that were there when this block was drawn don't grow in; one added later does
  const known = useRef(new Set(se.sets.map((x) => x.id)));
  useEffect(() => { for (const x of se.sets) known.current.add(x.id); });
  const kgTxt = (kg: number) => `${fmtNum(kgToDisplay(kg, u.weight), lang, 2)} ${u.weight}`;
  // one short line: what to do today and why, in a neutral tint (the numbers are already in the rows)
  const rv = sugg?.reasonVars ?? {};
  const reason = !sugg ? '' : sugg.kind === 'add-weight' ? t('+{inc} · set 1 hit {max}', { inc: kgTxt(Number(rv.inc)), max: rv.max ?? '' })
    : sugg.kind === 'add-reps' ? (rv.reps !== undefined ? t('Aim for {reps} reps', { reps: rv.reps }) : t('Same weight · +1 rep'))
    : sugg.kind === 'hold' ? t('Same weight · build set 1 to {min}', { min: rv.min ?? '' })
    : sugg.kind === 'stalled' ? t('Stalled at {w} · 3 sessions', { w: kgTxt(Number(rv.w)) })
    : t('First time · aim {min}–{max} reps', { min: rv.min ?? '', max: rv.max ?? '' });
  const REASON_ICON = { 'add-weight': 'arrowUp', 'add-reps': 'plus', hold: 'repeat', stalled: 'info', first: 'sparkle' } as const;
  const complete = se.sets.length > 0 && se.sets.every((x) => x.done);
  // the last set ticked while you watch: the card settles with a brief warm glow and one soft sheen (not when it is drawn
  // already complete, and not when a set is unticked)
  // (a set ticked, not the last open set deleted: that also makes it complete, and is no moment)
  const doneN = se.sets.filter((x) => x.done).length;
  const was = useRef({ complete, doneN });
  const [settle, setSettle] = useState(0);
  useEffect(() => { if (complete && !was.current.complete && doneN > was.current.doneN) setSettle((n) => n + 1); was.current = { complete, doneN }; }, [complete, doneN]);
  // something you told the Coach about this exercise ("left shoulder hurts on overhead press"): shown beside it, with a swap.
  // A joined string, so ticking a set elsewhere doesn't redraw this block.
  const flagged = useStore((s) => s.memory.filter((m) => m.exerciseIds?.includes(se.exerciseId)).map((m) => m.text).join('\n'));

  return (
    <section data-flip={se.id} className={`wk-block${appear ? ' in' : ''}${complete ? ' complete' : ''}`} style={{ position: 'relative', marginTop: linkedPrev ? 0 : 18, paddingLeft: se.supersetGroup ? 14 : 0 }}>
      {se.supersetGroup && <div aria-hidden style={{ position: 'absolute', left: 0, top: linkedPrev ? -4 : 6, bottom: linkedNext ? -14 : 6, width: 3, borderRadius: 3, background: 'var(--ac)', opacity: 0.85 }} />}
      {se.supersetGroup && !linkedPrev && <div className="micro accent" style={{ marginBottom: 4 }}>{t('Superset')}</div>}
      <div className="wk-card-wrap">
      <div className="plinth" style={{ padding: '14px 12px 12px', borderRadius: 'var(--r-lg)' }}>
        <div className="row-flex between" style={{ alignItems: 'flex-start', gap: 8 }}>
          <button className="grow press" style={{ textAlign: 'left', minWidth: 0 }} onClick={() => ex && push('exercise', { id: ex.id })}>
            {/* a long name wraps (two lines at most look calm); it never pushes the card wider than the screen */}
            <div className="display display-sm wk-ex-title">{ex ? exName(ex, lang) : t('Unknown exercise')}<span className="wk-ex-done" aria-hidden><Icon name="check" size={14} sw={3} /></span></div>
            <div className="wk-muscles">{ex?.muscles.slice(0, 2).map((m) => t(MUSCLE_LABEL[m])).join(' · ')}</div>
          </button>
          <button className="icon-btn flat press" onClick={() => onMenu(se.id)} aria-label={t('Exercise options')}><Icon name="more" /></button>
        </div>
        {se.note && <div className="small t2" style={{ marginTop: 8, padding: '8px 10px', background: 'var(--bg-2)', borderRadius: 10 }}>{se.note}</div>}
        {flagged && (
          <div className="wk-flag xs">
            <Icon name="note" size={14} style={{ flex: 'none', marginTop: 1 }} />
            <span className="grow">{flagged.split('\n').join(' · ')}</span>
            <button className="chip sm press" onClick={() => push('exercisePicker', { mode: 'replace', seId: se.id, forExercise: ex })}>{t('Swap')}</button>
          </div>
        )}
        {sugg && reason && (
          <div className="wk-reason num"><Icon name={REASON_ICON[sugg.kind]} size={13} style={{ flex: 'none' }} /><span>{reason}</span></div>
        )}

        <div className="set-head" style={{ display: 'grid', gridTemplateColumns: gridCols(ex, settings.effort), gap: 8, marginTop: 12 }}>
          <span className="micro">{t('Set')}</span><span className="micro">{t('Prev')}</span>
          {headers(ex, u, t).map((h) => <span key={h} className="micro" style={{ textAlign: 'center' }}>{h}</span>)}
          {settings.effort !== 'off' && <span className="micro" style={{ textAlign: 'center' }}>{settings.effort.toUpperCase()}</span>}
          <span />
        </div>
        <AnimatePresence initial={false}>
          {se.sets.map((set) => {
            if (set.type === 'working') workIdx++;
            return <Collapse key={set.id} appear={!known.current.has(set.id)}><SetRow se={se} set={set} ex={ex} label={set.type === 'warmup' ? 'W' : String(workIdx + 1)} prev={set.type === 'working' ? lastWorking[Math.min(workIdx, lastWorking.length - 1)] : undefined} restDefault={settings.restDefaultSec} /></Collapse>;
          })}
        </AnimatePresence>
        <div className="row-flex" style={{ gap: 8, marginTop: 10 }}>
          <button className="btn sm press grow wk-add-set" onClick={() => { haptic('light'); addSet(se.id); }}><Icon name="plus" size={16} /> {t('Set')}</button>
          {(!ex || ex.logType === 'weightReps' || ex.logType === 'bodyweightReps' || ex.logType === 'assisted') && <button className="btn sm ghost press" onClick={() => addSet(se.id, 'warmup')}>{t('+ Warm-up')}</button>}
        </div>
      </div>
      {/* laid over the card, not inside it: the card's frosted glass then never has to be redrawn while the glow plays */}
      {settle > 0 && complete && <span key={settle} className="wk-settle" aria-hidden><i /></span>}
      </div>
    </section>
  );
});

/** Bring a set row into view if it sits under the workout bar or just below the screen. Only ever scrolls down, and only a
 *  short way: it follows you to the next set, it never yanks the list somewhere you didn't look. */
function revealSet(id: string) {
  // the page you're on in Focus, else the list
  const list = document.querySelector<HTMLElement>('.wk-focus.on .wk-page.cur') ?? document.querySelector<HTMLElement>('.wk-list');
  const row = list?.querySelector<HTMLElement>(`[data-set="${id}"]`);
  if (!list || !row) return;
  const r = row.getBoundingClientRect(), box = list.getBoundingClientRect();
  const bar = document.querySelector('.wk-bar-wrap .wk-bar')?.getBoundingClientRect();
  const bottom = Math.min(box.bottom, bar ? bar.top - 16 : box.bottom);
  const dy = r.bottom - bottom;
  if (dy > 0 && dy < box.height * 0.8) list.scrollBy({ top: dy + 20, behavior: 'smooth' });
}

function gridCols(ex: Exercise | undefined, effort: string) {
  // minmax(0, 1fr): an input never pushes the row wider than the card (plain 1fr let its content decide)
  const extra = effort !== 'off' ? ' 52px' : '';
  const lt = ex?.logType ?? 'weightReps';
  if (lt === 'duration') return `34px 62px minmax(0, 1fr)${extra} 46px`;
  return `34px 62px minmax(0, 1fr) minmax(0, 1fr)${extra} 46px`;
}
function headers(ex: Exercise | undefined, u: { weight: string; distance: string }, t: (k: string) => string): string[] {
  const lt = ex?.logType ?? 'weightReps';
  if (lt === 'duration') return [t('Seconds')];
  if (lt === 'distance') return [u.distance.toUpperCase(), t('Min')];
  if (lt === 'bodyweightReps') return [`+${u.weight.toUpperCase()}`, t('Reps')];
  if (lt === 'assisted') return [`−${u.weight.toUpperCase()}`, t('Reps')];
  return [u.weight.toUpperCase(), t('Reps')];
}

// ── set row ─────────────────────────────────────────────────


const SetRow = memo(function SetRow({ se, set, ex, label, prev, restDefault }: { se: SessionExercise; set: SetRecord; ex?: Exercise; label: string; prev?: SetRecord; restDefault: number }) {
  const t = useT();
  const lang = useLang();
  const settings = useStore((s) => s.settings);
  const toast = useUI((u) => u.toast);
  const [open, setOpen] = useState(false);
  const [shake, setShake] = useState(0);
  const [burst, setBurst] = useState(0); // a ring that expands from the check each time a set is completed
  const [beat, setBeat] = useState<{ n: number; label: string } | null>(null); // you beat last time: gold burst + what you gained
  const [showGain, setShowGain] = useState(false);
  const [best, setBest] = useState(0); // a new best for this exercise: a gold light sweeps the row and a "New best" tag shows
  // the set to do next gets a quiet accent outline (a boolean, so only the two rows that change redraw)
  const current = useStore((s) => !set.done && nextSetOf(s.active)?.set.id === set.id);
  useEffect(() => { if (!beat) return; setShowGain(true); const id = setTimeout(() => setShowGain(false), 1500); return () => clearTimeout(id); }, [beat]);
  const lt = ex?.logType ?? 'weightReps';
  const u = settings.units;
  const wDisp = (kg?: number) => (kg === undefined ? undefined : Math.round(kgToDisplay(kg, u.weight) * 100) / 100);
  const target = set.target;
  const ph = {
    w: wDisp(target?.weightKg ?? prev?.weightKg),
    r: target?.repMax ? target.repMax : prev?.reps,
  };

  const eff = {
    weightKg: set.weightKg ?? target?.weightKg ?? prev?.weightKg,
    reps: set.reps ?? (target?.repMax ?? prev?.reps),
    durationSec: set.durationSec ?? prev?.durationSec,
    distanceM: set.distanceM ?? prev?.distanceM,
  };
  const valid = lt === 'duration' ? (eff.durationSec ?? 0) > 0 : lt === 'distance' ? (eff.distanceM ?? 0) > 0 || (eff.durationSec ?? 0) > 0 : (eff.reps ?? 0) > 0;

  const complete = () => {
    if (set.done) { patchSet(se.id, set.id, { done: false, completedAt: undefined }); skipRest(); return; }
    if (!valid) { setShake((n) => n + 1); haptic('warn'); toast(t('Enter reps first'), { tone: 'bad', duration: 1800 }); return; }
    const st = useStore.getState();
    if (st.active?.pausedAt) st.resumeActive();
    unlockRestAudio(); // a tap: the rest-over sound is allowed to play later
    if (st.active?.rest && st.active.rest.endsAt <= Date.now()) skipRest(); // "Go" has done its job
    // a new best beats everything before it (and is the bigger moment); otherwise beating last time gets its own small one
    const earlier = (st.active?.exercises ?? []).filter((e) => e.exerciseId === se.exerciseId).flatMap((e) => e.sets).filter((x) => x.id !== set.id);
    const pr = set.type === 'working' ? newBest(lt, eff, se.exerciseId, st.sessions, earlier) : null;
    const gain = !pr && set.type === 'working' ? beatLastTime(lt, eff, prev, u.weight, lang, t) : null;
    haptic(pr ? 'record' : gain ? 'gain' : 'set');
    setBurst(burst + 1); // the check pops and the row's light plays (a tap or Enter on the reps)
    if (pr) setBest(burst + 1);
    if (gain) setBeat((b) => ({ n: (b?.n ?? 0) + 1, label: gain }));
    patchSet(se.id, set.id, { ...eff, done: true, completedAt: Date.now() });
    // the next set comes into view if it is about to slip under the bar (never scrolls up, never jumps far)
    requestAnimationFrame(() => { const nx = nextSetOf(useStore.getState().active); if (nx) revealSet(nx.set.id); });
    if (set.type === 'working') {
      // supersets: rest only after the last exercise of the group has its turn
      const all = st.active?.exercises ?? [];
      const idx = all.findIndex((e) => e.id === se.id);
      const linkedNext = se.supersetGroup && all.slice(idx + 1).some((e) => e.supersetGroup === se.supersetGroup && e.sets.some((x) => !x.done));
      const lastOne = !(st.active?.exercises ?? []).some((e) => e.sets.some((x) => !x.done && x.id !== set.id));
      if (lastOne) skipRest(); // the workout is done: no rest, no alarm
      else if (!linkedNext) { startRest(se.restSec ?? restDefault, se.exerciseId); offerRestAlerts(useUI.getState().toast); }
      else skipRest();
    }
  };

  const remove = () => {
    const r = deleteSet(se.id, set.id);
    toast(t('Set removed'), { actionLabel: t('Undo'), onAction: r.restore });
  };

  const field = (value: number | undefined, placeholder: number | undefined, onChange: (v: number | undefined) => void, max: number, key: string, onEnter?: () => void) => (
    <div>
      <NumInput compact value={value} max={max} placeholder={placeholder !== undefined ? fmtNum(placeholder, lang, max) : '—'} onChange={onChange} label={key} onEnter={onEnter} />
    </div>
  );

  const fw = field(wDisp(set.weightKg), ph.w, (v) => patchSet(se.id, set.id, { weightKg: v === undefined ? undefined : displayToKg(v, u.weight) }), u.weight === 'lb' ? 1 : 2, t('Weight'));
  const fr = field(set.reps, ph.r, (v) => patchSet(se.id, set.id, { reps: v }), 0, t('Reps'), complete);

  return (
    // a plain row: it grows in and folds away inside its Collapse (no Motion layout — that re-measured the whole page)
    <div data-set={set.id}>
      <div className={`wk-set ${set.done ? 'done' : current ? 'current' : 'todo'}${set.type === 'warmup' ? ' warm' : ''}`} style={{ gridTemplateColumns: gridCols(ex, settings.effort) }}>
        {/* ticked: a soft light ripples out from the check across the row, and leaves the row's tint behind */}
        {burst > 0 && set.done && <span key={`w${burst}`} className="wk-set-clip" aria-hidden><i className={best === burst ? 'wk-set-sweep' : 'wk-set-wave'} /></span>}
        {best > 0 && best === burst && set.done && <span key={`b${best}`} className="wk-best" role="status">{t('New best')}</span>}
        <button className="press wk-set-n" aria-label={t('Set options')} aria-expanded={open} onClick={() => setOpen((v) => !v)}>{label}</button>
        <button className="num press wk-prev" disabled={!prev} onClick={() => prev && patchSet(se.id, set.id, { weightKg: prev.weightKg, reps: prev.reps, durationSec: prev.durationSec, distanceM: prev.distanceM })} aria-label={prev ? `${t('Use previous')}: ${fmtSet(prev, ex, u, lang, t)}` : undefined}>
          {/* a hold reads in the column's own unit ("66s" over SECONDS, not "1:06" beside a 66), as the records write it */}
          {prev ? (lt === 'duration' ? (prev.durationSec ? `${prev.durationSec}s` : '—') : fmtSet(prev, ex, u, lang, t).replace(/ (kg|lb)/, '')) : '—'}
        </button>
        {lt === 'duration' && field(set.durationSec, prev?.durationSec ?? 45, (v) => patchSet(se.id, set.id, { durationSec: v }), 0, t('Seconds'), complete)}
        {lt === 'distance' && <>
          {field(set.distanceM === undefined ? undefined : Math.round(mToDisplay(set.distanceM, u.distance) * 100) / 100, prev?.distanceM ? mToDisplay(prev.distanceM, u.distance) : undefined, (v) => patchSet(se.id, set.id, { distanceM: v === undefined ? undefined : displayToM(v, u.distance) }), 2, t('Distance'))}
          {field(set.durationSec === undefined ? undefined : Math.round((set.durationSec / 60) * 10) / 10, prev?.durationSec ? prev.durationSec / 60 : undefined, (v) => patchSet(se.id, set.id, { durationSec: v === undefined ? undefined : Math.round(v * 60) }), 1, t('Minutes'), complete)}
        </>}
        {(lt === 'weightReps' || lt === 'bodyweightReps' || lt === 'assisted') && <>{fw}{fr}</>}
        {settings.effort !== 'off' && <div><NumInput compact value={settings.effort === 'rpe' ? set.rpe : set.rir} max={1} placeholder="—" onChange={(v) => patchSet(se.id, set.id, settings.effort === 'rpe' ? { rpe: v } : { rir: v })} label={settings.effort.toUpperCase()} /></div>}
        {/* not logged: an empty outline (no check yet); logged: a filled check that draws itself in */}
        <motion.button key={shake} className={`press wk-check${set.done ? ' on' : ''}${set.done && burst > 0 ? ' fresh' : ''}`} aria-label={set.done ? t('Mark set not done') : t('Complete set')} aria-pressed={set.done} onClick={complete}
          animate={shake ? { x: [0, -5, 5, -3, 3, 0] } : undefined} transition={{ duration: 0.3 }}>
          {set.done && <svg key={`m${burst}`} className="wk-check-mark" viewBox="0 0 24 24" width="22" height="22" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" pathLength={1} fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" /></svg>}
          {burst > 0 && set.done && <motion.i key={burst} aria-hidden initial={{ scale: 0.9, opacity: 0.85 }} animate={{ scale: 2.2, opacity: 0 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }} style={{ position: 'absolute', inset: 0, borderRadius: 14, boxShadow: '0 0 0 2px var(--ac), 0 0 24px var(--ac)', pointerEvents: 'none' }} />}
          {beat && set.done && <motion.i key={`g${beat.n}`} aria-hidden initial={{ scale: 0.9, opacity: 1 }} animate={{ scale: 3.2, opacity: 0 }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }} style={{ position: 'absolute', inset: 0, borderRadius: 14, boxShadow: '0 0 0 2px var(--gold), 0 0 30px var(--gold)', pointerEvents: 'none' }} />}
          <AnimatePresence>{showGain && beat && set.done && <motion.span key={`l${beat.n}`} className="num" initial={{ opacity: 0, y: 6, scale: 0.8 }} animate={{ opacity: 1, y: -30, scale: 1 }} exit={{ opacity: 0, y: -42, transition: { duration: 0.3 } }} transition={BOUNCY}
            style={{ position: 'absolute', left: '50%', top: 0, x: '-50%', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700, color: 'var(--gold)', textShadow: '0 0 12px color-mix(in srgb, var(--gold) 60%, transparent)', pointerEvents: 'none' }}>{beat.label}</motion.span>}</AnimatePresence>
        </motion.button>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <Collapse key="opts" appear ms={260}>
            <div className="row-flex" style={{ gap: 8, padding: '4px 2px 8px' }}>
              <button className="chip sm press" onClick={() => patchSet(se.id, set.id, { type: set.type === 'warmup' ? 'working' : 'warmup' })}>{set.type === 'warmup' ? t('Make working set') : t('Make warm-up')}</button>
              
              <span className="grow" />
              <button className="chip sm press" style={{ color: 'var(--bad)' }} onClick={remove}><Icon name="trash" size={14} /> {t('Delete')}</button>
            </div>
          </Collapse>
        )}
      </AnimatePresence>
    </div>
  );
});

// ── exercise menu ───────────────────────────────────────────

function ExerciseMenu({ se, ex, onClose }: { se: SessionExercise; ex?: Exercise; onClose: () => void }) {
  const t = useT();
  const lang = useLang();
  const s = useStore();
  const act = useActive();
  const push = useUI((u) => u.push);
  const toast = useUI((u) => u.toast);
  const [note, setNote] = useState(se.note ?? '');
  const [rest, setRest] = useState(se.restSec ?? s.settings.restDefaultSec);
  const idx = (act?.exercises ?? []).findIndex((e) => e.id === se.id);
  const count = (act?.exercises ?? []).length;
  const items = [
    { icon: 'swap', label: t('Replace exercise'), run: () => { onClose(); push('exercisePicker', { mode: 'replace', seId: se.id, forExercise: ex }); } },
    { icon: 'link', label: se.supersetGroup && (act?.exercises ?? [])[idx + 1]?.supersetGroup === se.supersetGroup ? t('Unlink superset') : t('Superset with next'), disabled: idx >= count - 1, run: () => { toggleSuperset(se.id); onClose(); } },
    { icon: 'arrowUp', label: t('Move up'), disabled: idx === 0, run: () => { flip(document.querySelector('.wk-list'), () => moveExercise(se.id, -1), 420, se.id); onClose(); } },
    { icon: 'arrowDown', label: t('Move down'), disabled: idx >= count - 1, run: () => { flip(document.querySelector('.wk-list'), () => moveExercise(se.id, 1), 420, se.id); onClose(); } },
  ];
  return (
    <Sheet onClose={onClose} size="small" label={t('Exercise options')} nested>
      <SheetHead title={ex ? exName(ex, lang) : t('Exercise')} onClose={onClose} />
      <div className="sheet-body">
        <div className="list">
          {items.map((i) => <button key={i.label} className="li press" disabled={i.disabled} style={{ opacity: i.disabled ? 0.4 : 1 }} onClick={i.run}><Icon name={i.icon} size={20} /><span className="li-title">{i.label}</span></button>)}
        </div>
        <div className="field" style={{ marginTop: 18 }}>
          <label htmlFor="ex-note">{t('Exercise note')}</label>
          <textarea id="ex-note" className="input" value={note} onChange={(e) => { setNote(e.target.value); patchExercise(se.id, { note: e.target.value || undefined }); }} placeholder={t('Cues, seat height, how it felt…')} />
        </div>
        <div style={{ marginTop: 18 }}>
          <div className="lbl" style={{ marginBottom: 8 }}>{t('Rest after a set')}</div>
          {/* the routine editor's slim stepper: any rest in 15 s steps, and it never wraps onto a second line */}
          <Stepper compact label={t('Rest after a set')} value={rest} min={15} max={600} step={15} fmt={(v) => fmtDuration(v)} onChange={(v) => { setRest(v); patchExercise(se.id, { restSec: v }); }} />
        </div>
        <button className="btn danger block press" style={{ marginTop: 22 }} onClick={() => { fadeOutPage(se.id); const r = removeExercise(se.id); onClose(); toast(t('Exercise removed'), { actionLabel: t('Undo'), onAction: r.restore }); }}><Icon name="trash" size={18} /> {t('Remove exercise')}</button>
      </div>
    </Sheet>
  );
}
