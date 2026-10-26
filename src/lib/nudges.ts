/**
 * The Coach noticing things on its own: what you might have forgotten, what could go better, and what in your plan or the
 * app is worth changing. Two sources:
 *  - checks run on the phone, instantly and privately (no AI, no key): a missed or still-open workout, legs the day before
 *    wrestling, a stalled lift, a muscle that gets little work, protein under target for days, weight moving faster than
 *    is healthy, a weigh-in or a backup that is overdue, a card on Today you'd use;
 *  - once a day, with a Gemini key, the Coach reads the same picture it uses in chat and adds at most two observations of
 *    its own (see useInsights in ui/CoachPin.tsx).
 * Each nudge says why in one line, and offers one thing to do about it. "Not now" hides it until tomorrow; ✕ for good.
 */
import { weighIns } from './maintenance';
import { exerciseMap, missedWorkouts, plannedFor } from '../state/store';
import { addDays, diffDays, fmtDate, weekdayOf } from './dates';
import { setsPerMuscle, stalledLifts, nutritionByDay, average, weightTrend, trendRate, weeklyTraining, MUSCLES } from './stats';
import { lastBackup } from './persist';
import { activeGoals, goalState, tracked, type Pace } from './goals';
import { fmtNum, kgToDisplay } from './units';
import type { AppData, Lang, MuscleGroup } from './types';
import type { IconName } from '../ui/Icon';

export type NudgeAction =
  | { type: 'coach'; prompt: string }
  | { type: 'open'; overlay: string; props?: Record<string, unknown> }
  | { type: 'start'; routineId: string }
  | { type: 'setting'; patch: Record<string, unknown> };
export interface Nudge {
  /** stable while the situation lasts, so a dismissal sticks (a new situation is a new id) */
  id: string;
  kind: 'reminder' | 'suggestion' | 'warning' | 'insight' | 'app';
  icon: IconName;
  title: string;
  body?: string;
  action?: { label: string; run: NudgeAction };
  /** higher first */
  priority: number;
}
type T = (k: string, v?: Record<string, string | number>) => string;

const fmtDay = (day: string, lang: Lang) => fmtDate(day, lang, { day: 'numeric', month: 'short' });
const LEGS: MuscleGroup[] = ['quads', 'hamstrings', 'glutes'];
const LABEL: Record<string, string> = { chest: 'Chest', back: 'Back@muscle', shoulders: 'Shoulders', biceps: 'Biceps', triceps: 'Triceps', forearms: 'Forearms', quads: 'Quads', hamstrings: 'Hamstrings', glutes: 'Glutes', calves: 'Calves', core: 'Core' };

export function findNudges(d: AppData, today: string, hour: number, t: T, lang: Lang, exName: (id: string) => string): Nudge[] {
  const out: Nudge[] = [];
  const add = (n: Nudge) => out.push(n);
  const done = d.sessions.filter((s) => s.status === 'done');
  const map = exerciseMap(d.exercises);
  const routineName = (id: string) => d.routines.find((r) => r.id === id)?.name ?? '';
  const u = d.settings.units.weight;

  // ── training ──────────────────────────────────────────────
  const missed = d.active ? undefined : missedWorkouts(d, today, 3)[0];
  if (missed) {
    add({ id: `missed:${missed.date}:${missed.routineId}`, kind: 'reminder', icon: 'repeat', priority: 90,
      title: t('You missed {routine}', { routine: routineName(missed.routineId) }),
      body: t('Move it to another day so the week stays on track.'),
      action: { label: t('Reschedule'), run: { type: 'open', overlay: 'rescheduleSheet', props: { date: missed.date, routineId: missed.routineId } } } });
  }
  // (today's planned workout is not a pin: the workout card right below already offers it)

  // legs the day before (or the day of) wrestling, in the next 7 days
  const wrestleDays = new Set(Object.entries(d.schedule.activities ?? {}).filter(([, k]) => k?.includes('wrestling')).map(([w]) => Number(w)));
  if (wrestleDays.size) {
    for (let i = 0; i < 7; i++) {
      const date = addDays(today, i);
      const p = plannedFor(d, date, today);
      if (!p) continue;
      const r = d.routines.find((x) => x.id === p.routineId);
      if (!r) continue;
      const legSets = r.items.reduce((n, it) => n + (LEGS.includes(map.get(it.exerciseId)?.muscles?.[0] as MuscleGroup) ? it.workingSets : 0), 0);
      if (legSets < 6) continue;
      const next = weekdayOf(addDays(date, 1)), same = weekdayOf(date);
      const clash = wrestleDays.has(same) ? 'same' : wrestleDays.has(next) ? 'before' : null;
      if (!clash) continue;
      add({ id: `legs-wrestle:${date}:${r.id}`, kind: 'suggestion', icon: 'wrestle', priority: 70,
        title: clash === 'same' ? t('{routine} and wrestling on the same day', { routine: r.name }) : t('{routine} the day before wrestling', { routine: r.name }),
        body: t('{n} hard leg sets can leave your legs flat on the mat. Moving it a day helps.', { n: legSets }),
        action: { label: t('Ask the Coach'), run: { type: 'coach', prompt: t('My {routine} has {n} leg sets and lands {when} wrestling. Should I move it? Move it if it makes sense.', { routine: r.name, n: legSets, when: clash === 'same' ? t('on the same day as') : t('the day before') }) } } });
      break;
    }
  }

  // hard wrestling logged yesterday, and today's plan is heavy on legs
  const todayPlan = d.active ? undefined : plannedFor(d, today, today);
  const todayDone = d.sessions.some((x) => x.status === 'done' && x.date === today);
  if (todayPlan && !todayDone) {
    const mat = d.activities.find((x) => x.kind === 'wrestling' && x.date === addDays(today, -1) && ((x.intensity ?? 0) >= 2 || (x.rounds ?? 0) >= 6));
    const r = mat && d.routines.find((x) => x.id === todayPlan.routineId);
    const legSets = r ? r.items.reduce((n, it) => n + (LEGS.includes(map.get(it.exerciseId)?.muscles?.[0] as MuscleGroup) ? it.workingSets : 0), 0) : 0;
    if (r && legSets >= 6) add({ id: `legs-after-mat:${today}:${r.id}`, kind: 'suggestion', icon: 'wrestle', priority: 70,
      title: t('{routine} after hard wrestling', { routine: r.name }),
      body: t('{n} leg sets the day after the mat. Swap the day?', { n: legSets }),
      action: { label: t('Ask the Coach'), run: { type: 'coach', prompt: t('I wrestled hard yesterday and today is {routine} with {n} leg sets. Should I move it?', { routine: r.name, n: legSets }) } } });
  }

  // a lift that has stopped improving
  const stall = stalledLifts(done, today)[0];
  if (stall) {
    const name = exName(stall.exerciseId);
    add({ id: `stall:${stall.exerciseId}:${stall.since}`, kind: 'suggestion', icon: 'info', priority: 60,
      title: t('{ex} has stalled', { ex: name }),
      body: t('Best {w} × {r} for {n} sessions. A small change usually gets it moving again.', { w: `${fmtNum(kgToDisplay(stall.best.kg, u), lang, 2)} ${u}`, r: stall.best.reps, n: stall.sessions }),
      action: { label: t('Ask the Coach'), run: { type: 'coach', prompt: t('My {ex} has stalled at {w} × {r}. What one change should I make?', { ex: name, w: `${fmtNum(kgToDisplay(stall.best.kg, u), lang, 2)} ${u}`, r: stall.best.reps }) } } });
  }

  // a muscle that gets little work, when the rest is trained properly (last 4 weeks, at least 6 sessions)
  if (done.filter((s) => s.date >= addDays(today, -27)).length >= 6) {
    const avg = setsPerMuscle(done, (id) => map.get(id)?.muscles, addDays(today, -27), today);
    const main = MUSCLES.filter((m) => m !== 'forearms' && m !== 'core');
    const weekly = (m: MuscleGroup) => avg[m] / 4;
    const strong = main.filter((m) => weekly(m) >= 8).length;
    const weak = main.filter((m) => weekly(m) < 3).sort((a, b) => weekly(a) - weekly(b))[0];
    if (weak && strong >= 3) {
      add({ id: `weak:${weak}:${today.slice(0, 7)}`, kind: 'suggestion', icon: 'body', priority: 50,
        title: t('{m} get little work', { m: t(LABEL[weak]) }),
        // what is LOGGED, said as such (never "about 0 sets": Omar trains them and just hadn't logged them, 18 Oct); the
        // question asks before changing a routine
        body: weekly(weak) < 0.25
          ? t('No {m} sets logged in the last 4 weeks, while most muscles get 8 or more.', { m: t(LABEL[weak]).toLowerCase() })
          : t('About {n} sets a week logged over the last month, while most muscles get 8 or more.', { n: fmtNum(weekly(weak), lang, 1) }),
        action: { label: t('Ask the Coach'), run: { type: 'coach', prompt: t('Aven shows few {m} sets logged lately. Ask me first whether I train them without logging; if not, add an exercise for them to one of my routines.', { m: t(LABEL[weak]).toLowerCase() }) } } });
    }
  }

  // a long run of weeks on plan (8+): a real win, said as one (never a push for a lighter week: 25 Oct, honest voice)
  const target = d.schedule.mode === 'rotation' ? d.schedule.rotation.perWeek : Object.values(d.schedule.weekly).filter(Boolean).length;
  if (target) {
    const wk = weeklyTraining(done, today, 10, d.settings.weekStart).slice(0, -1);
    let run = 0; for (let i = wk.length - 1; i >= 0 && wk[i].sessions >= target; i--) run++;
    if (run >= 8) add({ id: `deload:${wk[wk.length - 1].start}`, kind: 'suggestion', icon: 'bolt', priority: 35,
      title: t('{n} hard weeks in a row', { n: run }),
      body: t('Every week on plan. That is what builds strength.'),
      action: { label: t('Ask the Coach'), run: { type: 'coach', prompt: t('I have hit my plan {n} weeks in a row. How are my lifts doing?', { n: run }) } } });
  }

  // ── food ───────────────────────────────────────────────────
  const g = d.settings.goals;
  const days = nutritionByDay(d.entries, addDays(today, -4), addDays(today, -1)).filter((x) => x.logged && !x.partial);
  if (g.protein && days.length >= 3) {
    const p = average(days.map((x) => x.protein)) ?? 0;
    if (p < g.protein * 0.8) add({ id: `protein:${today}`, kind: 'warning', icon: 'bolt', priority: 55,
      title: t('Protein under target {n} days', { n: days.length }),
      body: t('About {p} g a day against {g} g. Muscle needs it to grow.', { p: Math.round(p), g: g.protein }),
      action: { label: t('Ideas'), run: { type: 'coach', prompt: t('My protein has averaged {p} g against a {g} g target. Give me easy ways to close the gap with foods I already eat.', { p: Math.round(p), g: g.protein }) } } });
  }
  // usually logs, nothing yet by early afternoon
  const recent = nutritionByDay(d.entries, addDays(today, -7), addDays(today, -1)).filter((x) => x.logged).length;
  if (recent >= 5 && hour >= 14 && !d.entries.some((e) => e.date === today)) {
    add({ id: `nolog:${today}`, kind: 'reminder', icon: 'food', priority: 45,
      title: t('Nothing logged yet today'), body: t('Easier now than trying to remember tonight.'),
      action: { label: t('Log food'), run: { type: 'open', overlay: 'foodSearch', props: { date: today } } } });
  }

  // ── goals they told the Coach (lib/goals.ts): where each one is, every day ─────────
  const kg = (x: number) => `${fmtNum(kgToDisplay(x, u), lang, 1)} ${u}`;
  const goals = activeGoals(d, today).filter(tracked);
  for (const m of goals) {
    const st = goalState(d, m, today);
    if (!st) continue;
    const name = m.text.replace(/^(goal|mål)\s*:\s*/i, '');
    const short = name.length > 44 ? `${name.slice(0, 42)}…` : name;
    const lift = st.metric === 'lift';
    const by = m.goal.by ? fmtDay(m.goal.by, lang) : undefined;
    const body: string[] = [];
    if (st.now !== undefined && st.target !== undefined) body.push(lift
      ? t('Estimated max {now}, target {target}.', { now: kg(st.now), target: kg(st.target) })
      : by ? t('{now} now, {target} by {date}.', { now: kg(st.now), target: kg(st.target), date: by }) : t('{now} now, target {target}.', { now: kg(st.now), target: kg(st.target) }));
    if (st.pace === 'too fast') body.push(t('About {rate} a week. Faster than about 1% a week costs muscle and strength.', { rate: kg(Math.abs(st.rate!)) }));
    else if (st.rate !== undefined && st.pace !== 'reached') body.push(t('Going {rate} a week.', { rate: `${st.rate > 0 ? '+' : '−'}${kg(Math.abs(st.rate))}` }));
    if (st.need !== undefined && (st.pace === 'behind' || st.pace === 'wrong way' || st.dateUnsafe)) body.push(st.dateUnsafe ? t('The date needs {need} a week, faster than is safe.', { need: kg(Math.abs(st.need)) }) : t('The date needs {need} a week.', { need: kg(Math.abs(st.need)) }));
    if (st.pace === 'too early' && st.why?.includes('weigh-in')) body.push(t('Weigh in most mornings so the pace can be judged.'));
    const TITLE: Record<Pace, string> = { reached: 'Goal reached: {goal}', 'on pace': 'On pace: {goal}', ahead: 'Ahead of pace: {goal}', behind: 'Behind pace: {goal}', 'too fast': 'Faster than safe: {goal}', 'wrong way': 'Going the wrong way: {goal}', slow: 'Slow: {goal}', 'date passed': 'Date passed: {goal}', 'too early': 'Too early to tell: {goal}' };
    const off = st.pace === 'behind' || st.pace === 'too fast' || st.pace === 'wrong way' || st.pace === 'date passed';
    add({ id: `goal:${m.id}:${st.pace}`, kind: off ? 'warning' : 'insight', icon: lift ? 'bolt' : 'scale', priority: off ? 75 : st.pace === 'reached' ? 80 : 32,
      title: t(TITLE[st.pace], { goal: short }), body: body.join(' ') || undefined,
      action: st.pace === 'too early' && st.metric === 'weight'
        ? { label: t('Log weight'), run: { type: 'open', overlay: 'weight' } }
        : { label: t('Ask the Coach'), run: { type: 'coach', prompt: st.pace === 'reached' ? t('I reached my goal “{goal}”. What’s next?', { goal: name }) : t('How am I doing on my goal “{goal}”? Be honest.', { goal: name }) } } });
  }
  // no goal told yet: asked once (✕ for good), when they use the app enough to have one
  if (!(d.memory ?? []).some((m) => m.kind === 'goal') && (done.length >= 5 || d.entries.length >= 30)) add({ id: 'goal-ask', kind: 'suggestion', icon: 'info', priority: 22,
    title: t('What are we working on?'), body: t('Tell the Coach a goal, like “lose 2 kg by December” or “bench 100 by summer”. It plans it with you and follows it up.'),
    action: { label: t('Set a goal'), run: { type: 'coach', prompt: t('I want to set a goal. Ask me what I’m working toward and help me make it concrete.') } } });

  // ── body ───────────────────────────────────────────────────
  // (Aven's weigh-ins and the watch's scale)
  const ws = weighIns(d);
  const lastW = ws[ws.length - 1];
  if (lastW) {
    const rate = trendRate(weightTrend(ws));
    const pct = rate !== null ? (rate / lastW.kg) * 100 : 0;
    // (a weight goal running says this itself, with its own numbers)
    if (rate !== null && pct <= -1.1 && ws.length >= 6 && !goals.some((m) => m.goal.metric === 'weight')) add({ id: `fastloss:${today.slice(0, 7)}`, kind: 'warning', icon: 'scale', priority: 65,
      title: t('Losing weight fast'), body: t('About {r} a week. Faster than about 1% a week costs muscle and strength.', { r: `${fmtNum(kgToDisplay(-rate, u), lang, 1)} ${u}` }),
      action: { label: t('Ask the Coach'), run: { type: 'coach', prompt: t('I am losing about {r} a week. Is that too fast for keeping muscle? Adjust my calories if so.', { r: `${fmtNum(kgToDisplay(-rate, u), lang, 1)} ${u}` }) } } });
    const gap = diffDays(today, lastW.date);
    if (gap >= 7 && gap < 60) add({ id: `weigh:${lastW.date}`, kind: 'reminder', icon: 'scale', priority: 30,
      title: t('{n} days since you weighed in', { n: gap }), body: t('One weigh-in a week keeps the trend honest.'),
      action: { label: t('Log weight'), run: { type: 'open', overlay: 'weight' } } });
    // true maintenance needs the scale a few times a week (lib/maintenance.ts): a quiet reminder in the morning after 3 days
    // without a weigh-in (the watch's scale counts too); from 7 days the card above takes over
    if (gap >= 3 && gap < 7 && hour < 12) add({ id: `weigh:soon:${lastW.date}`, kind: 'suggestion', icon: 'scale', priority: 25,
      title: t('Step on the scale?'), body: t('A few weigh-ins a week keep your true maintenance calories accurate.'),
      action: { label: t('Log weight'), run: { type: 'open', overlay: 'weight' } } });
    // weighs often, but the weight card is off on Today
    if (!d.settings.widgets.weight && ws.filter((w) => w.date >= addDays(today, -14)).length >= 4) add({ id: 'app:weight-card', kind: 'app', icon: 'today', priority: 20,
      title: t('Show your weight trend on Today?'), body: t('You weigh in often, but the card is switched off.'),
      action: { label: t('Show it'), run: { type: 'setting', patch: { widgets: { ...d.settings.widgets, weight: true } } } } });
  }

  // ── the app ────────────────────────────────────────────────
  const last = lastBackup();
  const days0 = d.sessions.length + d.entries.length;
  let drive = false; try { drive = !!JSON.parse(localStorage.getItem('aven.drive') || '{}').connected; } catch { /* ignore */ }
  if (!drive && !(d as { demo?: boolean }).demo && days0 >= 15 && (!last || Date.now() - last > 14 * 86_400_000)) add({ id: `backup:${today.slice(0, 7)}`, kind: 'app', icon: 'shield', priority: 40,
    title: t(last ? 'No backup in over two weeks' : 'Your data has no backup yet'), body: t('Everything lives on this phone. Turn on the free Google Drive backup, or save a file.'),
    action: { label: t('Back up'), run: { type: 'open', overlay: 'settings', props: { section: 'data' } } } });

  // a health note from more than four weeks ago (no end date): asked about once. "It's better now" has the Coach forget it;
  // ✕ means it still applies (never asked again)
  const old = (d.memory ?? []).filter((m) => m.kind === 'health' && !m.until && Date.now() - (m.updatedAt ?? m.at) > 28 * 86400000).sort((a, b) => a.at - b.at)[0];
  if (old) add({
    id: `health-old:${old.id}`, kind: 'reminder', icon: 'info', priority: 40,
    title: t('Still true? “{text}”', { text: old.text.length > 48 ? `${old.text.slice(0, 46)}…` : old.text }),
    body: t('You told the Coach this {n} weeks ago. ✕ if it still applies.', { n: Math.floor((Date.now() - (old.updatedAt ?? old.at)) / (7 * 86400000)) }),
    action: { label: t('It’s better now'), run: { type: 'coach', prompt: t('My note “{text}” doesn’t apply any more. Please forget it.', { text: old.text }) } },
  });
  return out.sort((a, b) => b.priority - a.priority);
}

// ── what you set aside ───────────────────────────────────────
const KEY = 'aven.nudges';
type Hidden = Record<string, number>; // id → hidden until (ms); Infinity-like for good
export function hiddenNudges(): Hidden { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } }
export function hideNudge(id: string, forGood: boolean, now = Date.now()) {
  const h = hiddenNudges();
  // "Not now": back tomorrow morning; ✕: never again for this same situation
  const tomorrow = new Date(now); tomorrow.setHours(24 + 6, 0, 0, 0);
  h[id] = forGood ? 9e15 : tomorrow.getTime();
  // forget old entries so it never grows
  for (const k of Object.keys(h)) if (h[k] < now) delete h[k];
  const keys = Object.keys(h); if (keys.length > 200) for (const k of keys.slice(0, keys.length - 200)) delete h[k];
  try { localStorage.setItem(KEY, JSON.stringify(h)); } catch { /* ignore */ }
}
export const visibleNudges = (list: Nudge[], now = Date.now()) => { const h = hiddenNudges(); return list.filter((n) => !(h[n.id] > now)); };
