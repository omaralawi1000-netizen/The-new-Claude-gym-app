import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { Sum } from '../../lib/nutrition';
import { pct } from '../../lib/nutrition';
import { Count } from '../../ui/kit';
import { Dial } from '../../ui/Dial';
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
  const macros = [
    { k: 'protein' as const, label: t('Protein'), c: 'var(--c-protein)' },
    { k: 'carbs' as const, label: t('Carbs'), c: 'var(--c-carbs)' },
    { k: 'fat' as const, label: t('Fat'), c: 'var(--c-fat)' },
  ];
  const totalMacro = Math.max(1, (goals.protein ?? 0) + (goals.carbs ?? 0) + (goals.fat ?? 0) || 300);
  const ring = (k: 'protein' | 'carbs' | 'fat') => { const g = goals[k]; const v = sum.totals[k] ?? 0; return g ? pct(v, g) : Math.min(1, v / totalMacro); };
  return (
    <div style={{ padding: compact ? '2px 0 0' : '6px 0 0' }}>
      <div style={{ margin: '0 auto', width: 'fit-content', borderRadius: '50%' }} onClick={!compact && !goal ? () => push('settings', { section: 'targets' }) : undefined}>
        <Dial size={compact ? 252 : 268} stroke={10} gap={6} label={`${fmtNum(Math.round(kcal), lang, 0)} kcal`}
          rings={[{ value: goal ? pct(kcal, goal) : kcal > 0 ? 1 : 0, color: 'var(--ac)', label: 'kcal', over }, { value: ring('protein'), color: 'var(--c-protein)', label: t('Protein') }, { value: ring('carbs'), color: 'var(--c-carbs)', label: t('Carbs') }, { value: ring('fat'), color: 'var(--c-fat)', label: t('Fat') }]}>
          <div>
            <div className="display num" data-testid="ledger-kcal" style={{ fontSize: 42, lineHeight: 0.95, color: over ? 'var(--bad)' : 'var(--tx)' }}>
              <Count value={goal ? Math.abs(remaining!) : kcal} format={(n) => fmtNum(Math.round(n), lang, 0)} />
            </div>
            <div className="micro" style={{ marginTop: 6 }}>{goal ? (over ? t('Over') : t('kcal left')) : t('kcal')}</div>
          </div>
        </Dial>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 14 }}>
        {macros.map((m) => {
          const s = fmtSum(m.k, sum, lang);
          const g = goals[m.k];
          // some foods have no value for this macro: the number is a floor. A small dot says so (explained under More)
          // instead of a "≥" in front of every big number
          const text = s.partial ? s.text.replace(/^≥\s*/, '') : s.text;
          return (
            <div key={m.k} style={{ textAlign: 'center' }} aria-label={`${m.label} ${s.partial ? `${t('at least')} ` : ''}${text} g`}>
              <div className="num" style={{ fontSize: 22, fontWeight: 300, letterSpacing: '-0.03em' }}>{text}{s.partial && <i className="partial-dot" aria-hidden />}<span className="t3 xs">{g ? ` / ${fmtNum(g, lang, 0)}` : ' g'}</span></div>
              <div className="row-flex" style={{ gap: 6, justifyContent: 'center', marginTop: 4 }}><i style={{ width: 7, height: 7, borderRadius: 7, background: m.c, boxShadow: `0 0 10px ${m.c}` }} /><span className="micro">{m.label.slice(0, 1)}</span></div>
            </div>
          );
        })}
      </div>
      {!compact && (
        <>
          <button className="row-flex press small t2" style={{ marginTop: 14, gap: 6 }} onClick={() => setMore((v) => !v)} aria-expanded={more}>
            <Icon name={more ? 'chevU' : 'chevD'} size={16} /> {t('More')}
          </button>
          <AnimatePresence initial={false}>
            {more && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={SOFT} style={{ overflow: 'hidden' }}>
                {macros.some((m) => fmtSum(m.k, sum, lang).partial) && <div className="xs t2" style={{ paddingTop: 12 }}><i className="partial-dot" aria-hidden style={{ verticalAlign: 'middle', margin: '0 6px 0 0' }} />{t('Some foods have no value for this, so the real total is a little higher.')}</div>}
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
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}
