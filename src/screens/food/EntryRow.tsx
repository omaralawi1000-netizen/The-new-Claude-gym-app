import { motion, useMotionValue, useTransform, animate } from 'motion/react';
import type { FoodEntry } from '../../lib/types';
import { useLang, useT } from '../../lib/i18n';
import { fmtNutrient, qtyLabel } from '../../lib/format';
import { Icon } from '../../ui/Icon';
import { SOFT } from '../../ui/Sheet';
import { buzz } from '../../state/ui';

/**
 * A logged food inside its meal card: tap to edit, swipe left to delete (with undo).
 * The row itself is see-through (it sits on the card's glass); the red delete strip is clipped to exactly the space the
 * finger has uncovered, so nothing shows through the row while it rests.
 */
export function EntryRow({ e, onOpen, onDelete, fresh }: { e: FoodEntry; onOpen: () => void; onDelete: () => void; fresh?: boolean }) {
  const t = useT();
  const lang = useLang();
  const x = useMotionValue(0);
  const clip = useTransform(x, (v) => `inset(0 0 0 calc(100% + ${Math.min(0, v).toFixed(1)}px))`);
  const iconO = useTransform(x, [-90, -30], [1, 0]);
  const n = e.nutrients;
  // "raw"/"cooked" after the name, unless the name already says it ("Rice, white, cooked")
  const st = e.snap.state === 'raw' ? 'raw' : e.snap.state === 'cooked' ? 'cooked' : null;
  const state = st && ![st, t(st)].some((w) => e.snap.name.toLowerCase().includes(w.toLowerCase())) ? t(st) : null;
  return (
    <motion.div initial={fresh ? { opacity: 0, y: -8 } : false} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0, transition: { duration: 0.22 } }} transition={SOFT}
      className={`entry ${fresh ? 'settle' : ''}`}>
      <motion.div className="entry-del" style={{ clipPath: clip }} aria-hidden>
        <motion.span style={{ opacity: iconO }}><Icon name="trash" size={20} /></motion.span>
      </motion.div>
      <motion.button
        className="entry-row"
        style={{ x }}
        drag="x" dragDirectionLock dragConstraints={{ left: 0, right: 0 }} dragElastic={{ left: 0.5, right: 0 }}
        onDragEnd={(_, info) => {
          if (info.offset.x < -110 || info.velocity.x < -700) { buzz(12); animate(x, -480, { duration: 0.18 }).then(onDelete); }
          else animate(x, 0, SOFT);
        }}
        onClick={onOpen} aria-label={`${e.snap.name}, ${Math.round(n.kcal ?? 0)} kcal`}
      >
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="li-title trunc">{e.snap.name}{state && <span className="t3 small"> · {state}</span>}</div>
          <div className="entry-sub num trunc">
            {e.estimated ? '~' : ''}{qtyLabel(e, lang, t)}{e.snap.brand ? ` · ${e.snap.brand}` : ''}
            <span className="entry-macros">
              <i style={{ background: 'var(--c-protein)' }} />{fmtNutrient('protein', n.protein, lang)}
              <i style={{ background: 'var(--c-carbs)' }} />{fmtNutrient('carbs', n.carbs, lang)}
              <i style={{ background: 'var(--c-fat)' }} />{fmtNutrient('fat', n.fat, lang)}
            </span>
          </div>
        </div>
        <div className="entry-kcal num">{fmtNutrient('kcal', n.kcal, lang)}<span>kcal</span></div>
      </motion.button>
    </motion.div>
  );
}
