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
  const max = Math.max(goal ?? 0, ...days.map((x) => x.kcal), 1);
  const loggedDays = days.filter((x) => x.logged);
  const avg = loggedDays.length ? loggedDays.reduce((a, x) => a + x.kcal, 0) / loggedDays.length : 0;
  return (
    <section>
      <div className="row-flex between" style={{ marginBottom: 12 }}>
        <div className="micro">{t('This week')}</div>
        {loggedDays.length > 0 && <div className="small t2 num">{t('avg')} {fmtNum(Math.round(avg), lang, 0)} kcal · {loggedDays.length}/7 {t('days logged')}</div>}
      </div>
      <div className="plinth" style={{ padding: '16px 14px 12px', display: 'flex', alignItems: 'flex-end', gap: 8, height: 140, position: 'relative' }}>
        {goal ? <div style={{ position: 'absolute', left: 14, right: 14, bottom: 12 + 22 + (goal / max) * 64, borderTop: '1px dashed var(--line-2)' }} aria-hidden /> : null}
        {days.map((x) => (
          <button key={x.d} className="press" onClick={() => onPick(x.d)} aria-label={`${x.d}: ${x.logged ? Math.round(x.kcal) + ' kcal' : t('nothing logged')}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, justifyContent: 'flex-end', height: '100%' }}>
            <div style={{ height: 64, display: 'flex', alignItems: 'flex-end', width: '100%', justifyContent: 'center' }}>
              <motion.div initial={false} animate={{ height: x.logged ? Math.max(6, (x.kcal / max) * 64) : 4 }} transition={SOFT}
                style={{ width: '70%', maxWidth: 26, borderRadius: 6, background: x.d === date ? 'var(--ac)' : x.logged ? 'var(--s4)' : 'var(--s3)', opacity: x.logged ? 1 : 0.6 }} />
            </div>
            <div className="xs" style={{ fontWeight: x.d === today ? 700 : 500, color: x.d === date ? 'var(--ac-text)' : 'var(--tx3)' }}>{fmtWeekdayShort(weekdayOf(x.d), lang, true)}</div>
          </button>
        ))}
      </div>
    </section>
  );
}
