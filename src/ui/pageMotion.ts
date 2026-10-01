import { apple, springCurve } from './motion';

/**
 * Switching tabs: the new screen spills out of the tab you tapped like a drop of the dock's glass spreading over the
 * page — a circle growing from that tab to the far corners, the screen inside it settling from a little smaller, and a ring
 * of light riding the edge. The screen you leave sinks back and fades underneath (App.tsx). All browser-run animations of
 * clip-path, transform and opacity, so nothing waits for the page's script.
 */
const REVEAL = apple(0.62);

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
  const R = Math.hypot(Math.max(x, box.width - x), Math.max(y, box.height - y)) + 12;
  const c = springCurve(REVEAL);
  const timing = { duration: c.duration, easing: c.easing };
  el.style.transformOrigin = `${x}px ${y}px`;
  el.animate([{ clipPath: `circle(26px at ${x}px ${y}px)` }, { clipPath: `circle(${R.toFixed(1)}px at ${x}px ${y}px)` }], timing);
  el.animate([{ transform: 'scale(0.94)' }, { transform: 'scale(1)' }], timing);
  el.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 300, easing: 'cubic-bezier(.2,.7,.3,1)' });
  // the ring of light on the edge of the spreading drop
  const host = el.parentElement;
  if (!host) return;
  const ring = document.createElement('div');
  ring.className = 'reveal-ring';
  ring.setAttribute('aria-hidden', 'true');
  ring.style.cssText = `left:${(x - R).toFixed(1)}px;top:${(y - R).toFixed(1)}px;width:${(2 * R).toFixed(1)}px;height:${(2 * R).toFixed(1)}px`;
  host.appendChild(ring);
  const a = ring.animate(
    [{ transform: `scale(${(26 / R).toFixed(4)})`, opacity: 0 }, { opacity: 0.95, offset: 0.12 }, { opacity: 0.55, offset: 0.6 }, { transform: 'scale(1)', opacity: 0 }],
    timing,
  );
  const done = () => ring.remove();
  a.onfinish = done; a.oncancel = done;
}

/** A section inside a screen (Train's Plan / Library / History): it glides in from the side it lives on. */
export function slideSection(el: HTMLElement | null, dir: number) {
  if (!el || typeof el.animate !== 'function' || !dir) return;
  if (reduced()) { el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160 }); return; }
  const c = springCurve(apple(0.5));
  el.animate([{ transform: `translate3d(${dir * 34}px, 0, 0)` }, { transform: 'translate3d(0, 0, 0)' }], { duration: c.duration, easing: c.easing });
  el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.2,.7,.3,1)' });
}
