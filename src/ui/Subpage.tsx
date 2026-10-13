import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';

/**
 * A part of a screen that is swapped as a whole (Train's Plan / Library / History, Food's day): give it an `id` and its blocks
 * rise in again one after another when it changes (`.subpage > *` in styles.css), like a screen's blocks do. The part being
 * left fades out where it is meanwhile (it used to vanish at once, leaving a moment of empty background before the new
 * blocks rose). Opacity only; it is taken out of the layout as it leaves, so nothing below it moves.
 */
export function Subpage({ id, children }: { id: string; children: ReactNode }) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.div key={id} className="subpage" exit={{ opacity: 0, transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] } }}>{children}</motion.div>
    </AnimatePresence>
  );
}
