/**
 * Health (the fourth tab, where Progress was; Omar 20 Oct): everything the watch measured, as one page. On top, one plain
 * sentence with tappable numbers and a ribbon of the last 24 hours (it plays the day in once). Below, sections of
 * different sizes with no boxes: Ready, Sleep, Heart, Steps, This week, Body, Training. Each grows into its own page
 * (screens/health/expand.ts); the old Progress charts live on, unchanged, as the Training page.
 *
 * Scores (lib/scores.ts) are measured against his own normal, never 100 for a 7-hour night, and never tell him to train
 * lighter. Plan: /mnt/project-files/health/plan/build-plan.md. Mock: /mnt/project-files/health/concepts/mock-v8.html.
 */
import { memo, useCallback, useEffect, useMemo, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useScreenStore } from '../lib/hooks';
import { useT, useLang, type TFn } from '../lib/i18n';
import { useToday } from '../lib/derive';
import { addDays, fmtDate, fmtTime } from '../lib/dates';
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
import { C, Hypnogram, NightHeart, Ribbon, RouteLine, ScoreRing, Spark, StepsDay, Trace, WeekStrip, useWidth } from './health/charts';
import { Expander } from './health/expand';
import { ProgressBody } from './Progress';
import { Roll } from '../ui/Roll';
import { springCurve, SMOOTH } from '../ui/motion';
import { Icon } from '../ui/Icon';
import { useUI } from '../state/ui';
import './health/health.css';

type K = 'ready' | 'sleep' | 'heart' | 'move' | 'week' | 'body' | 'training';
// (no Ready on the screen: Omar dropped readiness on 16 Oct and the Coach line on top says what matters; 26 Oct)
const ORDER: K[] = ['sleep', 'heart', 'move', 'week', 'body', 'training'];
const COL: Record<K, string> = { ready: '#f6f7fb', sleep: C.sleep, heart: C.heart, move: C.move, week: C.cardio, body: C.body, training: C.train };
const NAME: Record<K, string> = { ready: 'Ready', sleep: 'Sleep', heart: 'Heart', move: 'Steps', week: 'This week', body: 'Body', training: 'Training' };

/** 432 min → "7 h 12" (the hour sign in Danish is t) */
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

  const root = useRef<HTMLDivElement>(null), scr = useRef<HTMLDivElement>(null), det = useRef<HTMLDivElement>(null);
  const L1 = useRef<HTMLDivElement>(null), L2 = useRef<HTMLDivElement>(null), L3 = useRef<HTMLDivElement>(null);
  const mat = useRef<HTMLDivElement>(null), dsc = useRef<HTMLDivElement>(null), fly = useRef<HTMLDivElement>(null), edge = useRef<HTMLDivElement>(null);
  const eng = useRef<Expander | null>(null);
  const [openK, setOpenK] = useState<K | null>(null);
  const pending = useRef<HTMLElement | null>(null);
  const swapDir = useRef(0);
  const inHist = useRef(false);
  const chips = useRef<HTMLDivElement>(null), chipFrom = useRef<{ x: number; w: number } | null>(null);

  useLayoutEffect(() => {
    eng.current = new Expander({ root: root.current!, scr: scr.current!, det: det.current!, L: [L1.current!, L2.current!, L3.current!], mat: mat.current!, dsc: dsc.current!, fly: fly.current!, edge: edge.current! });
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
  const close = useCallback(() => {
    if (inHist.current) { inHist.current = false; try { history.back(); } catch { /* fine */ } }
    eng.current?.close(done);
  }, [done]);
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
    on.animate([{ transform: `translateX(${f.x - r.left}px) scaleX(${f.w / r.width})` }, { transform: 'none' }], { pseudoElement: '::before', duration: 560, easing: springCurve(SMOOTH).easing, fill: 'both' });
    const row = chips.current!, want = on.offsetLeft - (row.clientWidth - on.offsetWidth) / 2;
    row.scrollTo({ left: Math.max(0, want), behavior: 'smooth' });
  };
  const swap = (k: K) => {
    const e = eng.current, st = e?.st; if (!e || !st || st.closing || st.k === k) return;
    const was = chips.current?.querySelector<HTMLElement>('button.on')?.getBoundingClientRect(); chipFrom.current = was ? { x: was.left, w: was.width } : null;
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
        {shown.map((k) => <Section key={k} k={k} v={v} t={t} lang={lang} onTap={tap} />)}
        {!v.hasWatch && <p className="hx-note">{t('Connect your watch in Settings → Watch, and sleep, heart and steps fill in here.')}</p>}
      </div>
      <div ref={det} className="hx-detail" style={{ ['--c' as string]: openK ? COL[openK] : C.sleep }} onClick={passTap}>
        <div ref={L1} className="hx-L hx-rnd"><div ref={L2} className="hx-L hx-rnd"><div ref={L3} className="hx-L">
          <div ref={mat} className="hx-mat" />
          <div ref={dsc} className="hx-dsc">
            {openK && (
              <div className="hx-page">
                <div className="hx-dhead"><button className="hx-x press" aria-label={t('Close')} onClick={close}>✕</button></div>
                <div className="hx-chips" ref={chips}>{shown.map((k) => <button key={k} className={k === openK ? 'on' : ''} style={{ ['--c' as string]: COL[k] }} onClick={() => swap(k)}><i />{t(NAME[k])}</button>)}</div>
                <Page key={openK} k={openK} v={v} t={t} lang={lang} />
              </div>
            )}
          </div>
        </div></div><div ref={edge} className="hx-edge" /></div>
      </div>
      <div ref={fly} className="hx-fly" />
    </div>
  );
}

function has(k: K, v: HealthView): boolean {
  switch (k) {
    case 'ready': return !!v.ready;
    case 'sleep': return !!v.night;
    case 'heart': return v.heart.rest !== undefined || v.heart.trace.length > 1;
    case 'move': return v.steps.today !== undefined;
    case 'week': return v.week.workouts + v.week.cardioMin > 0 || v.hasWatch;
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
    for (const k of ['sleep', 'heart', 'steps', 'moves']) wipe(k, 320, 1700);
    // the steps label fades in once the sweep has drawn its hill (a wipe would cut it letter by letter)
    layer('slab')?.animate([{ opacity: 0, offset: 0 }], { duration: 400, delay: 950, easing: 'linear', fill: 'both' });
    layer('now')?.animate([{ opacity: 0, transform: 'translateY(-6px)', offset: 0 }], { duration: 450, delay: 1050, easing: EO, fill: 'both' });
  });

  // sections rise when they come into view (not all at once below the fold, where nobody sees it); the first ones come in
  // order during the last part of the ribbon's sweep. One observer for the screen's life: a re-render (data arriving) must not cut a rise short.
  const io = useRef<IntersectionObserver | null>(null), t0 = useRef(0), order = useRef(0);
  useLayoutEffect(() => {
    const el = scr.current; if (!el) return;
    const fresh = [...el.querySelectorAll<HTMLElement>('.hx-sec')].filter((x) => !seen.current.has(x.dataset.k!));
    if (!fresh.length) return;
    fresh.forEach((x) => seen.current.add(x.dataset.k!));
    if (reduced()) return;
    if (!io.current) {
      t0.current = performance.now();
      io.current = new IntersectionObserver((es) => es.forEach((e) => {
        if (!e.isIntersecting) return;
        const x = e.target as HTMLElement; io.current?.unobserve(x);
        const late = Math.max(0, 720 + order.current++ * 110 - (performance.now() - t0.current));
        x.style.opacity = '';
        x.animate([{ opacity: 0, transform: 'translateY(12px)', offset: 0 }], { duration: 520, delay: late, easing: 'cubic-bezier(.25,1,.5,1)', fill: 'both' });
        const c = x.querySelector<HTMLElement>('.hx-wipe');
        const inner = c?.firstElementChild;
        if (c && inner) { c.animate([{ transform: 'translateX(-100%)', offset: 0 }], { duration: 1000, delay: late + 120, easing: EO, fill: 'both' }); inner.animate([{ transform: 'translateX(100%)', offset: 0 }], { duration: 1000, delay: late + 120, easing: EO, fill: 'both' }); }
      }), { root: el, threshold: 0.35 });
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
  return <>{tpl.split(/(\{x\})/).map((seg, j) => seg === '{x}' ? <span key={j}>{pill}</span> : seg.split(/(\s+)/).map((w, n) => (w.trim() ? <span key={`${j}-${n}`} className="hx-w">{w}</span> : w)))}</>;
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
  const night = v.night;
  // last night: "about your usual" within 30 min of the median of the 30 nights before (lib/recovery.ts usualSleep)
  let p1: ReactNode = null;
  if (night) {
    const d0 = night.usual ? night.asleep - night.usual : undefined;
    const tpl = d0 === undefined ? t('You slept {x}.') : Math.abs(d0) < 30 ? t('You slept {x}, about your usual.') : t(d0 > 0 ? 'You slept {x}, {d} more than usual.' : 'You slept {x}, {d} less than usual.', { d: hm(Math.abs(d0), lang) });
    p1 = <Words tpl={tpl} pill={<Pill k="sleep" onTap={onTap}>{hm(night.asleep, lang)}</Pill>} />;
  }
  let p2: ReactNode = null;
  if (note) {
    const run = () => { if (note.action) runNudge(note.action.run, today); };
    p2 = note.say
      ? <Words tpl={note.say.tpl} pill={<span className="hx-pill hx-w" style={{ ['--c' as string]: NOTE_COL(note) }} onClick={(e) => { e.stopPropagation(); run(); }}><i /><span>{note.say.x}</span></span>} />
      : <Words tpl={sentenceOf(note.title)} />;
  }
  if (!p1 && !p2) p1 = <Words tpl={v.hasWatch ? t('Your watch fills this in as it syncs.') : t('Nothing needs your attention right now.')} />;
  return (
    <>
      <div className="hx-coach hx-ln"><MiniOrb />{t('Coach')}</div>
      <p className="hx-sent">{p1}{p1 && p2 ? ' ' : ''}{p2}</p>
    </>
  );
}

const PACE: Record<Pace, string> = { reached: 'Reached', ready: 'Ready to test', 'on pace': 'On pace', ahead: 'Ahead', behind: 'Behind', 'too fast': 'Faster than safe', 'wrong way': 'Wrong way', slow: 'Slow', stalled: 'Stalled', 'date passed': 'Date passed', 'too early': 'Too early to tell' };

/** paces that need something from him: the pill gets a coral rim (white words, no wash) so it reads at a glance */
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
  const all = activeGoals(d, today);
  const goals = all.filter(tracked);
  const m = goals[0] ?? all[0];
  const u = d.settings.units.weight;
  const kg = (x: number) => `${fmtNum(kgToDisplay(x, u), lang, 1)}\u00a0${u}`;
  const ask = (prompt: string) => useUI.getState().push('coach', { ask: prompt });
  if (!m) {
    if ((d.memory ?? []).some((x) => x.kind === 'goal')) return null;
    return (
      <button className="hx-goal press" onClick={() => ask(t('I want to set a goal. Ask me what I’m working toward and help me make it concrete.'))}>
        <div className="hx-ghead"><span className="hx-gt">{t('What are we working on?')}</span><span className="hx-gchev">›</span></div>
        <div className="hx-gline">{t('Tell the Coach a goal and it follows it here.')}</div>
      </button>
    );
  }
  const st = goalState(d, m, today);
  const name = m.text.replace(/^(goal|mål)\s*:\s*/i, '');
  const by = m.goal.by ? fmtDate(m.goal.by, lang, { day: 'numeric', month: 'short' }) : undefined;
  const lift = m.goal.metric === 'lift';
  const ex = m.exerciseIds?.[0] ? exerciseMap(d.exercises).get(m.exerciseIds[0]) : undefined; // a deleted lift: just the weight
  const what = m.goal.target === undefined ? name : lift ? `${ex ? `${exName(ex, lang)} ` : ''}${kg(m.goal.target)}${(m.goal.reps ?? 1) > 1 ? ` × ${m.goal.reps}` : ''}` : kg(m.goal.target);
  const title = by && m.goal.target !== undefined ? t('{what} by {date}', { what, date: by }).replace(/ (\d)/g, '\u00a0$1') : what;
  let line = '';
  let bar: { start: number; now: number; target: number } | undefined;
  if (st) {
    const left = st.now !== undefined && st.target !== undefined ? Math.abs(st.target - st.now) : undefined;
    if (st.pace === 'reached') {
      const h = holdKcal(d, st, today);
      line = h ? (h.first ? t('{a} kcal for a week, then about {b} to hold it.', { a: fmtNum(h.first, lang, 0), b: fmtNum(h.hold, lang, 0) }) : t('About {b} kcal a day to hold it.', { b: fmtNum(h.hold, lang, 0) })) : t('Tell the Coach what is next.');
    } else if (st.pace === 'too early' && !st.next) line = earlyLine(st, t);
    else if (st.byFood && st.now !== undefined && st.scaleKg !== undefined) line = t('About {now} by what you eat · scale {scale}', { now: kg(st.now), scale: kg(st.scaleKg) });
    else if (lift && st.now !== undefined && left !== undefined) line = [t('Best set worth {n}', { n: kg(st.now) }), t('{n} to go', { n: kg(left) }), st.daysLeft !== undefined && st.daysLeft >= 0 ? t('{n} weeks', { n: Math.max(1, Math.round(st.daysLeft / 7)) }) : ''].filter(Boolean).join(' · ');
    else if (left !== undefined) line = [t('{n} to go', { n: kg(left) }), st.daysLeft !== undefined && st.daysLeft >= 0 ? t('{n} days', { n: st.daysLeft }) : '', d.settings.goals.kcal ? t('{n} kcal target', { n: fmtNum(d.settings.goals.kcal, lang, 0) }) : ''].filter(Boolean).join(' · ');
    if (st.start !== undefined && st.now !== undefined && st.target !== undefined && st.pace !== 'too early' && st.start !== st.target) bar = { start: st.start, now: st.now, target: st.target };
  } else line = t('No number to follow, so the Coach checks in with you instead.');
  const more = goals.length > 1 ? goals.length - 1 : 0;
  const col = lift ? C.cardio : C.body;
  const f = bar ? Math.max(0, Math.min(1, (bar.now - bar.start) / (bar.target - bar.start))) : 0;
  return (
    <button className="hx-goal press" style={{ ['--c' as string]: col }} onClick={() => ask(t('How am I doing on my goal “{goal}”? Be honest.', { goal: name }))}>
      <div className="hx-ghead"><span className="hx-gt">{title}</span>{st ? <span className={`hx-gpace${WARN.has(st.pace) ? ' hx-gwarn' : ''}`}>{t(PACE[st.pace])}</span> : <span className="hx-gchev">›</span>}</div>
      {bar && <div className="hx-gbar" style={{ ['--f' as string]: f }}><span className="hx-gnow">{t('{n} now', { n: fmtNum(kgToDisplay(bar.now, u), lang, 1) })}</span><i /></div>}
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

/** a section on the home screen: label, number, a line of context and its picture (no box: space and size carry it) */
function Section({ k, v, t, lang, onTap }: { k: K; v: HealthView; t: TFn; lang: Lang; onTap: (k: K, el: HTMLElement) => void }) {
  const [ref, w] = useWidth<HTMLDivElement>(344);
  const wu = useScreenStore().settings.units.weight;
  const W = w; // the section itself reaches the screen's edges, so its charts do too
  let body: ReactNode = null;
  if (k === 'sleep') {
    const n = v.night!;
    body = <>
      <div className="hx-n hx-n46" data-share="num"><Roll text={hm(n.asleep, lang)} /></div>
      <div className="hx-sub">{fmtTime(n.session.start, lang)} → {fmtTime(n.session.end, lang)}{n.score ? ` · ${t('score')} ${n.score.score}` : ''} · {t('deep')} {hm(n.stages.deep, lang)}</div>
      <div className="hx-bleed hx-hyp hx-wipe" data-share="chart"><div><Hypnogram night={n.session} w={W} /></div></div>
    </>;
  } else if (k === 'heart') {
    const h = v.heart;
    body = <>
      <div><span className="hx-n hx-n64" data-share="num"><Roll text={h.rest !== undefined ? String(h.rest) : '—'} /></span><span className="hx-sub hx-unit" data-share="unit">{t('bpm resting')}</span></div>
      <div className="hx-bleed hx-wipe" data-share="chart" style={{ marginTop: 4 }}><div><Trace values={h.trace} band={h.restRange} w={W} usualLabel={t('your usual')} /></div></div>
      {h.hrv !== undefined && <div className="hx-sub" style={{ marginTop: 8 }}>{h.hrvRange && h.hrv >= h.hrvRange[0] && h.hrv <= h.hrvRange[1] ? t('HRV {n} ms, inside your usual range', { n: Math.round(h.hrv) }) : h.hrvRange && h.hrv < h.hrvRange[0] ? t('HRV {n} ms, under your usual range', { n: Math.round(h.hrv) }) : t('HRV {n} ms', { n: Math.round(h.hrv) })}</div>}
    </>;
  } else if (k === 'move') {
    const st = v.steps;
    body = <>
      <div><span className="hx-n hx-n34" data-share="num"><Roll text={fmtNum(st.today ?? 0, lang, 0)} /></span>{st.usual ? <span className="hx-sub hx-unit" data-share="unit">{t('of your usual {n}', { n: fmtNum(Math.round(st.usual / 100) * 100, lang, 0) })}</span> : null}</div>
      {st.curve.length > 1 && <div className="hx-bleed hx-wipe" data-share="chart" style={{ marginTop: 8 }}><div><StepsDay today={st.curve} usual={st.usualCurve} w={W} h={48} /></div></div>}
    </>;
  } else if (k === 'week') {
    const wk = v.week;
    body = <>
      <div className="hx-sub" style={{ marginTop: 2 }}><b className="hx-hi">{wk.cardioMin} min</b> {t('cardio')} · <b className="hx-hi">{t('{a} of {b}', { a: wk.workouts, b: wk.target })}</b> {t('workouts')}</div>
      <div data-share="chart"><WeekStrip days={wk.days} today={v.today} letter={(d) => fmtDate(d, lang, { weekday: 'narrow' })} /></div>
    </>;
  } else if (k === 'body') {
    const b = v.body; const u = wu;
    body = <div className="hx-bodyrow">
      <span className="hx-n hx-n28" data-share="num"><Roll text={fmtNum(kgToDisplay(b.kg!, u), lang, 1)} /><small>{u}</small></span>
      <div style={{ flex: 1, minWidth: 0 }}><Spark values={b.series} w={Math.max(60, w - 250)} /></div>
      {b.rate !== null && <span className="hx-sub">{fmtSigned(kgToDisplay(b.rate, u), lang)} {u}/{t('wk')}</span>}
    </div>;
  } else if (k === 'training') {
    body = <div className="hx-sub" style={{ marginTop: 2 }}>{t('Your progress charts, records and exercise trends.')}</div>;
  }
  return (
    <section ref={ref as React.Ref<HTMLElement>} className="hx-sec" data-k={k} style={{ ['--c' as string]: COL[k] }} onClick={(e) => onTap(k, e.currentTarget)}>
      <div className="hx-lab"><i />{t(NAME[k])}</div>
      {body}
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
      <div className="hx-lab"><i />{t('Last night')}</div>
      <div className="hx-n hx-n56" data-share="num">{hm(n.asleep, lang)}</div>
      <div className="hx-sub">{fmtTime(n.session.start, lang)} → {fmtTime(n.session.end, lang)}</div>
      <div className="hx-bleed hx-hyp" data-share="chart"><Hypnogram night={n.session} w={W} /></div>
      <h3 className="hx-dt hx-rise">{head}</h3>
      {diff !== undefined && <p className="hx-dsub hx-rise">{Math.abs(diff) < 15 ? t('About your usual {u}.', { u: hm(n.usual!, lang) }) : t(diff > 0 ? '{d} more than your usual {u}.' : '{d} less than your usual {u}.', { d: hm(Math.abs(diff), lang), u: hm(n.usual!, lang) })}</p>}
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
      <div className="hx-lab"><i />{t('Resting heart rate')}</div>
      <div><span className="hx-n hx-n64" data-share="num">{h.rest ?? '—'}</span><span className="hx-sub hx-unit" data-share="unit">{t('bpm resting')}</span></div>
      <div className="hx-bleed" data-share="chart" style={{ marginTop: 4 }}><Trace values={h.trace} band={h.restRange} w={W} usualLabel={t('your usual')} /></div>
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
      <div className="hx-lab"><i />{t('Steps today')}</div>
      <div><span className="hx-n hx-n52" data-share="num">{fmtNum(st.today ?? 0, lang, 0)}</span>{st.usual ? <span className="hx-sub hx-unit" data-share="unit">{t('of your usual {n}', { n: fmtNum(Math.round(st.usual / 100) * 100, lang, 0) })}</span> : null}</div>
      {st.curve.length > 1 && <div className="hx-bleed" data-share="chart" style={{ marginTop: 8 }}><StepsDay today={st.curve} usual={st.usualCurve} w={W} h={48} /></div>}
      <h3 className="hx-dt hx-rise">{ahead === undefined ? t('Today so far') : Math.abs(ahead) < 800 ? t('On your usual pace') : ahead > 0 ? t('Ahead of your usual day') : t('Behind your usual day')}</h3>
      {ahead !== undefined && st.usual && <p className="hx-dsub hx-rise">{t('The dotted line is your usual day. You tend to finish around {n}.', { n: fmtNum(Math.round(st.usual / 100) * 100, lang, 0) })}</p>}
      <div className="hx-panel hx-rise"><div className="hx-ptitle">{t('This week')}</div>
        <svg viewBox={`0 0 ${w} 132`} width={w} height={132} style={{ display: 'block', overflow: 'visible' }} aria-hidden>
          <defs><clipPath id="hxW"><rect x="0" y="-10" width={w} height="126" /></clipPath></defs>
          <g clipPath="url(#hxW)">{st.week.map((x, i) => { const cx = 20 + (i / 6) * (w - 40), y = 116 - ((x.count ?? 0) / top) * 104; const now = x.date === v.today; return x.count ? <g key={x.date} className="hx-col"><rect x={cx - 1} y={y} width={2} height={116 - y + 14} rx={1} fill={C.move} opacity={now ? 1 : 0.55} /><circle cx={cx} cy={y} r={now ? 5 : 3.5} fill={C.move} /></g> : null; })}</g>
          {st.week.map((x, i) => <text key={x.date} className="hx-ax3" x={20 + (i / 6) * (w - 40)} y="130" textAnchor="middle">{fmtDate(x.date, lang, { weekday: 'narrow' })}</text>)}
        </svg></div>
      {d && <div className="hx-panel hx-rise"><div className="hx-kv">
        {d.distanceM !== undefined && <div><span>{t('Distance')}</span><b>{fmtNum(d.distanceM / 1000, lang, 1)} km</b></div>}
        {d.floors !== undefined && <div><span>{t('Floors')}</span><b>{fmtNum(d.floors, lang, 0)}</b></div>}
        {d.activeKcal !== undefined && <div><span>{t('Active kcal')}</span><b>{fmtNum(d.activeKcal, lang, 0)}</b></div>}
        {d.totalKcal !== undefined && <div><span>{t('Total kcal')}</span><b>{fmtNum(d.totalKcal, lang, 0)}</b></div>}
      </div></div>}
    </>;
  } else if (k === 'week') {
    const wk = v.week, mx = Math.max(1, ...wk.sports.map((x) => x.min));
    out = <>
      <div className="hx-lab"><i />{t('This week')}</div>
      <div className="hx-sub" style={{ marginTop: 2 }}><b className="hx-hi">{wk.cardioMin} min</b> {t('cardio')} · <b className="hx-hi">{t('{a} of {b}', { a: wk.workouts, b: wk.target })}</b> {t('workouts')}</div>
      <div data-share="chart" style={{ marginBottom: 28 }}><WeekStrip days={wk.days} today={v.today} letter={(d) => fmtDate(d, lang, { weekday: 'narrow' })} /></div>
      {wk.sports.length > 0 && <div className="hx-panel hx-rise"><div className="hx-ptitle">{t('Minutes by sport')}</div>{wk.sports.map((x) => <div key={x.label} className="hx-sport"><span className="hx-sub">{x.label}</span><div className="hx-sbar"><span className="hx-sb" style={{ ['--sc' as string]: C.cardio, width: `${Math.round((x.min / mx) * 100)}%` }} /></div><span className="hx-sub" style={{ textAlign: 'right' }}>{x.min}</span></div>)}</div>}
      {wk.last && <div className="hx-panel hx-rise"><div className="hx-ptitle">{t('Last session')}</div><div className="hx-n" style={{ fontSize: 26, fontWeight: 300 }}>{wk.last.name || t(ACTIVITY_LABEL[wk.last.kind])} · {Math.round(wk.last.durationSec / 60)} min</div>
        <div className="hx-sub" style={{ marginTop: 6 }}>{[fmtDate(wk.last.date, lang), wk.last.avgHr ? t('avg {n} bpm', { n: Math.round(wk.last.avgHr) }) : '', wk.last.maxHr ? t('top {n}', { n: Math.round(wk.last.maxHr) }) : '', wk.last.kcal ? `${fmtNum(wk.last.kcal, lang, 0)} kcal` : '', wk.last.elevationM ? t('Climbed {n} m', { n: wk.last.elevationM }) : ''].filter(Boolean).join(' · ')}</div>
        {wk.last.hcId && <div style={{ marginTop: 12 }}><RouteLine id={wk.last.hcId} w={w} /></div>}</div>}
    </>;
  } else if (k === 'body' && v.body.kg !== undefined) {
    const b = v.body, u = wu, ser = b.series.map((x) => kgToDisplay(x, u));
    const lo = Math.min(...ser), hi = Math.max(...ser);
    out = <>
      <div className="hx-lab"><i />{t('Body')}</div>
      <div className="hx-n hx-n52" data-share="num">{fmtNum(kgToDisplay(b.kg!, u), lang, 1)}<small>{u}</small></div>
      <h3 className="hx-dt hx-rise">{b.rate === null ? t('Your weight') : Math.abs(b.rate) < 0.1 ? t('Steady') : b.rate < 0 ? t('Slowly down') : t('Slowly up')}</h3>
      {b.rate !== null && <p className="hx-dsub hx-rise">{t('About {n} {u} a week.', { n: fmtSigned(kgToDisplay(b.rate, u), lang), u })}</p>}
      <div className="hx-panel hx-rise"><button className="chip sm acc press" onClick={() => useUI.getState().push('weight')}><Icon name="plus" size={14} /> {t('Log your weight')}</button></div>
      {ser.length > 1 && <div className="hx-panel hx-rise"><div className="hx-ptitle">{t('Weight, last 30 days')}</div><Spark values={ser} w={w} h={100} /><div className="hx-ends"><span className="hx-ax3">{fmtNum(ser[0], lang, 1)}</span><span className="hx-ax3">{fmtNum(lo, lang, 1)}–{fmtNum(hi, lang, 1)}</span></div></div>}
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
      <div className="hx-lab"><i />{t('Training')}</div>
      <div className="hx-sub">{t('Your progress charts, records and exercise trends.')}</div>
      <div className="hx-rise hx-training"><ProgressBody /></div>
    </>;
  }
  return <div ref={ref} className="hx-body">{out}</div>;
}
