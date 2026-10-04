import { useMemo } from 'react';
import { useStore } from '../../state/store';
import { useT, useLang } from '../../lib/i18n';
import { addDays, fmtWeekdayShort, startOfWeek, weekdayOf } from '../../lib/dates';
import { sumNutrients } from '../../lib/nutrition';
import { fmtNum } from '../../lib/units';
import { motion } from 'motion/react';
import { useToday } from '../../lib/derive';
import { SOFT } from '../../ui/Sheet';

/** Seven-day calorie strip for the week containing `date`. Days with no entries are empty, not zero-calorie. */
export function WeekStrip({ date, onPick }: { date: string; onPick: (d: string) => void }) {
  const t = useT();
  const lang = useLang();
  const today = useToday();
  const entries = useStore((s) => s.entries);
  const weekStart = useStore((s) => s.settings.weekStart);
  const goal = useStore((s) => s.settings.goals.kcal);
  const start = startOfWeek(date, weekStart);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = addDays(start, i);
    const list = entries.filter((e) => e.date === d);
    return { d, logged: list.length > 0, kcal: sumNutrients(list.map((e) => e.nutrients)).totals.kcal ?? 0 };
  }), [entries, start]);
  const max = Math.max((goal ?? 0) * 1.15, ...days.map((x) => x.kcal), 1); // a little headroom above the goal line
  const loggedDays = days.filter((x) => x.logged);
  const avg = loggedDays.length ? loggedDays.reduce((a, x) => a + x.kcal, 0) / loggedDays.length : 0;
  const H = 86; // bar area height
  return (
    <section className="plinth week">
      <div className="row-flex between">
        <div className="micro">{t('This week')}</div>
        {loggedDays.length > 0 && <div className="xs t2 num">{t('avg')} {fmtNum(Math.round(avg), lang, 0)} kcal · {loggedDays.length}/7</div>}
      </div>
      <div className="week-bars" style={{ height: H }}>
        {goal ? <div className="week-goal" style={{ bottom: (goal / max) * H }} aria-hidden /> : null}
        {days.map((x) => (
          <button key={x.d} className="press" onClick={() => onPick(x.d)} aria-label={`${x.d}: ${x.logged ? Math.round(x.kcal) + ' kcal' : t('nothing logged')}`}>
            <motion.i initial={false} animate={{ height: x.logged ? Math.max(8, (x.kcal / max) * H) : 6 }} transition={SOFT}
              className={x.d === date ? 'on' : x.logged ? 'logged' : ''} />
          </button>
        ))}
      </div>
      <div className="week-days">
        {days.map((x) => (
          <span key={x.d} className={x.d === date ? 'on' : x.d === today ? 'today' : ''}>{fmtWeekdayShort(weekdayOf(x.d), lang, true)}</span>
        ))}
      </div>
    </section>
  );
}
