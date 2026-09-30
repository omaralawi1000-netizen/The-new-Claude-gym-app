import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { Sum } from '../../lib/nutrition';
import { pct } from '../../lib/nutrition';
import { Count, Ticks } from '../../ui/kit';
import { Icon } from '../../ui/Icon';
import { useStore } from '../../state/store';
import { useT, useLang } from '../../lib/i18n';
import { fmtNum } from '../../lib/units';
import { fmtSum } from '../../lib/format';
import { useUI } from '../../state/ui';
import { SOFT } from '../../ui/Sheet';

/** The day "ledger": a drafting-ruler calorie gauge, macro rules and optional nutrients. */
export function Ledger({ sum, compact }: { sum: Sum; compact?: boolean }) {
  const t = useT();
  const lang = useLang();
  const goals = useStore((s) => s.settings.goals);
  const push = useUI((s) => s.push);
  const [more, setMore] = useState(false);
  const kcal = sum.totals.kcal ?? 0;
  const goal = goals.kcal;
  const remaining = goal ? goal - kcal : undefined;
  const over = remaining !== undefined && remaining < 0;
  const kcalSum = fmtSum('kcal', sum, lang);
  const macros = [
    { k: 'protein' as const, label: t('Protein'), c: 'var(--c-protein)' },
    { k: 'carbs' as const, label: t('Carbs'), c: 'var(--c-carbs)' },
    { k: 'fat' as const, label: t('Fat'), c: 'var(--c-fat)' },
  ];
  return (
    <div className="plinth dots" style={{ padding: compact ? '18px 18px 16px' : '20px 18px 18px', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
      <div className="row-flex between" style={{ alignItems: 'flex-end' }}>
        <div>
          <div className="micro">{goal ? (over ? t('Over target') : t('Remaining')) : t('Eaten today')}</div>
          <div className="display display-xl" style={{ marginTop: 6, color: over ? 'var(--bad)' : 'var(--tx)' }}>
            {goal ? <Count value={Math.abs(remaining!)} format={(n) => fmtNum(Math.round(n), lang, 0)} /> : <Count value={kcal} format={(n) => fmtNum(Math.round(n), lang, 0)} />}
            <span className="display-sm t3" style={{ marginLeft: 6, fontStretch: '100%', fontWeight: 600 }}>kcal</span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }} className="small t2 num">
          {goal ? (<><div>{t('Eaten')} <b style={{ color: 'var(--tx)' }}>{kcalSum.text}</b></div><div>{t('Goal')} {fmtNum(goal, lang, 0)}</div></>) : (
            <button className="chip acc press" onClick={() => push('settings', { section: 'targets' })}>{t('Set targets')}</button>
          )}
        </div>
      </div>
      {goal ? <div style={{ marginTop: 16 }}><Ticks value={pct(kcal, goal)} over={over} /></div> : null}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginTop: 18 }}>
        {macros.map((m) => {
          const s = fmtSum(m.k, sum, lang);
          const g = goals[m.k];
          const v = sum.totals[m.k] ?? 0;
          return (
            <div key={m.k}>
              <div className="micro" style={{ color: 'var(--tx3)', marginBottom: 4 }}>{m.label}</div>
              <div className="num" style={{ fontSize: 20, fontWeight: 650, letterSpacing: '-0.01em' }}>{s.text}<span className="t3 small"> g</span></div>
              <div className="bar" style={{ marginTop: 8, height: 4 }}><motion.i style={{ background: m.c }} initial={false} animate={{ width: `${g ? pct(v, g) * 100 : Math.min(100, (v / Math.max(1, (goals.protein ?? 0) + (goals.carbs ?? 0) + (goals.fat ?? 0) || 300)) * 100)}%` }} transition={SOFT} /></div>
              {g ? <div className="xs t3 num" style={{ marginTop: 4 }}>{t('of')} {fmtNum(g, lang, 0)} g</div> : <div className="xs t3" style={{ marginTop: 4 }}>{s.partial ? t('some items lack data') : ' '}</div>}
            </div>
          );
        })}
      </div>
      {!compact && (
        <>
          <button className="row-flex press small t2" style={{ marginTop: 14, gap: 6 }} onClick={() => setMore((v) => !v)} aria-expanded={more}>
            <Icon name={more ? 'chevU' : 'chevD'} size={16} /> {t('More nutrients')}
          </button>
          <AnimatePresence initial={false}>
            {more && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={SOFT} style={{ overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px 18px', paddingTop: 12 }}>
                  {(['fibre', 'sugar', 'satFat', 'sodium'] as const).map((k) => {
                    const s = fmtSum(k, sum, lang, true);
                    const label = { fibre: t('Fibre'), sugar: t('Sugars'), satFat: t('Saturated fat'), sodium: t('Sodium') }[k];
                    return (
                      <div key={k} className="row-flex between small">
                        <span className="t2">{label}</span>
                        <span className="num" style={{ fontWeight: 600, color: s.unknown ? 'var(--tx3)' : 'var(--tx)' }}>{s.text}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="xs t3" style={{ paddingTop: 10 }}>{t('"—" means no data, not zero. "≥" means some entries had no value for it.')}</div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}
