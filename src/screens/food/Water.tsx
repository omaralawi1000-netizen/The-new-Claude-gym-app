import { motion } from 'motion/react';
import { useStore } from '../../state/store';
import { useUI, buzz } from '../../state/ui';
import { useT, useLang } from '../../lib/i18n';
import { useWaterOn } from '../../lib/derive';
import { Icon } from '../../ui/Icon';
import { Count } from '../../ui/kit';
import { fmtNum } from '../../lib/units';
import { pct } from '../../lib/nutrition';
import { SOFT } from '../../ui/Sheet';

export function WaterTile({ date }: { date: string }) {
  const t = useT();
  const lang = useLang();
  const { ml } = useWaterOn(date);
  const goal = useStore((s) => s.settings.goals.waterMl);
  const quick = useStore((s) => s.settings.waterQuick);
  const addWater = useStore((s) => s.addWater);
  const removeWater = useStore((s) => s.removeWater);
  const toast = useUI((s) => s.toast);
  const push = useUI((s) => s.push);
  const p = pct(ml, goal);
  const add = (v: number) => {
    buzz(8);
    const id = addWater(v, date);
    toast(`+${fmtNum(v, lang, 0)} ml`, { tone: 'ok', actionLabel: t('Undo'), onAction: () => removeWater(id), duration: 3500 });
  };
  return (
    <div className="plinth water">
      <div className="row-flex between">
        <div>
          <div className="micro row-flex" style={{ gap: 6 }}><Icon name="drop" size={14} /> {t('Water')}</div>
          <div className="display display-md num" style={{ marginTop: 6 }}><Count value={ml} format={(n) => fmtNum(Math.round(n), lang, 0)} /><span className="t3 small"> / {fmtNum(goal, lang, 0)} ml</span></div>
        </div>
        <button className="icon-btn flat" aria-label={t('Edit quick amounts')} onClick={() => push('waterSheet', { date })}><Icon name="more" /></button>
      </div>
      <div className="water-bar" role="progressbar" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={ml}>
        <motion.i initial={false} animate={{ x: `${(Math.min(1, p) - 1) * 100}%` }} transition={SOFT} />
      </div>
      <div className="row-flex" style={{ gap: 8, marginTop: 16 }}>
        {quick.map((v) => (
          <button key={v} className="btn sm press grow" onClick={() => add(v)} aria-label={`${t('Add')} ${v} ml`}><Icon name="drop" size={16} /> {fmtNum(v, lang, 0)}</button>
        ))}
      </div>
    </div>
  );
}
