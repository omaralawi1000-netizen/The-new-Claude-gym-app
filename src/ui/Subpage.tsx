import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { slideSection } from './pageMotion';

/**
 * A part of a screen that is swapped as a whole (Train's Plan / Library / History, Food's day): mount it with a `key`, and it
 * glides in from the side it lives on (`dir` -1 = from the left, 1 = from the right, 0 = no movement) on Apple's spring.
 */
export function Subpage({ dir, children }: { dir: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { slideSection(ref.current, dir); }, []); // eslint-disable-line
  return <div ref={ref} className="subpage">{children}</div>;
}
