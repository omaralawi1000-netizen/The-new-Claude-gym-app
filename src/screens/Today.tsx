import { useEffect, useMemo, useRef } from 'react';
import { motion } from 'motion/react';
import { useStore, plannedFor, missedWorkouts, foodPool } from '../state/store';
import { useUI, buzz } from '../state/ui';
import { useT, useLang } from '../lib/i18n';
import { addDays, fmtDate, fmtDuration, fmtWeekdayShort, startOfWeek, weekdayOf } from '../lib/dates';
import { useDaySummary, useToday, useWaterOn, defaultMealId } from '../lib/derive';
import { Icon } from '../ui/Icon';
import { Ledger } from './food/Ledger';
import { Sparkline } from '../ui/charts';
import { elapsedMs, sessionSetCount, sessionVolume } from '../lib/workout';
import { fmtNum, kgToDisplay } from '../lib/units';
import { entryFromSnapshot, snapshotOf, uid } from '../lib/nutrition';
import { defaultQty } from './food/Detail';
import { useNow } from '../lib/hooks';
import type { Routine } from '../lib/types';

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
  const weights = s.weights.slice().sort((a, b) => a.date.localeCompare(b.date));
  const recentW = weights.slice(-14).map((w) => w.kg);
  const lastW = weights[weights.length - 1];

  // While the workout overlay is open, keep the hero looking like it did when it was tapped: otherwise it flips to its
  // "in progress" layout (a different height) in the middle of the plate morph that grows out of it.
  const workoutOpen = useUI((u) => u.overlays.some((o) => o.type === 'workout'));
  const frozenActive = useRef(s.active);
  if (!workoutOpen) frozenActive.current = s.active;
  const active = frozenActive.current;
  const aDone = active ? sessionSetCount(active.exercises, true) : 0;
  const aTotal = active ? sessionSetCount(active.exercises, false) : 0;
  const addWater = () => { buzz(8); const v = settings.waterQuick[1] ?? 250; const id = s.addWater(v, today); toast(`+${v} ml`, { tone: 'ok', actionLabel: t('Undo'), onAction: () => s.removeWater(id), duration: 3500 }); };
  const mealId = defaultMealId(settings.meals);
  const last = doneToday[doneToday.length - 1];

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
        <div className="row-flex" style={{ gap: 10, justifyContent: 'center', marginTop: 20 }}>
          <button className="icon-btn press" aria-label={t('Log food')} onClick={() => push('foodSearch', { date: today, mealId })}><Icon name="plus" /></button>
          <button className="icon-btn press" aria-label={t('Dictate')} onClick={() => push('voice', { mode: 'food', date: today, mealId })}><Icon name="mic" /></button>
          <button className="icon-btn press" aria-label={t('Scan')} onClick={() => push('scanner', { date: today, mealId })}><Icon name="barcode" /></button>
          <button className="icon-btn press" aria-label={t('Photo')} onClick={() => push('photoFood', { date: today, mealId })}><Icon name="camera" /></button>
          <button className="icon-btn press" aria-label={`+${settings.waterQuick[1] ?? 250} ml`} onClick={addWater} style={{ width: 'auto', padding: '0 16px', gap: 6, display: 'inline-flex', alignItems: 'center' }}>
            <Icon name="drop" size={18} style={{ color: 'var(--c-water)' }} /><span className="num small" style={{ fontWeight: 600 }}>{fmtNum(water.ml, lang, 0)}</span>
          </button>
        </div>
        {recents.length > 0 && <div className="chips" style={{ marginTop: 14, justifyContent: 'safe center' }}>{recents.map((r) => <button key={r.id} className="chip press" onClick={() => quickLog(r.id, r.qty)} aria-label={`${t('Add')} ${r.name}`}>+ {r.name.split(',')[0]}</button>)}</div>}
      </section>

      {/* ── workout ── */}
      <motion.section layout="position" style={{ position: 'relative' }}>
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
          ) : routine ? (
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

      {/* ── week ── */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {week.map((w) => {
          const isToday = w.d === today;
          const past = w.d < today;
          const r = w.p ? s.routines.find((x) => x.id === w.p!.routineId) : undefined;
          return (
            <button key={w.d} className="press" onClick={() => setTab('train')} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }} aria-label={`${fmtDate(w.d, lang)}${r ? `: ${r.name}` : ''}${w.done ? `, ${t('done')}` : ''}`}>
              <span className="micro" style={{ color: isToday ? 'var(--ac-text)' : undefined }}>{fmtWeekdayShort(weekdayOf(w.d), lang, true)}</span>
              <span style={{ width: 36, height: 36, borderRadius: '50%', display: 'grid', placeItems: 'center', background: w.done ? 'var(--ac)' : w.wr ? 'var(--ac-soft)' : 'var(--s2)', color: w.done ? 'var(--ac-ink)' : w.wr ? 'var(--ac-text)' : 'var(--tx2)', boxShadow: w.done ? '0 0 18px -2px var(--ac)' : isToday ? 'inset 0 0 0 1.5px var(--ac), 0 0 18px -6px var(--ac)' : 'inset 0 0 0 1px var(--line)', fontSize: 12, fontWeight: 700 }}>
                {w.done ? <Icon name="check" size={17} sw={2.6} /> : w.wr ? <Icon name="wrestle" size={17} /> : r ? r.name.slice(0, 1).toUpperCase() : ''}
              </span>
              <i style={{ width: 4, height: 4, borderRadius: 4, background: r && past && !w.done ? 'var(--bad)' : 'transparent' }} />
            </button>
          );
        })}
      </section>

      {/* ── body ── */}
      {lastW && (
        <section className="row-flex between">
          <button className="press" style={{ textAlign: 'left' }} onClick={() => setTab('progress')}> 
            <span className="display num" style={{ fontSize: 44 }}>{fmtNum(kgToDisplay(lastW.kg, settings.units.weight), lang, 1)}</span><span className="t3 small"> {settings.units.weight}</span>
          </button>
          <div className="row-flex" style={{ gap: 12 }}>
            <Sparkline values={recentW.map((x) => kgToDisplay(x, settings.units.weight))} w={96} h={36} />
            <button className="icon-btn press" aria-label={t('Log weight')} onClick={() => push('weight')}><Icon name="plus" /></button>
          </div>
        </section>
      )}

      {s.demo && (
        <div className="row-flex" style={{ justifyContent: 'center' }}>
          <button className="chip sm press" onClick={() => push('settings', { section: 'data' })} aria-label={t('Remove demo data')}><span className="pulse-dot" style={{ width: 6, height: 6 }} /> {t('Demo data')} · {t('Remove')}</button>
        </div>
      )}

      {first && (
        <div className="row-flex" style={{ justifyContent: 'center' }}>
          <button className="btn press" onClick={() => push('voice', { mode: 'food', date: today, mealId })}><Icon name="mic" size={18} /> {t('Say what you ate')}</button>
        </div>
      )}
    </div>
  );
}

/** The running workout's clock on the hero card. Only this line ticks — not the whole Today screen (which stays mounted,
 * hidden, behind the live workout). */
function HeroClock() {
  const a = useStore((x) => x.active);
  const now = useNow(1000, !!a);
  return <>{a ? fmtDuration(elapsedMs(a, now) / 1000) : ''}</>;
}
