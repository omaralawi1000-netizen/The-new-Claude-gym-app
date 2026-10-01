import { motion, useTransform, type MotionValue } from 'motion/react';
import type { Ref } from 'react';
import { mirrorProgress } from './engage';

/**
 * What lies between a popup and the page behind it: a dim and a soft blur, both following the popup's own progress
 * frame for frame — they deepen exactly as it rises and fade exactly as you pull it down.
 *
 * The blur grows gradually. A blur's strength can't be animated cheaply (every step is a new full-screen filter), and a
 * single blurred layer faded in reads as "sharp, then suddenly blurred". So it is built from two layers with fixed
 * strengths that fade in one after the other: a light blur first, then a stronger one over it. Each layer fades with its
 * OWN opacity — a fading parent would switch their blur off until the fade ends (the snap people saw).
 */
export interface VeilLayer { cls: string; from: number; to: number }

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const ramp = (l: VeilLayer, p: number) => clamp01((p - l.from) / (l.to - l.from));

/** Behind sheets: a light blur and a dim that deepens with the sheet. */
export const SHEET_VEIL: VeilLayer[] = [
  { cls: 'veil-blur-a', from: 0, to: 0.55 },
  { cls: 'veil-blur-b', from: 0.3, to: 1 },
  { cls: 'veil-dim', from: 0, to: 1 },
];
/** Behind a full-screen surface that is frosted itself (the live workout): only the dim. */
export const DIM_VEIL: VeilLayer[] = [{ cls: 'veil-dim', from: 0, to: 1 }];
/** Behind the orb screen: a deep frost that builds up gradually. */
export const VOICE_VEIL: VeilLayer[] = [
  { cls: 'veil-blur-v1', from: 0, to: 0.45 },
  { cls: 'veil-blur-v2', from: 0.25, to: 1 },
  { cls: 'veil-tint', from: 0, to: 1 },
];

function Layer({ e, l }: { e: MotionValue<number>; l: VeilLayer }) {
  const opacity = useTransform(e, (v) => ramp(l, v));
  return <motion.i className={l.cls} style={{ opacity }} />;
}

export function Veil({ e, z, onClick, layers = SHEET_VEIL, elRef, className = '' }: { e: MotionValue<number>; z: number; onClick?: () => void; layers?: VeilLayer[]; elRef?: Ref<HTMLDivElement>; className?: string }) {
  return (
    <div ref={elRef} className={`scrim ${className}`} style={{ zIndex: z }} onClick={onClick}>
      {layers.map((l) => <Layer key={l.cls} e={e} l={l} />)}
    </div>
  );
}

/** High refresh rate: the same ramps as browser-run animations (see mirrorSpring), one per layer. */
export function mirrorVeil(root: HTMLElement | null, p0: number, p1: number, sp: { stiffness: number; damping: number; mass?: number }, vel: number, layers: VeilLayer[] = SHEET_VEIL): (Animation | null)[] {
  if (!root) return [];
  return layers.map((l, i) => mirrorProgress(root.children[i], p0, p1, sp, vel, (p) => ({ opacity: ramp(l, p) }), [l.from, l.to]));
}
