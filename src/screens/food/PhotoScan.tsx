import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useIsPresent } from 'motion/react';
import { useT } from '../../lib/i18n';

const SCAN_WORDS = ['Reading your plate', 'Finding ingredients', 'Estimating portions', 'Adding it all up'];
/** Which of the four steps the wait is at (rAF + performance.now, so it follows the real clock). The wait is never shorter than MIN_READ_MS
 *  (photoRead.ts), so the first three steps always show; "Adding it all up" only comes after 7 s so a long wait doesn't sit on it early. */
const STEP_AT = [0, 1800, 3600, 7000];
function useStep() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t0 = performance.now(); let raf = 0;
    const tick = () => {
      const e = performance.now() - t0;
      setI((n) => { const k = STEP_AT.reduce((m, at, j) => (e >= at ? j : m), 0); return k === n ? n : k; });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return i;
}
/** While the photo is read (Siri-style): a wave of light climbs the frozen photo and the objects it passes light up (a brighter copy of the photo shown
 *  through a soft band, aligned 1:1 by moving the band up and the copy down by the same amount). Only transform and opacity move; the root never fades
 *  (a fading ancestor would drop the frost of the words capsule), the film and lights fade as one layer and the capsule fades by itself. */
export function Scan({ src, v }: { src: string; v: 'A' | 'B' | 'C' }) {
  const t = useT();
  const i = useStep();
  const dots = v === 'B' || v === 'C';
  const present = useIsPresent();
  const words = (
    <motion.div className="scan-words" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: 0.45 } }} exit={{ opacity: 0, transition: { duration: 0.18 } }}>
      {dots && <span className="scan-orbit"><i /><i /><i /><i /><i /><i /></span>}
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={i} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0, transition: { duration: 0.42, delay: 0.02, ease: [0.22, 1, 0.36, 1] } }} exit={{ opacity: 0, y: -3, transition: { duration: 0.22, ease: [0.4, 0, 1, 1] } }}>{t(SCAN_WORDS[i])}</motion.span>
      </AnimatePresence>
    </motion.div>
  );
  return (
    <div className={`scan scan-${v}${dots ? ' with-dots' : ''}${present ? '' : ' leaving'}`} aria-hidden>
      <motion.div className="scan-fx" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: 0.45 } }} exit={{ opacity: 0, transition: { duration: 0.18 } }}>
        <i className="scan-film" />
        <div className="scan-lit"><div className="scan-lit-in"><img src={src} alt="" /><i className="scan-warm" /></div></div>
      </motion.div>
      {words}
    </div>
  );
}


/** The depth look (C): the whole picture surface leans back a few degrees and lifts with the wave, then settles flat; a warm glow behind it.
 *  One wrapper holds the photo, the lit layer and the words, so nothing drifts apart. Transform and opacity only. Other looks: a plain wrapper. */
export function ScanStage({ depth, busy, fill, children }: { depth: boolean; busy: boolean; fill?: boolean; children: ReactNode }) {
  const loop = { duration: 3.7, times: [0, 0.5, 1], ease: [0.45, 0.05, 0.55, 0.95] as [number, number, number, number], delay: 0.45, repeat: Infinity, repeatDelay: 0.5 };
  return (
    <motion.div className={`scan-stage${fill ? ' fill' : ''}`} style={depth ? { transformPerspective: 900, transformOrigin: '50% 70%' } : undefined}
      animate={depth ? (busy ? { rotateX: [0, 3, 0], scale: [1, 1.02, 1] } : { rotateX: 0, scale: 1 }) : undefined}
      transition={depth ? (busy ? loop : { duration: 0.5, ease: [0.22, 1, 0.36, 1] }) : undefined}>
      {depth && <motion.i className="scan-contact" animate={busy ? { opacity: [0, 0.55, 0] } : { opacity: 0 }} transition={busy ? loop : { duration: 0.5 }} />}
      {children}
    </motion.div>
  );
}
