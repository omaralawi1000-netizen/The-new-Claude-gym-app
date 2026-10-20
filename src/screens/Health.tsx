/**
 * Health (the fourth tab, where Progress was; Omar 20 Oct): everything the watch measured, as one page. On top, one plain
 * sentence with tappable numbers and a ribbon of the last 24 hours (it plays the day in once). Below, sections of
 * different sizes with no boxes: Ready, Sleep, Heart, Steps, This week, Body, Training. Each grows into its own page
 * (screens/health/expand.ts); the old Progress charts live on, unchanged, as the Training page.
 *
 * Scores (lib/scores.ts) are measured against his own normal, never 100 for a 7-hour night, and never tell him to train
 * lighter. Plan: /mnt/project-files/health/plan/build-plan.md. Mock: /mnt/project-files/health/concepts/mock-v8.html.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useScreenStore } from '../lib/hooks';
import { useT, useLang, type TFn } from '../lib/i18n';
import { useToday } from '../lib/derive';
import { fmtDate, fmtTime } from '../lib/dates';
import { fmtNum, fmtSigned, kgToDisplay } from '../lib/units';
import { ACTIVITY_LABEL } from '../lib/activity';
import type { ActivityLog, Lang } from '../lib/types';
import type { Score } from '../lib/scores';
import { useHealthView, type HealthView } from './health/data';
import { C, Hypnogram, NightHeart, Ribbon, ScoreRing, Spark, StepsDay, Trace, WeekStrip, useWidth } from './health/charts';
import { Expander } from './health/expand';
import { ProgressBody } from './Progress';
import { Roll } from '../ui/Roll';
import './health/health.css';

type K = 'ready' | 'sleep' | 'heart' | 'move' | 'week' | 'body' | 'training';
const ORDER: K[] = ['ready', 'sleep', 'heart', 'move', 'week', 'body', 'training'];
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

  useLayoutEffect(() => {
    eng.current = new Expander({ root: root.current!, det: det.current!, L: [L1.current!, L2.current!, L3.current!], mat: mat.current!, dsc: dsc.current!, fly: fly.current!, edge: edge.current! });
    return () => eng.current?.closeNow();
  }, []);

  // React has drawn the page: grow it out of its section, or (after a chip) let the new page arrive
  useLayoutEffect(() => {
    const e = eng.current; if (!e || !openK) return;
    if (!e.st && pending.current) { e.open(openK, pending.current); pending.current = null; }
    else if (e.st && swapDir.current) { e.swapIn(swapDir.current); swapDir.current = 0; }
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
  const swap = (k: K) => {
    const e = eng.current, st = e?.st; if (!e || !st || st.closing || st.k === k) return;
    const sec = scr.current?.querySelector<HTMLElement>(`.hx-sec[data-k="${k}"]`); if (!sec) return;
    swapDir.current = e.swapOut(k, sec, ORDER.indexOf(k) > ORDER.indexOf(st.k as K) ? 1 : -1, scr.current!) ?? 0;
    setOpenK(k);
  };
  // while the page closes, a tap on it lands on what is under it (the section it is closing into, or another)
  const passTap = (ev: React.MouseEvent) => {
    const st = eng.current?.st; if (!st?.closing) return;
    const hit = document.elementsFromPoint(ev.clientX, ev.clientY).map((x) => x.closest<HTMLElement>('.hx-sec,.hx-pill')).find(Boolean);
    if (hit && !det.current?.contains(hit)) tap(hit.dataset.k as K, hit);
  };

  useIntro(scr, v);

  const shown = ORDER.filter((k) => has(k, v));
  return (
    <div ref={root} className="hx-root">
      <div ref={scr} className="screen hx-screen">
        <div className="hx-top hx-ln"><h1 className="hx-title">{t('Health')}</h1></div>
        <div className="hx-date hx-ln">{fmtDate(today, lang, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        <Sentence v={v} t={t} lang={lang} onTap={tap} />
        {v.ribbon && <RibbonBlock v={v} t={t} lang={lang} />}
        {shown.map((k) => <Section key={k} k={k} v={v} t={t} lang={lang} onTap={tap} />)}
        {!v.hasWatch && <p className="hx-note">{t('Connect your watch in Settings → Watch, and sleep, heart and steps fill in here.')}</p>}
      </div>
      <div ref={det} className="hx-detail" style={{ ['--c' as string]: openK ? COL[openK] : C.sleep }} onClick={passTap}>
        <div ref={L1} className="hx-L"><div ref={L2} className="hx-L"><div ref={L3} className="hx-L">
          <div ref={mat} className="hx-mat" />
          <div ref={dsc} className="hx-dsc">
            {openK && (
              <div className="hx-page">
                <div className="hx-dhead"><button className="hx-x press" aria-label={t('Close')} onClick={close}>✕</button></div>
                <div className="hx-chips">{shown.map((k) => <button key={k} className={k === openK ? 'on' : ''} style={{ ['--c' as string]: COL[k] }} onClick={() => swap(k)}><i />{t(NAME[k])}</button>)}</div>
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
    const el = scr.current; if (!el || played.current) return;
    if (!v.hasWatch && !v.body.kg && hasRibbon === false && v.ready === null) { /* nothing to play beyond the header */ }
    played.current = true;
    if (reduced()) return;
    const sm = { duration: 520, easing: 'cubic-bezier(.25,1,.5,1)' };
    const rise = (x: Element, delay: number) => x.animate([{ opacity: 0, transform: 'translateY(12px)', offset: 0 }], { ...sm, delay, fill: 'both' });
    // lines of the sentence: words grouped by the line they sit on (the house rhythm: 60 ms a step, at most 4)
    const words = [...el.querySelectorAll<HTMLElement>('.hx-w')];
    const lines: HTMLElement[][] = [];
    for (const w of words) { const top = w.getBoundingClientRect().top; const l = lines.find((x) => Math.abs(x[0].getBoundingClientRect().top - top) < 12); if (l) l.push(w); else lines.push([w]); }
    const steps = [[...el.querySelectorAll<HTMLElement>('.hx-ln')], ...lines];
    steps.forEach((g, i) => g.forEach((w) => rise(w, 60 + Math.min(i, 5) * 60)));
  }, [scr, v.hasWatch, hasRibbon, v.body.kg, v.ready]);

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
    layer('axis')?.animate([{ opacity: 0, offset: 0 }], { duration: 600, delay: 300, easing: 'linear', fill: 'both' });
    wipe('sleep', 380, 1100);
    layer('sleep')?.firstElementChild?.animate([{ opacity: 0.4, offset: 0 }], { duration: 900, delay: 380, easing: 'linear', fill: 'both' });
    wipe('heart', 560, 1300);
    layer('steps')?.firstElementChild?.animate([{ transform: 'translateY(46px)', offset: 0 }], { duration: 1100, delay: 900, easing: EO, fill: 'both' });
    layer('moves')?.animate([{ opacity: 0, transform: 'translateY(6px)', offset: 0 }], { duration: 700, delay: 1300, easing: EO, fill: 'both' });
    layer('now')?.animate([{ opacity: 0, transform: 'translateY(-10px)', offset: 0 }], { duration: 700, delay: 1650, easing: EO, fill: 'both' });
  });

  // sections rise when they come into view (not all at once below the fold, where nobody sees it)
  useLayoutEffect(() => {
    const el = scr.current; if (!el) return;
    const fresh = [...el.querySelectorAll<HTMLElement>('.hx-sec')].filter((x) => !seen.current.has(x.dataset.k!));
    if (!fresh.length) return;
    if (reduced()) { fresh.forEach((x) => seen.current.add(x.dataset.k!)); return; }
    fresh.forEach((x) => { x.style.opacity = '0'; });
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      const x = e.target as HTMLElement; io.unobserve(x); seen.current.add(x.dataset.k!);
      x.style.opacity = '';
      x.animate([{ opacity: 0, transform: 'translateY(12px)', offset: 0 }], { duration: 520, easing: 'cubic-bezier(.25,1,.5,1)', fill: 'both' });
      const c = x.querySelector<HTMLElement>('.hx-wipe');
      const inner = c?.firstElementChild;
      if (c && inner) { c.animate([{ transform: 'translateX(-100%)', offset: 0 }], { duration: 1000, delay: 120, easing: EO, fill: 'both' }); inner.animate([{ transform: 'translateX(100%)', offset: 0 }], { duration: 1000, delay: 120, easing: EO, fill: 'both' }); }
    }), { root: el, threshold: 0.35 });
    const id = setTimeout(() => fresh.forEach((x) => io.observe(x)), 420);
    return () => { clearTimeout(id); io.disconnect(); fresh.forEach((x) => { if (!seen.current.has(x.dataset.k!)) { x.style.opacity = ''; seen.current.add(x.dataset.k!); } }); };
  });
}

function Pill({ k, children, onTap }: { k: K; children: ReactNode; onTap: (k: K, el: HTMLElement) => void }) {
  return <span className="hx-pill hx-w" data-k={k} style={{ ['--c' as string]: COL[k] }} onClick={(e) => { e.stopPropagation(); onTap(k, e.currentTarget); }}><i /><span data-share="num">{children}</span></span>;
}

/** the plain sentence on top, its numbers as pills that open their page */
function Sentence({ v, t, lang, onTap }: { v: HealthView; t: TFn; lang: Lang; onTap: (k: K, el: HTMLElement) => void }) {
  const parts: { tpl: string; k?: K; val?: string }[] = [];
  if (v.night) {
    const d = v.night.usual ? v.night.asleep - v.night.usual : undefined;
    parts.push({ tpl: d === undefined ? t('You slept {x}.') : Math.abs(d) < 15 ? t('You slept {x}, about your usual.') : t(d > 0 ? 'You slept {x}, {d} more than usual.' : 'You slept {x}, {d} less than usual.', { d: hm(Math.abs(d), lang) }), k: 'sleep', val: hm(v.night.asleep, lang) });
  }
  if (v.heart.rest !== undefined) parts.push({ tpl: t('Your heart rested at {x}.'), k: 'heart', val: String(v.heart.rest) });
  if (v.steps.today !== undefined) parts.push({ tpl: t("You've walked {x} steps."), k: 'move', val: fmtNum(v.steps.today, lang, 0) });
  if (!parts.length) parts.push({ tpl: v.hasWatch ? t('Your watch fills this in as it syncs.') : t('Your day, from your watch and your training.') });
  return (
    <p className="hx-sent">
      {parts.map((p, i) => (
        <span key={i}>
          {p.tpl.split(/(\{x\})/).map((seg, j) => seg === '{x}' && p.k ? <Pill key={j} k={p.k} onTap={onTap}>{p.val}</Pill> : seg.split(/(\s+)/).map((w, n) => (w.trim() ? <span key={`${j}-${n}`} className="hx-w">{w}</span> : w)))}
          {i < parts.length - 1 ? ' ' : ''}
        </span>
      ))}
    </p>
  );
}

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
  const W = w; // the section itself reaches the screen's edges, so its charts do too
  let body: ReactNode = null;
  if (k === 'ready') {
    const r = v.ready!;
    body = r.learning !== undefined
      ? <><div className="hx-n hx-n46" data-share="num">{r.learning}<small>/ 14</small></div><div className="hx-sub">{t('Learning your normal: {n} of 14 days. Ready appears once Aven knows it.', { n: r.learning })}</div></>
      : <div className="hx-rowc"><div><div className="hx-n hx-n46" data-share="num"><Roll text={String(r.score)} /><small>{t(r.band)}</small></div><div className="hx-sub">{readyLine(r, t)}</div></div><div data-share="chart"><ScoreRing value={r.score} color="#f6f7fb" size={64} /></div></div>;
  } else if (k === 'sleep') {
    const n = v.night!;
    body = <>
      <div className="hx-n hx-n46" data-share="num"><Roll text={hm(n.asleep, lang)} /></div>
      <div className="hx-sub">{fmtTime(n.session.start, lang)} → {fmtTime(n.session.end, lang)}{n.score ? ` · ${t('score')} ${n.score.score}` : ''} · {t('deep')} {hm(n.stages.deep, lang)}</div>
      <div className="hx-bleed hx-hyp hx-wipe" data-share="chart"><div><Hypnogram night={n.session} w={W} /></div></div>
    </>;
  } else if (k === 'heart') {
    const h = v.heart;
    body = <>
      <div><span className="hx-n hx-n64" data-share="num"><Roll text={h.rest !== undefined ? String(h.rest) : '—'} /></span><span className="hx-sub hx-unit">{t('bpm resting')}</span></div>
      <div className="hx-bleed hx-wipe" data-share="chart" style={{ marginTop: 4 }}><div><Trace values={h.trace} band={h.restRange} w={W} usualLabel={t('your usual')} /></div></div>
      {h.hrv !== undefined && <div className="hx-sub" style={{ marginTop: 8 }}>{h.hrvRange && h.hrv >= h.hrvRange[0] && h.hrv <= h.hrvRange[1] ? t('HRV {n} ms, inside your usual range', { n: Math.round(h.hrv) }) : h.hrvRange && h.hrv < h.hrvRange[0] ? t('HRV {n} ms, under your usual range', { n: Math.round(h.hrv) }) : t('HRV {n} ms', { n: Math.round(h.hrv) })}</div>}
    </>;
  } else if (k === 'move') {
    const st = v.steps;
    body = <>
      <div><span className="hx-n hx-n34" data-share="num"><Roll text={fmtNum(st.today ?? 0, lang, 0)} /></span>{st.usual ? <span className="hx-sub hx-unit">{t('of your usual {n}', { n: fmtNum(Math.round(st.usual / 100) * 100, lang, 0) })}</span> : null}</div>
      {st.curve.length > 1 && <div className="hx-bleed hx-wipe" data-share="chart" style={{ marginTop: 8 }}><div><StepsDay today={st.curve} usual={st.usualCurve} w={W} h={48} /></div></div>}
    </>;
  } else if (k === 'week') {
    const wk = v.week;
    body = <>
      <div className="hx-sub" style={{ marginTop: 2 }}><b className="hx-hi">{wk.cardioMin} min</b> {t('cardio')} · <b className="hx-hi">{t('{a} of {b}', { a: wk.workouts, b: wk.target })}</b> {t('workouts')}</div>
      <div data-share="chart"><WeekStrip days={wk.days} today={v.today} letter={(d) => fmtDate(d, lang, { weekday: 'narrow' })} /></div>
    </>;
  } else if (k === 'body') {
    const b = v.body; const u = 'kg';
    body = <div className="hx-bodyrow">
      <span className="hx-n hx-n28" data-share="num"><Roll text={fmtNum(kgToDisplay(b.kg!, u), lang, 1)} /><small>{u}</small></span>
      <div style={{ flex: 1, minWidth: 0 }}><Spark values={b.series} w={Math.max(60, w - 250)} /></div>
      {b.rate !== null && <span className="hx-sub">{fmtSigned(b.rate, lang)} {u}/{t('wk')}</span>}
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

const READY_WHY: Record<string, string> = {
  hrv: 'Your HRV is under your normal.',
  restHr: 'Your resting heart rate is above your usual.',
  sleep: "Last night's sleep is holding it back.",
  load: 'You have trained a lot more than usual this week.',
  breathing: 'You are breathing faster than usual.',
  oxygen: 'Your blood oxygen was low last night.',
};
function readyLine(r: Score, t: TFn) { return r.low && READY_WHY[r.low] ? t(READY_WHY[r.low]) : t('Everything is inside your normal range.'); }
const PART: Record<string, string> = { duration: 'Length', deep: 'Deep sleep', rem: 'REM sleep', rest: 'Restfulness', timing: 'Timing', heart: 'Heart rate', hrv: 'HRV', restHr: 'Resting heart rate', sleep: 'Sleep', load: 'Training load' };

function Parts({ s, t }: { s: Score; t: TFn }) {
  return (
    <div className="hx-stages">
      {s.parts.map((p) => (
        <div key={p.key} className="hx-strow">
          <b>{t(PART[p.key] ?? p.key)}</b>
          <div className="hx-sbar"><span className="hx-sb" style={{ ['--sc' as string]: 'var(--c)', width: `calc(${Math.round(p.score)}% - 4px)` }} /></div>
          <span className="num">{Math.round(p.score)}</span>
        </div>
      ))}
    </div>
  );
}

/** the page a section grows into */
function Page({ k, v, t, lang }: { k: K; v: HealthView; t: TFn; lang: Lang }) {
  const [ref, w] = useWidth<HTMLDivElement>(344);
  const W = w + 40;
  let out: ReactNode = null;
  if (k === 'ready' && v.ready) {
    const r = v.ready;
    out = r.learning !== undefined ? <>
      <div className="hx-lab"><i />{t('Ready')}</div>
      <div className="hx-n hx-n56" data-share="num">{r.learning}<small>/ 14</small></div>
      <h3 className="hx-dt hx-rise">{t('Learning your normal')}</h3>
      <p className="hx-dsub hx-rise">{t('Ready compares today with your own last 60 days: HRV, resting heart rate, sleep and training load. It needs 14 days of watch data first.')}</p>
    </> : <>
      <div className="hx-lab"><i />{t('Ready today')}</div>
      <div className="hx-rowc"><div><div className="hx-n hx-n56" data-share="num">{r.score}<small>{t(r.band)}</small></div></div><div data-share="chart"><ScoreRing value={r.score} color="#f6f7fb" size={88} /></div></div>
      <h3 className="hx-dt hx-rise">{readyLine(r, t)}</h3>
      <p className="hx-dsub hx-rise">{t('Measured against your own last 60 days. It explains; what you do with it is your call.')}</p>
      <div className="hx-panel hx-rise"><div className="hx-ptitle">{t('What it is made of')}</div><Parts s={r} t={t} /></div>
    </>;
  } else if (k === 'sleep' && v.night) {
    const n = v.night, sc = n.score;
    const st: [string, number, string][] = [[t('Deep'), n.stages.deep, '#7d6bff'], [t('REM'), n.stages.rem, '#c7b8ff'], [t('Light'), n.stages.light, '#a8b4ff'], [t('Awake'), n.stages.awake, '#ff9a7a']];
    const mx = Math.max(1, ...st.map((x) => x[1]));
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
      {sc && <div className="hx-panel hx-rise"><div className="hx-rowc"><div><div className="hx-ptitle" style={{ margin: 0 }}>{t('Sleep score')}</div><div className="hx-n" style={{ fontSize: 40, fontWeight: 300, marginTop: 4 }}>{sc.score}<small>/100 · {t(sc.band)}</small></div>{sc.cap && <div className="hx-sub" style={{ marginTop: 4 }}>{t('Under 7 h 40 of sleep it stays at most {n}.', { n: sc.cap })}</div>}</div><ScoreRing value={sc.score} color={C.sleep} /></div><div style={{ marginTop: 14 }}><Parts s={sc} t={t} /></div></div>}
      <div className="hx-panel hx-rise"><div className="hx-stages">{st.map(([name, m, c]) => <div key={name} className="hx-strow"><b style={{ color: c }}>{name}</b><div className="hx-sbar"><span className="hx-sb" style={{ ['--sc' as string]: c, width: `calc(${Math.round((m / mx) * 100)}% - 4px)` }} /></div><span>{hm(m, lang)}</span></div>)}</div></div>
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
    const vit: [string, number | undefined, [number, number] | undefined, string][] = [[t('Resting'), h.rest, h.restRange, ''], [t('HRV'), h.hrv, h.hrvRange, ' ms'], [t('Oxygen'), h.spo2, h.spo2Range, ' %'], [t('Breathing'), h.resp, h.respRange, '']];
    const calm = h.rest !== undefined && h.usual !== undefined && h.rest <= h.usual;
    out = <>
      <div className="hx-lab"><i />{t('Resting heart rate')}</div>
      <div><span className="hx-n hx-n64" data-share="num">{h.rest ?? '—'}</span><span className="hx-sub hx-unit">{t('bpm resting')}</span></div>
      <div className="hx-bleed" data-share="chart" style={{ marginTop: 4 }}><Trace values={h.trace} band={h.restRange} w={W} usualLabel={t('your usual')} /></div>
      <h3 className="hx-dt hx-rise">{calm ? t('Your heart is calm') : t('Your heart is working a little harder')}</h3>
      {h.rest !== undefined && h.usual !== undefined && <p className="hx-dsub hx-rise">{t('Resting at {n}, your usual is {u}.', { n: h.rest, u: Math.round(h.usual) })}</p>}
      {h.overnight.length > 4 && <div className="hx-panel hx-rise"><div className="hx-ptitle">{t('Last night, minute by minute')}</div><div className="hx-bleed" style={{ marginTop: -6 }}><NightHeart points={h.overnight} w={W} lowLabel={(b) => t('low {n}', { n: b })} /></div></div>}
      <div className="hx-panel hx-rise"><div className="hx-ptitle">{t('Overnight vitals')}</div><div className="hx-vit">{vit.filter((x) => x[1] !== undefined).map(([name, val, rg, unit]) => {
        const lo = rg ? rg[0] - (rg[1] - rg[0] + 1) : 0, hi = rg ? rg[1] + (rg[1] - rg[0] + 1) : 1, pos = (x: number) => Math.max(0, Math.min(100, ((x - lo) / (hi - lo)) * 100));
        return <div key={name} className="hx-vrow"><span>{name}</span><div className="hx-rg">{rg && <u style={{ left: `${pos(rg[0])}%`, width: `${pos(rg[1]) - pos(rg[0])}%` }} />}<i style={{ left: `${rg ? pos(val!) : 50}%` }} /></div><b>{fmtNum(val!, lang, 0)}{unit}</b></div>;
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
      <div><span className="hx-n hx-n52" data-share="num">{fmtNum(st.today ?? 0, lang, 0)}</span>{st.usual ? <span className="hx-sub hx-unit">{t('of your usual {n}', { n: fmtNum(Math.round(st.usual / 100) * 100, lang, 0) })}</span> : null}</div>
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
      {wk.sports.length > 0 && <div className="hx-panel hx-rise"><div className="hx-ptitle">{t('Minutes by sport')}</div>{wk.sports.map((x) => <div key={x.label} className="hx-sport"><span className="hx-sub">{x.label}</span><div className="hx-sbar"><span className="hx-sb" style={{ ['--sc' as string]: C.cardio, width: `calc(${Math.round((x.min / mx) * 100)}% - 4px)` }} /></div><span className="hx-sub" style={{ textAlign: 'right' }}>{x.min}</span></div>)}</div>}
      {wk.last && <div className="hx-panel hx-rise"><div className="hx-ptitle">{t('Last session')}</div><div className="hx-n" style={{ fontSize: 26, fontWeight: 300 }}>{wk.last.name || t(ACTIVITY_LABEL[wk.last.kind])} · {Math.round(wk.last.durationSec / 60)} min</div>
        <div className="hx-sub" style={{ marginTop: 6 }}>{[fmtDate(wk.last.date, lang), wk.last.avgHr ? t('avg {n} bpm', { n: Math.round(wk.last.avgHr) }) : '', wk.last.maxHr ? t('top {n}', { n: Math.round(wk.last.maxHr) }) : '', wk.last.kcal ? `${fmtNum(wk.last.kcal, lang, 0)} kcal` : ''].filter(Boolean).join(' · ')}</div></div>}
    </>;
  } else if (k === 'body' && v.body.kg !== undefined) {
    const b = v.body, u = 'kg';
    const lo = Math.min(...b.series), hi = Math.max(...b.series);
    out = <>
      <div className="hx-lab"><i />{t('Body')}</div>
      <div className="hx-n hx-n52" data-share="num">{fmtNum(b.kg!, lang, 1)}<small>{u}</small></div>
      <h3 className="hx-dt hx-rise">{b.rate === null ? t('Your weight') : Math.abs(b.rate) < 0.1 ? t('Steady') : b.rate < 0 ? t('Slowly down') : t('Slowly up')}</h3>
      {b.rate !== null && <p className="hx-dsub hx-rise">{t('About {n} kg a week.', { n: fmtSigned(b.rate, lang) })}</p>}
      {b.series.length > 1 && <div className="hx-panel hx-rise"><div className="hx-ptitle">{t('Weight, last 30 days')}</div><Spark values={b.series} w={w} h={100} /><div className="hx-ends"><span className="hx-ax3">{fmtNum(b.series[0], lang, 1)}</span><span className="hx-ax3">{fmtNum(lo, lang, 1)}–{fmtNum(hi, lang, 1)}</span></div></div>}
      {(b.fat !== undefined || v.heart.vo2 !== undefined) && <div className="hx-panel hx-rise"><div className="hx-kv">{b.fat !== undefined && <div><span>{t('Body fat')}</span><b>{fmtNum(b.fat, lang, 0)} %</b></div>}{v.heart.vo2 !== undefined && <div><span>VO2 max</span><b>{fmtNum(v.heart.vo2, lang, 0)}</b></div>}</div></div>}
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
