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
    <div className="plinth" style={{ padding: 18, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', borderRadius: 'inherit', overflow: 'hidden' }}>
        <motion.div initial={false} animate={{ height: `${p * 100}%` }} transition={SOFT} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: 'linear-gradient(180deg, color-mix(in srgb, var(--c-water) 20%, transparent), color-mix(in srgb, var(--c-water) 8%, transparent))', borderTop: p > 0 && p < 1 ? '1px solid color-mix(in srgb, var(--c-water) 50%, transparent)' : undefined }} />
      </div>
      <div className="row-flex between" style={{ position: 'relative' }}>
        <div>
          <div className="micro">{t('Water')}</div>
          <div className="display display-md" style={{ marginTop: 4 }}><Count value={ml} format={(n) => fmtNum(Math.round(n), lang, 0)} /><span className="t3 small" style={{ fontFamily: 'var(--f-ui)', fontStretch: '100%', fontWeight: 600 }}> / {fmtNum(goal, lang, 0)} ml</span></div>
        </div>
        <button className="icon-btn flat" aria-label={t('Edit quick amounts')} onClick={() => push('waterSheet', { date })}><Icon name="more" /></button>
      </div>
      <div className="row-flex" style={{ gap: 8, marginTop: 14, position: 'relative' }}>
        {quick.map((v) => (
          <button key={v} className="btn sm press grow" onClick={() => add(v)} aria-label={`${t('Add')} ${v} ml`}><Icon name="drop" size={16} /> {fmtNum(v, lang, 0)}</button>
        ))}
      </div>
    </div>
  );
}
