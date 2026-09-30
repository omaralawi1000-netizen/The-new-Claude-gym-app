import { motion, useMotionValue, useTransform, animate } from 'motion/react';
import type { FoodEntry } from '../../lib/types';
import { useLang, useT } from '../../lib/i18n';
import { fmtNutrient, qtyLabel } from '../../lib/format';
import { Icon } from '../../ui/Icon';
import { SOFT, Plate } from '../../ui/Sheet';
import { buzz } from '../../state/ui';

/** A logged food: tap to edit, swipe left to delete (with undo). */
export function EntryRow({ e, onOpen, onDelete, fresh }: { e: FoodEntry; onOpen: () => void; onDelete: () => void; fresh?: boolean }) {
  const t = useT();
  const lang = useLang();
  const x = useMotionValue(0);
  const bgOpacity = useTransform(x, [-120, -20, 0], [1, 0.6, 0]);
  const n = e.nutrients;
  return (
    <motion.div layout="position" initial={fresh ? { opacity: 0, y: -10, scale: 0.98 } : false} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, height: 0, transition: { duration: 0.2 } }} transition={SOFT}
      style={{ position: 'relative', overflow: 'hidden', borderTop: '1px solid var(--line)' }} className={fresh ? 'settle' : ''}>
      <motion.div style={{ opacity: bgOpacity, position: 'absolute', inset: 0, background: 'var(--bad)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 22, color: '#fff' }}>
        <Icon name="trash" />
      </motion.div>
      <motion.button
        style={{ x, width: '100%', display: 'flex', gap: 12, alignItems: 'center', padding: '12px 0', textAlign: 'left', background: 'var(--bg)', position: 'relative', touchAction: 'pan-y' }}
        drag="x" dragDirectionLock dragConstraints={{ left: 0, right: 0 }} dragElastic={{ left: 0.5, right: 0 }}
        onDragEnd={(_, info) => {
          if (info.offset.x < -110 || info.velocity.x < -700) { buzz(12); animate(x, -480, { duration: 0.18 }).then(onDelete); }
          else animate(x, 0, SOFT);
        }}
        onClick={onOpen} aria-label={`${e.snap.name}, ${Math.round(n.kcal ?? 0)} kcal`}
      >
        <Plate layoutId={`entry-${e.id}`} flat radius={0} style={{ background: 'var(--bg)' }} />
        <div className="grow" style={{ position: 'relative' }}>
          <div className="li-title trunc">{e.snap.name}{e.snap.state && e.snap.state !== 'dry' && <span className="t3 small"> · {t(e.snap.state === 'raw' ? 'raw' : 'cooked')}</span>}</div>
          <div className="li-sub trunc num">
            {e.estimated ? '~' : ''}{qtyLabel(e, lang, t)}{e.snap.brand ? ` · ${e.snap.brand}` : ''}
          </div>
          <div className="xs t3 num" style={{ marginTop: 2 }}>
            P {fmtNutrient('protein', n.protein, lang)} · C {fmtNutrient('carbs', n.carbs, lang)} · F {fmtNutrient('fat', n.fat, lang)}
          </div>
        </div>
        <div style={{ textAlign: 'right', position: 'relative' }}>
          <div className="num" style={{ fontWeight: 650, fontSize: 16 }}>{fmtNutrient('kcal', n.kcal, lang)}</div>
          <div className="xs t3">kcal</div>
        </div>
      </motion.button>
    </motion.div>
  );
}
