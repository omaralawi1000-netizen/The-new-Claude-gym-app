import { useEffect, useMemo, useRef } from 'react';
import { motion } from 'motion/react';
import { useStore, exerciseMap, plannedFor, missedWorkouts, foodPool } from '../state/store';
import { useUI, buzz } from '../state/ui';
import { useT, useLang } from '../lib/i18n';
import { addDays, fmtDate, fmtDuration, fmtWeekdayShort, startOfWeek, weekdayOf, diffDays } from '../lib/dates';
import { useDaySummary, useToday, useWaterOn, defaultMealId } from '../lib/derive';
import { Icon } from '../ui/Icon';
import { Ledger } from './food/Ledger';
import { Sparkline } from '../ui/charts';
import { Section } from '../ui/kit';
import { SOFT } from '../ui/Sheet';
import { elapsedMs, sessionSetCount, sessionVolume } from '../lib/workout';
import { exName } from './workout/common';
import { fmtNum, kgToDisplay } from '../lib/units';
import { entryFromSnapshot, snapshotOf, uid } from '../lib/nutrition';
import { defaultQty } from './food/Detail';
import { useNow } from '../lib/hooks';
import type { Routine } from '../lib/types';

function greeting(h: number, t: (k: string) => string) {
  return h < 5 ? t('Late night') : h < 11 ? t('Good morning') : h < 17 ? t('Good afternoon') : t('Good evening');
}

export function estMinutes(r: Routine): number {
  const sets = r.items.reduce((n, i) => n + i.warmupSets + i.workingSets, 0);
  const rest = r.items.reduce((n, i) => n + i.workingSets * i.restSec, 0);
  return Math.max(10, Math.round((sets * 45 + rest) / 60 / 5) * 5);
}

export function TodayScreen() {
  const t = useT();
  const lang = useLang();
  const s = useStore();
  const push = useUI((u) => u.push);
  const setTab = useUI((u) => u.setTab);
  const toast = useUI((u) => u.toast);
  const today = useToday();
  const { sum } = useDaySummary(today);
  const water = useWaterOn(today);
  const exMap = exerciseMap(s.exercises);
  const now = useNow(1000, !!s.active);
  const plan = plannedFor(s, today, today);
  const routine = plan ? s.routines.find((r) => r.id === plan.routineId) : undefined;
  const doneToday = s.sessions.filter((x) => x.date === today);
  const missed = useMemo(() => missedWorkouts(s, today), [s.schedule, s.routines, s.sessions, today]);
  const settings = s.settings;
  const first = s.entries.length === 0 && s.sessions.length === 0 && s.weights.length === 0;

  // Training-day reminder. It can only fire while Aven is open (see Settings → Reminders): an in-app nudge, plus a system
  // notification once per day if the user allowed them.
  const [rh, rm] = settings.reminderTime.split(':').map(Number);
  const nowD = new Date();
  const dueNudge = settings.remindersEnabled && !!routine && !s.active && doneToday.length === 0 && nowD.getHours() * 60 + nowD.getMinutes() >= rh * 60 + rm;
  useEffect(() => {
    if (!dueNudge || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const key = `aven.notified.${today}`;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch { /* ignore */ }
    try { new Notification(t('Time to train'), { body: routine?.name, icon: '/icon-192.png' }); } catch { /* ignore */ }
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
    return { d, p, done };
  });
  const weights = s.weights.slice().sort((a, b) => a.date.localeCompare(b.date));
  const recentW = weights.slice(-14).map((w) => w.kg);
  const lastW = weights[weights.length - 1];

  // activity feed
  type Item = { at: number; icon: any; title: string; sub: string; run: () => void };
  const feed: Item[] = [];
  s.sessions.slice(-4).forEach((x) => feed.push({ at: x.endedAt ?? x.startedAt, icon: 'dumbbell', title: x.name || t('Workout'), sub: `${fmtDate(x.date, lang, { weekday: 'short', day: 'numeric', month: 'short' })} · ${fmtDuration(elapsedMs(x) / 1000)} · ${fmtNum(Math.round(kgToDisplay(sessionVolume(x.exercises), settings.units.weight)), lang, 0)} ${settings.units.weight}${x.records?.length ? ` · ${x.records.length} PR` : ''}`, run: () => push('sessionDetail', { id: x.id }) }));
  s.activities.slice(-3).forEach((x) => feed.push({ at: x.at, icon: 'run', title: t(x.kind === 'run' ? 'Run' : x.kind === 'walk' ? 'Walk' : x.kind === 'cycle' ? 'Cycle' : x.kind === 'swim' ? 'Swim' : x.kind === 'row' ? 'Row' : x.kind === 'hike' ? 'Hike' : x.kind === 'mobility' ? 'Mobility' : x.kind === 'warmup' ? 'Warm-up' : x.kind === 'recovery' ? 'Recovery' : 'Activity'), sub: `${fmtDate(x.date, lang, { weekday: 'short', day: 'numeric', month: 'short' })} · ${Math.round(x.durationSec / 60)} min`, run: () => setTab('train') }));
  weights.slice(-2).forEach((x) => feed.push({ at: x.at, icon: 'scale', title: `${fmtNum(kgToDisplay(x.kg, settings.units.weight), lang, 1)} ${settings.units.weight}`, sub: `${t('Bodyweight')} · ${fmtDate(x.date, lang, { weekday: 'short', day: 'numeric', month: 'short' })}`, run: () => push('weight') }));
  feed.sort((a, b) => b.at - a.at);

  // While the workout overlay is open, keep the hero looking like it did when it was tapped: otherwise it flips to its
  // "in progress" layout (a different height) in the middle of the plate morph that grows out of it.
  const workoutOpen = useUI((u) => u.overlays.some((o) => o.type === 'workout'));
  const frozenActive = useRef(s.active);
  if (!workoutOpen) frozenActive.current = s.active;
  const active = frozenActive.current;
  const aDone = active ? sessionSetCount(active.exercises, true) : 0;
  const aTotal = active ? sessionSetCount(active.exercises, false) : 0;
  const hour = new Date().getHours();

  return (
    <div className="screen">
      <header className="row-flex between" style={{ alignItems: 'flex-start' }}>
        <div>
          <div className="micro">{fmtDate(today, lang, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          <h1 className="display display-lg" style={{ margin: '6px 0 0' }}>{greeting(hour, t)}{settings.name ? `,` : ''}<br />{settings.name || ''}</h1>
        </div>
        <div className="row-flex" style={{ gap: 6 }}>
          <button className="icon-btn press" aria-label={t('Coach')} onClick={() => push('coach')}><Icon name="sparkle" /></button>
          <button className="icon-btn press" aria-label={t('Settings')} onClick={() => push('settings')}><Icon name="settings" /></button>
        </div>
      </header>

      {s.demo && (
        <div className="plinth-2 small row-flex between" style={{ padding: '10px 14px' }}>
          <span><b>{t('Demo data')}</b> · {t('made up to show the app')}</span>
          <button className="chip sm acc press" onClick={() => push('settings', { section: 'data' })}>{t('Remove')}</button>
        </div>
      )}

      {/* ── workout hero ── */}
      <motion.section layout="position" style={{ position: 'relative' }}>
        <motion.div layoutId="wk-hero" transition={SOFT} className="dots"
          style={{ position: 'absolute', inset: 0, borderRadius: 'var(--r-lg)', background: 'var(--s1)', boxShadow: 'inset 0 1px 0 var(--hl), inset 0 0 0 1px var(--line), var(--sh-a)', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, background: 'var(--ac)' }} />
        </motion.div>
        <div style={{ position: 'relative', padding: '20px 20px 20px 24px' }}>
          {active ? (
            <>
              <div className="row-flex" style={{ gap: 8 }}><span className="pulse-dot" style={active.pausedAt ? { animation: 'none', background: 'var(--tx3)' } : undefined} /><span className="micro accent">{active.pausedAt ? t('Paused') : t('In progress')}</span></div>
              <div className="display display-lg" style={{ marginTop: 10 }}>{active.name || t('Workout')}</div>
              <div className="row-flex" style={{ gap: 18, marginTop: 14 }}>
                <div><div className="micro">{t('Time')}</div><div className="display display-md num">{fmtDuration(elapsedMs(active, now) / 1000)}</div></div>
                <div><div className="micro">{t('Sets')}</div><div className="display display-md num">{aDone}<span className="t3">/{aTotal}</span></div></div>
              </div>
              <button className="btn primary block press" style={{ marginTop: 18 }} onClick={() => { buzz(12); push('workout', { origin: 'hero' }); }}><Icon name="play" size={18} /> {t('Resume workout')}</button>
            </>
          ) : routine ? (
            <>
              <div className="micro accent">{plan?.source === 'override' && plan.originDate ? t('Rescheduled') : t('Today’s workout')}</div>
              <div className="display display-lg" style={{ marginTop: 8 }}>{routine.name}</div>
              <div className="small t2 num" style={{ marginTop: 6 }}>{routine.items.length} {t('exercises')} · ~{estMinutes(routine)} min</div>
              <ul style={{ listStyle: 'none', padding: 0, margin: '14px 0 0', display: 'flex', flexDirection: 'column', gap: 7 }}>
                {routine.items.slice(0, 4).map((i) => { const ex = exMap.get(i.exerciseId); return <li key={i.id} className="row-flex between small"><span className="trunc">{ex ? exName(ex, lang) : ''}</span><span className="t3 num" style={{ flex: 'none' }}>{i.workingSets} × {i.repMin}–{i.repMax}</span></li>; })}
                {routine.items.length > 4 && <li className="xs t3">+{routine.items.length - 4} {t('more')}</li>}
              </ul>
              <div className="row-flex" style={{ gap: 10, marginTop: 18 }}>
                <button className="btn primary grow press" onClick={() => start(routine)}><Icon name="play" size={18} /> {doneToday.length ? t('Start again') : t('Start workout')}</button>
                <button className="icon-btn press" aria-label={t('Edit routine')} onClick={() => push('routine', { id: routine.id })}><Icon name="edit" /></button>
              </div>
            </>
          ) : doneToday.length ? (
            <>
              <div className="micro" style={{ color: 'var(--ok)' }}>{t('Done for today')}</div>
              <div className="display display-lg" style={{ marginTop: 8 }}>{doneToday[doneToday.length - 1].name}</div>
              <div className="small t2 num" style={{ marginTop: 6 }}>{fmtDuration(elapsedMs(doneToday[doneToday.length - 1]) / 1000)} · {fmtNum(Math.round(kgToDisplay(sessionVolume(doneToday[doneToday.length - 1].exercises), settings.units.weight)), lang, 0)} {settings.units.weight}</div>
              <div className="row-flex" style={{ gap: 10, marginTop: 16 }}>
                <button className="btn grow press" onClick={() => push('sessionDetail', { id: doneToday[doneToday.length - 1].id })}>{t('View')}</button>
                <button className="btn grow press" onClick={() => start()}>{t('Train again')}</button>
              </div>
            </>
          ) : s.routines.length === 0 ? (
            <>
              <div className="micro accent">{t('Train')}</div>
              <div className="display display-lg" style={{ marginTop: 8 }}>{t('Start your first session')}</div>
              <div className="small t2" style={{ marginTop: 8, maxWidth: 290 }}>{t('Log as you go, or build a routine and let Aven line up your week.')}</div>
              <div className="row-flex" style={{ gap: 10, marginTop: 18 }}>
                <button className="btn primary grow press" onClick={() => start()}><Icon name="plus" size={18} /> {t('Empty session')}</button>
                <button className="btn grow press" onClick={() => push('routine', {})}>{t('Build routine')}</button>
              </div>
            </>
          ) : (
            <>
              <div className="micro">{t('Rest day')}</div>
              <div className="display display-lg" style={{ marginTop: 8 }}>{t('Nothing planned today')}</div>
              <div className="small t2" style={{ marginTop: 8 }}>{t('Train anyway, or pick one of your routines.')}</div>
              <div className="chips" style={{ marginTop: 14 }}>
                {s.routines.slice(0, 5).map((r) => <button key={r.id} className="chip press" onClick={() => start(r)}>{r.name}</button>)}
              </div>
              <button className="btn block press" style={{ marginTop: 12 }} onClick={() => start()}>{t('Empty session')}</button>
            </>
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
        <section className="plinth-2" style={{ padding: 14 }}>
          <div className="micro" style={{ marginBottom: 8 }}>{t('Missed')}</div>
          {missed.slice(0, 2).map((m) => {
            const r = s.routines.find((x) => x.id === m.routineId);
            return (
              <div key={m.date} className="row-flex between" style={{ padding: '6px 0' }}>
                <div className="small"><b>{r?.name}</b> · <span className="t2">{fmtDate(m.date, lang, { weekday: 'long' })}</span></div>
                <button className="chip sm acc press" onClick={() => push('rescheduleSheet', { date: m.date, routineId: m.routineId })}>{t('Reschedule')}</button>
              </div>
            );
          })}
        </section>
      )}

      {/* ── nutrition ── */}
      <Section title={t('Nutrition')} right={<button className="small accent press" onClick={() => setTab('food')}>{t('Open log')} →</button>}>
        <Ledger sum={sum} compact />
        <div style={{ marginTop: 12 }} className="chips">
          <button className="chip acc press" onClick={() => push('foodSearch', { date: today, mealId: defaultMealId(settings.meals) })}><Icon name="plus" size={16} /> {t('Log food')}</button>
          <button className="chip press" onClick={() => push('voice', { mode: 'food', date: today, mealId: defaultMealId(settings.meals) })}><Icon name="mic" size={16} /> {t('Dictate')}</button>
          <button className="chip press" onClick={() => push('scanner', { date: today, mealId: defaultMealId(settings.meals) })}><Icon name="barcode" size={16} /> {t('Scan')}</button>
          {recents.map((r) => <button key={r.id} className="chip press" onClick={() => quickLog(r.id, r.qty)} aria-label={`${t('Add')} ${r.name}`}>+ {r.name.split(',')[0]}</button>)}
        </div>
        <div className="row-flex between" style={{ marginTop: 6 }}>
          <div className="small t2 num"><Icon name="drop" size={15} style={{ verticalAlign: '-3px', color: 'var(--c-water)' }} /> {fmtNum(water.ml, lang, 0)} / {fmtNum(settings.goals.waterMl, lang, 0)} ml</div>
          <button className="chip sm press" onClick={() => { buzz(8); const v = settings.waterQuick[1] ?? 250; const id = s.addWater(v, today); toast(`+${v} ml`, { tone: 'ok', actionLabel: t('Undo'), onAction: () => s.removeWater(id), duration: 3500 }); }}>+{settings.waterQuick[1] ?? 250} ml</button>
        </div>
      </Section>

      {/* ── week ── */}
      <Section title={t('This week')} right={<button className="small accent press" onClick={() => setTab('train')}>{t('Plan')} →</button>}>
        <div className="plinth" style={{ padding: '14px 10px', display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {week.map((w) => {
            const isToday = w.d === today;
            const past = w.d < today;
            const r = w.p ? s.routines.find((x) => x.id === w.p!.routineId) : undefined;
            return (
              <button key={w.d} className="press" onClick={() => { setTab('train'); }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }} aria-label={`${fmtDate(w.d, lang)}${r ? `: ${r.name}` : ''}${w.done ? `, ${t('done')}` : ''}`}>
                <span className="micro" style={{ color: isToday ? 'var(--ac-text)' : undefined }}>{fmtWeekdayShort(weekdayOf(w.d), lang, true)}</span>
                <span style={{ width: 34, height: 34, borderRadius: 12, display: 'grid', placeItems: 'center', background: w.done ? 'var(--ac)' : 'var(--s2)', color: w.done ? 'var(--ac-ink)' : 'var(--tx2)', boxShadow: isToday ? 'inset 0 0 0 1.5px var(--ac)' : 'inset 0 0 0 1px var(--line)', fontSize: 12, fontWeight: 700 }}>
                  {w.done ? <Icon name="check" size={17} sw={2.6} /> : r ? r.name.slice(0, 1).toUpperCase() : ''}
                </span>
                <i style={{ width: 4, height: 4, borderRadius: 4, background: r && past && !w.done ? 'var(--bad)' : 'transparent' }} />
              </button>
            );
          })}
        </div>
      </Section>

      {/* ── body ── */}
      {lastW && (
        <Section title={t('Bodyweight')} right={<button className="small accent press" onClick={() => push('weight')}>{t('Log')} →</button>}>
          <button className="plinth press" style={{ width: '100%', padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left' }} onClick={() => setTab('progress')}>
            <div><div className="display display-lg num">{fmtNum(kgToDisplay(lastW.kg, settings.units.weight), lang, 1)}<span className="t3 display-sm" style={{ fontStretch: '100%', fontWeight: 600 }}> {settings.units.weight}</span></div><div className="small t2">{diffDays(today, lastW.date) === 0 ? t('today') : `${diffDays(today, lastW.date)} ${t('days ago')}`}</div></div>
            <Sparkline values={recentW.map((x) => kgToDisplay(x, settings.units.weight))} w={110} h={40} />
          </button>
        </Section>
      )}

      {/* ── recent ── */}
      {feed.length > 0 ? (
        <Section title={t('Recent activity')}>
          <div className="list">
            {feed.slice(0, 5).map((f, i) => (
              <button key={i} className="li press" onClick={f.run}>
                <span style={{ width: 38, height: 38, borderRadius: 12, background: 'var(--s2)', display: 'grid', placeItems: 'center', color: 'var(--tx2)', boxShadow: 'inset 0 0 0 1px var(--line)', flex: 'none' }}><Icon name={f.icon} size={19} /></span>
                <div className="grow" style={{ textAlign: 'left', minWidth: 0 }}><div className="li-title trunc">{f.title}</div><div className="li-sub trunc">{f.sub}</div></div>
                <Icon name="chevR" size={16} style={{ color: 'var(--tx3)' }} />
              </button>
            ))}
          </div>
        </Section>
      ) : first && (
        <Section title={t('Getting started')}>
          <div className="stack gap8">
            {[
              { icon: 'mic', t: t('Say what you ate'), s: t('“200 grams of skyr and a banana” — review, then confirm.'), run: () => push('voice', { mode: 'food', date: today, mealId: defaultMealId(settings.meals) }) },
              { icon: 'bolt', t: t('Set your targets'), s: t('Calories and macros are optional — set them any time.'), run: () => push('settings', { section: 'targets' }) },
              { icon: 'scale', t: t('Log your weight'), s: t('One number starts your trend.'), run: () => push('weight') },
            ].map((x) => (
              <button key={x.t} className="plinth press" style={{ padding: 14, display: 'flex', gap: 14, alignItems: 'center', textAlign: 'left' }} onClick={x.run}>
                <span style={{ width: 40, height: 40, borderRadius: 13, background: 'var(--ac-soft)', color: 'var(--ac-text)', display: 'grid', placeItems: 'center' }}><Icon name={x.icon} size={20} /></span>
                <div className="grow"><div className="li-title">{x.t}</div><div className="li-sub">{x.s}</div></div><Icon name="chevR" size={16} />
              </button>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
