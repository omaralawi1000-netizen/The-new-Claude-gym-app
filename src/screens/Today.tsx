import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { useStore, plannedFor, missedWorkouts, foodPool, exerciseMap } from '../state/store';
import { useUI, buzz } from '../state/ui';
import { useT, useLang } from '../lib/i18n';
import { addDays, fmtDate, fmtDuration, fmtWeekdayShort, startOfWeek, weekdayOf } from '../lib/dates';
import { useDaySummary, useToday, useWaterOn, defaultMealId } from '../lib/derive';
import { Icon } from '../ui/Icon';
import { Ledger } from './food/Ledger';
import { weightTrend, trendRate, reviewWeekEnd, weekReview } from '../lib/stats';
import { Count } from '../ui/kit';
import { elapsedMs, sessionSetCount, sessionVolume } from '../lib/workout';
import { fmtNum, kgToDisplay } from '../lib/units';
import { entryFromSnapshot, snapshotOf, uid } from '../lib/nutrition';
import { defaultQty } from './food/Detail';
import { useCovered, useNow, useScreenStore } from '../lib/hooks';
import type { AppData, Routine } from '../lib/types';
import { exName } from './workout/common';

export function estMinutes(r: Routine): number {
  const sets = r.items.reduce((n, i) => n + i.warmupSets + i.workingSets, 0);
  const rest = r.items.reduce((n, i) => n + i.workingSets * i.restSec, 0);
  return Math.max(10, Math.round((sets * 45 + rest) / 60 / 5) * 5);
}

export function TodayScreen() {
  const t = useT();
  const lang = useLang();
  const s = useScreenStore(); // paused while the live workout covers the page
  const push = useUI((u) => u.push);
  const setTab = useUI((u) => u.setTab);
  const toast = useUI((u) => u.toast);
  const today = useToday();
  const { sum } = useDaySummary(today);
  const water = useWaterOn(today);
  const plan = plannedFor(s, today, today);
  const routine = plan ? s.routines.find((r) => r.id === plan.routineId) : undefined;
  const doneToday = s.sessions.filter((x) => x.date === today);
  const missed = useMemo(() => missedWorkouts(s, today), [s.schedule, s.routines, s.sessions, today]);
  const settings = s.settings;
  const wd = settings.widgets;

  // Training-day reminder. It can only fire while Aven is open (see Settings → Reminders): an in-app nudge, plus a system
  // notification once per day if the user allowed them.
  const [rh, rm] = settings.reminderTime.split(':').map(Number);
  const nowD = new Date();
  const dueNudge = settings.remindersEnabled && !!routine && !s.active && doneToday.length === 0 && nowD.getHours() * 60 + nowD.getMinutes() >= rh * 60 + rm;
  useEffect(() => {
    if (!dueNudge || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const key = `aven.notified.${today}`;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch { /* ignore */ }
    try { new Notification(t('Time to train'), { body: routine?.name, icon: `${import.meta.env.BASE_URL}icon-192.png` }); } catch { /* ignore */ }
  }, [dueNudge, today, routine?.name, t]);

  const start = (r?: Routine) => {
    buzz(14);
    if (!s.active) s.startWorkout({ routine: r, plannedDate: r && plan?.routineId === r.id ? today : undefined });
    push('workout', { origin: 'hero' });
  };

  // recents for one-tap repeat
  const pool = foodPool(s.foods, s.recipes);
  const recents = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; qty: any }>();
    for (const e of [...s.entries].sort((a, b) => b.at - a.at)) {
      if (e.quick || !e.snap.foodId || seen.has(e.snap.foodId)) continue;
      seen.set(e.snap.foodId, { id: e.snap.foodId, name: e.snap.name, qty: e.qty });
      if (seen.size >= 6) break;
    }
    return [...seen.values()];
  }, [s.entries]);
  const quickLog = (id: string, qty: any) => {
    const food = pool.find((f) => f.id === id);
    if (!food) return;
    const mealId = defaultMealId(settings.meals);
    const e = entryFromSnapshot(snapshotOf(food), defaultQty(food, qty), today, mealId, { id: uid('e') });
    if (!e) return;
    buzz(10);
    const [added] = s.logEntries([e]);
    if (added) toast(t('Added {name}', { name: food.name }), { tone: 'ok', actionLabel: t('Undo'), onAction: () => s.removeEntry(added.id) });
  };

  // week
  const weekStart = startOfWeek(today, settings.weekStart);
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(weekStart, i);
    const p = plannedFor(s, d, today);
    const done = s.sessions.some((x) => x.date === d);
    const wr = s.activities.some((x) => x.date === d && x.kind === 'wrestling');
    return { d, p, done, wr };
  });

  // While the workout overlay is open, keep the hero looking like it did when it was tapped: otherwise it flips to its
  // "in progress" layout (a different height) in the middle of the plate morph that grows out of it.
  // (read, not subscribed: opening the workout used to re-render all of Today behind it; it only needs to redraw once the
  // workout has gone — see the subscription below)
  const isWorkout = (o: { type: string }) => o.type === 'workout';
  const workoutOpen = useUI.getState().overlays.some(isWorkout);
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => useUI.subscribe((u, prev) => { if (prev.overlays.some(isWorkout) && !u.overlays.some(isWorkout)) redraw(); }), []);
  const frozenActive = useRef(s.active);
  if (!workoutOpen) frozenActive.current = s.active;
  const active = frozenActive.current;
  const aDone = active ? sessionSetCount(active.exercises, true) : 0;
  const aTotal = active ? sessionSetCount(active.exercises, false) : 0;
  const addWater = () => { buzz(8); const v = settings.waterQuick[1] ?? 250; const id = s.addWater(v, today); toast(`+${v} ml`, { tone: 'ok', actionLabel: t('Undo'), onAction: () => s.removeWater(id), duration: 3500 }); };
  const mealId = defaultMealId(settings.meals);
  const last = doneToday[doneToday.length - 1];
  // once today's planned workout is done, the card says so (and what got better) instead of offering to start it again
  const plannedDone = !!routine && doneToday.some((x) => x.routineId === routine.id || x.plannedDate === today);
  const gains = useMemo(() => {
    if (!last) return null;
    const prev = s.sessions.filter((x) => x.id !== last.id && x.date <= last.date && (last.routineId ? x.routineId === last.routineId : x.name === last.name)).sort((a, b) => b.date.localeCompare(a.date) || b.startedAt - a.startedAt)[0];
    const v = sessionVolume(last.exercises), pv = prev ? sessionVolume(prev.exercises) : 0;
    return { prs: last.records?.length ?? 0, pct: pv > 0 ? Math.round(((v - pv) / pv) * 100) : null };
  }, [last, s.sessions]);

  return (
    <div className="screen">
      <header className="row-flex between">
        <div className="small t2">{fmtDate(today, lang, { weekday: 'long', day: 'numeric', month: 'short' })}{settings.name ? <span className="t3"> · {settings.name}</span> : null}</div>
        <div className="row-flex" style={{ gap: 8 }}>
          <button className="icon-btn press" aria-label={t('Coach')} onClick={() => push('coach')}><Icon name="sparkle" /></button>
          <button className="icon-btn press" aria-label={t('Settings')} onClick={() => push('settings')}><Icon name="settings" /></button>
        </div>
      </header>

      {/* ── the day, as one instrument ── */}
      <section aria-label={t('Nutrition')}>
        <button className="press" style={{ display: 'block', width: '100%' }} onClick={() => setTab('food')} aria-label={t('Open log')}><Ledger sum={sum} compact /></button>
        {(wd.quick || wd.water) && <div className="row-flex" style={{ gap: 10, justifyContent: 'center', marginTop: 20 }}>
          {wd.quick && <>
          <button className="icon-btn press" aria-label={t('Log food')} onClick={() => push('foodSearch', { date: today, mealId })}><Icon name="plus" /></button>
          <button className="icon-btn press" aria-label={t('Scan')} onClick={() => push('scanner', { date: today, mealId })}><Icon name="barcode" /></button>
          <button className="icon-btn press" aria-label={t('Photo')} onClick={() => push('photoFood', { date: today, mealId })}><Icon name="camera" /></button>
          </>}
          {wd.water && <button className="icon-btn press" aria-label={`+${settings.waterQuick[1] ?? 250} ml`} onClick={addWater} style={{ width: 'auto', padding: '0 16px', gap: 6, display: 'inline-flex', alignItems: 'center' }}>
            <Icon name="drop" size={18} style={{ color: 'var(--c-water)' }} /><span className="num small" style={{ fontWeight: 600 }}>{fmtNum(water.ml, lang, 0)}</span>
          </button>}
        </div>}
        {wd.recents && recents.length > 0 && <div className="chips" style={{ marginTop: 14, justifyContent: 'safe center' }}>{recents.map((r) => <button key={r.id} className="chip press" onClick={() => quickLog(r.id, r.qty)} aria-label={`${t('Add')} ${r.name}`}>+ {r.name.split(',')[0]}</button>)}</div>}
      </section>

      {/* ── workout ── */}
      <motion.section style={{ position: 'relative' }}>
        <div data-wk="hero" className="plinth"
          style={{ position: 'absolute', inset: 0, borderRadius: 30, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', right: -60, top: -60, width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(closest-side, var(--ac-soft), transparent)' }} />
        </div>
        <div style={{ position: 'relative', padding: '22px 22px 22px 24px' }}>
          {active ? (
            <div className="row-flex between" style={{ gap: 14 }}>
              <div style={{ minWidth: 0 }}>
                <div className="row-flex" style={{ gap: 8 }}><span className="pulse-dot" style={active.pausedAt ? { animation: 'none', background: 'var(--tx3)' } : undefined} /><span className="small t2">{active.pausedAt ? t('Paused') : active.name || t('Workout')}</span></div>
                <div className="display num" style={{ fontSize: 54, marginTop: 8 }}><HeroClock /></div>
                <div className="small t2 num" style={{ marginTop: 2 }}>{aDone}<span className="t3"> / {aTotal}</span></div>
              </div>
              <button className="icon-btn acc press" style={{ width: 68, height: 68, flex: 'none' }} aria-label={t('Resume workout')} onClick={() => { buzz(12); push('workout', { origin: 'hero' }); }}><Icon name="play" size={26} /></button>
            </div>
          ) : routine && !(plannedDone && last) ? (
            <div className="row-flex between" style={{ gap: 14 }}>
              <div style={{ minWidth: 0 }}>
                <div className="display" style={{ fontSize: 56, fontStyle: 'italic', lineHeight: 0.95 }}>{routine.name}</div>
                <div className="small t2 num" style={{ marginTop: 8 }}>{routine.items.length} · ~{estMinutes(routine)} min{plan?.source === 'override' && plan.originDate ? ` · ${t('Rescheduled')}` : ''}</div>
              </div>
              <div className="stack" style={{ gap: 10, alignItems: 'center', flex: 'none' }}>
                <button className="icon-btn acc press" style={{ width: 68, height: 68 }} aria-label={doneToday.length ? t('Start again') : t('Start workout')} onClick={() => start(routine)}><Icon name="play" size={26} /></button>
                <button className="icon-btn flat sm press" aria-label={t('Edit routine')} onClick={() => push('routine', { id: routine.id })}><Icon name="edit" size={17} /></button>
              </div>
            </div>
          ) : last ? (
            <div className="row-flex between" style={{ gap: 14 }}>
              <div style={{ minWidth: 0 }}>
                <div className="row-flex" style={{ gap: 6, color: 'var(--ok)' }}><Icon name="check" size={16} sw={2.6} /><span className="small">{t('Done for today')}</span></div>
                <div className="display" style={{ fontSize: 46, fontStyle: 'italic', marginTop: 6 }}>{last.name}</div>
                <div className="small t2 num" style={{ marginTop: 8 }}>{fmtDuration(elapsedMs(last) / 1000)} · {fmtNum(Math.round(kgToDisplay(sessionVolume(last.exercises), settings.units.weight)), lang, 0)} {settings.units.weight}</div>
                {gains && (gains.prs > 0 || (gains.pct !== null && gains.pct !== 0)) && (
                  // what got better than last time
                  <div className="row-flex num" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    {gains.prs > 0 && <span className="chip sm" style={{ color: 'var(--gold)', borderColor: 'color-mix(in srgb, var(--gold) 40%, transparent)' }}><Icon name="bolt" size={13} /> {gains.prs} {gains.prs === 1 ? t('record') : t('records')}</span>}
                    {gains.pct !== null && gains.pct !== 0 && <span className="chip sm" style={{ color: gains.pct > 0 ? 'var(--ok)' : 'var(--tx2)' }}>{t('{n} % volume vs last time', { n: `${gains.pct > 0 ? '+' : '−'}${Math.abs(gains.pct)}` })}</span>}
                  </div>
                )}
              </div>
              <div className="stack" style={{ gap: 10, flex: 'none' }}>
                <button className="icon-btn press" aria-label={t('View')} onClick={() => push('sessionDetail', { id: last.id })}><Icon name="list" /></button>
                <button className="icon-btn press" aria-label={t('Train again')} onClick={() => start()}><Icon name="repeat" /></button>
              </div>
            </div>
          ) : s.routines.length === 0 ? (
            <div className="row-flex between" style={{ gap: 14 }}>
              <div className="display" style={{ fontSize: 46, fontStyle: 'italic' }}>{t('First session')}</div>
              <div className="stack" style={{ gap: 10, alignItems: 'center', flex: 'none' }}>
                <button className="icon-btn acc press" style={{ width: 68, height: 68 }} aria-label={t('Empty session')} onClick={() => start()}><Icon name="plus" size={26} /></button>
                <button className="icon-btn flat sm press" aria-label={t('Build routine')} onClick={() => push('routine', {})}><Icon name="list" size={17} /></button>
              </div>
            </div>
          ) : (
            <div>
              <div className="row-flex between">
                <div className="display" style={{ fontSize: 46, fontStyle: 'italic', opacity: .85 }}>{t('Rest day')}</div>
                <button className="icon-btn press" aria-label={t('Empty session')} onClick={() => start()}><Icon name="plus" /></button>
              </div>
              <div className="chips" style={{ marginTop: 14 }}>
                {s.routines.slice(0, 5).map((r) => <button key={r.id} className="chip press" onClick={() => start(r)}>{r.name}</button>)}
                <button className="chip acc press" onClick={() => push('activity', { kind: 'wrestling' })}><Icon name="wrestle" size={15} /> {t('Wrestling')}</button>
              </div>
            </div>
          )}
        </div>
      </motion.section>

      {dueNudge && routine && (
        <div className="plinth-2 small row-flex between" style={{ padding: '10px 14px' }} role="status">
          <span><Icon name="bell" size={16} style={{ verticalAlign: '-3px', marginRight: 6 }} /><b>{t('Time to train')}</b> · {routine.name}</span>
          <button className="chip sm acc press" onClick={() => start(routine)}>{t('Start')}</button>
        </div>
      )}

      {missed.length > 0 && !active && (
        <section className="stack gap8">
          {missed.slice(0, 2).map((m) => {
            const r = s.routines.find((x) => x.id === m.routineId);
            return (
              <div key={m.date} className="plinth-2 row-flex between" style={{ padding: '10px 10px 10px 16px' }}>
                <div className="small"><b>{r?.name}</b> · <span className="t2">{fmtDate(m.date, lang, { weekday: 'short' })}</span></div>
                <button className="chip sm acc press" onClick={() => push('rescheduleSheet', { date: m.date, routineId: m.routineId })}>{t('Reschedule')}</button>
              </div>
            );
          })}
        </section>
      )}

      <WeekReviewCard d={s} today={today} />

      {/* ── week ── */}
      {wd.week && <section style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {week.map((w) => {
          const isToday = w.d === today;
          const past = w.d < today;
          const r = w.p ? s.routines.find((x) => x.id === w.p!.routineId) : undefined;
          return (
            <button key={w.d} className="press" onClick={() => setTab('train')} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }} aria-label={`${fmtDate(w.d, lang)}${r ? `: ${r.name}` : ''}${w.done ? `, ${t('done')}` : ''}`}>
              <span className="micro" style={{ color: isToday ? 'var(--ac-text)' : undefined }}>{fmtWeekdayShort(weekdayOf(w.d), lang, true)}</span>
              <span style={{ width: 36, height: 36, borderRadius: '50%', display: 'grid', placeItems: 'center', background: w.done ? 'var(--ac)' : w.wr ? 'var(--ac-soft)' : r || isToday ? 'var(--s2)' : 'transparent', color: w.done ? 'var(--ac-ink)' : w.wr ? 'var(--ac-text)' : 'var(--tx2)', boxShadow: w.done ? '0 0 18px -2px var(--ac)' : isToday ? 'inset 0 0 0 1.5px var(--ac), 0 0 18px -6px var(--ac)' : r ? 'inset 0 0 0 1px var(--line)' : undefined, fontSize: 12, fontWeight: 700 }}>
                {/* a rest day is just a quiet dot: circles only where something is planned or done */}
                {w.done ? <Icon name="check" size={17} sw={2.6} /> : w.wr ? <Icon name="wrestle" size={17} /> : r ? r.name.slice(0, 1).toUpperCase() : <i aria-hidden style={{ width: 4, height: 4, borderRadius: 4, background: 'var(--tx3)', opacity: 0.6 }} />}
              </span>
              <i style={{ width: 4, height: 4, borderRadius: 4, background: r && past && !w.done ? 'var(--bad)' : 'transparent' }} />
            </button>
          );
        })}
      </section>}

      {/* ── weight trend ── */}
      {wd.weight && <WeightTrend />}

      <div className="row-flex" style={{ justifyContent: 'center' }}>
        <button className="chip sm press" onClick={() => push('settings', { section: 'today' })}><Icon name="settings" size={14} /> {t('Customize Today')}</button>
      </div>

      {s.demo && (
        <div className="row-flex" style={{ justifyContent: 'center' }}>
          <button className="chip sm press" onClick={() => push('settings', { section: 'data' })} aria-label={t('Remove demo data')}><span className="pulse-dot" style={{ width: 6, height: 6 }} /> {t('Demo data')} · {t('Remove')}</button>
        </div>
      )}

    </div>
  );
}

/** The running workout's clock on the hero card. Only this line ticks — not the whole Today screen (which stays mounted,
 * hidden, behind the live workout). */
function HeroClock() {
  const a = useStore((x) => x.active);
  const covered = useCovered(); // behind the open workout nobody sees it tick
  const now = useNow(1000, !!a && !covered);
  return <>{a ? fmtDuration(elapsedMs(a, now) / 1000) : ''}</>;
}

/**
 * Weight trend: today's weight, how it has moved, and the line drawing itself in. Sits in one card; before the first weigh-in it
 * is a single quiet prompt. The trend is the smoothed line (an estimate), the change is plain first-to-last of the last 30 days.
 */
function WeightTrend() {
  const t = useT();
  const lang = useLang();
  const weights = useStore((x) => x.weights);
  const u = useStore((x) => x.settings.units.weight);
  const push = useUI((x) => x.push);
  const setTab = useUI((x) => x.setTab);
  const sorted = useMemo(() => weights.slice().sort((a, b) => a.date.localeCompare(b.date)), [weights]);
  const last = sorted[sorted.length - 1];
  const pts = useMemo(() => sorted.slice(-30).map((w) => kgToDisplay(w.kg, u)), [sorted, u]);
  const rate = useMemo(() => trendRate(weightTrend(sorted)), [sorted]);
  if (!last) {
    return (
      <section className="plinth row-flex between" style={{ padding: '16px 14px 16px 20px', borderRadius: 'var(--r-lg)' }}>
        <div><div className="micro">{t('Weight')}</div><div className="small t2" style={{ marginTop: 4 }}>{t('Log your weight to see the trend.')}</div></div>
        <button className="icon-btn press" aria-label={t('Log weight')} onClick={() => push('weight')}><Icon name="plus" /></button>
      </section>
    );
  }
  const change = pts.length >= 2 ? pts[pts.length - 1] - pts[0] : null;
  const rateD = rate === null ? null : kgToDisplay(rate, u);
  const sign = (v: number) => (v > 0.04 ? '+' : v < -0.04 ? '−' : '');
  return (
    <section className="plinth wt" style={{ padding: '16px 16px 14px 20px', borderRadius: 'var(--r-lg)' }}>
      <div className="row-flex between" style={{ alignItems: 'flex-start' }}>
        <button className="press" style={{ textAlign: 'left' }} onClick={() => setTab('progress')} aria-label={t('Open progress')}>
          <div className="micro">{t('Weight')}</div>
          <div style={{ marginTop: 4 }}><span className="display num" style={{ fontSize: 44 }}><Count value={kgToDisplay(last.kg, u)} format={(v) => fmtNum(v, lang, 1)} /></span><span className="t3 small"> {u}</span></div>
        </button>
        <button className="icon-btn press" aria-label={t('Log weight')} onClick={() => push('weight')}><Icon name="plus" /></button>
      </div>
      {pts.length >= 2 && <TrendLine values={pts} />}
      <div className="small t2 num" style={{ marginTop: 6 }}>
        {change !== null && <span>{sign(change)}{fmtNum(Math.abs(change), lang, 1)} {u} <span className="t3">· {t('last {n} weigh-ins', { n: pts.length })}</span></span>}
        {rateD !== null && <span className="t3">{change !== null ? ' · ' : ''}{sign(rateD)}{fmtNum(Math.abs(rateD), lang, 1)} {u}/{t('wk')}</span>}
      </div>
    </section>
  );
}

/** The weight line: soft area under it, the line drawing itself in once, and a glowing dot at today's value. */
function TrendLine({ values }: { values: number[] }) {
  const w = 320, h = 70, pad = 6;
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const X = (i: number) => pad + (i / (values.length - 1)) * (w - pad * 2);
  const Y = (v: number) => pad + (1 - (v - min) / span) * (h - pad * 2);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join('');
  const lx = X(values.length - 1), ly = Y(values[values.length - 1]);
  return (
    <svg className="trend" viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" aria-hidden style={{ display: 'block', marginTop: 8, overflow: 'visible' }}>
      <defs><linearGradient id="wt-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--ac)" stopOpacity=".28" /><stop offset="1" stopColor="var(--ac)" stopOpacity="0" /></linearGradient></defs>
      <path className="trend-area" d={`${d}L${lx} ${h}L${X(0)} ${h}Z`} fill="url(#wt-fill)" />
      <path className="trend-line" d={d} pathLength={1} fill="none" stroke="var(--ac)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" style={{ filter: 'drop-shadow(0 0 6px var(--ac))' }} />
      <circle className="trend-dot" cx={lx} cy={ly} r="4" fill="var(--ac)" stroke="var(--bg)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/**
 * The week in review: on the last day of the week (from midday) and the first day of the next, one card with the week's
 * sessions, protein, weight trend and records, and a lift that has stopped improving. The Coach turns it into one change
 * for next week. Computed on the phone; nothing is sent until you ask the Coach.
 */
function WeekReviewCard({ d, today }: { d: AppData; today: string }) {
  const t = useT();
  const lang = useLang();
  const push = useUI((u) => u.push);
  const end = reviewWeekEnd(today, new Date().getHours(), d.settings.weekStart);
  const [hidden, setHidden] = useState(() => { try { return !!end && localStorage.getItem('aven.review') === end; } catch { return false; } });
  const r = useMemo(() => (end ? weekReview(d, end) : null), [end, d.sessions, d.entries, d.weights, d.activities]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!end || hidden || !r || r.sessions + r.wrestling + r.loggedDays === 0) return null;
  const u = d.settings.units.weight;
  const goal = d.settings.goals.protein;
  const stall = r.stalls[0];
  const stallEx = stall ? exerciseMap(d.exercises).get(stall.exerciseId) : undefined;
  const dismiss = () => { try { localStorage.setItem('aven.review', end); } catch { /* ignore */ } buzz(6); setHidden(true); };
  const rate = r.weightRate !== null ? kgToDisplay(r.weightRate, u) : null;
  return (
    <section className="plinth review-card" aria-label={t('Your week')}>
      <div className="row-flex between" style={{ alignItems: 'flex-start' }}>
        <div>
          <div className="micro">{t('Your week')}</div>
          <div className="display display-sm" style={{ fontStyle: 'italic', marginTop: 4 }}>{fmtDate(r.from, lang, { day: 'numeric', month: 'short' })} – {fmtDate(r.to, lang, { day: 'numeric', month: 'short' })}</div>
        </div>
        <button className="icon-btn flat sm press" aria-label={t('Hide')} onClick={dismiss}><Icon name="close" size={16} /></button>
      </div>
      <div className="review-grid">
        <div><div className="review-num num">{r.sessions}</div><div className="xs t2">{r.wrestling ? t('workouts + {n} wrestling', { n: r.wrestling }) : t('workouts')}{r.prevSessions !== r.sessions ? ` · ${r.sessions > r.prevSessions ? '↑' : '↓'} ${t('from {n}', { n: r.prevSessions })}` : ''}</div></div>
        <div><div className="review-num num">{r.proteinAvg !== null ? `${Math.round(r.proteinAvg)} g` : '—'}</div><div className="xs t2">{goal ? t('protein a day · target {n} g', { n: goal }) : t('protein a day')}</div></div>
        <div><div className="review-num num">{rate !== null ? `${rate > 0 ? '+' : rate < 0 ? '−' : ''}${fmtNum(Math.abs(rate), lang, 1)} ${u}` : '—'}</div><div className="xs t2">{t('weight per week (estimate)')}</div></div>
        <div><div className="review-num num">{r.records}</div><div className="xs t2">{r.records === 1 ? t('new record') : t('new records')}</div></div>
      </div>
      {stall && stallEx && (
        <div className="xs review-stall"><Icon name="info" size={14} style={{ flex: 'none', marginTop: 1 }} /><span>{t('{ex} has stalled: best {w} × {r} since {date}', { ex: exName(stallEx, lang), w: `${fmtNum(kgToDisplay(stall.best.kg, u), lang, 2)} ${u}`, r: stall.best.reps, date: fmtDate(stall.since, lang, { day: 'numeric', month: 'short' }) })}</span></div>
      )}
      <button className="btn sm primary press" style={{ marginTop: 14 }} onClick={() => { buzz(8); push('coach', { ask: t('Review my week and give me the one thing to change next week.') }); }}>
        <Icon name="sparkle" size={15} /> {t('Plan next week with the Coach')}
      </button>
    </section>
  );
}
