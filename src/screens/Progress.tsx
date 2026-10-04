import { useMemo, useState } from 'react';
import { useStore, exerciseMap } from '../state/store';
import { useUI } from '../state/ui';
import { useT, useLang } from '../lib/i18n';
import { useToday } from '../lib/derive';
import { addDays, fmtDate } from '../lib/dates';
import { BarChart, ChartCard, LineChart, Sparkline } from '../ui/charts';
import { Icon } from '../ui/Icon';
import { Empty, Section, Seg } from '../ui/kit';
import { average, nutritionByDay, trendRate, weekStreak, weeklyTraining, weightTrend } from '../lib/stats';
import { fmtNum, kgToDisplay } from '../lib/units';
import { bestsFor, countable, epley } from '../lib/workout';
import { exName } from './workout/common';

type Range = '4w' | '12w' | '6m' | 'all';
const DAYS: Record<Range, number> = { '4w': 28, '12w': 84, '6m': 182, all: 3650 };

export function ProgressScreen() {
  const t = useT();
  const lang = useLang();
  const s = useStore();
  const push = useUI((u) => u.push);
  const today = useToday();
  const [range, setRange] = useState<Range>('12w');
  const u = s.settings.units;
  const from = addDays(today, -DAYS[range]);
  const exMap = exerciseMap(s.exercises);

  const weights = useMemo(() => s.weights.filter((w) => w.date >= from).sort((a, b) => a.date.localeCompare(b.date)), [s.weights, from]);
  const allTrend = useMemo(() => weightTrend(s.weights), [s.weights]);
  const trend = allTrend.filter((p) => p.date >= from);
  const rate = trendRate(allTrend);
  const weeks = range === '4w' ? 4 : range === '12w' ? 12 : range === '6m' ? 26 : 52;
  const wk = useMemo(() => weeklyTraining(s.sessions, today, weeks, s.settings.weekStart), [s.sessions, today, weeks, s.settings.weekStart]);
  const target = s.schedule.mode === 'rotation' ? s.schedule.rotation.perWeek : Math.max(1, Object.values(s.schedule.weekly).filter(Boolean).length) || 3;
  const streak = weekStreak(wk, target);
  const nDays = range === '4w' ? 28 : 14;
  const nut = useMemo(() => nutritionByDay(s.entries, addDays(today, -(nDays - 1)), today), [s.entries, today, nDays]);
  const loggedN = nut.filter((d) => d.logged);
  const avgKcal = average(loggedN.map((d) => d.kcal));
  const avgP = average(loggedN.map((d) => d.protein));

  const exRows = useMemo(() => {
    const ids = new Set<string>();
    s.sessions.forEach((x) => x.exercises.forEach((e) => ids.add(e.exerciseId)));
    return [...ids].map((id) => {
      const ex = exMap.get(id)!;
      const hist = s.sessions.filter((x) => x.exercises.some((e) => e.exerciseId === id));
      const series = hist.map((h) => h.exercises.filter((e) => e.exerciseId === id).flatMap((e) => e.sets).filter(countable).reduce((m, x) => Math.max(m, x.weightKg && x.reps && x.reps <= 12 ? epley(x.weightKg, x.reps) : x.reps ?? 0), 0));
      return { id, ex, best: bestsFor(id, s.sessions), series, n: hist.length };
    }).filter((r) => r.ex).sort((a, b) => b.n - a.n).slice(0, 8);
  }, [s.sessions, exMap]);

  // wrestling: minutes on the mat per week, on the same week buckets as training
  const mat = useMemo(() => wk.map((b) => { const end = addDays(b.start, 6); const l = s.activities.filter((x) => x.kind === 'wrestling' && x.date >= b.start && x.date <= end); return { start: b.start, min: Math.round(l.reduce((n, x) => n + x.durationSec, 0) / 60), n: l.length }; }), [wk, s.activities]);
  const hasMat = s.activities.some((x) => x.kind === 'wrestling');
  const recs = s.sessions.flatMap((x) => (x.records ?? []).map((r) => ({ ...r, at: x.endedAt ?? 0 }))).sort((a, b) => b.at - a.at).slice(0, 5);
  const empty = s.sessions.length === 0 && s.weights.length === 0 && s.entries.length === 0;
  const lastWeight = weights[weights.length - 1];
  const firstW = weights[0];
  const wLabel = (d: string) => fmtDate(d, lang, { day: 'numeric', month: 'short' });

  return (
    <div className="screen">
      <header>
        <Seg value={range} onChange={setRange} options={[{ value: '4w', label: t('4 weeks') }, { value: '12w', label: t('12 weeks') }, { value: '6m', label: t('6 months') }, { value: 'all', label: t('All') }]} />
      </header>

      {empty ? <Empty icon="progress" title={t('Nothing to chart yet')} action={<button className="btn primary press" onClick={() => push('weight')}>{t('Log your weight')}</button>} /> : <>

      {/* consistency */}
      <ChartCard title={<>{t('Training consistency')}</>} sub={<><span className="num">{wk[wk.length - 1]?.sessions ?? 0}</span><span className="t3 small" style={{ fontFamily: 'var(--f-ui)', fontStretch: '100%', fontWeight: 600 }}> / {target} {t('this week')}</span></>}
        table={{ head: [t('Week of'), t('Sessions'), t('Sets'), `${t('Volume')} (${u.weight})`], rows: wk.map((b) => [fmtDate(b.start, lang, { day: 'numeric', month: 'short' }), b.sessions, b.sets, fmtNum(Math.round(kgToDisplay(b.volume, u.weight)), lang, 0)]) }}>
        <BarChart label={t('Sessions per week')} bars={wk.map((b, i) => ({ label: fmtDate(b.start, lang, { day: 'numeric', month: 'numeric' }), value: b.sessions, sub: `${t('Week of')} ${fmtDate(b.start, lang, { day: 'numeric', month: 'short' })}`, emphasis: i === wk.length - 1 }))} fmt={(v) => fmtNum(Math.round(v * 10) / 10, lang, 0)} target={target} targetLabel={`${t('target')} ${target}`} />
        {streak > 0 && <div className="small t2" style={{ marginTop: 8 }}>{t('{n}-week streak of hitting your target', { n: streak })}</div>}
      </ChartCard>

      {hasMat && (
        <ChartCard title={<>{t('Wrestling')}</>} sub={<>{mat[mat.length - 1]?.min ?? 0}<span className="t3 small"> min {t('this week')}</span></>}
          right={<button className="chip sm acc press" onClick={() => push('activity', { kind: 'wrestling' })}><Icon name="plus" size={14} /> {t('Log')}</button>}
          table={{ head: [t('Week of'), t('Sessions'), 'min'], rows: mat.map((b) => [fmtDate(b.start, lang, { day: 'numeric', month: 'short' }), b.n, b.min]) }}>
          <BarChart label={t('Mat time per week')} bars={mat.map((b, i) => ({ label: fmtDate(b.start, lang, { day: 'numeric', month: 'numeric' }), value: b.min, sub: `${b.n} × · ${t('Week of')} ${fmtDate(b.start, lang, { day: 'numeric', month: 'short' })}`, emphasis: i === mat.length - 1 }))} fmt={(v) => `${Math.round(v)}`} />
        </ChartCard>
      )}

      {/* volume */}
      {s.sessions.length > 0 && (
        <ChartCard title={<>{t('Weekly volume')}</>} sub={<>{fmtNum(Math.round(kgToDisplay(wk[wk.length - 1]?.volume ?? 0, u.weight)), lang, 0)}<span className="t3 small" style={{ fontFamily: 'var(--f-ui)', fontStretch: '100%', fontWeight: 600 }}> {u.weight}</span></>}
          table={{ head: [t('Week of'), `${t('Volume')} (${u.weight})`], rows: wk.map((b) => [fmtDate(b.start, lang, { day: 'numeric', month: 'short' }), fmtNum(Math.round(kgToDisplay(b.volume, u.weight)), lang, 0)]) }}>
          <BarChart label={t('Weekly volume')} bars={wk.map((b, i) => ({ label: fmtDate(b.start, lang, { day: 'numeric', month: 'numeric' }), value: kgToDisplay(b.volume, u.weight), sub: `${t('Week of')} ${fmtDate(b.start, lang, { day: 'numeric', month: 'short' })}`, emphasis: i === wk.length - 1 }))} fmt={(v) => (v >= 1000 ? `${fmtNum(v / 1000, lang, 1)}k` : fmtNum(Math.round(v), lang, 0))} />
        </ChartCard>
      )}

      {/* bodyweight */}
      <ChartCard title={<>{t('Bodyweight')}</>} sub={lastWeight ? <><span className="num">{fmtNum(kgToDisplay(lastWeight.kg, u.weight), lang, 1)}</span><span className="t3 small" style={{ fontFamily: 'var(--f-ui)', fontStretch: '100%', fontWeight: 600 }}> {u.weight}</span></> : '—'}
        right={<button className="chip sm acc press" onClick={() => push('weight')}><Icon name="plus" size={14} /> {t('Log')}</button>}
        table={weights.length ? { head: [t('Date'), `${t('Weight')} (${u.weight})`, `${t('Trend')} (${u.weight})`], rows: weights.map((w) => [fmtDate(w.date, lang), fmtNum(kgToDisplay(w.kg, u.weight), lang, 1), fmtNum(kgToDisplay(allTrend.find((p) => p.date === w.date)?.kg ?? w.kg, u.weight), lang, 1)]) } : undefined}>
        {weights.length >= 2 ? (
          <>
            <LineChart points={weights.map((w) => ({ x: new Date(w.date + 'T12:00:00').getTime(), y: kgToDisplay(w.kg, u.weight), label: wLabel(w.date) }))} trend={trend.map((p) => ({ x: new Date(p.date + 'T12:00:00').getTime(), y: kgToDisplay(p.kg, u.weight) }))} fmtY={(v) => fmtNum(v, lang, 1)} seriesLabel={t('Weigh-ins')} trendLabel={t('Trend (estimate)')} />
            <div className="row-flex between small t2 num" style={{ marginTop: 10 }}>
              <span>{firstW && lastWeight && firstW !== lastWeight ? <>{t('Change')} <b style={{ color: 'var(--tx)' }}>{(lastWeight.kg - firstW.kg >= 0 ? '+' : '−')}{fmtNum(Math.abs(kgToDisplay(lastWeight.kg, u.weight) - kgToDisplay(firstW.kg, u.weight)), lang, 1)} {u.weight}</b></> : null}</span>
              <span>{rate !== null ? <>~{rate >= 0 ? '+' : '−'}{fmtNum(Math.abs(kgToDisplay(rate, u.weight)), lang, 2)} {u.weight}/{t('wk')}</> : t('Trend rate needs 7+ days of data')}</span>
            </div>
          </>
        ) : <div className="small t3" style={{ padding: '8px 4px 4px' }}>{t('Log your weight')}</div>}
        <div className="row-flex" style={{ gap: 8, marginTop: 12 }}>
          <button className="btn sm press" onClick={() => push('measure')}><Icon name="body" size={16} /> {t('Measurements')}</button>
          <button className="btn sm press" onClick={() => push('photos')}><Icon name="camera" size={16} /> {t('Photos')}</button>
        </div>
      </ChartCard>

      {/* nutrition */}
      <ChartCard title={<>{t('Calories')}</>} sub={avgKcal !== null ? <><span className="num">{fmtNum(Math.round(avgKcal), lang, 0)}</span><span className="t3 small" style={{ fontFamily: 'var(--f-ui)', fontStretch: '100%', fontWeight: 600 }}> kcal {t('avg per logged day')}</span></> : '—'}
        table={{ head: [t('Date'), 'kcal', `${t('Protein')} g`], rows: nut.map((d) => [fmtDate(d.date, lang, { day: 'numeric', month: 'short' }), d.logged ? Math.round(d.kcal) : '—', d.logged ? Math.round(d.protein) : '—']) }}>
        <BarChart label={t('Calories per day')} bars={nut.map((d) => ({ label: String(Number(d.date.slice(8))), value: d.kcal, sub: `${fmtDate(d.date, lang, { weekday: 'short', day: 'numeric', month: 'short' })}${d.logged ? '' : ` · ${t('nothing logged')}`}`, dim: !d.logged, emphasis: d.date === today }))} fmt={(v) => fmtNum(Math.round(v), lang, 0)} target={s.settings.goals.kcal} targetLabel={s.settings.goals.kcal ? `${t('target')}` : undefined} />
        <div className="row-flex between small t2 num" style={{ marginTop: 8 }}>
          <span>{loggedN.length}/{nDays} {t('days logged')}</span>
          <span>{avgP !== null ? `${t('Protein')} ${fmtNum(Math.round(avgP), lang, 0)} g` : ''}{s.settings.goals.protein && avgP !== null ? ` · ${Math.round((avgP / s.settings.goals.protein) * 100)}% ${t('of target')}` : ''}</span>
        </div>
      </ChartCard>

      {/* records + per-exercise */}
      {recs.length > 0 && (
        <Section title={t('Recent records')}>
          <div className="list">
            {recs.map((r, i) => { const ex = exMap.get(r.exerciseId); return (
              <button key={i} className="li press" onClick={() => push('exercise', { id: r.exerciseId })}>
                <span style={{ width: 34, height: 34, borderRadius: 12, background: 'var(--ac)', color: 'var(--ac-ink)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon name="bolt" size={17} /></span>
                <div className="grow" style={{ textAlign: 'left' }}><div className="li-title small">{ex ? exName(ex, lang) : ''}</div><div className="li-sub">{t(({ weight: 'Heaviest set', e1rm: 'Estimated 1RM', volume: 'Best set volume', reps: 'Most reps', duration: 'Longest hold', distance: 'Longest distance' } as any)[r.kind])} · {fmtDate(r.date, lang, { day: 'numeric', month: 'short' })}</div></div>
                <div className="num" style={{ fontWeight: 700 }}>{r.kind === 'reps' ? r.value : r.kind === 'duration' ? `${r.value}s` : r.kind === 'distance' ? `${fmtNum(r.value / 1000, lang, 2)} km` : `${fmtNum(kgToDisplay(r.value, u.weight), lang, r.kind === 'e1rm' ? 1 : 2)} ${u.weight}`}</div>
              </button>); })}
          </div>
        </Section>
      )}
      {exRows.length > 0 && (
        <Section title={t('Exercise trends')}>
          <div className="list">
            {exRows.map((r) => (
              <button key={r.id} className="li press" onClick={() => push('exercise', { id: r.id })}>
                <div className="grow" style={{ textAlign: 'left', minWidth: 0 }}><div className="li-title small trunc">{exName(r.ex, lang)}</div><div className="li-sub num">{r.n} {t('sessions')} · {r.best.e1rm > 0 ? `${t('est. 1RM')} ${fmtNum(kgToDisplay(r.best.e1rm, u.weight), lang, 0)} ${u.weight}` : r.best.reps > 0 ? `${r.best.reps} ${t('reps best')}` : ''}</div></div>
                <Sparkline values={r.series} w={84} h={28} />
              </button>
            ))}
          </div>
        </Section>
      )}
      </>}
    </div>
  );
}
