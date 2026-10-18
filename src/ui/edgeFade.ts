// A sideways row of chips that fades out only on the side that still has more to scroll to, and fades in as you scroll,
// so a chip is never sliced hard by the card edge and nothing looks faded when everything fits. The fade width follows the
// scroll position (no pop, no animation): it is written as `--fl` / `--fr` on the row, read by `.chips.fade-x` in styles.css.
import { useEffect, useRef } from 'react';

const MAX = 44; // px, the longest fade
const SLOPE = 2; // fade px per px scrolled: it reaches full length after 22 px

export function useEdgeFade<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let l = -1, r = -1, raf = 0;
    const set = () => {
      raf = 0;
      const max = el.scrollWidth - el.clientWidth;
      const fl = Math.round(Math.max(0, Math.min(MAX, el.scrollLeft * SLOPE)));
      const fr = Math.round(Math.max(0, Math.min(MAX, (max - el.scrollLeft) * SLOPE)));
      if (fl !== l) { l = fl; el.style.setProperty('--fl', `${fl}px`); }
      if (fr !== r) { r = fr; el.style.setProperty('--fr', `${fr}px`); }
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(set); };
    set();
    el.addEventListener('scroll', kick, { passive: true });
    const ro = new ResizeObserver(kick);
    ro.observe(el);
    for (const c of Array.from(el.children)) ro.observe(c);
    return () => { el.removeEventListener('scroll', kick); ro.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, []);
  return ref;
}
