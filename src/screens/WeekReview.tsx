import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore, exerciseMap, allExercises } from '../state/store';
import { useUI, haptic } from '../state/ui';
import { useAi } from '../state/ai';
import { useT, useLang } from '../lib/i18n';
import { addDays, dayKey, fmtDate, startOfWeek } from '../lib/dates';
import { reviewWeekEnd } from '../lib/stats';
import { candidates, localVerdict, met, reviewNumbers, storedReview, type Candidate, type ReviewNumbers } from '../lib/weekReview';
import { fmtNum, fmtSigned, kgToDisplay } from '../lib/units';
import { getKey } from '../lib/keys';
import { Sheet, SheetHead } from '../ui/Sheet';
import { Icon } from '../ui/Icon';
import { Odo } from '../ui/Odo';
import { exName, MUSCLE_LABEL } from './workout/common';
import type { AppData, MuscleGroup, WeekReviewNote } from '../lib/types';

/**
 * The week in review, as a sheet of its own. Everything in it is computed on the phone (lib/weekReview.ts); the Coach (with
 * a Gemini key) adds a short verdict and chooses at most two of the app's own priorities, phrased as actions. Kept, so next
 * week's review says whether they happened. Its entrance is one calm timeline on transform and opacity: the numbers roll in
 * like the workout summary's, the muscle bars grow from the left one after another, then the Coach's words rise in.
 */
const SMOOTH = 'cubic-bezier(0.22, 1, 0.36, 1)'; // var(--ease-smooth)
const played = new Set<string>(); // the full entrance once per week per visit; reopened, it is simply there

const reduced = () => document.documentElement.dataset.motion === 'reduce' || (document.documentElement.dataset.motion !== 'full' && matchMedia('(prefers-reduced-motion: reduce)').matches);

/** The week to look back on: the one the Today card points at, else the last finished week. */
export function reviewEndFor(today: string, weekStart: 0 | 1): string {
  return reviewWeekEnd(today, new Date().getHours(), weekStart) ?? addDays(startOfWeek(today, weekStart), -1);
}

function play(root: HTMLElement): () => void {
  const all: Animation[] = [];
  // (the smooth curve throughout, as on the Coach's cards: a spring's last overshoot left text a sub-pixel off its rest, and
  // the sheet visibly sharpened when the entrance ended — 20/255 against the still sheet)
  const ease = (el: Element, frames: Keyframe[], dur: number, delay: number, easing = SMOOTH) => all.push((el as HTMLElement).animate(frames, { duration: dur * 1000, easing, delay: delay * 1000, fill: 'backwards' }));
  const qa = (k: string) => [...root.querySelectorAll(`[data-rv="${k}"]`)];
  const rise = (el: Element, px: number, delay: number, dur = 0.72) => { ease(el, [{ transform: `translate3d(0, ${px}px, 0)` }, { transform: 'none' }], dur, delay); ease(el, [{ opacity: 0 }, { opacity: 1 }], 0.34, delay); };
  // the numbers: each tile rises as its digits roll in one continuous roll, a little after the one before
  qa('tile').forEach((tile, i) => {
    const st = 0.06 + i * 0.1;
    rise(tile, 14, st, 0.66);
    tile.querySelectorAll<HTMLElement>('[data-travel]').forEach((strip) => ease(strip, [{ transform: 'translate3d(0, 0, 0)' }, { transform: `translate3d(0, ${-Number(strip.dataset.travel) * 1.15}em, 0)` }], 0.9, st));
  });
  // the muscles: the glass rises with its label; each bar slides in from the left, one after another, and the mark for
  // the usual week fades in as its own bar lands
  qa('panel').forEach((el) => rise(el, 12, 0.36));
  qa('bar').forEach((row, i) => {
    const st = 0.42 + i * 0.05;
    ease(row, [{ opacity: 0 }, { opacity: 1 }], 0.28, st);
    const fill = row.querySelector('[data-rv-fill]'); if (fill) ease(fill, [{ transform: 'translate3d(-100%, 0, 0)' }, { transform: 'none' }], 0.72, st + 0.03);
    const mark = row.querySelector('[data-rv-mark]'); if (mark) ease(mark, [{ opacity: 0, offset: 0 }], 0.2, st + 0.75);
  });
  qa('more').forEach((el, i) => rise(el, 10, 1.1 + i * 0.08));
  return () => all.forEach((a) => a.cancel());
}

export function WeekReviewSheet({ props }: { props: { end?: string } }) {
  const t = useT();
  const lang = useLang();
  const d = useStore() as AppData & ReturnType<typeof useStore.getState>;
  const closeAll = useUI((u) => u.closeAll);
  const push = useUI((u) => u.push);
  const hasGemini = useAi((a) => a.hasGemini);
  const today = dayKey(Date.now(), d.settings.dayStartHour);
  const end = props.end ?? reviewEndFor(today, d.settings.weekStart);
  const pool = useMemo(() => allExercises(d.exercises), [d.exercises]);
  const musclesOf = useCallback((id: string) => pool.find((e) => e.id === id)?.muscles, [pool]);
  const name = useCallback((id: string) => { const e = exerciseMap(d.exercises).get(id); return e ? exName(e, lang) : id; }, [d.exercises, lang]);
  const muscle = useCallback((m: MuscleGroup) => t(MUSCLE_LABEL[m]), [t]);
  const n = useMemo(() => reviewNumbers(d, end, musclesOf), [end, d.sessions, d.entries, d.weights, d.activities, d.schedule, musclesOf]); // eslint-disable-line react-hooks/exhaustive-deps
  const cands = useMemo(() => candidates(d, n, name, muscle), [n, name, muscle, d.settings.goals]); // eslint-disable-line react-hooks/exhaustive-deps
  const saved = (d.reviews ?? []).find((r) => r.week === end);
  const prev = (d.reviews ?? []).find((r) => r.week === addDays(end, -7));
  // the Coach's verdict: kept once written; asked for once per week (and only with a key)
  const [asking, setAsking] = useState(!saved && hasGemini);
  const fill = (c: Candidate) => t(c.key, Object.fromEntries(Object.entries(c.vars).map(([k, v]) => [k, k === 'date' && typeof v === 'string' ? fmtDate(v, lang, { day: 'numeric', month: 'short' }) : v])));
  useEffect(() => {
    if (saved || !hasGemini) return;
    let live = true;
    const ac = new AbortController();
    (async () => {
      const [{ aiWeekReview }, { agentModels }, { buildCoachContext, memoryBlock }, { learnedBlock }] = await Promise.all([import('../lib/gemini'), import('../lib/agentTurn'), import('../lib/coachContext'), import('../lib/ledger')]);
      const muscles = n.muscles.map((x) => `${x.m} ${x.sets} (usually ${x.avg})`).join(', ');
      const week = [
        `WEEK ${n.from}…${n.to}: ${n.sessions} workouts (week before ${n.prevSessions}), ${n.planned} planned, ${n.missed} planned missed, ${n.wrestling} wrestling, ${n.sets} working sets, ${n.records} records, streak ${n.streak} weeks with 2+ workouts.`,
        `Sets per muscle (usual week in brackets): ${muscles || 'none'}.`,
        `Food: logged on ${n.loggedDays} of 7 days${n.proteinAvg !== null ? `; on logged days ${Math.round(n.kcalAvg ?? 0)} kcal and ${Math.round(n.proteinAvg)} g protein a day (targets ${d.settings.goals.kcal} kcal, ${d.settings.goals.protein} g)` : ''}. Days not logged are unknown, not zero.`,
        `Weight: ${n.weightPct === null ? 'not enough weigh-ins' : `${n.weightPct > 0 ? '+' : ''}${n.weightPct}% a week (trend)`}.`,
      ].join('\n');
      const cand = `CANDIDATES (id — what it is):\n${cands.map((c) => `${c.id} — ${t(c.key, c.vars as Record<string, string | number>)}`).join('\n') || '(none: the week went well)'}`;
      const last = prev ? `LAST WEEK'S PRIORITIES: ${prev.priorities.map((p) => { const ok = met(p.id, n, d.settings.goals.protein); return `${p.text} → ${ok === null ? 'unknown' : ok ? 'done' : 'not done'}`; }).join('; ') || 'none'}` : 'LAST WEEK: no review.';
      const ctx = `${week}\n\n${cand}\n\n${last}\n\n${memoryBlock(d, name)}\n\n${learnedBlock(name, (id) => id)}\n\nDATA:\n${buildCoachContext(d, today, name, musclesOf)}`;
      const r = await aiWeekReview(ctx, { key: getKey('gemini'), models: agentModels(true), signal: ac.signal }, lang, cands.map((c) => c.id)).catch(() => null);
      if (!live) return;
      // what the Coach chose, kept for the week (no answer: the app's own verdict and its top two)
      const picks = r ? r.priorities : cands.filter((c) => c.id !== 'keep').slice(0, 2).map((c) => ({ id: c.id, text: fill(c) }));
      useStore.getState().saveReview(storedReview(end, r?.verdict ?? null, picks));
      setAsking(false);
    })();
    return () => { live = false; ac.abort(); };
  }, [end]); // eslint-disable-line react-hooks/exhaustive-deps
  const verdict = saved?.verdict ?? (asking ? null : localVerdict(n, t));
  const priorities: { id: string; text: string; ask?: string }[] = saved
    ? saved.priorities.map((p) => ({ ...p, ask: cands.find((c) => c.id === p.id)?.ask }))
    : asking ? [] : cands.filter((c) => c.id !== 'keep').slice(0, 2).map((c) => ({ id: c.id, text: fill(c), ask: c.ask }));

  // the entrance plays when the sheet's contents attach (a beat after it starts rising), before that frame is painted
  const [calm] = useState(() => played.has(end) || reduced()); // reopened: still from the first frame
  // the Coach's words follow the bars when they are already there; written later (the AI), they rise in at once
  const [base] = useState(() => (saved?.verdict || !hasGemini ? 1450 : 0)); // (after the last bar has landed)
  const stop = useRef<(() => void) | null>(null);
  const body = useCallback((el: HTMLDivElement | null) => {
    if (!el || stop.current) return;
    if (played.has(end) || reduced()) { stop.current = () => {}; return; }
    played.add(end);
    stop.current = play(el);
  }, [end]);
  useEffect(() => () => stop.current?.(), []);

  const u = d.settings.units.weight;
  const rate = n.weightRate !== null ? kgToDisplay(n.weightRate, u) : null;
  const goal = d.settings.goals.protein;
  const top = Math.max(1, ...n.muscles.map((x) => Math.max(x.sets, x.avg)));
  const planNext = () => {
    haptic('light');
    const focus = priorities.map((p) => p.text).join('; ');
    push('coach', { ask: focus ? t('Plan next week with me. Focus: {focus}', { focus }) : t('Review my week and give me the one thing to change next week.') });
  };
  return (
    <Sheet onClose={closeAll} tall label={t('Your week')} foot={<div className="row-flex" style={{ gap: 10 }}><button className="btn grow press" onClick={closeAll}>{t('Done')}</button><button className="btn primary grow press" onClick={planNext}><Icon name="calendar" size={16} /> {t('Plan next week')}</button></div>}>
      <SheetHead title={t('Your week')} sub={`${fmtDate(n.from, lang, { day: 'numeric', month: 'short' })} – ${fmtDate(n.to, lang, { day: 'numeric', month: 'short' })}`} onClose={closeAll} />
      <div ref={body} className={`sheet-body melt-foot stack gap16 rv${calm ? ' still' : ''}`} style={{ ['--rv-base' as string]: `${base}ms` }}>
        <div className="rv-tiles">
          <Tile label={n.wrestling ? t('workouts + {n} wrestling', { n: n.wrestling }) : t('workouts')} text={String(n.sessions)} sub={n.planned ? t('{done} of {planned} planned', { done: n.planned - n.missed, planned: n.planned }) : undefined} />
          <Tile label={t('working sets')} text={String(n.sets)} sub={n.streak >= 2 ? t('{n} weeks in a row', { n: n.streak }) : undefined} />
          <Tile label={goal ? t('protein a day · target {n} g', { n: goal }) : t('protein a day')} text={n.proteinAvg !== null ? String(Math.round(n.proteinAvg)) : '—'} unit={n.proteinAvg !== null ? 'g' : undefined} sub={t('logged {n} of 7 days', { n: n.loggedDays })} />
          <Tile label={t('weight per week (estimate)')} text={rate !== null ? fmtSigned(rate, lang) : '—'} unit={rate !== null ? u : undefined} sub={n.records ? (n.records === 1 ? t('1 new record') : t('{n} new records', { n: n.records })) : undefined} />
        </div>
        {n.muscles.length > 0 && (
          <section className="plinth-2 rv-muscles" data-rv="panel" aria-label={t('Sets per muscle')}>
            <div className="row-flex between xs t2"><span>{t('Sets per muscle')}</span><span className="rv-key"><i className="rv-key-mark" /> {t('your usual week')}</span></div>
            {n.muscles.slice(0, 8).map((x) => (
              <div key={x.m} className="rv-bar" data-rv="bar">
                <span className="xs rv-bar-l">{muscle(x.m)}</span>
                <span className="rv-bar-track">
                  <span className="rv-bar-clip"><i className={`rv-bar-fill${x.avg >= 3 && x.sets < x.avg * 0.5 ? ' low' : ''}`} data-rv-fill style={{ width: `${(x.sets / top) * 100}%` }} /></span>
                  {x.avg > 0 && <i className="rv-bar-mark" data-rv-mark style={{ left: `${(x.avg / top) * 100}%` }} />}
                </span>
                <span className="xs num rv-bar-n">{fmtNum(x.sets, lang, 1)}</span>
              </div>
            ))}
          </section>
        )}
        {prev && prev.priorities.length > 0 && (
          <section className="stack gap6" data-rv="more" aria-label={t('Last week’s focus')}>
            <div className="micro">{t('Last week’s focus')}</div>
            {prev.priorities.map((p) => { const ok = met(p.id, n, goal); return <div key={p.id} className="row-flex small rv-last" style={{ gap: 8 }}><span className={`rv-ok ${ok === null ? '' : ok ? 'yes' : 'no'}`} aria-hidden><Icon name={ok ? 'check' : ok === false ? 'close' : 'info'} size={13} /></span><span className="grow">{p.text}</span><span className="xs t3">{ok === null ? '' : ok ? t('done') : t('not yet')}</span></div>; })}
          </section>
        )}
        <section className="rv-coach" data-rv="more" aria-live="polite" style={{ ['--rv-words' as string]: verdict ? verdict.split(/\s+/).length : 0 }}>
          <div className="micro">{t('The Coach')}</div>
          {verdict === null
            ? <div className="small t2 rv-thinking">{t('Looking over your week…')}</div>
            : <Words key={verdict} text={verdict} />}
          {priorities.map((p, i) => (
            <div key={`${p.id}:${verdict ?? ''}`} className="plinth-2 rv-pri" style={{ ['--i' as string]: i }}>
              <span className="rv-pri-n num" aria-hidden>{i + 1}</span>
              <span className="grow small">{p.text}</span>
              {p.ask && <button className="btn sm ghost press" onClick={() => { haptic('light'); push('coach', { ask: p.ask }); }}>{t('Do it')}</button>}
            </div>
          ))}
        </section>
      </div>
    </Sheet>
  );
}

function Tile({ label, text, unit, sub }: { label: string; text: string; unit?: string; sub?: string }) {
  return (
    <div className="rv-tile" data-rv="tile">
      <div className="display display-md num rv-num"><Odo text={text} />{unit && <span className="t3 small rv-unit"> {unit}</span>}</div>
      <div className="xs t2">{label}</div>
      {sub && <div className="xs t3">{sub}</div>}
    </div>
  );
}

/** The verdict: its words rise in one after another, like a reply being written (a key per verdict replays it). */
function Words({ text }: { text: string }) {
  const words = text.split(/(\s+)/);
  let k = 0;
  return <p className="rv-verdict">{words.map((w, i) => (/^\s+$/.test(w) ? w : <span key={i} className="rv-w" style={{ ['--w' as string]: k++ }}>{w}</span>))}</p>;
}

export type { ReviewNumbers, WeekReviewNote };
