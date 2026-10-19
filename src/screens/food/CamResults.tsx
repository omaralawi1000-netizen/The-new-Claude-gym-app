import { motion } from 'motion/react';
import { useT, useLang } from '../../lib/i18n';
import { fmtNum } from '../../lib/units';
import { Icon } from '../../ui/Icon';
import { PORTIONS, type ReadItem } from './photoRead';

const EASE = [0.22, 1, 0.36, 1] as const;
/** House stagger: 60 ms between rows. Rows only rise (a transform) and fade; text is never scaled. */
const rise = (i: number, base: number) => ({ initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, delay: base + i * 0.06, ease: EASE } });

/** The result of reading a photo, inside the camera pop-up (CameraSheet): a total, then one dark row per item with its portion chips.
 *  Black and white only, as the camera is in both themes. */
export function CamResults({ items, setItems, assume, base }: { items: ReadItem[]; setItems: (f: (l: ReadItem[]) => ReadItem[]) => void; assume: string; base: number }) {
  const t = useT();
  const lang = useLang();
  const on = items.filter((x) => x.on);
  const total = on.reduce((n, x) => n + x.kcal * x.k, 0);
  const sum = (f: 'protein' | 'carbs' | 'fat') => Math.round(on.reduce((n, x) => n + x[f] * x.k, 0));
  return (
    <>
      <motion.div className="cam-res-head" {...rise(0, base)}>
        <div className="cam-res-total num">~{fmtNum(Math.round(total), lang, 0)}<span> kcal</span></div>
        <div className="cam-res-sub num">P {sum('protein')} · C {sum('carbs')} · F {sum('fat')} g</div>
        <div className="cam-res-sub">{t('AI estimate')} · {items.length}</div>
      </motion.div>
      <div className="cam-res-list">
        {items.map((x, i) => (
          <motion.div key={i} className="cam-row" data-off={x.on ? undefined : ''} {...rise(i + 1, base)}>
            <div className="cam-row-top">
              <button className="cam-row-name press" onClick={() => setItems((l) => l.map((y, j) => (j === i ? { ...y, on: !y.on } : y)))} aria-pressed={x.on}>
                <span className={`cam-tick${x.on ? ' on' : ''}`}>{x.on && <Icon name="check" size={14} sw={3} />}</span>
                <span className="trunc">~ {x.name}</span>
              </button>
              <span className="num cam-row-kcal">~{fmtNum(Math.round(x.kcal * x.k), lang, 0)}<span> kcal</span></span>
            </div>
            <div className="cam-row-macros num">{x.grams ? `~${Math.round(x.grams * x.k)} g · ` : ''}P {Math.round(x.protein * x.k)} · C {Math.round(x.carbs * x.k)} · F {Math.round(x.fat * x.k)} g</div>
            <div className="cam-chips">{PORTIONS.map((k) => <button key={k} className={`cam-chip press${x.k === k ? ' on' : ''}`} onClick={() => setItems((l) => l.map((y, j) => (j === i ? { ...y, k } : y)))}>×{fmtNum(k, lang, 2)}</button>)}</div>
          </motion.div>
        ))}
        {assume && <motion.div className="cam-res-note" {...rise(items.length + 1, base)}>~ {assume}</motion.div>}
      </div>
    </>
  );
}
