/**
 * Health (the fourth tab, where Progress was; Omar 20 Oct): everything the watch measured, as one page. On top, one plain
 * sentence with tappable numbers and a ribbon of the last 24 hours (it plays the day in once). Below, cards of three sizes
 * in three chapters (the bento, Omar 27 Oct): Recovery (Sleep, Heart: wide), Training (Cardio tall, Workouts and Lifting
 * square), Body (Weight, Steps). Each card grows into its own page (screens/health/expand.ts) carrying its number and its
 * chart, which is the page's own chart drawn small; swipe a page down to put it back. The old Progress charts live on,
 * unchanged, on the Lifting page.
 *
 * Scores (lib/scores.ts) are measured against his own normal, never 100 for a 7-hour night, and never tell him to train
 * lighter. Plan: /mnt/project-files/health/plan/build-plan.md. Mock: /mnt/project-files/health/concepts/mock-v8.html.
 */
import { memo, useCallback, useEffect, useMemo, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useScreenStore } from '../lib/hooks';
import { useT, useLang, type TFn } from '../lib/i18n';
import { useToday } from '../lib/derive';
import { addDays, diffDays, fmtDate, fmtTime } from '../lib/dates';
import { fmtNum, fmtSigned, kgToDisplay } from '../lib/units';
import { ACTIVITY_LABEL } from '../lib/activity';
import type { ActivityLog, Lang } from '../lib/types';
import type { Score } from '../lib/scores';
import { useHealthView, type HealthView } from './health/data';
import { activeGoals, goalState, holdKcal, tracked, type GoalState, type Pace } from '../lib/goals';
import { healthNote, rankNotes, type Nudge } from '../lib/nudges';
import { cachedInsights, runNudge } from '../ui/CoachPin';
import { exerciseMap } from '../state/store';
import { exName } from './workout/common';
import { LOGO } from '../ui/logoDots';
import type { AppData } from '../lib/types';
import { C, DayBars, Hypnogram, NightHeart, Ribbon, RouteLine, ScoreRing, Spark, StepsDay, Trace, WeekBarsBig, WeekDotsSvg, useWidth } from './health/charts';
import { Expander, slideCurve, SLIDE_E } from './health/expand';
import { ProgressBody } from './Progress';
import { Roll } from '../ui/Roll';
import { Icon } from '../ui/Icon';
import { useUI } from '../state/ui';
import './health/health.css';

type K = 'ready' | 'sleep' | 'heart' | 'move' | 'cardio' | 'week' | 'body' | 'training';
// (no Ready on the screen: Omar dropped readiness on 16 Oct and the Coach line on top says what matters; 26 Oct)
const ORDER: K[] = ['sleep', 'heart', 'cardio', 'week', 'training', 'body', 'move'];
const COL: Record<K, string> = { ready: '#f6f7fb', sleep: C.sleep, heart: C.heart, move: C.move, cardio: C.cardio, week: C.train, body: C.body, training: C.train };
const NAME: Record<K, string> = { ready: 'Ready', sleep: 'Sleep', heart: 'Heart', move: 'Steps', cardio: 'Cardio', week: 'Workouts', body: 'Weight', training: 'Lifting' };

/** 432 min → "7 h 12" (the hour sign in Danish is t) */
/** within this many minutes of the usual night is "about your usual", on the Coach line and the Sleep page alike */
const USUAL_BAND = 30;
const hm = (min: number, lang: Lang) => { const m = Math.round(min); const h = Math.floor(m / 60); return h ? `${h} ${lang === 'da' ? 't' : 'h'}${m % 60 ? ` ${String(m % 60).padStart(2, '0')}` : ''}` : `${m} min`; };
const EO = 'cubic-bezier(.22,.8,.2,1)';
const reduced = () => { const m = document.documentElement.dataset.motion; return m === 'reduce' || (m !== 'full' && matchMedia('(prefers-reduced-motion: reduce)').matches); };

export function HealthScreen() {
  const t = useT();
  const lang = useLang();
  const s = useScreenStore();
  const today = useToday();
  const label = useCallback((a: ActivityLog) => a.name || t(ACTIVITY_LABEL[a.kind]), [t]);
  const v = useHealthView(s, today, label);

  const root = useRef<HTMLDivElement>(null), scr = useRef<HTMLDivElement>(null), shade = useRef<HTMLDivElement>(null), det = useRef<HTMLDivElement>(null);
  const L1 = useRef<HTMLDivElement>(null), L2 = useRef<HTMLDivElement>(null), L3 = useRef<HTMLDivElement>(null), L4 = useRef<HTMLDivElement>(null), L5 = useRef<HTMLDivElement>(null);
  const mat = useRef<HTMLDivElement>(null), dsc = useRef<HTMLDivElement>(null), fly = useRef<HTMLDivElement>(null), edge = useRef<HTMLDivElement>(null), rim = useRef<HTMLDivElement>(null), drag = useRef<HTMLDivElement>(null);
  const [, SW] = useWidthOf(root);
  const eng = useRef<Expander | null>(null);
  const [openK, setOpenK] = useState<K | null>(null);
  const pending = useRef<HTMLElement | null>(null);
  const swapDir = useRef(0);
  const inHist = useRef(false);
  const chips = useRef<HTMLDivElement>(null), chipFrom = useRef<{ x: number; w: number } | null>(null);

  useLayoutEffect(() => {
    eng.current = new Expander({ root: root.current!, scr: scr.current!, shade: shade.current!, det: det.current!, L: [L1.current!, L2.current!, L3.current!, L4.current!, L5.current!], mat: mat.current!, dsc: dsc.current!, fly: fly.current!, edge: edge.current!, rim: rim.current!, drag: drag.current! });
    return () => eng.current?.closeNow();
  }, []);

  // React has drawn the page: grow it out of its section, or (after a chip) let the new page arrive
  useLayoutEffect(() => {
    const e = eng.current; if (!e || !openK) return;
    if (!e.st && pending.current) { e.open(openK, pending.current); pending.current = null; }
    else if (e.st && swapDir.current) { e.swapIn(swapDir.current); swapDir.current = 0; slideCap(); }
  }, [openK]);

  const done = useCallback((next: { k: string; src: HTMLElement } | null) => {
    if (next) { pending.current = next.src; setOpenK(next.k as K); } else setOpenK(null);
  }, []);
  const close = useCallback((o?: Parameters<Expander['close']>[1]) => {
    if (inHist.current) { inHist.current = false; try { history.back(); } catch { /* fine */ } }
    eng.current?.close(done, o);
  }, [done]);
  // swipe the page down from its top: it follows the finger, and on letting go closes (at the finger's speed) or springs back
  useEffect(() => {
    const el = dsc.current; if (!el) return;
    let y0 = 0, x0 = 0, on = false, maybe = false, pts: { t: number; y: number }[] = [];
    const start = (e: TouchEvent) => { if (e.touches.length !== 1) { maybe = false; return; } y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; maybe = el.scrollTop <= 0; on = false; pts = [{ t: e.timeStamp, y: y0 }]; };
    const move = (e: TouchEvent) => {
      if (!maybe && !on) return;
      const y = e.touches[0].clientY, dy = y - y0, dx = e.touches[0].clientX - x0;
      if (!on) {
        if (Math.abs(dx) > Math.abs(dy) || dy < -4 || el.scrollTop > 0) { maybe = false; return; }
        if (dy < 8) return;
        if (!eng.current?.dragStart()) { maybe = false; return; }
        on = true; y0 = y; // follows from here, so it never jumps by the slop
      }
      e.preventDefault();
      pts.push({ t: e.timeStamp, y }); if (pts.length > 6) pts.shift();
      eng.current?.dragMove(y - y0);
    };
    const end = (e: TouchEvent) => {
      maybe = false; if (!on) return; on = false;
      // the finger's speed over its last ~80 ms (px/ms, down positive); a finger that stopped before letting go has none
      const now = e.timeStamp, rec = pts.filter((p) => now - p.t < 100), a = rec[0], b = rec[rec.length - 1];
      const vy = a && b && b.t > a.t ? (b.y - a.y) / (b.t - a.t) : 0;
      const e0 = eng.current; if (!e0) return;
      const sp = e0.swipeSpring(vy);
      if (e0.dragEnd(vy)) close(sp);
    };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end); el.addEventListener('touchcancel', end);
    return () => { el.removeEventListener('touchstart', start); el.removeEventListener('touchmove', move); el.removeEventListener('touchend', end); el.removeEventListener('touchcancel', end); };
  }, [close]);
  const tap = useCallback((k: K, el: HTMLElement) => {
    eng.current?.tap(k, el, () => {
      pending.current = el; setOpenK(k);
      // Back closes the page (an entry of our own, under any pop-up opened from it)
      if (!inHist.current) { inHist.current = true; try { history.pushState({ hxPage: 1 }, ''); } catch { /* fine */ } }
    });
  }, []);
  useEffect(() => {
    const onPop = (e: PopStateEvent) => { if (inHist.current && !(e.state && e.state.hxPage)) { inHist.current = false; eng.current?.close(done); } };
    window.addEventListener('popstate', onPop);
    return () => { window.removeEventListener('popstate', onPop); if (inHist.current) { inHist.current = false; try { history.back(); } catch { /* fine */ } } };
  }, [done]);
  // the chip highlight is one capsule that slides to the chosen chip (FLIP on its ::before; the chip's text stays put)
  const slideCap = () => {
    const on = chips.current?.querySelector<HTMLElement>('button.on'), f = chipFrom.current; chipFrom.current = null;
    if (!on || !f || reduced()) return;
    const r = on.getBoundingClientRect();
    // the same curve as the page's slide, so the capsule lands with the page
    const sc = slideCurve(Math.max(1, Math.abs(f.x - r.left)));
    on.animate([{ transform: `translateX(${f.x - r.left}px) scaleX(${f.w / r.width})` }, { transform: 'none' }], { pseudoElement: '::before', duration: sc.duration, easing: sc.easing, fill: 'both' });
    // the row scrolls only when the chip is cut off, and on the slide's curve and time (the browser's own smooth scroll was a
    // third, quicker motion beside the page and the capsule)
    const row = chips.current!, l = on.offsetLeft - row.scrollLeft, cut = l < 20 || l + on.offsetWidth > row.clientWidth - 20;
    if (!cut) return;
    const from = row.scrollLeft, to = Math.max(0, Math.min(row.scrollWidth - row.clientWidth, on.offsetLeft - (row.clientWidth - on.offsetWidth) / 2)), t0 = performance.now();
    const step = (now: number) => { const p = Math.min(1, (now - t0) / sc.duration); row.scrollLeft = from + (to - from) * SLIDE_E(p); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  };
  const swap = (k: K) => {
    const e = eng.current, st = e?.st; if (!e || !st || st.closing || st.k === k) return;
    // the capsule leaves from where it is drawn (it may still be on its way from a chip tapped a moment ago)
    const ob = chips.current?.querySelector<HTMLElement>('button.on'), was = ob?.getBoundingClientRect();
    const cm = ob ? getComputedStyle(ob, '::before').transform : 'none', m = new DOMMatrix(cm === 'none' ? undefined : cm);
    chipFrom.current = was ? { x: was.left + m.e, w: was.width * m.a } : null;
    const sec = scr.current?.querySelector<HTMLElement>(`.hx-sec[data-k="${k}"]`); if (!sec) return;
    swapDir.current = e.swapOut(k, sec, ORDER.indexOf(k) > ORDER.indexOf(st.k as K) ? 1 : -1, scr.current!) ?? 0;
    setOpenK(k);
  };
  // while the page closes, a tap on it lands on what is under it (the section it is closing into, or another)
  const passTap = (ev: React.MouseEvent) => {
    const st = eng.current?.st; if (!st?.closing) return;
    const hit = document.elementsFromPoint(ev.clientX, ev.clientY).map((x) => x.closest<HTMLElement>('.hx-sec,.hx-pill[data-k]')).find(Boolean);
    if (hit && !det.current?.contains(hit)) tap(hit.dataset.k as K, hit);
  };

  useIntro(scr, v);

  const shown = ORDER.filter((k) => has(k, v));
  return (
    <div ref={root} className="hx-root">
      <div ref={scr} className={`screen hx-screen${v.loaded ? '' : ' hx-wait'}`}>
        <div className="hx-top hx-ln"><h1 className="hx-title">{t('Health')}</h1></div>
        <div className="hx-date hx-ln">{fmtDate(today, lang, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        <CoachLine v={v} d={s} today={today} t={t} lang={lang} onTap={tap} />
        <GoalCard d={s} today={today} t={t} lang={lang} />
        {v.ribbon && <RibbonBlock v={v} t={t} lang={lang} />}
        <Chapters v={v} t={t} lang={lang} onTap={tap} W={SW} />
      </div>
      <div ref={shade} className="hx-shade" />
      <div ref={drag} className="hx-drag">
      <div ref={det} className="hx-detail" style={{ ['--c' as string]: openK ? COL[openK] : C.sleep }} onClick={passTap}>
        <div ref={L1} className="hx-L hx-rnd hx-c1"><div ref={L2} className="hx-L hx-rnd hx-c2"><div ref={L3} className="hx-L hx-rnd hx-c3"><div ref={L4} className="hx-L hx-rnd hx-c4"><div ref={L5} className="hx-L">
          <div className="hx-cmat" />
          <div ref={mat} className="hx-mat" />
          <div ref={dsc} className="hx-dsc">
            {openK && (
              <div className="hx-page">
                <div className="hx-dhead"><button className="hx-x press" aria-label={t('Close')} onClick={() => close()}>✕</button></div>
                <div className="hx-chips" ref={chips}>{shown.map((k) => <button key={k} className={k === openK ? 'on' : ''} style={{ ['--c' as string]: COL[k] }} onClick={() => swap(k)}><i />{t(NAME[k])}</button>)}</div>
                <Page key={openK} k={openK} v={v} t={t} lang={lang} />
              </div>
            )}
          </div>
        </div></div></div></div><div ref={edge} className="hx-edge" /></div>
        <div ref={rim} className="hx-rim" aria-hidden><i className="tl"><b /></i><i className="tr"><b /></i><i className="bl"><b /></i><i className="br"><b /></i><u className="t" /><u className="b" /><u className="l" /><u className="r" /></div>
      </div>
      <div ref={fly} className="hx-fly" />
      </div>
    </div>
  );
}

function has(k: K, v: HealthView): boolean {
  switch (k) {
    case 'ready': return !!v.ready;
    case 'sleep': return !!v.night;
    case 'heart': return v.heart.rest !== undefined || v.heart.trace.length > 1;
    case 'move': return v.steps.today !== undefined;
    case 'week': case 'cardio': return true;
    case 'body': return v.body.kg !== undefined;
    case 'training': return true;
  }
}

/** the screen arriving: header and sentence rise a line at a time, the ribbon plays the day, sections rise as they scroll in */
function useIntro(scr: React.RefObject<HTMLDivElement | null>, v: HealthView) {
  const played = useRef(false), seen = useRef(new Set<string>());
  const hasRibbon = !!v.ribbon;
  useLayoutEffect(() => {
    const el = scr.current; if (!el || played.current || !v.loaded) return;
    if (!v.hasWatch && !v.body.kg && hasRibbon === false && v.ready === null) { /* nothing to play beyond the header */ }
    played.current = true;
    if (reduced()) return;
    const sm = { duration: 520, easing: 'cubic-bezier(.25,1,.5,1)' };
    const rise = (x: Element, delay: number) => x.animate([{ opacity: 0, transform: 'translateY(12px)', offset: 0 }], { ...sm, delay, fill: 'both' });
    // lines of the sentence: words grouped by the line they sit on (the house rhythm: 60 ms a step, at most 4)
    const words = [...el.querySelectorAll<HTMLElement>('.hx-w, .hx-pill')];
    const lines: HTMLElement[][] = [];
    const mid = (x: HTMLElement) => x.offsetTop + x.offsetHeight / 2; // layout, not the screen's moving picture
    for (const w of words) { const m = mid(w); const l = lines.find((x) => Math.abs(mid(x[0]) - m) < 16); if (l) l.push(w); else lines.push([w]); }
    const steps = [[...el.querySelectorAll<HTMLElement>('.hx-ln')], ...lines];
    steps.forEach((g, i) => g.forEach((w) => rise(w, 60 + Math.min(i, 5) * 60)));
    // the goal card under the Coach's line, one step after its last line
    const goal = el.querySelector('.hx-goal'); if (goal) rise(goal, 60 + Math.min(steps.length, 6) * 60);
  }, [scr, v.hasWatch, hasRibbon, v.body.kg, v.ready, v.loaded]);

  // the ribbon plays the day once, slowly: the night steps down, the heart thread draws, the steps hill rises, now lands
  const ribbonPlayed = useRef(false);
  useLayoutEffect(() => {
    const el = scr.current?.querySelector('.hx-ribbon'); if (!el || ribbonPlayed.current) return;
    ribbonPlayed.current = true;
    if (reduced()) return;
    const layer = (k: string) => el.querySelector<HTMLElement>(`[data-rl="${k}"]`);
    const wipe = (k: string, delay: number, duration: number) => {
      const o = layer(k), i = o?.firstElementChild; if (!o || !i) return;
      o.animate([{ transform: 'translateX(-100%)', offset: 0 }], { duration, delay, easing: EO, fill: 'both' });
      i.animate([{ transform: 'translateX(100%)', offset: 0 }], { duration, delay, easing: EO, fill: 'both' });
    };
    // one slow sweep through the day, left to right, every layer together (the day in time order); the labels and now settle after
    layer('axis')?.animate([{ opacity: 0, offset: 0 }], { duration: 600, delay: 200, easing: 'linear', fill: 'both' });
    for (const k of ['sleep', 'heart', 'steps', 'moves']) wipe(k, 220, 1200);
    // the steps label fades in once the sweep has drawn its hill (a wipe would cut it letter by letter)
    layer('slab')?.animate([{ opacity: 0, offset: 0 }], { duration: 360, delay: 640, easing: 'linear', fill: 'both' });
    layer('now')?.animate([{ opacity: 0, transform: 'translateY(-6px)', offset: 0 }], { duration: 420, delay: 700, easing: EO, fill: 'both' });
  });

  // chapters and rows rise as they come into view. The ones on screen at the start carry on the same wave as the lines above
  // (one calm wave, no waiting: Omar 26 Oct); later ones rise the moment they scroll in. One observer for the screen's life:
  // a re-render (data arriving) must not cut a rise short.
  const io = useRef<IntersectionObserver | null>(null), t0 = useRef(0), order = useRef(0);
  useLayoutEffect(() => {
    const el = scr.current; if (!el || !v.loaded) return;
    const fresh = [...el.querySelectorAll<HTMLElement>('.hx-chap,.hx-row,.hx-card')].filter((x) => !seen.current.has(x.dataset.k!));
    if (!fresh.length) return;
    fresh.forEach((x) => seen.current.add(x.dataset.k!));
    if (reduced()) return;
    if (!io.current) {
      t0.current = performance.now();
      // where the wave above ends: one step after the goal card
      const first = 60 + Math.min(el.querySelectorAll('.hx-sent .hx-w').length ? 6 : 3, 6) * 50;
      io.current = new IntersectionObserver((es) => es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top).forEach((e) => {
        const x = e.target as HTMLElement; io.current?.unobserve(x);
        const since = performance.now() - t0.current;
        const late = since < 400 ? Math.max(0, Math.min(first + order.current++ * 45, 520) - since) : 0;
        x.style.opacity = '';
        if (x.closest('.hx-root')?.querySelector('.hx-detail.live')) return; // home is under a page: it stays covered
        x.animate([{ opacity: 0, transform: 'translateY(12px)', offset: 0 }], { duration: 480, delay: late, easing: 'cubic-bezier(.25,1,.5,1)', fill: 'both' });
      }), { root: el, threshold: 0.2 });
    }
    fresh.forEach((x) => { x.style.opacity = '0'; io.current!.observe(x); });
  });
  useEffect(() => () => { io.current?.disconnect(); io.current = null; seen.current.clear(); }, []);
}

function Pill({ k, children, onTap }: { k: K; children: ReactNode; onTap: (k: K, el: HTMLElement) => void }) {
  return <span className="hx-pill hx-w" data-k={k} style={{ ['--c' as string]: COL[k] }} onClick={(e) => { e.stopPropagation(); onTap(k, e.currentTarget); }}><i /><span data-share="num">{children}</span></span>;
}

/** the Coach's orb, small: the logo's own dots (ui/logoDots.ts) in the live orb's colours (ui/Sphere.tsx: its light is
 *  --ac-2, its shade --ac at 30 %), so it is the same orb as the tab bar's, whatever the area's accent */
const ORB_DOTS = LOGO.map((p) => ({ ...p, f: Math.round(Math.max(0, Math.min(1, (p.rgb[1] - 52) / (178 - 52))) * 100) }));
function MiniOrb({ size = 24 }: { size?: number }) {
  return <svg className="hx-orb" width={size} height={size} viewBox="-1.1 -1.1 2.2 2.2" aria-hidden>{ORB_DOTS.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={p.r} style={{ fill: `color-mix(in srgb, var(--ac-2) ${p.f}%, color-mix(in srgb, var(--ac) 30%, #000))` }} />)}</svg>;
}

/** a sentence with one number in it drawn as a pill: words wrap and rise one by one */
function Words({ tpl, pill }: { tpl: string; pill?: ReactNode }) {
  return <>{tpl.split(/(\{x\})/).map((seg, j) => seg === '{x}' ? <span key={j}>{pill}</span> : seg.split(/(\s+)/).map((w, n) => (w.trim() ? <span key={`${j}-${n}`} className={j > 0 && n === 0 && /^[,.;:!?)]/.test(w) ? 'hx-w hx-tight' : 'hx-w'}>{w}</span> : w)))}</>;
}

/** what the Coach's second sentence is about, by its note: the colour of its number */
const NOTE_COL = (n: Nudge) => (n.id.startsWith('protein:') ? 'var(--c-protein, #e0b07a)' : n.id.startsWith('over:') ? 'var(--c-kcal, #f5e2b8)' : n.id.startsWith('stall:') ? C.train : C.body);
const sentenceOf = (x: string) => (/[.!?…]$/.test(x.trim()) ? x.trim() : `${x.trim()}.`);

/**
 * The Coach speaking, on top of Health (Omar 26 Oct, "build it around the coach"): last night against his usual, then the
 * one thing Today's notes put first (lib/nudges.ts rankNotes, the same ranking as Today's pin; goals are left to the card
 * under it, app chores to Today). Built on the phone from the same facts the Coach uses; opening Health asks nothing.
 */
function CoachLine({ v, d, today, t, lang, onTap }: { v: HealthView; d: AppData; today: string; t: TFn; lang: Lang; onTap: (k: K, el: HTMLElement) => void }) {
  const hour = new Date().getHours();
  // once per store change, not on every section open (those renders land in the frame before the open animation)
  const note = useMemo(() => {
    const map = exerciseMap(d.exercises);
    return healthNote(rankNotes(d, today, hour, t, lang, (id) => { const e = map.get(id); return e ? exName(e, lang) : '?'; }, cachedInsights(today)));
  }, [d, today, hour, t, lang]);
  // the goal the card shows (its first tracked one)
  const goalWarn = useMemo(() => { const m = cardGoal(d, today); const g = m?.goal && goalState(d, m, today); return !!g && (WARN.has(g.pace) || (g.daysLeft !== undefined && g.daysLeft < 0 && g.pace !== 'reached')); }, [d, today]);
  const night = v.night;
  // last night: "about your usual" within 30 min of the median of the 30 nights before (lib/recovery.ts usualSleep)
  let p1: ReactNode = null;
  if (night) {
    const d0 = night.usual ? night.asleep - night.usual : undefined;
    const tpl = d0 === undefined ? t('You slept {x}.') : Math.abs(d0) < USUAL_BAND ? t('You slept {x}, about your usual.') : t(d0 > 0 ? 'You slept {x}, {d} more than usual.' : 'You slept {x}, {d} less than usual.', { d: hm(Math.abs(d0), lang) });
    p1 = <Words tpl={tpl} pill={<Pill k="sleep" onTap={onTap}>{hm(night.asleep, lang)}</Pill>} />;
  }
  let p2: ReactNode = null;
  if (note) {
    const run = () => { if (note.action) runNudge(note.action.run, today); };
    p2 = note.say
      ? <Words tpl={note.say.tpl} pill={<span className="hx-pill hx-w" style={{ ['--c' as string]: NOTE_COL(note), cursor: note.action ? undefined : 'default' }} onClick={note.action ? (e) => { e.stopPropagation(); run(); } : undefined}><i /><span>{note.say.x}</span></span>} />
      : <Words tpl={sentenceOf(note.title)} />;
  }
  if (!p1 && !p2) p1 = <Words tpl={v.hasWatch ? t('Your watch fills this in as it syncs.') : goalWarn ? t('Here is where your goal stands.') : t('Nothing needs your attention right now.')} />;
  return (
    <>
      <div className="hx-coach hx-ln"><MiniOrb />{t('Coach')}</div>
      <p className="hx-sent">{p1}{p1 && p2 ? ' ' : ''}{p2}</p>
    </>
  );
}

// t() on each, so the Danish check (scripts/i18n-keys.mjs) sees every label
const PACE = (t: TFn): Record<Pace, string> => ({ reached: t('Reached'), ready: t('Ready to test'), 'on pace': t('On pace'), ahead: t('Ahead'), behind: t('Behind'), 'too fast': t('Faster than safe'), 'wrong way': t('Wrong way'), slow: t('Slow'), stalled: t('Stalled'), 'date passed': t('Date passed'), 'too early': t('Too early to tell') });

/** paces that need something from him: the pill gets a coral rim (white words, no wash) so it reads at a glance */
/** the time left as he'd say it: days under a week, weeks after; nothing on the day or after it */
/** the goal the card shows, and the Coach line checks: the first tracked one, else the first */
const cardGoal = (d: AppData, today: string) => { const all = activeGoals(d, today); return all.filter(tracked)[0] ?? all[0]; };
const timeLeft = (n: number | undefined, t: TFn) => (n === undefined || n <= 0 ? '' : n === 1 ? t('1 day') : n < 7 ? t('{n} days', { n }) : Math.round(n / 7) === 1 ? t('1 week') : t('{n} weeks', { n: Math.round(n / 7) }));
const WARN = new Set<Pace>(['behind', 'too fast', 'wrong way', 'stalled', 'date passed']);

/** why a goal can't be judged yet, as the one thing that helps (never "log food" where food can't count) */
function earlyLine(st: GoalState, t: TFn): string {
  switch (st.whyCode) {
    case 'young': case 'fewWeighIns': return st.eating ? t('Weigh in most mornings and the Coach can judge it.') : t('Log a few days of food or weigh in most mornings, and the Coach can judge it.');
    case 'noWeighIns': return t('Weigh in once and the Coach can judge it.');
    case 'stale': return t('Weigh in again and the Coach can judge it.');
    case 'fewInWindow': return t('A few more weigh-ins and the Coach can judge it.');
    case 'notTrained': case 'liftUntrained': return t('Train it once and the Coach can judge it.');
    case 'fewWorkouts': return t('A few more workouts with it and the Coach can judge it.');
    case 'noExercise': return t('Tell the Coach which lift it is, and it follows it here.');
    case 'untracked': return t('No number to follow, so the Coach checks in with you instead.');
    default: return t('The Coach can judge it soon.');
  }
}

/**
 * The goal the Coach follows, right under its line: the same numbers as the Coach and Today (lib/goals.ts goalState,
 * the first tracked goal, as the Coach's "My goal" chip picks it). A thin outline, no fill: it is part of the Coach's
 * voice, not another card. Tap it to ask the Coach how it is going.
 */
const GoalCard = memo(function GoalCard({ d, today, t, lang }: { d: AppData; today: string; t: TFn; lang: Lang }) {
  const goals = activeGoals(d, today).filter(tracked);
  const m = cardGoal(d, today);
  const u = d.settings.units.weight;
  const kg = (x: number) => `${fmtNum(kgToDisplay(x, u), lang, 1)}\u00a0${u}`;
  const ask = (prompt: string) => useUI.getState().push('coach', { ask: prompt });
  if (!m) {
    return (
      <button className="hx-goal press" onClick={() => ask(t('I want to set a goal. Ask me what I’m working toward and help me make it concrete.'))}>
        <div className="hx-ghead"><span className="hx-gt">{t('What are we working on?')}</span><span className="hx-gchev">›</span></div>
        <div className="hx-gline">{t('Tell the Coach a goal and it follows it here.')}</div>
      </button>
    );
  }
  const name0 = m.text.replace(/^(goal|mål)\s*:\s*/i, '').replace(/^\p{Ll}/u, (c) => c.toUpperCase());
  // a goal saved without a plan (no number, no date: "a muscle-up"): its words, and the Coach checks in
  if (!m.goal) return (
    <button className="hx-goal press" onClick={() => ask(t('How am I doing on my goal “{goal}”? Be honest.', { goal: name0 }))}>
      <div className="hx-ghead"><span className="hx-gt">{name0}</span><span className="hx-gchev">›</span></div>
      <div className="hx-gline">{t('No number to follow, so the Coach checks in with you instead.')}</div>
    </button>
  );
  const st0 = goalState(d, m, today);
  // the date has gone by and it isn't reached: say so, whatever the pace (lib/goals.ts keeps judging the pace for the Coach)
  const over = !!st0 && st0.daysLeft !== undefined && st0.daysLeft < 0 && st0.pace !== 'reached';
  const st = st0 && over ? { ...st0, pace: 'date passed' as Pace } : st0;
  const name = name0;
  const by = m.goal.by ? fmtDate(m.goal.by, lang, { day: 'numeric', month: 'short' }) : undefined;
  const lift = m.goal.metric === 'lift';
  const ex = m.exerciseIds?.[0] ? exerciseMap(d.exercises).get(m.exerciseIds[0]) : undefined; // a deleted lift: just the weight
  const gone = lift && !!m.exerciseIds?.[0] && !ex; // ...and no verdict on a lift that isn't there
  const what = m.goal.target === undefined ? name : lift ? `${ex ? `${exName(ex, lang)} ` : ''}${kg(m.goal.target)}${(m.goal.reps ?? 1) > 1 ? ` × ${m.goal.reps}` : ''}` : kg(m.goal.target);
  const title = by && m.goal.target !== undefined ? t('{what} by {date}', { what, date: by }).replace(/ (\d)/g, '\u00a0$1') : what;
  let line = '';
  let bar: { start: number; now: number; target: number } | undefined;
  if (st) {
    const left = st.now !== undefined && st.target !== undefined ? Math.abs(st.target - st.now) : undefined;
    if (st.pace === 'reached') {
      const h = holdKcal(d, st, today);
      line = h ? (h.first ? t('{a} kcal for a week, then about {b} to hold it.', { a: fmtNum(h.first, lang, 0), b: fmtNum(h.hold, lang, 0) }) : t('About {b} kcal a day to hold it.', { b: fmtNum(h.hold, lang, 0) })) : t('Tell the Coach what is next.');
    } else if (lift && m.exerciseIds?.[0] && !ex) line = earlyLine({ ...st, whyCode: 'noExercise' }, t);
    else if (over) line = t('Tell the Coach how it went.');
    else if (st.pace === 'too early' && !st.next) line = earlyLine(st, t);
    else if (st.byFood && st.now !== undefined && st.scaleKg !== undefined) line = t('About {now} by what you eat · scale {scale}', { now: kg(st.now), scale: kg(st.scaleKg) });
    else if (lift && st.now !== undefined && left !== undefined) line = [t('Best set worth {n}', { n: kg(st.now) }), st.now < st.target! - 0.05 ? t('{n} to go', { n: kg(left) }) : '', timeLeft(st.daysLeft, t)].filter(Boolean).join(' · ');
    else if (left !== undefined) {
      // the pace it needs against the pace it has, so every pill shows its evidence (the date is in the title)
      const wk = (x: number) => `${x < 0 ? '−' : '+'}${fmtNum(Math.abs(kgToDisplay(x, u)), lang, 1)}\u00a0${u}`;
      const why = st.need !== undefined && st.rate !== undefined ? t('needs {a}/wk, now {b}/wk', { a: wk(st.need), b: wk(st.rate).replace(/\u00a0\S+$/, '') }) : '';
      line = [t('{n} to go', { n: kg(left) }), !why ? timeLeft(st.daysLeft, t) : '', why || (d.settings.goals.kcal ? t('{n} kcal target', { n: fmtNum(d.settings.goals.kcal, lang, 0) }) : '')].filter(Boolean).join(' · ');
    }
    if (!line && st.pace === 'date passed') line = t('Tell the Coach how it went.');
    // (not while judged on food: that "now" is an estimate, the line above says so)
    if (!st.byFood && st.start !== undefined && st.now !== undefined && st.target !== undefined && st.pace !== 'too early' && st.start !== st.target) bar = { start: st.start, now: st.now, target: st.target };
  } else line = t('No number to follow, so the Coach checks in with you instead.');
  const more = goals.length > 1 ? goals.length - 1 : 0;
  const col = lift ? C.cardio : C.body;
  const f = bar ? Math.max(0, Math.min(1, (bar.now - bar.start) / (bar.target - bar.start))) : 0;
  // where the date says he should be today: the gap to the knob is the evidence for Behind (a still tick, no motion)
  const span = bar && m.goal.startDate && m.goal.by ? diffDays(m.goal.by, m.goal.startDate) : 0;
  const exp0 = span > 0 ? Math.max(0, Math.min(1, diffDays(today, m.goal.startDate!) / span)) : undefined;
  // (no tick when the knob is on it: on pace there is no gap to show, and a sliver beside the knob reads as a glitch)
  const exp = exp0 !== undefined && Math.abs(exp0 - f) > 0.04 ? exp0 : undefined;
  return (
    <button className="hx-goal press" style={{ ['--c' as string]: col }} onClick={() => ask(t('How am I doing on my goal “{goal}”? Be honest.', { goal: name }))}>
      <div className="hx-ghead"><span className="hx-gt">{title}</span>{st && !gone && st.whyCode !== 'untracked' ? <span className={`hx-gpace${WARN.has(st.pace) ? ' hx-gwarn' : ''}`}>{PACE(t)[st.pace]}</span> : <span className="hx-gchev">›</span>}</div>
      {bar && <div className="hx-gbar" style={{ ['--f' as string]: f }}><span className="hx-gnow">{(lift ? t('{n} now', { n: fmtNum(kgToDisplay(bar.now, u), lang, 1) }) : t('{n} trend', { n: fmtNum(kgToDisplay(bar.now, u), lang, 1) }))}</span>{exp !== undefined && <b className="hx-gexp" style={{ left: `${exp * 100}%` }} />}<i /></div>}
      {bar && <div className="hx-gends"><span>{fmtNum(kgToDisplay(bar.start, u), lang, 1)}&nbsp;{u}</span><span>{fmtNum(kgToDisplay(bar.target, u), lang, 1)}&nbsp;{u}</span></div>}
      {(line || more > 0) && <div className="hx-gline">{line}{more > 0 && <>{line ? ' · ' : ''}<b>{t('+{n} more', { n: more })}</b></>}</div>}
    </button>
  );
});

function RibbonBlock({ v, t, lang }: { v: HealthView; t: TFn; lang: Lang }) {
  const [ref, w] = useWidth<HTMLDivElement>(384);
  const r = v.ribbon!;
  const axis = [0, 6, 12, 18, 24].map((h) => fmtTime(r.from + h * 3600000, lang).replace(/:00$/, '').replace(/\.00$/, ''));
  return (
    <div ref={ref} className="hx-bleed hx-rib">
      <Ribbon r={r} w={w} axis={axis} labels={{ sleep: v.night ? `${t('Sleep')} ${hm(v.night.asleep, lang)}` : undefined, steps: t('Steps') }} />
    </div>
  );
}

/** the width an element is drawn at (an element the caller already holds) */
function useWidthOf(ref: React.RefObject<HTMLElement | null>, fallback = 384): [React.RefObject<HTMLElement | null>, number] {
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const set = () => { const x = Math.round(el.getBoundingClientRect().width); if (x > 0) setW(x); };
    set();
    const ro = new ResizeObserver(set); ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return [ref, w];
}

type Size = 'wide' | 'tall' | 'sq';
/** the home screen's cards, in three chapters (the bento, Omar 27 Oct): Recovery, Training (cardio inside it), Body */
const CHAPTERS: { name: string; cards: [K, Size][] }[] = [
  { name: 'Recovery', cards: [['sleep', 'wide'], ['heart', 'wide']] },
  { name: 'Training', cards: [['cardio', 'tall'], ['week', 'sq'], ['training', 'sq']] },
  { name: 'Body', cards: [['body', 'sq'], ['move', 'sq']] },
];

function Chapters({ v, t, lang, onTap, W }: { v: HealthView; t: TFn; lang: Lang; onTap: (k: K, el: HTMLElement) => void; W: number }) {
  return <>{CHAPTERS.map(({ name, cards }) => {
    const ks = cards.filter(([k]) => has(k, v));
    // no watch: Body says, once, what fills it in (a row of its own, never an empty chapter)
    const empty = name === 'Body' && !v.hasWatch;
    if (!ks.length && !empty) return null;
    return (
      <div key={name} className="hx-chapter">
        {ks.length > 0 && <h2 className="hx-chap" data-k={`ch-${name}`}>{t(name)}</h2>}
        {ks.length > 0 && <div className="hx-grid">{ks.map(([k, size]) => <Card key={k} k={k} size={size} v={v} t={t} lang={lang} W={W} onTap={onTap} />)}</div>}
        {empty && <div className="hx-row hx-quiet" data-k="ch-watch"><div className="hx-rmain"><div className="hx-lab" style={{ ['--c' as string]: C.sleep }}><i />{t('Sleep and heart')}</div><div className="hx-sub hx-cap">{t('Connect your watch in Settings → Watch, and sleep, heart and steps fill in here.')}</div></div></div>}
      </div>
    );
  })}</>;
}

/** a card's chart, drawn at the page's full width W with 20 px either side: the page shows it as it is, the card shows the
 *  same drawing scaled down to its own width, so card and page share one picture (it flies between them whole) */
function chartOf(k: K, v: HealthView, W: number, u: 'kg' | 'lb', t: TFn): { node: ReactNode; h: number } | null {
  switch (k) {
    case 'sleep': return v.night ? { node: <Hypnogram night={v.night.session} w={W} />, h: 72 } : null;
    case 'heart': return v.heart.trace.length > 1 ? { node: <Trace values={v.heart.trace} band={v.heart.restRange} w={W} usualLabel={t('your usual')} />, h: 54 } : null;
    case 'move': return v.steps.curve.length > 1 ? { node: <StepsDay today={v.steps.curve} usual={v.steps.usualCurve} w={W} h={130} sw={3} r={8} />, h: 138 } : null;
    case 'cardio': return { node: <DayBars mins={v.week.days.map((d) => d.cardioMin)} w={W} h={290} />, h: 290 };
    case 'week': return { node: <WeekDotsSvg days={v.week.days} today={v.today} w={W} />, h: 49 };
    case 'training': return { node: <WeekBarsBig weeks={v.train.weeks} w={W} h={110} />, h: 110 };
    case 'body': return v.body.series.length > 1 ? { node: <div style={{ padding: '0 20px' }}><Spark values={v.body.series.map((x) => kgToDisplay(x, u))} w={W - 40} h={140} sw={3.2} dot={8} /></div>, h: 140 } : null;
    default: return null;
  }
}

/** the week's day letters under a chart of seven days (the card's are the page's, smaller; they don't fly) */
function DayLetters({ v, lang, w, pad, size, ml = 0 }: { v: HealthView; lang: Lang; w: number; pad: number; size: number; ml?: number }) {
  return <div className="hx-dl" style={{ width: w, padding: `0 ${pad}px`, fontSize: size, marginLeft: ml }}>{v.week.days.map((d) => <span key={d.date} className={d.date === v.today ? 'now' : ''}>{fmtDate(d.date, lang, { weekday: 'narrow' })}</span>)}</div>;
}

/** a card on the home screen: label, number, one line, and its chart (the page's own, drawn small) */
function Card({ k, size, v, t, lang, W, onTap }: { k: K; size: Size; v: HealthView; t: TFn; lang: Lang; W: number; onTap: (k: K, el: HTMLElement) => void }) {
  const [ref, cw] = useWidth<HTMLElement>(size === 'wide' ? 344 : 167);
  const u = useScreenStore().settings.units.weight;
  const s = Math.max(0.1, (cw - 32) / (W - 40));
  let num: ReactNode = null, unit: ReactNode = null, cap: ReactNode = null, extra: ReactNode = null;
  if (k === 'sleep') {
    const n = v.night!;
    num = <Roll text={hm(n.asleep, lang)} />;
    cap = <>{fmtTime(n.session.start, lang)} → {fmtTime(n.session.end, lang)} · {t('deep')} {hm(n.stages.deep, lang)}</>;
  } else if (k === 'heart') {
    const h = v.heart;
    num = <Roll text={h.rest !== undefined ? String(h.rest) : '—'} />; unit = t('bpm resting');
    if (h.hrv !== undefined) cap = h.hrvRange && h.hrv >= h.hrvRange[0] && h.hrv <= h.hrvRange[1] ? t('HRV {n} ms, inside your usual range', { n: Math.round(h.hrv) }) : h.hrvRange && h.hrv < h.hrvRange[0] ? t('HRV {n} ms, under your usual range', { n: Math.round(h.hrv) }) : t('HRV {n} ms', { n: Math.round(h.hrv) });
  } else if (k === 'move') {
    const st = v.steps;
    num = <Roll text={fmtNum(st.today ?? 0, lang, 0)} />;
    if (st.usual) cap = t('usual {n}', { n: fmtNum(Math.round(st.usual / 100) * 100, lang, 0) });
  } else if (k === 'cardio') {
    const wk = v.week, top = wk.sports[0], last = wk.last;
    num = <Roll text={String(wk.cardioMin)} />; unit = t('min'); cap = t('this week');
    extra = <>
      <DayLetters v={v} lang={lang} w={W * s} pad={20 * s} size={10.5} ml={-20 * s} />
      {(top || last) && <div className="hx-stats">
        {top && <div><span>{top.label}</span><b>{top.min}<small> min</small></b></div>}
        {last && <div><span>{t('Last session')}</span><b>{last.avgHr ? <>{Math.round(last.avgHr)}<small> bpm</small></> : <>{Math.round(last.durationSec / 60)}<small> min</small></>}</b></div>}
      </div>}
    </>;
  } else if (k === 'week') {
    num = <Roll text={String(v.week.workouts)} />; unit = t('of {n}', { n: v.week.target }); cap = t('this week');
  } else if (k === 'training') {
    num = <Roll text={String(v.train.n28)} />; unit = t('workouts'); cap = t('last 4 weeks');
  } else if (k === 'body') {
    const b = v.body;
    num = <Roll text={fmtNum(kgToDisplay(b.kg!, u), lang, 1)} />; unit = u;
    cap = b.rate !== null ? `${fmtSigned(kgToDisplay(b.rate, u), lang)} ${u}/${t('wk')}` : b.date ? t('Last weigh-in {d}', { d: fmtDate(b.date, lang, { day: 'numeric', month: 'short' }) }) : null;
  }
  const ch = chartOf(k, v, W, u, t);
  return (
    <section ref={ref} className={`hx-sec hx-card hx-${size}`} data-k={k} style={{ ['--c' as string]: COL[k] }} onClick={(e) => onTap(k, e.currentTarget)}>
      <div className="hx-lab" data-share="lab"><i />{t(NAME[k])}</div>
      <div className="hx-rnum"><span className="hx-n" data-share="num">{num}</span>{unit && <span className="hx-sub hx-unit" data-share="unit">{unit}</span>}</div>
      {cap && <div className="hx-sub hx-cap" data-share="cap">{cap}</div>}
      {ch && <div className="hx-cchart" data-share="chart" style={{ width: W * s, height: ch.h * s, marginLeft: -20 * s }}><div style={{ width: W, transform: `scale(${s})` }}>{ch.node}</div></div>}
      {extra}
    </section>
  );
}

const PART: Record<string, string> = { duration: 'Length', deep: 'Deep sleep', rem: 'REM sleep', rest: 'Restfulness', timing: 'Timing', heart: 'Heart rate', hrv: 'HRV', restHr: 'Resting heart rate', sleep: 'Sleep', load: 'Recovered from training' };

function Parts({ s, t }: { s: Score; t: TFn }) {
  return (
    <div className="hx-stages">
      {s.parts.map((p) => (
        <div key={p.key} className="hx-strow">
          <b>{t(PART[p.key] ?? p.key)}</b>
          <div className="hx-sbar"><span className="hx-sb" style={{ ['--sc' as string]: 'var(--c)', width: `${Math.round(p.score)}%` }} /></div>
          <span className="num">{Math.round(p.score)}</span>
        </div>
      ))}
    </div>
  );
}

/** the page a section grows into */
function Page({ k, v, t, lang }: { k: K; v: HealthView; t: TFn; lang: Lang }) {
  const [ref, w] = useWidth<HTMLDivElement>(344);
  const wu = useScreenStore().settings.units.weight;
  const W = w + 40;
  // the card's chart, at full size: the hero under the number (it is what flies between card and page)
  const ch = chartOf(k, v, W, wu, t);
  const hero = (style?: React.CSSProperties) => ch && <div className="hx-bleed" data-share="chart" style={style}>{ch.node}</div>;
  let out: ReactNode = null;
  if (k === 'sleep' && v.night) {
    const n = v.night, sc = n.score;
    const st: [string, number, string][] = [[t('Deep'), n.stages.deep, '#7d6bff'], [t('REM'), n.stages.rem, '#c7b8ff'], [t('Light'), n.stages.light, '#a8b4ff'], [t('Awake'), n.stages.awake, '#ff9a7a']];
    const mx = Math.max(1, st.reduce((a, x) => a + x[1], 0)); // each stage as a share of the night
    const head = !sc ? t('Last night') : t(({ Great: 'A great night', Good: 'A good night', Fair: 'A fair night', Poor: 'A short or broken night' } as Record<string, string>)[sc.band]);
    const diff = n.usual ? n.asleep - n.usual : undefined;
    const nights = n.last14.concat([{ date: v.today, min: n.asleep }]);
    const top = Math.max(540, ...nights.map((x) => x.min));
    out = <>
      <div className="hx-lab" data-share="lab"><i />{t(NAME.sleep)}</div>
      <div className="hx-n hx-n56" data-share="num">{hm(n.asleep, lang)}</div>
      <div className="hx-sub" data-share="cap">{fmtTime(n.session.start, lang)} → {fmtTime(n.session.end, lang)} · {t('deep')} {hm(n.stages.deep, lang)}</div>
      {hero({ marginTop: 10 })}
      <h3 className="hx-dt hx-rise">{head}</h3>
      {diff !== undefined && <p className="hx-dsub hx-rise">{Math.abs(diff) < USUAL_BAND ? t('About your usual {u}.', { u: hm(n.usual!, lang) }) : t(diff > 0 ? '{d} more than your usual {u}.' : '{d} less than your usual {u}.', { d: hm(Math.abs(diff), lang), u: hm(n.usual!, lang) })}</p>}
      {sc && <div className="hx-panel hx-rise"><div className="hx-rowc"><div><div className="hx-ptitle" style={{ margin: 0 }}>{t('Sleep score')}</div><div className="hx-n" style={{ fontSize: 40, fontWeight: 300, marginTop: 4 }}>{sc.score}<small>/100 · {t(sc.band)}</small></div>{sc.cap && sc.capMin && <div className="hx-sub" style={{ marginTop: 4, textWrap: 'balance' }}>{t('Under {h} of sleep it stays at most {n}.', { h: hm(sc.capMin, lang), n: sc.cap })}</div>}</div><ScoreRing value={sc.score} color={C.sleep} /></div><div style={{ marginTop: 14 }}><Parts s={sc} t={t} /></div><div className="hx-sub" style={{ marginTop: 10 }}>{t('Length counts for 30%, each of the others 10–15%.')}</div></div>}
      <div className="hx-panel hx-rise"><div className="hx-stages">{st.map(([name, m, c]) => <div key={name} className="hx-strow"><b style={{ color: c }}>{name}</b><div className="hx-sbar"><span className="hx-sb" style={{ ['--sc' as string]: c, width: `${Math.round((m / mx) * 100)}%` }} /></div><span>{hm(m, lang)}</span></div>)}</div></div>
      <div className="hx-panel hx-rise"><div className="hx-ptitle">{n.usual ? t('The last 14 nights · usual {u}', { u: hm(n.usual, lang) }) : t('The last 14 nights')}</div>
        <svg viewBox={`0 0 ${w} 112`} width={w} height={112} style={{ display: 'block', overflow: 'visible' }} aria-hidden>
          <defs><clipPath id="hx14"><rect x="0" y="-10" width={w} height="106" /></clipPath></defs>
          <g clipPath="url(#hx14)">{nights.map((x, i) => { const cx = 8 + (i / (nights.length - 1)) * (w - 16), y = 96 - (x.min / top) * 90; const last = i === nights.length - 1; return x.min ? <g key={x.date} className="hx-col"><rect x={cx - 1} y={y} width={2} height={96 - y + 8} rx={1} fill={C.sleep} opacity={last ? 1 : 0.5} /><circle cx={cx} cy={y} r={last ? 5 : 3.5} fill={C.sleep} opacity={last ? 1 : 0.75} /></g> : null; })}</g>
          {n.usual && <rect x="0" y={96 - (n.usual / top) * 90} width={w} height="1" fill="rgba(255,255,255,.3)" />}
          <text className="hx-ax3" x="0" y="110">{fmtDate(nights[0].date, lang, { day: 'numeric', month: 'short' })}</text><text className="hx-ax3" x={w} y="110" textAnchor="end">{t('last night')}</text>
        </svg></div>
      <div className="hx-panel hx-rise"><div className="hx-kv">
        <div><span>{t('Bedtime')}</span><b>{fmtTime(n.session.start, lang)}</b></div><div><span>{t('Woke')}</span><b>{fmtTime(n.session.end, lang)}</b></div>
        {n.hrLow !== undefined && <div><span>{t('Heart asleep')}</span><b>{n.hrLow}–{n.hrHigh}</b></div>}
        {v.heart.resp !== undefined && <div><span>{t('Breathing')}</span><b>{fmtNum(v.heart.resp, lang, 0)} /min</b></div>}
      </div></div>
    </>;
  } else if (k === 'heart') {
    const h = v.heart;
    const vit: [string, number | undefined, [number, number] | undefined, string][] = [[t('Resting'), h.rest, h.restRange, ''], [t('HRV'), h.hrv, h.hrvRange, ' ms'], [t('Oxygen'), h.spo2, h.spo2Range, ' %'], [t('Breathing'), h.resp, h.respRange, ''], [t('Skin temp'), h.skin, h.skinRange, ' °C']];
    const calm = h.rest !== undefined && h.usual !== undefined && h.rest <= h.usual;
    const hrvLow = h.hrv !== undefined && !!h.hrvRange && h.hrv < h.hrvRange[0];
    out = <>
      <div className="hx-lab" data-share="lab"><i />{t(NAME.heart)}</div>
      <div><span className="hx-n hx-n64" data-share="num">{h.rest ?? '—'}</span><span className="hx-sub hx-unit" data-share="unit">{t('bpm resting')}</span></div>
      {hero({ marginTop: 4 })}
      {h.trace.length > 1 && <div className="hx-ends hx-rise" style={{ marginTop: 0 }}><span className="hx-ax3">{fmtDate(addDays(v.today, 1 - h.trace.length), lang, { day: 'numeric', month: 'short' })}</span><span className="hx-ax3">{t('Today')}</span></div>}
      <h3 className="hx-dt hx-rise">{!calm ? t('Your heart is working a little harder') : hrvLow ? t('A calm pulse, with HRV a little low') : t('Your heart is calm')}</h3>
      {h.rest !== undefined && h.usual !== undefined && <p className="hx-dsub hx-rise">{t('Resting at {n}, your usual is {u}.', { n: h.rest, u: Math.round(h.usual) })}</p>}
      {h.overnight.length > 4 && <div className="hx-panel hx-rise"><div className="hx-ptitle">{t('Last night, minute by minute')}</div><div className="hx-bleed" style={{ marginTop: -6 }}><NightHeart points={h.overnight} w={W} lowLabel={(b) => t('low {n}', { n: b })} ends={[fmtTime(h.overnight[0].t, lang), fmtTime(h.overnight[h.overnight.length - 1].t, lang)]} /></div></div>}
      <div className="hx-panel hx-rise"><div className="hx-ptitle">{t('Overnight vitals')}</div><div className="hx-vit">{vit.filter((x) => x[1] !== undefined).map(([name, val, rg, unit]) => {
        const temp = unit === ' °C', pad = rg ? rg[1] - rg[0] + (temp ? 0.3 : 1) : 0, lo = rg ? rg[0] - pad : 0, hi = rg ? rg[1] + pad : 1, pos = (x: number) => Math.max(0, Math.min(100, ((x - lo) / (hi - lo)) * 100));
        return <div key={name} className="hx-vrow"><span>{name}</span><div className="hx-rg">{rg && <u style={{ left: `${pos(rg[0])}%`, width: `${pos(rg[1]) - pos(rg[0])}%` }} />}<i style={{ left: `${rg ? pos(val!) : 50}%` }} /></div><b>{temp ? fmtSigned(val!, lang) : fmtNum(val!, lang, 0)}{unit}</b></div>;
      })}</div></div>
      <div className="hx-panel hx-rise"><div className="hx-kv">{h.top !== undefined && <div><span>{t('Top today')}</span><b>{h.top}</b></div>}{h.vo2 !== undefined && <div><span>VO2 max</span><b>{fmtNum(h.vo2, lang, 0)}</b></div>}</div></div>
    </>;
  } else if (k === 'move') {
    const st = v.steps, d = v.day;
    const usualNow = st.usualCurve.length ? st.usualCurve[Math.max(0, st.curve.length - 1)] : undefined;
    const ahead = usualNow !== undefined && st.today !== undefined ? st.today - usualNow : undefined;
    const top = Math.max(1, ...st.week.map((x) => x.count ?? 0));
    out = <>
      <div className="hx-lab" data-share="lab"><i />{t(NAME.move)}</div>
      <div><span className="hx-n hx-n52" data-share="num">{fmtNum(st.today ?? 0, lang, 0)}</span>{st.usual ? <span className="hx-sub hx-unit">{t('of your usual {n}', { n: fmtNum(Math.round(st.usual / 100) * 100, lang, 0) })}</span> : null}</div>
      {hero({ marginTop: 14 })}
      <h3 className="hx-dt hx-rise">{ahead === undefined ? t('Today so far') : Math.abs(ahead) < 800 ? t('On your usual pace') : ahead > 0 ? t('Ahead of your usual day') : t('Behind your usual day')}</h3>
      {ahead !== undefined && st.usual && <p className="hx-dsub hx-rise">{t('The dotted line is your usual day. You tend to finish around {n}.', { n: fmtNum(Math.round(st.usual / 100) * 100, lang, 0) })}</p>}
      {st.week.some((x) => x.count) && <div className="hx-panel hx-rise"><div className="hx-ptitle">{t('This week')}</div>
        <svg viewBox={`0 0 ${w} 132`} width={w} height={132} style={{ display: 'block', overflow: 'visible' }} aria-hidden>
          <defs><clipPath id="hxW"><rect x="0" y="-10" width={w} height="126" /></clipPath></defs>
          <g clipPath="url(#hxW)">{st.week.map((x, i) => { const cx = 20 + (i / 6) * (w - 40), y = 116 - ((x.count ?? 0) / top) * 104; const now = x.date === v.today; return x.count ? <g key={x.date} className="hx-col"><rect x={cx - 1} y={y} width={2} height={116 - y + 14} rx={1} fill={C.move} opacity={now ? 1 : 0.55} /><circle cx={cx} cy={y} r={now ? 5 : 3.5} fill={C.move} /></g> : null; })}</g>
          {st.week.map((x, i) => <text key={x.date} className="hx-ax3" x={20 + (i / 6) * (w - 40)} y="130" textAnchor="middle">{fmtDate(x.date, lang, { weekday: 'narrow' })}</text>)}
        </svg></div>}
      {d && <div className="hx-panel hx-rise"><div className="hx-kv">
        {d.distanceM !== undefined && <div><span>{t('Distance')}</span><b>{fmtNum(d.distanceM / 1000, lang, 1)} km</b></div>}
        {d.floors !== undefined && <div><span>{t('Floors')}</span><b>{fmtNum(d.floors, lang, 0)}</b></div>}
        {d.activeKcal !== undefined && <div><span>{t('Active kcal')}</span><b>{fmtNum(d.activeKcal, lang, 0)}</b></div>}
        {d.totalKcal !== undefined && <div><span>{t('Total kcal')}</span><b>{fmtNum(d.totalKcal, lang, 0)}</b></div>}
      </div></div>}
    </>;
  } else if (k === 'cardio') {
    const wk = v.week, mx = Math.max(1, ...wk.sports.map((x) => x.min));
    out = <>
      <div className="hx-lab" data-share="lab"><i />{t('Cardio')}</div>
      <div className="hx-rnum"><span className="hx-n hx-n52" data-share="num">{wk.cardioMin}</span><span className="hx-sub hx-unit" data-share="unit">{t('min')}</span></div>
      <div className="hx-sub" data-share="cap" style={{ marginTop: 6 }}>{t('this week')}</div>
      {hero({ marginTop: 22 })}
      <div className="hx-bleed hx-rise"><DayLetters v={v} lang={lang} w={W} pad={20} size={12} /></div>
      <div style={{ height: 26 }} />
      {wk.sports.length > 0 && <div className="hx-panel hx-rise"><div className="hx-ptitle">{t('Minutes by sport')}</div>{wk.sports.map((x) => <div key={x.label} className="hx-sport"><span className="hx-sub">{x.label}</span><div className="hx-sbar"><span className="hx-sb" style={{ ['--sc' as string]: C.cardio, width: `${Math.round((x.min / mx) * 100)}%` }} /></div><span className="hx-sub" style={{ textAlign: 'right' }}>{x.min}</span></div>)}</div>}
      {wk.last && <div className="hx-panel hx-rise"><div className="hx-ptitle">{t('Last session')}</div><div className="hx-n" style={{ fontSize: 26, fontWeight: 300 }}>{wk.last.name || t(ACTIVITY_LABEL[wk.last.kind])} · {Math.round(wk.last.durationSec / 60)} min</div>
        <div className="hx-sub" style={{ marginTop: 6 }}>{[fmtDate(wk.last.date, lang), wk.last.avgHr ? t('avg {n} bpm', { n: Math.round(wk.last.avgHr) }) : '', wk.last.maxHr ? t('top {n}', { n: Math.round(wk.last.maxHr) }) : '', wk.last.kcal ? `${fmtNum(wk.last.kcal, lang, 0)} kcal` : '', wk.last.elevationM ? t('Climbed {n} m', { n: wk.last.elevationM }) : ''].filter(Boolean).join(' · ')}</div>
        {wk.last.hcId && <div style={{ marginTop: 12 }}><RouteLine id={wk.last.hcId} w={w} /></div>}</div>}
    </>;
  } else if (k === 'week') {
    const wk = v.week;
    out = <>
      <div className="hx-lab" data-share="lab"><i />{t('Workouts')}</div>
      <div className="hx-rnum"><span className="hx-n hx-n52" data-share="num">{wk.workouts}</span><span className="hx-sub hx-unit" data-share="unit">{t('of {n}', { n: wk.target })}</span></div>
      <div className="hx-sub" data-share="cap" style={{ marginTop: 6 }}>{t('this week')}</div>
      {hero({ marginTop: 22 })}
      <div className="hx-bleed hx-rise" style={{ marginTop: 6 }}><DayLetters v={v} lang={lang} w={W} pad={20} size={12} /></div>
      <div style={{ height: 26 }} />
      <div className="hx-panel hx-rise">{wk.list.length ? <div className="hx-kv1">{wk.list.map((x, i) => <div key={i}><span>{fmtDate(x.date, lang, { weekday: 'long' })}</span><b>{x.name}</b>{x.min !== undefined && <em>{x.min} min</em>}</div>)}</div> : <div className="hx-sub">{t('No workouts yet this week.')}</div>}</div>
    </>;
  } else if (k === 'body' && v.body.kg !== undefined) {
    const b = v.body, u = wu, ser = b.series.map((x) => kgToDisplay(x, u));
    const lo = Math.min(...ser), hi = Math.max(...ser);
    out = <>
      <div className="hx-lab" data-share="lab"><i />{t('Weight')}</div>
      <div className="hx-rnum"><span className="hx-n hx-n52" data-share="num">{fmtNum(kgToDisplay(b.kg!, u), lang, 1)}</span><span className="hx-sub hx-unit" data-share="unit">{u}</span></div>
      {hero({ marginTop: 22 })}
      {ser.length > 1 && <div className="hx-ends hx-rise"><span className="hx-ax3">{t('30 days ago')}</span><span className="hx-ax3">{fmtNum(lo, lang, 1)}–{fmtNum(hi, lang, 1)} {u}</span></div>}
      <h3 className="hx-dt hx-rise">{b.rate === null ? t('Your weight') : Math.abs(b.rate) < 0.1 ? t('Steady') : b.rate < 0 ? t('Slowly down') : t('Slowly up')}</h3>
      {b.rate !== null && <p className="hx-dsub hx-rise">{t('About {n} {u} a week.', { n: fmtSigned(kgToDisplay(b.rate, u), lang), u })}</p>}
      <div className="hx-panel hx-rise"><button className="chip sm acc press" onClick={() => useUI.getState().push('weight')}><Icon name="plus" size={14} /> {t('Log your weight')}</button></div>
      {(b.fat !== undefined || b.lean !== undefined || b.bmr !== undefined || v.heart.vo2 !== undefined) && <div className="hx-panel hx-rise"><div className="hx-ptitle">{t('Body composition')}</div><div className="hx-kv">
        {b.fat !== undefined && <div><span>{t('Body fat')}</span><b>{fmtNum(b.fat, lang, 1)} %</b></div>}
        {b.lean !== undefined && <div><span>{t('Lean mass')}</span><b>{fmtNum(kgToDisplay(b.lean, u), lang, 1)} {u}</b></div>}
        {b.water !== undefined && <div><span>{t('Body water')}</span><b>{fmtNum(kgToDisplay(b.water, u), lang, 1)} {u}</b></div>}
        {b.bone !== undefined && <div><span>{t('Bone')}</span><b>{fmtNum(kgToDisplay(b.bone, u), lang, 1)} {u}</b></div>}
        {b.bmr !== undefined && <div><span>{t('Burns at rest')}</span><b>{fmtNum(b.bmr, lang, 0)} kcal</b></div>}
        {v.heart.vo2 !== undefined && <div><span>VO2 max</span><b>{fmtNum(v.heart.vo2, lang, 0)}</b></div>}
      </div></div>}
    </>;
  } else if (k === 'training') {
    out = <>
      <div className="hx-lab" data-share="lab"><i />{t('Lifting')}</div>
      <div className="hx-rnum"><span className="hx-n hx-n52" data-share="num">{v.train.n28}</span><span className="hx-sub hx-unit" data-share="unit">{t('workouts')}</span></div>
      <div className="hx-sub" data-share="cap" style={{ marginTop: 6 }}>{t('last 4 weeks')}</div>
      {hero({ marginTop: 22 })}
      <div className="hx-ends hx-rise"><span className="hx-ax3">{t('8 weeks ago')}</span><span className="hx-ax3">{t('This week')}</span></div>
      <div className="hx-rise hx-training"><ProgressBody /></div>
    </>;
  }
  return <div ref={ref} className="hx-body">{out}</div>;
}
