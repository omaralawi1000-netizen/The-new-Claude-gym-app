import { memo, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AnimatePresence, animate, motion, useMotionValue, usePresence, useReducedMotion, useTransform } from 'motion/react';
import { useStore, exerciseMap } from '../../state/store';
import { useUI, buzz } from '../../state/ui';
import { useT, useLang } from '../../lib/i18n';
import type { Exercise, SessionExercise, SetRecord } from '../../lib/types';
import { Icon } from '../../ui/Icon';
import { NumInput } from '../../ui/kit';
import { Sheet, SheetHead, SOFT, SNAP, useOverlayZ, zoomFrom } from '../../ui/Sheet';
import { beatLastTime, elapsedMs, lastPerformance, sessionSetCount, sessionVolume, suggestProgression, countable } from '../../lib/workout';
import { fmtDuration } from '../../lib/dates';
import { displayToKg, kgToDisplay, fmtNum, displayToM, mToDisplay } from '../../lib/units';
import { useNow, restEndedCue } from '../../lib/hooks';
import { addSet, deleteSet, moveExercise, patchExercise, patchSet, removeExercise, startRest, adjustRest, skipRest, toggleSuperset } from './actions';
import { exName, fmtSet, MUSCLE_LABEL } from './common';
import { SphereSlot, orbPress, orbTap } from '../../ui/Sphere';
import { useSwipeDown } from '../../ui/swipe';
import { Mirror, mirrorProgress, mirrorStage, trackCover, trackDepth } from '../../ui/engage';
import { DIM_VEIL, Veil, mirrorVeil } from '../../ui/Veil';
import { kb } from '../../ui/keyboard';
import { BOUNCY, SURFACE_EXIT, apple } from '../../ui/motion';

// critically damped: it opens and closes in one smooth motion with no wobble at the end
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** Opening: Apple's spring with a touch of bounce, as the Music player lands. */
const OPEN = { ...apple(0.52, 0.08), restDelta: 0.001 };
/** progress ranges over which the panel's solid colour and the content fade in */
const SOLID = [0.3, 0.92];
const SHOW = [0.18, 0.7];

/** The live workout: a full-height card that rises over the page (which steps back behind it), like Apple Music's player. */
export function ActiveWorkout({ props }: { props: { origin?: 'hero' | 'pill' | 'none' } }) {
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
  useSwipeDown(dialogRef, dragY, (v) => { swipeV.current = v ?? 0; useUI.getState().pop(); }, { threshold: 130 });
  // Presented like Apple Music's player: a frosted panel grows out of what you tapped — the resume bar above the tab bar or
  // the workout card on Today — rising and widening to fill the screen, its frost turning into the window's own solid
  // colour as it lands, while the content fades in and the page behind steps back and dims. Closing (a tap on the chevron
  // or a drag down from anywhere) shrinks it back into the bar or card. One number (`p`, finger included in `eFinger`)
  // drives all of it, and only transforms and opacity move.
  const H = typeof window !== 'undefined' ? window.innerHeight : 900;
  const W = typeof window !== 'undefined' ? window.innerWidth : 400;
  // where it grows from / shrinks back into: the resume bar, else Today's workout card, else the bottom edge
  const originOf = () => {
    const pick = (sel: string) => { const el = document.querySelector(sel); const r = el?.getBoundingClientRect(); return r && r.width > 40 && r.top > 0 && r.top < H ? r : null; };
    const r = (props.origin === 'hero' ? pick('[data-wk="hero"]') : null) ?? pick('[data-wk="pill"]') ?? pick('[data-wk="hero"]');
    return r ? { top: r.top, sx: Math.min(1, r.width / W) } : { top: H, sx: 1 };
  };
  const origin = useRef(originOf());
  const p = useMotionValue(0);
  const dialogY = useTransform([p, dragY], ([pp, d]: number[]) => (1 - pp) * origin.current.top + Math.max(0, d) + Math.min(0, d) * 0.15);
  const panelSx = useTransform(p, (pp) => origin.current.sx + (1 - origin.current.sx) * pp);
  const solid = useTransform(p, (pp) => clamp01((pp - SOLID[0]) / (SOLID[1] - SOLID[0])));
  const contentO = useTransform(p, (pp) => clamp01((pp - SHOW[0]) / (SHOW[1] - SHOW[0])));
  const eFinger = useTransform([p, dragY], ([pp, d]: number[]) => Math.min(1, Math.max(0, pp - Math.max(0, d) / H)));
  const engage = useMemo(() => ({ e: eFinger, shift: dialogY }), [eFinger, dialogY]);
  const depthId = useId();
  useEffect(() => trackDepth(depthId, eFinger), [depthId, eFinger]); // the page behind recedes with the card, frame for frame
  useEffect(() => trackCover(depthId, eFinger), [depthId, eFinger]); // and stops being drawn while the card covers it
  const panelRef = useRef<HTMLDivElement>(null), solidRef = useRef<HTMLDivElement>(null), contentRef = useRef<HTMLDivElement>(null);
  // the content's fade is written straight to the element; the frost under the panel is switched off while it rests full
  // screen (the solid colour covers it then, and a full-screen blur would be recomputed on every scroll for nothing)
  useEffect(() => {
    const show = (v: number) => { if (contentRef.current) contentRef.current.style.opacity = v >= 1 ? '' : String(v); };
    const rest = (v: number) => dialogRef.current?.classList.toggle('rest', v >= 0.999);
    show(contentO.get()); rest(eFinger.get());
    const a = contentO.on('change', show), b = eFinger.on('change', rest);
    return () => { a(); b(); };
  }, [contentO, eFinger]);
  // high refresh rate: card, panel, colour, content, dim and page behind also run by the browser on the identical spring
  const scrimRef = useRef<HTMLDivElement>(null);
  const mirror = useRef<Mirror | null>(null); if (!mirror.current) mirror.current = new Mirror();
  const runMirror = (p0: number, p1: number, sp: { stiffness: number; damping: number; mass?: number }, vel: number) => {
    const m = mirror.current!; m.cancel();
    if (reduce) return;
    const o = origin.current;
    const ramp = (r: number[]) => (pp: number) => ({ opacity: clamp01((pp - r[0]) / (r[1] - r[0])) });
    m.add(
      mirrorProgress(dialogRef.current, p0, p1, sp, vel, (pp) => ({ transform: `translateY(${(1 - pp) * o.top}px)` })),
      mirrorProgress(panelRef.current, p0, p1, sp, vel, (pp) => ({ transform: `scaleX(${o.sx + (1 - o.sx) * pp})` })),
      mirrorProgress(solidRef.current, p0, p1, sp, vel, ramp(SOLID), SOLID),
      mirrorProgress(contentRef.current, p0, p1, sp, vel, ramp(SHOW), SHOW),
      ...mirrorVeil(scrimRef.current, p0, p1, sp, vel, DIM_VEIL),
      mirrorStage(depthId, p0, p1, sp, vel),
    );
  };
  useEffect(() => { const off = dragY.on('change', () => mirror.current!.cancel()); return () => { off(); mirror.current!.cancel(); }; }, [dragY]);
  const [isPresent, safeToRemove] = usePresence();
  useEffect(() => {
    const c = animate(p, 1, reduce ? { duration: 0.01 } : OPEN);
    runMirror(0, 1, OPEN, 0);
    return () => c.stop();
    // eslint-disable-next-line
  }, []);
  const closing = useRef(false);
  useEffect(() => {
    if (isPresent || closing.current) return;
    closing.current = true;
    // the finger's offset becomes progress, then it carries on at the finger's speed — back into the bar or card it came from
    const v = swipeV.current || dragY.getVelocity();
    const e0 = eFinger.get();
    origin.current = originOf();
    p.set(e0); dragY.set(0);
    const vel = -v / Math.max(120, origin.current.top);
    runMirror(e0, 0, SURFACE_EXIT, vel);
    animate(p, 0, reduce ? { duration: 0.01 } : { ...SURFACE_EXIT, velocity: vel }).then(() => safeToRemove?.());
    // eslint-disable-next-line
  }, [isPresent]);
  // the keyboard slides over the page (it no longer resizes it): the list gets that much more room at its end, so the last
  // set's fields can still be scrolled above the keys, and the rest timer rides on top of the keyboard
  const bodyPad = useTransform(kb, (v) => `calc(var(--sab) + 150px + ${v}px)`);
  const restBottom = useTransform(kb, (v) => `calc(var(--sab) + 16px + ${v}px)`);
  const exMap = useMemo(() => exerciseMap(exercises), [exercises]);
  const [menu, setMenu] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | 'finish' | 'discard'>(null);
  const [renaming, setRenaming] = useState(false);
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
  const [shown, setShown] = useState(() => Math.min(2, total0));
  const [ready, setReady] = useState(false);
  const listDoneAtOpen = useRef(total0 <= 2);
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
    if (!ready || shown >= total0) return;
    const id = setTimeout(() => setShown((n) => n + 1), shown === 0 ? 0 : 70);
    return () => clearTimeout(id);
  }, [ready, shown, total0]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ov = useUI.getState().overlays;
      if (ov[ov.length - 1]?.type !== 'workout' || document.querySelector('.sheet')) return; // a sheet above the workout (or one of its own menus) handles its own Escape
      if (e.key === 'Escape' && !(e.target as HTMLElement)?.closest?.('input,textarea')) pop();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pop]);

  // rest timer end cue (once per rest)
  const restKey = a?.rest ? `${a.rest.endsAt}:${a.rest.total}` : '';
  const cued = useRef('');
  useEffect(() => {
    if (!a?.rest || a.pausedAt) return;
    const ms = a.rest.endsAt - Date.now();
    const id = setTimeout(() => { if (cued.current !== restKey) { cued.current = restKey; restEndedCue(); } }, Math.max(0, ms));
    const clear = setTimeout(() => { if (useStore.getState().active?.rest?.endsAt === a.rest!.endsAt) skipRest(); }, Math.max(0, ms) + 6000);
    return () => { clearTimeout(id); clearTimeout(clear); };
    // eslint-disable-next-line
  }, [restKey, a?.pausedAt]);

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
  const doDiscard = () => {
    const d = useStore.getState().discardActive();
    pop();
    if (d) toast(t('Workout discarded'), { actionLabel: t('Undo'), onAction: () => useStore.getState().restoreActive(d), duration: 8000 });
  };

  const menuEx = menu ? a.exercises.find((e) => e.id === menu) : undefined;

  return (
    <>
      <Veil e={eFinger} z={z - 1} onClick={pop} layers={DIM_VEIL} elRef={scrimRef} />
      <motion.div
        role="dialog" aria-modal="true" aria-label={t('Active workout')}
        ref={dialogRef} data-hue="train" className="wk-card" style={{ zIndex: z, y: dialogY }}
      >
        {/* the surface: frosted glass while it grows, the window's own colour once it has landed */}
        <motion.div ref={panelRef} className="wk-panel" aria-hidden style={{ scaleX: panelSx }}>
          <i className="wk-frost" />
          <motion.div ref={solidRef} className="wk-solid" style={{ opacity: solid }}><div className="aurora-lite" /></motion.div>
        </motion.div>
        <div ref={contentRef} className="wk-window" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, paddingTop: 'var(--sat)' }}>
          <div className="sheet-grab" style={{ position: 'relative', zIndex: 3 }} />
          {/* header */}
          {/* no backdrop of its own: the list scrolls in its own box below, so the header sits straight on the window's light
              (a solid band here cut the colour field off in a hard line under the grabber) */}
          <div style={{ padding: '0 16px 12px', touchAction: 'none', position: 'relative', zIndex: 2 }}>
            <div className="row-flex between">
              <button className="icon-btn press" aria-label={t('Minimise workout')} onClick={pop}><Icon name="chevD" /></button>
              <div className="grow" style={{ textAlign: 'center', minWidth: 0 }}>
                {renaming ? (
                  <input className="input" autoFocus style={{ minHeight: 40, textAlign: 'center' }} defaultValue={a.name} onBlur={(e) => { useStore.getState().mutateActive((x) => ({ ...x, name: e.target.value.trim() })); setRenaming(false); }} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} aria-label={t('Workout name')} />
                ) : (
                  <button className="display display-sm trunc press" style={{ maxWidth: '100%' }} onClick={() => setRenaming(true)}>{a.name || t('Workout')}</button>
                )}
              </div>
              <button className="btn primary sm press" onClick={finish}>{t('Finish')}</button>
            </div>
            <div className="row-flex between" style={{ marginTop: 10, alignItems: 'flex-end' }}>
              <div>
                <div className="display display-lg num" style={{ color: paused ? 'var(--tx3)' : 'var(--tx)' }}><Clock /></div>
                <div className="small t2 num">{done}/{total} · {fmtNum(Math.round(kgToDisplay(sessionVolume(a.exercises), weightUnit)), lang, 0)} {weightUnit}</div>
              </div>
              <button className="btn sm press" onClick={() => { buzz(10); paused ? useStore.getState().resumeActive() : useStore.getState().pauseActive(); }} aria-label={paused ? t('Resume') : t('Pause')}>
                <Icon name={paused ? 'play' : 'pause'} size={16} /> {paused ? t('Resume') : t('Pause')}
              </button>
            </div>
            <div style={{ height: 3, borderRadius: 3, background: 'var(--s3)', marginTop: 12, overflow: 'hidden' }}><motion.div animate={{ width: `${total ? (done / total) * 100 : 0}%` }} transition={SOFT} style={{ height: '100%', background: 'var(--ac)' }} /></div>
            {paused && <div className="small" style={{ marginTop: 8, color: 'var(--warn)' }}>{t('Paused')}</div>}
          </div>

          {/* body */}
          <motion.div ref={body} style={{ flex: 1, overflowY: 'auto', padding: '4px 16px 0', paddingBottom: bodyPad, overscrollBehavior: 'contain' }} className="hide-scroll">
            {a.exercises.length === 0 && (
              <div className="empty"><div className="display display-sm">{t('Empty session')}</div><div style={{ height: 12 }} /></div>
            )}
            <AnimatePresence initial={false}>
              {a.exercises.slice(0, shown).map((se, idx) => (
                <ExerciseBlock key={se.id} se={se} idx={idx} ex={exMap.get(se.exerciseId)} onMenu={setMenu}
                  linkedPrev={!!(idx > 0 && se.supersetGroup && a.exercises[idx - 1].supersetGroup === se.supersetGroup)}
                  linkedNext={!!(idx < a.exercises.length - 1 && se.supersetGroup && a.exercises[idx + 1].supersetGroup === se.supersetGroup)} />
              ))}
            </AnimatePresence>
            {listDone && (
            <motion.div initial={listDoneAtOpen.current ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={SOFT}>
            <div className="row-flex" style={{ gap: 10, marginTop: 20 }}>
              <button className="btn block press" onClick={() => push('exercisePicker', { mode: 'add' })}><Icon name="plus" size={18} /> {t('Add exercise')}</button>
              <button className="press" onPointerDown={() => orbPress(true)} onPointerUp={() => orbPress(false)} onPointerCancel={() => orbPress(false)} onPointerLeave={() => orbPress(false)} onClick={() => { orbTap(1); push('voice', { mode: 'workout' }); }} aria-label={t('Dictate sets')} style={{ position: 'relative', width: 52, height: 52, flex: 'none', borderRadius: 999 }}><SphereSlot id="workout" priority={5} engage={engage} style={{ position: 'absolute', inset: -4 }} /></button>
            </div>
            <button className="btn primary block press" style={{ marginTop: 12 }} onClick={finish}>{t('Finish workout')}</button>
            <button className="btn ghost danger block press" style={{ marginTop: 6 }} onClick={() => setConfirm('discard')}>{t('Discard workout')}</button>
            </motion.div>
            )}
          </motion.div>

          {/* rest timer — floats above content, in the same frosted material as the tab bar */}
          <AnimatePresence>
            {a.rest && (
              <motion.div key="rest" className="glass" initial={{ y: 40, opacity: 0, scale: 0.96 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 30, opacity: 0, scale: 0.97 }} transition={SOFT}
                style={{ position: 'absolute', left: 16, right: 16, bottom: restBottom, borderRadius: 26, padding: '12px 14px 12px 16px', display: 'flex', alignItems: 'center', gap: 12, zIndex: 5 }}>
                <RestCountdown />
                <button className="btn sm press" onClick={() => adjustRest(-15)} aria-label={t('15 seconds less')}>−15</button>
                <button className="btn sm press" onClick={() => adjustRest(15)} aria-label={t('15 seconds more')}>+15</button>
                <button className="btn sm primary press" onClick={() => skipRest()}>{t('Skip')}</button>
              </motion.div>
            )}
          </AnimatePresence>
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {menuEx && <ExerciseMenu key="menu" se={menuEx} ex={exMap.get(menuEx.exerciseId)} onClose={() => setMenu(null)} />}
        {confirm && (
          <Sheet key="confirm" onClose={() => setConfirm(null)} label={t('Confirm')} nested>
            <SheetHead title={confirm === 'finish' ? t('Finish workout?') : t('Discard workout?')} sub={confirm === 'finish' ? t('{n} sets aren’t checked off. They will not be saved.', { n: total - done }) : t('Nothing has been logged yet. You can undo this right after.')} onClose={() => setConfirm(null)} />
            <div className="sheet-body">
              <div className="stack gap8">
                {confirm === 'finish' ? (
                  <>
                    <button className="btn primary block press" onClick={() => { setConfirm(null); doFinish(); }}>{t('Finish and save {n} sets', { n: done })}</button>
                    <button className="btn block press" onClick={() => setConfirm(null)}>{t('Keep training')}</button>
                  </>
                ) : (
                  <>
                    <button className="btn block danger press" onClick={() => { setConfirm(null); doDiscard(); }}>{t('Discard workout')}</button>
                    <button className="btn block press" onClick={() => setConfirm(null)}>{t('Keep training')}</button>
                  </>
                )}
              </div>
            </div>
          </Sheet>
        )}
      </AnimatePresence>
    </>
  );
}

// The ticking parts live in their own small components, so the clock re-renders a line of text four times a
// second instead of the whole workout screen.
function Clock() {
  const a = useStore((s) => s.active);
  const now = useNow(250, !!a);
  return <>{a ? fmtDuration(elapsedMs(a, now) / 1000) : ''}</>;
}

function RestCountdown() {
  const t = useT();
  const a = useStore((s) => s.active);
  const now = useNow(250, !!a?.rest);
  if (!a?.rest) return null;
  const restLeft = (a.pausedAt ? a.rest.endsAt : a.rest.endsAt - now) / 1000;
  return (
    <>
      <RestRing left={restLeft} total={a.rest.total} />
      <div className="grow">
        <div className="micro">{restLeft <= 0 ? t('Rest over') : t('Rest')}</div>
        <div className="display display-md num" style={{ color: restLeft <= 0 ? 'var(--ok)' : 'var(--tx)' }}>{restLeft <= 0 ? t('Go') : fmtDuration(Math.ceil(restLeft))}</div>
      </div>
    </>
  );
}

function RestRing({ left, total }: { left: number; total: number }) {
  const p = total > 0 ? Math.max(0, Math.min(1, left / total)) : 0;
  const r = 20, c = 2 * Math.PI * r;
  return (
    <svg width="52" height="52" viewBox="0 0 52 52" aria-hidden>
      <circle cx="26" cy="26" r={r} fill="none" stroke="var(--s4)" strokeWidth="4" />
      <circle cx="26" cy="26" r={r} fill="none" stroke={left <= 0 ? 'var(--ok)' : 'var(--ac)'} strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - p)} transform="rotate(-90 26 26)" style={{ transition: 'stroke-dashoffset 300ms linear' }} />
    </svg>
  );
}

// ── exercise block ──────────────────────────────────────────

// memoised: ticking a set re-renders that exercise only
const ExerciseBlock = memo(function ExerciseBlock({ se, idx, ex, linkedPrev, linkedNext, onMenu }: { se: SessionExercise; idx: number; ex?: Exercise; linkedPrev: boolean; linkedNext: boolean; onMenu: (id: string) => void }) {
  const t = useT();
  const lang = useLang();
  const settings = useStore((s) => s.settings);
  const sessions = useStore((s) => s.sessions);
  const push = useUI((u) => u.push);
  const toast = useUI((u) => u.toast);
  const last = useMemo(() => lastPerformance(se.exerciseId, sessions), [se.exerciseId, sessions]);
  const lastWorking = last?.sets.filter(countable) ?? [];
  const working = se.sets.filter((x) => x.type === 'working');
  const range = { min: working[0]?.target?.repMin ?? 6, max: working[0]?.target?.repMax ?? 10 };
  const sugg = ex && ex.logType === 'weightReps' ? suggestProgression(ex, last, range, settings.plateStep) : undefined;
  const pendingSets = se.sets.filter((x) => !x.done);
  const u = settings.units;
  let workIdx = -1;
  const showSugg = sugg && sugg.kind === 'add-weight' && pendingSets.length > 0 && pendingSets.every((x) => x.weightKg === undefined && x.target?.weightKg !== sugg.weightKg);

  return (
    <motion.section layout="position" layoutDependency={`${idx}:${se.supersetGroup ?? ''}`} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} transition={SOFT}
      style={{ position: 'relative', marginTop: linkedPrev ? 0 : 18, paddingLeft: se.supersetGroup ? 14 : 0 }}>
      {se.supersetGroup && <div aria-hidden style={{ position: 'absolute', left: 0, top: linkedPrev ? -4 : 6, bottom: linkedNext ? -14 : 6, width: 3, borderRadius: 3, background: 'var(--ac)', opacity: 0.85 }} />}
      {se.supersetGroup && !linkedPrev && <div className="micro accent" style={{ marginBottom: 4 }}>{t('Superset')}</div>}
      <div className="plinth" style={{ padding: '14px 12px 12px', borderRadius: 'var(--r-lg)' }}>
        <div className="row-flex between" style={{ alignItems: 'flex-start', gap: 8 }}>
          <button className="grow press" style={{ textAlign: 'left', minWidth: 0 }} onClick={(ev) => ex && push('exercise', { id: ex.id, from: zoomFrom(ev.currentTarget) })}>
            <div className="display display-sm trunc">{ex ? exName(ex, lang) : t('Unknown exercise')}</div>
            <div className="xs t2" style={{ marginTop: 3 }}>{ex?.muscles.slice(0, 2).map((m) => t(MUSCLE_LABEL[m])).join(' · ')}</div>
          </button>
          <button className="icon-btn flat" onClick={() => onMenu(se.id)} aria-label={t('Exercise options')}><Icon name="more" /></button>
        </div>
        {lastWorking.length > 0 && <div className="xs t3 num" style={{ marginTop: 6 }}>{t('Last')}: {lastWorking.slice(0, 5).map((p) => fmtSet(p, ex, u, lang, t)).join(' · ')}</div>}
        {se.note && <div className="small t2" style={{ marginTop: 8, padding: '8px 10px', background: 'var(--bg-2)', borderRadius: 10 }}>{se.note}</div>}
        {showSugg && (
          <button className="chip acc press" style={{ marginTop: 10, height: 'auto', padding: '8px 12px', textAlign: 'left', whiteSpace: 'normal', lineHeight: 1.3 }}
            onClick={() => { buzz(8); pendingSets.forEach((x) => patchSet(se.id, x.id, { target: { ...x.target, weightKg: sugg!.weightKg } })); toast(t('Targets set to {w} {u}', { w: fmtNum(kgToDisplay(sugg!.weightKg!, u.weight), lang, 2), u: u.weight })); }}>
            <Icon name="sparkle" size={15} />
            <span>{t('Try {w} {u} — all sets reached {reps} reps last time. Tap to set.', { w: fmtNum(kgToDisplay(sugg!.weightKg!, u.weight), lang, 2), u: u.weight, reps: sugg!.reasonVars.reps })}</span>
          </button>
        )}

        <div className="set-head" style={{ display: 'grid', gridTemplateColumns: gridCols(ex, settings.effort), gap: 8, marginTop: 12, padding: '0 2px' }}>
          <span className="micro">{t('Set')}</span><span className="micro">{t('Prev')}</span>
          {headers(ex, u, t).map((h) => <span key={h} className="micro" style={{ textAlign: 'center' }}>{h}</span>)}
          {settings.effort !== 'off' && <span className="micro" style={{ textAlign: 'center' }}>{settings.effort.toUpperCase()}</span>}
          <span />
        </div>
        <AnimatePresence initial={false}>
          {se.sets.map((set) => {
            if (set.type === 'working') workIdx++;
            return <SetRow key={set.id} se={se} set={set} ex={ex} label={set.type === 'warmup' ? 'W' : String(workIdx + 1)} prev={set.type === 'working' ? lastWorking[Math.min(workIdx, lastWorking.length - 1)] : undefined} restDefault={settings.restDefaultSec} />;
          })}
        </AnimatePresence>
        <div className="row-flex" style={{ gap: 8, marginTop: 10 }}>
          <button className="btn sm press grow" onClick={() => { buzz(6); addSet(se.id); }}><Icon name="plus" size={16} /> {t('Set')}</button>
          <button className="btn sm ghost press" onClick={() => addSet(se.id, 'warmup')}>{t('+ Warm-up')}</button>
        </div>
      </div>
    </motion.section>
  );
});

function gridCols(ex: Exercise | undefined, effort: string) {
  const extra = effort !== 'off' ? ' 52px' : '';
  const lt = ex?.logType ?? 'weightReps';
  if (lt === 'duration') return `34px 62px 1fr${extra} 46px`;
  return `34px 62px 1fr 1fr${extra} 46px`;
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
    const gain = set.type === 'working' ? beatLastTime(lt, eff, prev, u.weight, lang, t) : null;
    buzz(gain ? [12, 50, 22] as any : 14);
    if (gain) setBeat((b) => ({ n: (b?.n ?? 0) + 1, label: gain }));
    patchSet(se.id, set.id, { ...eff, done: true, completedAt: Date.now() });
    if (set.type === 'working') {
      // supersets: rest only after the last exercise of the group has its turn
      const all = st.active?.exercises ?? [];
      const idx = all.findIndex((e) => e.id === se.id);
      const linkedNext = se.supersetGroup && all.slice(idx + 1).some((e) => e.supersetGroup === se.supersetGroup && e.sets.some((x) => !x.done));
      if (!linkedNext) startRest(se.restSec ?? restDefault, se.exerciseId);
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
    // layout is measured only when this row actually moves (a row above was added/removed), not on every tick or keystroke
    <motion.div layout="position" layoutDependency={`${label}:${se.sets.length}`} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={SOFT} style={{ overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: gridCols(ex, settings.effort), gap: 8, alignItems: 'center', padding: '5px 2px', opacity: set.done ? 0.72 : 1 }}>
        <button className="press" aria-label={t('Set options')} aria-expanded={open} onClick={() => setOpen((v) => !v)}
          style={{ height: 38, borderRadius: 10, fontWeight: 700, fontSize: 14, background: set.type === 'warmup' ? 'var(--ac-soft)' : 'var(--s2)', color: set.type === 'warmup' ? 'var(--ac-text)' : 'var(--tx2)', boxShadow: 'inset 0 0 0 1px var(--line)' }}>{label}</button>
        <button className="xs t3 num press" style={{ textAlign: 'left', lineHeight: 1.15 }} disabled={!prev} onClick={() => prev && patchSet(se.id, set.id, { weightKg: prev.weightKg, reps: prev.reps, durationSec: prev.durationSec, distanceM: prev.distanceM })} aria-label={prev ? `${t('Use previous')}: ${fmtSet(prev, ex, u, lang, t)}` : undefined}>
          {prev ? fmtSet(prev, ex, u, lang, t).replace(/ (kg|lb)/, '') : '—'}
        </button>
        {lt === 'duration' && field(set.durationSec, prev?.durationSec ?? 45, (v) => patchSet(se.id, set.id, { durationSec: v }), 0, t('Seconds'), complete)}
        {lt === 'distance' && <>
          {field(set.distanceM === undefined ? undefined : Math.round(mToDisplay(set.distanceM, u.distance) * 100) / 100, prev?.distanceM ? mToDisplay(prev.distanceM, u.distance) : undefined, (v) => patchSet(se.id, set.id, { distanceM: v === undefined ? undefined : displayToM(v, u.distance) }), 2, t('Distance'))}
          {field(set.durationSec === undefined ? undefined : Math.round((set.durationSec / 60) * 10) / 10, prev?.durationSec ? prev.durationSec / 60 : undefined, (v) => patchSet(se.id, set.id, { durationSec: v === undefined ? undefined : Math.round(v * 60) }), 1, t('Minutes'), complete)}
        </>}
        {(lt === 'weightReps' || lt === 'bodyweightReps' || lt === 'assisted') && <>{fw}{fr}</>}
        {settings.effort !== 'off' && <div onFocusCapture={focusScroll as any}><NumInput compact value={settings.effort === 'rpe' ? set.rpe : set.rir} max={1} placeholder="—" onChange={(v) => patchSet(se.id, set.id, settings.effort === 'rpe' ? { rpe: v } : { rir: v })} label={settings.effort.toUpperCase()} /></div>}
        <motion.button key={shake} className="press" aria-label={set.done ? t('Mark set not done') : t('Complete set')} aria-pressed={set.done} onClick={() => { if (!set.done) setBurst((n) => n + 1); complete(); }}
          animate={shake ? { x: [0, -5, 5, -3, 3, 0] } : undefined} transition={{ duration: 0.3 }}
          style={{ position: 'relative', height: 44, borderRadius: 14, display: 'grid', placeItems: 'center', background: set.done ? 'var(--ac)' : 'var(--s3)', color: set.done ? 'var(--ac-ink)' : 'var(--tx3)', boxShadow: set.done ? '0 6px 16px -6px color-mix(in srgb, var(--ac) 70%, transparent), inset 0 1px 0 rgba(255,255,255,.4)' : 'inset 0 1px 0 var(--hl), inset 0 0 0 1px var(--line)', transition: 'background 180ms, color 180ms' }}>
          <motion.span key={String(set.done)} initial={{ scale: set.done ? 0.4 : 1 }} animate={{ scale: 1 }} transition={SNAP} style={{ display: 'grid' }}><Icon name="check" size={22} sw={2.6} /></motion.span>
          {burst > 0 && set.done && <motion.i key={burst} aria-hidden initial={{ scale: 0.9, opacity: 0.85 }} animate={{ scale: 2.4, opacity: 0 }} transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }} style={{ position: 'absolute', inset: 0, borderRadius: 14, boxShadow: '0 0 0 2px var(--ac), 0 0 24px var(--ac)', pointerEvents: 'none' }} />}
          {beat && set.done && <motion.i key={`g${beat.n}`} aria-hidden initial={{ scale: 0.9, opacity: 1 }} animate={{ scale: 3.2, opacity: 0 }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }} style={{ position: 'absolute', inset: 0, borderRadius: 14, boxShadow: '0 0 0 2px var(--gold), 0 0 30px var(--gold)', pointerEvents: 'none' }} />}
          <AnimatePresence>{showGain && beat && set.done && <motion.span key={`l${beat.n}`} className="num" initial={{ opacity: 0, y: 6, scale: 0.8 }} animate={{ opacity: 1, y: -30, scale: 1 }} exit={{ opacity: 0, y: -42, transition: { duration: 0.3 } }} transition={BOUNCY}
            style={{ position: 'absolute', left: '50%', top: 0, x: '-50%', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700, color: 'var(--gold)', textShadow: '0 0 12px color-mix(in srgb, var(--gold) 60%, transparent)', pointerEvents: 'none' }}>{beat.label}</motion.span>}</AnimatePresence>
        </motion.button>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={SOFT} style={{ overflow: 'hidden' }}>
            <div className="row-flex" style={{ gap: 8, padding: '4px 2px 8px' }}>
              <button className="chip sm press" onClick={() => patchSet(se.id, set.id, { type: set.type === 'warmup' ? 'working' : 'warmup' })}>{set.type === 'warmup' ? t('Make working set') : t('Make warm-up')}</button>
              {settings.effort === 'off' && <span className="xs t3">{t('Effort (RPE/RIR) can be turned on in Settings.')}</span>}
              <span className="grow" />
              <button className="chip sm press" style={{ color: 'var(--bad)' }} onClick={remove}><Icon name="trash" size={14} /> {t('Delete')}</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
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
    { icon: 'arrowUp', label: t('Move up'), disabled: idx === 0, run: () => { moveExercise(se.id, -1); onClose(); } },
    { icon: 'arrowDown', label: t('Move down'), disabled: idx >= count - 1, run: () => { moveExercise(se.id, 1); onClose(); } },
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
          <div className="row-flex" style={{ gap: 6, flexWrap: 'wrap' }}>
            {[30, 60, 90, 120, 180, 240].map((v) => <button key={v} className={`chip press ${rest === v ? 'on' : ''}`} onClick={() => { setRest(v); patchExercise(se.id, { restSec: v }); }}>{fmtDuration(v)}</button>)}
          </div>
        </div>
        <button className="btn danger block press" style={{ marginTop: 22 }} onClick={() => { const r = removeExercise(se.id); onClose(); toast(t('Exercise removed'), { actionLabel: t('Undo'), onAction: r.restore }); }}><Icon name="trash" size={18} /> {t('Remove exercise')}</button>
      </div>
    </Sheet>
  );
}
