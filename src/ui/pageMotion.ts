import { apple, springCurve } from './motion';

/**
 * Switching tabs: the new screen — a solid surface with its own colour field — spreads out of the tab you tapped over the
 * old one, a circle growing from that tab to the far corners, while its content settles from a hair smaller. Quick and
 * quiet, because you do it all the time. The screen you leave dims a little underneath and is gone once it is covered
 * (App.tsx). Browser-run animations of clip-path and transform only, so nothing waits for the page's script.
 */
const REVEAL = apple(0.5);

const reduced = () => {
  const m = document.documentElement.dataset.motion;
  return m === 'reduce' || (m !== 'full' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
};

export function revealPage(el: HTMLElement | null) {
  if (!el || typeof el.animate !== 'function') return;
  if (reduced()) { el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' }); return; }
  const box = el.getBoundingClientRect();
  const tab = (document.querySelector('.tab.on') as HTMLElement | null)?.getBoundingClientRect();
  const x = (tab && tab.width ? tab.left + tab.width / 2 : box.left + box.width / 2) - box.left;
  const y = (tab && tab.width ? tab.top + tab.height / 2 : box.bottom) - box.top;
  const R = Math.hypot(Math.max(x, box.width - x), Math.max(y, box.height - y)) + 2;
  const c = springCurve(REVEAL);
  const timing = { duration: c.duration, easing: c.easing };
  el.animate([{ clipPath: `circle(40px at ${x}px ${y}px)` }, { clipPath: `circle(${R.toFixed(1)}px at ${x}px ${y}px)` }], timing);
  const content = el.querySelector(':scope > .screen') as HTMLElement | null;
  if (content) {
    content.style.transformOrigin = `${x}px ${y}px`;
    content.animate([{ transform: 'scale(0.975)' }, { transform: 'scale(1)' }], timing);
  }
}

/** A section inside a screen (Train's Plan / Library / History): it glides in from the side it lives on. */
export function slideSection(el: HTMLElement | null, dir: number) {
  if (!el || typeof el.animate !== 'function' || !dir) return;
  if (reduced()) { el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160 }); return; }
  const c = springCurve(apple(0.5));
  el.animate([{ transform: `translate3d(${dir * 34}px, 0, 0)` }, { transform: 'translate3d(0, 0, 0)' }], { duration: c.duration, easing: c.easing });
  el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.2,.7,.3,1)' });
}
