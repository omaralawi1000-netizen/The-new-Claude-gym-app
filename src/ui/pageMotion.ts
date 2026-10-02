import { apple, springCurve } from './motion';

/* Motion inside a screen. (Switching tabs is in App.tsx: Field + TabPane.) */

const reduced = () => {
  const m = document.documentElement.dataset.motion;
  return m === 'reduce' || (m !== 'full' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
};

/** A section inside a screen (Train's Plan / Library / History): it glides in from the side it lives on. */
export function slideSection(el: HTMLElement | null, dir: number) {
  if (!el || typeof el.animate !== 'function' || !dir) return;
  if (reduced()) { el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160 }); return; }
  const c = springCurve(apple(0.5));
  el.animate([{ transform: `translate3d(${dir * 34}px, 0, 0)` }, { transform: 'translate3d(0, 0, 0)' }], { duration: c.duration, easing: c.easing });
  el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.2,.7,.3,1)' });
}
