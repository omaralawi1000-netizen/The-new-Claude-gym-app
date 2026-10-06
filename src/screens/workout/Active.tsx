import { createContext, memo, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { useStore, exerciseMap } from '../../state/store';
import { useUI, buzz } from '../../state/ui';
import { useT, useLang } from '../../lib/i18n';
import type { Exercise, SessionExercise, SetRecord } from '../../lib/types';
import { Icon } from '../../ui/Icon';
import { Collapse, NumInput, Stepper } from '../../ui/kit';
import { flip } from '../../ui/flip';
import { Sheet, SheetHead, SOFT, useOverlayZ } from '../../ui/Sheet';
import { beatLastTime, elapsedMs, historyOf, incrementFor, lastPerformance, repRange, sessionSetCount, sessionVolume, suggestProgression, countable } from '../../lib/workout';
import { fmtDuration } from '../../lib/dates';
import { displayToKg, kgToDisplay, fmtNum, displayToM, mToDisplay } from '../../lib/units';
import { useNow } from '../../lib/hooks';
import { nextSetOf, offerRestAlerts, unlockRestAudio } from './rest';
import { addSet, deleteSet, moveExercise, patchExercise, patchSet, removeExercise, startRest, adjustRest, skipRest, toggleSuperset } from './actions';
import { exName, fmtSet, MUSCLE_LABEL } from './common';
import { SphereSlot, mirrorOrb, orbPress, orbTap } from '../../ui/Sphere';
import { useSwipeDown } from '../../ui/swipe';
import { Mirror, mirrorProgress, mirrorStage, trackCover, trackDepth, type Engage } from '../../ui/engage';
import { DIM_VEIL, Veil, mirrorVeil } from '../../ui/Veil';
import { kb } from '../../ui/keyboard';
import { viewportH } from '../../ui/viewport';
import { BOUNCY, SURFACE, SURFACE_EXIT } from '../../ui/motion';

/** False while the workout is minimised (kept alive but hidden): its clocks stop ticking. */
const WkLive = createContext(true);

/**
 * The live workout: a full-height card that rises over the page (which steps back behind it), like Apple Music's player.
 * Kept alive between openings (WorkoutHost): `open` false slides it away and then hides it.
 */
export function ActiveWorkout({ props, open = true }: { props: { origin?: 'hero' | 'pill' | 'none' }; open?: boolean }) {
  const t = useT();
  const lang = useLang();
  // narrow selections: the screen re-renders when the session changes, not on every store write
  const a = useStore((s) => s.active);
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
  // shadow) used to hang just under the tab bar for that long after closing
  const sheetTop = (pp: number) => (1 - pp) * (H + 64);
  const sheetT = useTransform(p, (pp) => `translateY(${sheetTop(pp).toFixed(2)}px)`);
  const dragT = useTransform(dragY, (d) => Math.max(0, d) + Math.min(0, d) * 0.15);
  const dialogY = useTransform([p, dragY], ([pp, d]: number[]) => sheetTop(pp) + Math.max(0, d) + Math.min(0, d) * 0.15); // how far the content is displaced (for the orb)
  const eFinger = useTransform([p, dragY], ([pp, d]: number[]) => Math.min(1, Math.max(0, pp - Math.max(0, d) / H)));
  const engage = useMemo(() => ({ e: eFinger, shift: dialogY }), [eFinger, dialogY]);
  const depthId = useId();
  useEffect(() => trackDepth(depthId, eFinger), [depthId, eFinger]); // the page behind recedes with the window, frame for frame
  useEffect(() => trackCover(depthId, eFinger), [depthId, eFinger]); // and stops being drawn while the window covers it
  const sheetRef = useRef<HTMLDivElement>(null);
  // high refresh rate: the window, the dim and the page behind also run by the browser on the identical spring
  const scrimRef = useRef<HTMLDivElement>(null);
  const mirror = useRef<Mirror | null>(null); if (!mirror.current) mirror.current = new Mirror();
  const runMirror = (p0: number, p1: number, sp: { stiffness: number; damping: number; mass?: number }, vel: number) => {
    const m = mirror.current!; m.cancel();
    if (reduce) return;
    m.add(
      mirrorProgress(sheetRef.current, p0, p1, sp, vel, (pp) => ({ transform: `translateY(${sheetTop(pp).toFixed(2)}px)` })),
      ...mirrorVeil(scrimRef.current, p0, p1, sp, vel, DIM_VEIL),
      mirrorStage(depthId, p0, p1, sp, vel),
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
    const c = animate(p, 0, reduce ? { duration: 0.01 } : { ...SURFACE_EXIT, velocity: vel });
    closing.current = new Promise<void>((done) => { c.then(() => done()); });
    return closing.current;
  };
  const close = (v = 0) => {
    if (closing.current) return;
    startClose(v);
    requestAnimationFrame(() => setTimeout(() => { if (useUI.getState().overlays.some((o) => o.type === 'workout')) useUI.getState().pop(); }, 0));
  };

  // the keyboard slides over the page (it no longer resizes it): the list gets that much more room at its end, so the last
  // set's fields can still be scrolled above the keys, and the rest timer rides on top of the keyboard
  const bodyPad = useTransform(kb, (v) => `calc(var(--sab) + 150px + ${v}px)`);
  const exMap = useMemo(() => exerciseMap(exercises), [exercises]);
  const [menu, setMenu] = useState<string | null>(null);
  // another screen on top of the workout (the exercise list, an exercise's page): the bar steps away, or it showed through
  // the glass of that sheet. Not for the orb's screen or the Coach — the orb flies from the bar's slot and back into it.
  const covered = useUI((u) => { const top = u.overlays[u.overlays.length - 1]; return !!top && top.type !== 'workout' && top.type !== 'voice' && top.type !== 'coach' && u.overlays.some((o) => o.type === 'workout'); });
  const [confirm, setConfirm] = useState<null | 'finish' | 'discard'>(null);
  const finishBtn = useRef<HTMLButtonElement>(null);
  const pointToFinish = () => { const b = finishBtn.current; if (!b) return; b.classList.remove('nudge'); void b.offsetWidth; b.classList.add('nudge'); };
  const [renaming, setRenaming] = useState(false);
  // Opening is started before the first paint, so the browser-run half is already going when the rest of the window's setup
  // work runs. Closing — the chevron, a swipe, Back, or another screen taking its place — slides it down; then it is hidden
  // (kept, so the next opening is only the slide).
  const [hidden, setHidden] = useState(!open);
  const openRef = useRef(open); openRef.current = open;
  useLayoutEffect(() => {
    if (open) {
      closing.current = null;
      // un-park it now, before the orb's flight measures where its slot will be (React would only do it after this effect)
      dialogRef.current?.classList.remove('wk-off'); scrimRef.current?.classList.remove('wk-off');
      setHidden(false);
      const from = p.get();
      const c = animate(p, 1, reduce ? { duration: 0.01 } : SURFACE);
      runMirror(from, 1, SURFACE, 0);
      return () => c.stop();
    }
    setMenu(null); setConfirm(null); setRenaming(false);
    const el = document.activeElement as HTMLElement | null;
    if (el && dialogRef.current?.contains(el)) el.blur();
    (closing.current ?? startClose(swipeV.current || dragY.getVelocity())).then(() => { if (!openRef.current) setHidden(true); });
    // eslint-disable-next-line
  }, [open]);
  // typing a weight or reps: the keyboard takes the bottom half, so the rest timer steps out of the way (it sat right on top
  // of the sets you were editing) and keeps counting in the header instead
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const el = dialogRef.current; if (!el) return;
    const isField = (n: EventTarget | null) => n instanceof HTMLElement && /^(INPUT|TEXTAREA)$/.test(n.tagName);
    const on = (e: FocusEvent) => { if (isField(e.target)) setTyping(true); };
    const off = (e: FocusEvent) => { if (isField(e.target) && !isField(e.relatedTarget)) setTyping(false); };
    el.addEventListener('focusin', on); el.addEventListener('focusout', off);
    return () => { el.removeEventListener('focusin', on); el.removeEventListener('focusout', off); };
  }, []);
  const body = useRef<HTMLDivElement>(null);
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
  useEffect(() => {
    if (p.get() >= 0.97) { setReady(true); return; }
    const off = p.on('change', (v) => { if (v >= 0.97) { setReady(true); off(); } });
    const fallback = setTimeout(() => setReady(true), 900);
    return () => { off(); clearTimeout(fallback); };
    // eslint-disable-next-line
  }, []);
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
    doFinish();
  };
  const doFinish = () => {
    const r = useStore.getState().finishActive();
    if (r) { buzz([20, 40, 20] as any); swap(1, 'summary', { sessionId: r.id }); }
  };
  // the bar's "next set": scroll it into the middle and let it glow for a moment
  const jumpTo = (setId: string) => {
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
      <Veil e={eFinger} z={z - 1} onClick={() => close()} layers={DIM_VEIL} elRef={scrimRef} className={hidden ? 'wk-off' : ''} />
      <motion.div
        role={hidden ? undefined : 'dialog'} aria-modal={hidden ? undefined : 'true'} aria-label={t('Active workout')} aria-hidden={hidden || undefined}
        ref={dialogRef} data-hue="train" className={`wk-card${hidden ? ' wk-off' : ''}`} style={{ zIndex: z, y: dragT }}
      >
        <WkLive.Provider value={!hidden}>
        <motion.div ref={sheetRef} className="wk-sheet" style={{ transform: sheetT }}>
          <div className="wk-solid" aria-hidden><div className="aurora-lite" /></div>
        <div className="wk-window" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, paddingTop: 'var(--sat)' }}>
          <div className="sheet-grab" style={{ position: 'relative', zIndex: 3 }} />
          {/* header */}
          {/* no backdrop of its own: the list scrolls in its own box below, so the header sits straight on the window's light
              (a solid band here cut the colour field off in a hard line under the grabber) */}
          <div className="wk-head-wrap" style={{ touchAction: 'none' }}>
            <div className="wk-head">
              <button className="icon-btn flat press wk-min" aria-label={t('Minimise workout')} onClick={() => close()}><Icon name="chevD" /></button>
              <div className="wk-head-mid">
                {renaming ? (
                  <input className="input" autoFocus style={{ minHeight: 34, padding: '4px 10px' }} defaultValue={a.name} onBlur={(e) => { useStore.getState().mutateActive((x) => ({ ...x, name: e.target.value.trim() })); setRenaming(false); }} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} aria-label={t('Workout name')} />
                ) : (
                  <button className="wk-title display press" onClick={() => setRenaming(true)}>{a.name || t('Workout')}</button>
                )}
                {/* the clock and the tally on one line: time, sets, volume */}
                <div className="wk-meta num">
                  <span className={`wk-clock${paused ? ' paused' : ''}`}><Clock /></span>
                  <span className="wk-meta-rest">{total ? <><Roll v={done} />/{total} {t('sets')}{done > 0 && <> · {fmtNum(Math.round(kgToDisplay(sessionVolume(a.exercises), weightUnit)), lang, 0)} {weightUnit}</>}</> : t('No sets yet')}</span>
                  {paused && <span className="wk-paused">{t('Paused')}</span>}
                  {typing && a.rest && <RestInline />}
                </div>
              </div>
              <button className="icon-btn flat press wk-pause" onClick={() => { buzz(10); paused ? useStore.getState().resumeActive() : useStore.getState().pauseActive(); }} aria-label={paused ? t('Resume') : t('Pause')}>
                <Icon name={paused ? 'play' : 'pause'} size={18} />
              </button>
              {/* the one Finish: muted until a set is logged, then the accent; it glows once every set is ticked */}
              <button ref={finishBtn} className={`btn sm press wk-finish ${done > 0 ? 'primary' : 'muted'}${total > 0 && done === total ? ' ready' : ''}`} onClick={finish}>{t('Finish')}</button>
            </div>
            {/* grows by scaling (the compositor's job); it animated its width, which made every set ticked lay the page out again */}
            <div className="wk-progress"><i style={{ transform: `scaleX(${total ? done / total : 0})` }} /></div>
          </div>

          {/* body */}
          <motion.div ref={body} style={{ flex: 1, overflowY: 'auto', padding: '4px 16px 0', paddingBottom: bodyPad, overscrollBehavior: 'contain' }} className="hide-scroll wk-list">
            {a.exercises.length === 0 && (
              <div className="wk-empty">
                <div className="display display-sm" style={{ fontStyle: 'italic' }}>{t('Empty session')}</div>
                <div className="small t2" style={{ marginTop: 6 }}>{t('Add your first exercise, or tell the orb what you did.')}</div>
              </div>
            )}
            {/* plain blocks: an exercise added later fades in, a removed one folds away (Collapse) — nothing re-measures the page */}
            <AnimatePresence initial={false}>
              {a.exercises.slice(0, shown).map((se, idx) => (
                <Collapse key={se.id}>
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

          {/* the workout's own dock, where the tab bar sits: what's next, the rest timer, and the orb */}
          <WorkoutBar engage={engage} exMap={exMap} away={typing || !!confirm || !!menu || covered} onDone={pointToFinish} onJump={jumpTo} />
          </div>
        </div>
          </motion.div>
        </WkLive.Provider>
        </motion.div>

      <AnimatePresence>
        {menuEx && <ExerciseMenu key="menu" se={menuEx} ex={exMap.get(menuEx.exerciseId)} onClose={() => setMenu(null)} />}
        {confirm && (
          <Sheet key="confirm" onClose={() => setConfirm(null)} label={confirm === 'finish' ? t('Finish workout?') : t('Discard workout?')} nested>
            <SheetHead title={confirm === 'finish' ? t('Finish workout?') : t('Discard workout?')} onClose={() => setConfirm(null)} />
            <div className="sheet-body">
              {/* the session at a glance, then one clear choice */}
              <div className="wk-end-stats">
                <div><span className="micro">{t('Time')}</span><b className="num">{fmtDuration(elapsedMs(a) / 1000)}</b></div>
                <div><span className="micro">{t('Sets')}</span><b className="num">{done}<span className="t3">/{total}</span></b></div>
                <div><span className="micro">{t('Volume')}</span><b className="num">{fmtNum(Math.round(kgToDisplay(sessionVolume(a.exercises), weightUnit)), lang, 0)}<span className="t3"> {weightUnit}</span></b></div>
              </div>
              <p className="small t2 wk-end-note">{confirm === 'finish' ? t('{n} sets aren’t ticked. Only the ticked ones are saved.', { n: total - done }) : t('Nothing has been logged yet. You can undo this right after.')}</p>
              <div className="stack gap8">
                {confirm === 'finish' ? (
                  <button className="btn primary block press wk-end-btn" style={{ ['--i' as string]: 0 }} onClick={() => { buzz(14); setConfirm(null); doFinish(); }}>{done === 1 ? t('Finish and save 1 set') : t('Finish and save {n} sets', { n: done })}</button>
                ) : (
                  <button className="btn block danger press wk-end-btn" style={{ ['--i' as string]: 0 }} onClick={() => { buzz(14); setConfirm(null); doDiscard(); }}>{t('Discard workout')}</button>
                )}
                <button className="btn block ghost press wk-end-btn" style={{ ['--i' as string]: 1 }} onClick={() => { buzz(6); setConfirm(null); }}>{t('Keep training')}</button>
              </div>
            </div>
          </Sheet>
        )}
      </AnimatePresence>
    </>
  );
}

/** A number that rolls up (or down) when it changes, like the steppers; still on the first draw. */
function Roll({ v }: { v: number }) {
  const prev = useRef(v);
  const dir = v > prev.current ? 'up' : v < prev.current ? 'down' : '';
  useEffect(() => { prev.current = v; }, [v]);
  return <span key={v} className={`wk-roll${dir ? ` roll-${dir}` : ''}`}>{v}</span>;
}

// The ticking parts live in their own small components, so the clock re-renders a line of text four times a
// second instead of the whole workout screen.
function Clock() {
  const a = useStore((s) => s.active);
  const live = useContext(WkLive);
  const now = useNow(250, !!a && live);
  return <>{a ? fmtDuration(elapsedMs(a, now) / 1000) : ''}</>;
}

/** The rest timer as a few words in the header, while the keyboard is up. */
function RestInline() {
  const t = useT();
  const a = useStore((s) => s.active);
  const live = useContext(WkLive);
  const now = useNow(250, !!a?.rest && live);
  if (!a?.rest) return null;
  const left = (a.pausedAt ? a.rest.endsAt : a.rest.endsAt - now) / 1000;
  return <span style={{ color: left <= 0 ? 'var(--ok)' : 'var(--ac-text)', fontWeight: 650 }}> · {left <= 0 ? t('Rest over') : `${t('Rest')} ${fmtDuration(Math.ceil(left))}`}</span>;
}

/**
 * The workout's own dock, in the tab bar's place and material. On the left, what's next ("Next · Set 3 · 80 kg × 8" over
 * the exercise): tap it and the list scrolls to that set. While you rest the whole bar fills with the accent as the rest
 * passes, under the time; tap it then for −15 / +15 / Skip. When the rest is over it turns green — "Go · Bench Press" — and
 * stays so until that set is ticked. The orb sits at its right end: tap it to say your sets. It is there from the first
 * frame, so the orb glides into it with the window instead of jumping to a button at the end of the list.
 */
function WorkoutBar({ engage, exMap, away, onDone, onJump }: { engage: Engage; exMap: Map<string, Exercise>; away: boolean; onDone: () => void; onJump: (setId: string) => void }) {
  const t = useT();
  const lang = useLang();
  const push = useUI((u) => u.push);
  const a = useStore((s) => s.active);
  const unit = useStore((s) => s.settings.units.weight);
  const live = useContext(WkLive);
  const now = useNow(250, !!a?.rest && !a?.pausedAt && live);
  const [panel, setPanel] = useState(false);
  useEffect(() => { if (!panel) return; const id = setTimeout(() => setPanel(false), 4000); return () => clearTimeout(id); }, [panel, a?.rest?.endsAt, a?.rest?.total]);
  const resting = !!a?.rest;
  useEffect(() => { if (!resting) setPanel(false); }, [resting]);
  if (!a) return null;
  const nx = nextSetOf(a);
  const ex = nx ? exMap.get(nx.se.exerciseId) : undefined;
  const name = ex ? exName(ex, lang) : '';
  const rest = a.rest;
  const left = rest ? (a.pausedAt ? rest.endsAt : rest.endsAt - now) / 1000 : 0;
  const over = !!rest && left <= 0;
  const frac = rest && rest.total > 0 ? Math.min(1, Math.max(0, 1 - left / rest.total)) : 0;
  const kg = nx ? (nx.set.weightKg ?? nx.set.target?.weightKg) : undefined;
  const reps = nx ? (nx.set.reps ?? nx.set.target?.repMax) : undefined;
  const target = [kg !== undefined ? `${fmtNum(kgToDisplay(kg, unit), lang, 2)} ${unit}` : '', reps ? `× ${reps}` : ''].filter(Boolean).join(' ');
  const setWord = nx ? (nx.label === 'W' ? t('Warm-up') : `${t('Set')} ${nx.label}`) : '';
  const empty = !a.exercises.some((e) => e.sets.length > 0);
  // every set ticked: done, even while a rest is still counting (there's nothing left to rest for)
  const state: 'next' | 'rest' | 'go' | 'done' | 'empty' = empty ? 'empty' : !nx ? 'done' : rest ? (over ? 'go' : 'rest') : 'next';
  const tap = () => {
    buzz(6);
    if (state === 'rest') setPanel((v) => !v);
    else if (state === 'done') onDone();
    else if (state === 'empty') { orbTap(1); push('voice', { mode: 'workout' }); }
    else if (nx) onJump(nx.set.id);
  };
  const ofN = nx ? nx.se.sets.filter((x) => x.type === 'working').length : 0;
  const top = state === 'next' ? `${t('Next set')} · ${nx!.label === 'W' ? t('Warm-up') : t('{n} of {m}', { n: nx!.label, m: ofN })}`
    : state === 'rest' ? (panel ? (a.pausedAt ? `${t('Rest')} · ${t('Paused')}` : t('Rest')) : nx ? `${t('Rest')} · ${t('Next')}: ${name}` : t('Rest'))
    : state === 'go' ? `${t('Rest over')}${nx ? ` · ${setWord}` : ''}`
    : state === 'empty' ? `“${t('Bench press 80 kg for 8, 8, 6')}”`
    : t('All sets done');
  const big = state === 'next' ? name
    : state === 'rest' ? (a.pausedAt && !panel ? `${fmtDuration(Math.ceil(left))} · ${t('Paused')}` : fmtDuration(Math.ceil(left)))
    : state === 'go' ? (nx ? `${t('Go')} · ${name}` : t('Go'))
    : state === 'empty' ? t('Tell the orb what you did')
    : `${sessionSetCount(a.exercises, true)} ${t('sets')} · ${fmtNum(Math.round(kgToDisplay(sessionVolume(a.exercises), unit)), lang, 0)} ${unit}`;
  return (
    <div className={`wk-bar-wrap${away ? ' away' : ''}`}>
      {/* never re-keyed: the orb's slot lives in here, and remounting it made the orb leave and land again (a tick, a hop) */}
      <div className={`wk-bar glass ${state}`}>
        <span className="wk-bar-clip" aria-hidden><i className="wk-bar-fill" style={{ transform: `scaleX(${state === 'go' ? 1 : state === 'rest' ? frac : 0})` }} /></span>
        <button className="wk-bar-main press" onClick={tap} aria-expanded={state === 'rest' ? panel : undefined}
          aria-label={state === 'rest' ? `${t('Rest')} ${fmtDuration(Math.ceil(left))}` : `${top}. ${big}${state === 'next' && target ? `, ${target}` : ''}`}>
          <span className="wk-bar-top">{top}</span>
          <span className="wk-bar-big num">{state === 'next' ? <><span className="wk-bar-name">{name}</span>{target && <span className="wk-bar-tgt">{target}</span>}</> : big}</span>
        </button>
        <button className="wk-bar-orb press" aria-label={t('Dictate sets')} onPointerDown={() => orbPress(true)} onPointerUp={() => orbPress(false)} onPointerCancel={() => orbPress(false)} onPointerLeave={() => orbPress(false)}
          onClick={() => { orbTap(1); push('voice', { mode: 'workout' }); }}>
          <SphereSlot id="workout" priority={5} engage={engage} style={{ position: 'absolute', inset: -4 }} />
        </button>
        {/* −15 / +15 / Skip slide in inside the bar itself, beside the time (a pill floating above it covered the sets) */}
        <AnimatePresence>
          {panel && state === 'rest' && (
            <motion.div key="ctl" className="wk-bar-ctl" initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={SOFT}>
              <button className="wk-ctl press num" onClick={() => { buzz(6); adjustRest(-15); }} aria-label={t('15 seconds less')}>−15</button>
              <button className="wk-ctl press num" onClick={() => { buzz(6); adjustRest(15); }} aria-label={t('15 seconds more')}>+15</button>
              <button className="wk-ctl skip press" onClick={() => { buzz(8); skipRest(); setPanel(false); }}>{t('Skip')}</button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── exercise block ──────────────────────────────────────────

// memoised: ticking a set re-renders that exercise only
const ExerciseBlock = memo(function ExerciseBlock({ se, ex, linkedPrev, linkedNext, onMenu, appear }: { se: SessionExercise; ex?: Exercise; linkedPrev: boolean; linkedNext: boolean; onMenu: (id: string) => void; appear?: boolean }) {
  const t = useT();
  const lang = useLang();
  const settings = useStore((s) => s.settings);
  const sessions = useStore((s) => s.sessions);
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
  // something you told the Coach about this exercise ("left shoulder hurts on overhead press"): shown beside it, with a swap.
  // A joined string, so ticking a set elsewhere doesn't redraw this block.
  const flagged = useStore((s) => s.memory.filter((m) => m.exerciseIds?.includes(se.exerciseId)).map((m) => m.text).join('\n'));

  return (
    <section data-flip={se.id} className={`wk-block${appear ? ' in' : ''}${complete ? ' complete' : ''}`} style={{ position: 'relative', marginTop: linkedPrev ? 0 : 18, paddingLeft: se.supersetGroup ? 14 : 0 }}>
      {se.supersetGroup && <div aria-hidden style={{ position: 'absolute', left: 0, top: linkedPrev ? -4 : 6, bottom: linkedNext ? -14 : 6, width: 3, borderRadius: 3, background: 'var(--ac)', opacity: 0.85 }} />}
      {se.supersetGroup && !linkedPrev && <div className="micro accent" style={{ marginBottom: 4 }}>{t('Superset')}</div>}
      <div className="plinth" style={{ padding: '14px 12px 12px', borderRadius: 'var(--r-lg)' }}>
        <div className="row-flex between" style={{ alignItems: 'flex-start', gap: 8 }}>
          <button className="grow press" style={{ textAlign: 'left', minWidth: 0 }} onClick={() => ex && push('exercise', { id: ex.id })}>
            {/* a long name wraps (two lines at most look calm); it never pushes the card wider than the screen */}
            <div className="display display-sm wk-ex-title">{ex ? exName(ex, lang) : t('Unknown exercise')}<span className="wk-ex-done" aria-hidden><Icon name="check" size={14} sw={3} /></span></div>
            <div className="wk-muscles">{ex?.muscles.slice(0, 2).map((m) => t(MUSCLE_LABEL[m])).join(' · ')}</div>
          </button>
          <button className="icon-btn flat" onClick={() => onMenu(se.id)} aria-label={t('Exercise options')}><Icon name="more" /></button>
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
          <button className="btn sm press grow" onClick={() => { buzz(6); addSet(se.id); }}><Icon name="plus" size={16} /> {t('Set')}</button>
          <button className="btn sm ghost press" onClick={() => addSet(se.id, 'warmup')}>{t('+ Warm-up')}</button>
        </div>
      </div>
    </section>
  );
});

/** Bring a set row into view if it sits under the workout bar or just below the screen. Only ever scrolls down, and only a
 *  short way: it follows you to the next set, it never yanks the list somewhere you didn't look. */
function revealSet(id: string) {
  const list = document.querySelector<HTMLElement>('.wk-list');
  const row = list?.querySelector<HTMLElement>(`[data-set="${id}"]`);
  if (!list || !row) return;
  const r = row.getBoundingClientRect(), box = list.getBoundingClientRect();
  const bar = document.querySelector('.wk-bar-wrap:not(.away) .wk-bar')?.getBoundingClientRect();
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
    if (!valid) { setShake((n) => n + 1); buzz(30); toast(t('Enter reps first'), { tone: 'bad', duration: 1800 }); return; }
    const st = useStore.getState();
    if (st.active?.pausedAt) st.resumeActive();
    unlockRestAudio(); // a tap: the rest-over tones are allowed to play later
    if (st.active?.rest && st.active.rest.endsAt <= Date.now()) skipRest(); // "Go" has done its job
    const gain = set.type === 'working' ? beatLastTime(lt, eff, prev, u.weight, lang, t) : null;
    buzz(gain ? [12, 50, 22] as any : 14);
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
  const focusScroll = (e: React.FocusEvent<HTMLInputElement>) => { const el = e.currentTarget; setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 280); };

  const field = (value: number | undefined, placeholder: number | undefined, onChange: (v: number | undefined) => void, max: number, key: string, onEnter?: () => void) => (
    <div onFocusCapture={focusScroll as any}>
      <NumInput compact value={value} max={max} placeholder={placeholder !== undefined ? fmtNum(placeholder, lang, max) : '—'} onChange={onChange} label={key} onEnter={onEnter} />
    </div>
  );

  const fw = field(wDisp(set.weightKg), ph.w, (v) => patchSet(se.id, set.id, { weightKg: v === undefined ? undefined : displayToKg(v, u.weight) }), u.weight === 'lb' ? 1 : 2, t('Weight'));
  const fr = field(set.reps, ph.r, (v) => patchSet(se.id, set.id, { reps: v }), 0, t('Reps'), complete);

  return (
    // a plain row: it grows in and folds away inside its Collapse (no Motion layout — that re-measured the whole page)
    <div data-set={set.id}>
      <div className={`wk-set ${set.done ? 'done' : current ? 'current' : 'todo'}${set.type === 'warmup' ? ' warm' : ''}`} style={{ gridTemplateColumns: gridCols(ex, settings.effort) }}>
        <button className="press wk-set-n" aria-label={t('Set options')} aria-expanded={open} onClick={() => setOpen((v) => !v)}>{label}</button>
        <button className="num press wk-prev" disabled={!prev} onClick={() => prev && patchSet(se.id, set.id, { weightKg: prev.weightKg, reps: prev.reps, durationSec: prev.durationSec, distanceM: prev.distanceM })} aria-label={prev ? `${t('Use previous')}: ${fmtSet(prev, ex, u, lang, t)}` : undefined}>
          {prev ? fmtSet(prev, ex, u, lang, t).replace(/ (kg|lb)/, '') : '—'}
        </button>
        {lt === 'duration' && field(set.durationSec, prev?.durationSec ?? 45, (v) => patchSet(se.id, set.id, { durationSec: v }), 0, t('Seconds'), complete)}
        {lt === 'distance' && <>
          {field(set.distanceM === undefined ? undefined : Math.round(mToDisplay(set.distanceM, u.distance) * 100) / 100, prev?.distanceM ? mToDisplay(prev.distanceM, u.distance) : undefined, (v) => patchSet(se.id, set.id, { distanceM: v === undefined ? undefined : displayToM(v, u.distance) }), 2, t('Distance'))}
          {field(set.durationSec === undefined ? undefined : Math.round((set.durationSec / 60) * 10) / 10, prev?.durationSec ? prev.durationSec / 60 : undefined, (v) => patchSet(se.id, set.id, { durationSec: v === undefined ? undefined : Math.round(v * 60) }), 1, t('Minutes'), complete)}
        </>}
        {(lt === 'weightReps' || lt === 'bodyweightReps' || lt === 'assisted') && <>{fw}{fr}</>}
        {settings.effort !== 'off' && <div onFocusCapture={focusScroll as any}><NumInput compact value={settings.effort === 'rpe' ? set.rpe : set.rir} max={1} placeholder="—" onChange={(v) => patchSet(se.id, set.id, settings.effort === 'rpe' ? { rpe: v } : { rir: v })} label={settings.effort.toUpperCase()} /></div>}
        {/* not logged: an empty outline (no check yet); logged: a filled check that draws itself in */}
        <motion.button key={shake} className={`press wk-check${set.done ? ' on' : ''}${set.done && burst > 0 ? ' fresh' : ''}`} aria-label={set.done ? t('Mark set not done') : t('Complete set')} aria-pressed={set.done} onClick={() => { if (!set.done) setBurst((n) => n + 1); complete(); }}
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
  const push = useUI((u) => u.push);
  const toast = useUI((u) => u.toast);
  const [note, setNote] = useState(se.note ?? '');
  const [rest, setRest] = useState(se.restSec ?? s.settings.restDefaultSec);
  const idx = s.active!.exercises.findIndex((e) => e.id === se.id);
  const count = s.active!.exercises.length;
  const items = [
    { icon: 'swap', label: t('Replace exercise'), run: () => { onClose(); push('exercisePicker', { mode: 'replace', seId: se.id, forExercise: ex }); } },
    { icon: 'link', label: se.supersetGroup && s.active!.exercises[idx + 1]?.supersetGroup === se.supersetGroup ? t('Unlink superset') : t('Superset with next'), disabled: idx >= count - 1, run: () => { toggleSuperset(se.id); onClose(); } },
    { icon: 'arrowUp', label: t('Move up'), disabled: idx === 0, run: () => { flip(document.querySelector('.wk-list'), () => moveExercise(se.id, -1)); onClose(); } },
    { icon: 'arrowDown', label: t('Move down'), disabled: idx >= count - 1, run: () => { flip(document.querySelector('.wk-list'), () => moveExercise(se.id, 1)); onClose(); } },
  ];
  return (
    <Sheet onClose={onClose} label={t('Exercise options')} nested>
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
        <button className="btn danger block press" style={{ marginTop: 22 }} onClick={() => { const r = removeExercise(se.id); onClose(); toast(t('Exercise removed'), { actionLabel: t('Undo'), onAction: r.restore }); }}><Icon name="trash" size={18} /> {t('Remove exercise')}</button>
      </div>
    </Sheet>
  );
}
