// "Ask the Coach about this": hold a food, a lift, a past workout or a chart (anything tagged `data-ask`, lib/askAbout.ts)
// and a small glass pill rises above it, with a soft ring around what you're holding. Tap the pill and the Coach opens
// about exactly that; tap anywhere else (or scroll) and it goes. One listener for the whole app, like ui/press.ts.
// Transform and opacity only; the ring is a pseudo-element faded in, the pill a fixed layer that never blurs anything
// behind it while it moves (its frost comes in after it has landed).
import { aboutFrom } from '../lib/askAbout';
import { haptic, useUI } from '../state/ui';
import { tNow } from '../lib/i18n';

const HOLD = 480;   // ms: a deliberate hold (Android's own long press is 400–500)
const SLOP = 8;     // px a finger may drift (a scroll cancels it)

let timer = 0, x0 = 0, y0 = 0, pid = -1;
let target: HTMLElement | null = null;
let ring: HTMLElement | null = null;
let pill: HTMLButtonElement | null = null;
let swallowUntil = 0;

function cancel() {
  if (timer) { clearTimeout(timer); timer = 0; }
  target = null; pid = -1;
  window.removeEventListener('pointermove', move, true);
  window.removeEventListener('pointerup', cancel, true);
  window.removeEventListener('pointercancel', cancel, true);
}

function move(e: PointerEvent) {
  if (e.pointerId !== pid) return;
  if (Math.abs(e.clientX - x0) > SLOP || Math.abs(e.clientY - y0) > SLOP) cancel();
}

/** The pill and the ring go: faded out, then taken away. */
export function dismissAsk() {
  const p = pill, g = ring;
  pill = null; ring = null;
  for (const x of [p, g]) if (x) { x.classList.remove('on'); x.classList.add('off'); setTimeout(() => x.remove(), 300); }
  document.removeEventListener('pointerdown', outside, true);
  window.removeEventListener('scroll', dismissAsk, true);
}

function outside(e: PointerEvent) { if (pill && e.target instanceof Node && pill.contains(e.target)) return; dismissAsk(); }

function fire(el: HTMLElement) {
  timer = 0;
  const tag = el.dataset.ask;
  const about = tag ? aboutFrom(tag) : null;
  cancel();
  if (!about) return;
  dismissAsk();
  haptic('light');
  // the click that ends this hold must not also open the row
  swallowUntil = performance.now() + 900;
  const r = el.getBoundingClientRect();
  // the ring and the pill live on <body>, outside the tab's own light: they take the held item's accent with them
  const cs = getComputedStyle(el);
  const tint = `--ac:${cs.getPropertyValue('--ac')};--ac-text:${cs.getPropertyValue('--ac-text')}`;
  // a soft accent ring around what is held, a little outside it (never touching its words), on its own layer over it (the
  // item itself is left exactly as it is); cut off where the dock covers the page, so it never runs under it
  (document.activeElement as HTMLElement | null)?.blur?.();
  const g = document.createElement('div');
  g.className = 'ask-ring';
  const dock = document.querySelector('.tabbar')?.getBoundingClientRect();
  const R = { l: r.left - 6, t: r.top - 4, w: r.width + 12, h: r.height + 8 };
  const under = dock && dock.height ? Math.max(0, R.t + R.h - dock.top + 2) : 0;
  g.style.cssText = `${tint};left:${Math.round(R.l)}px;top:${Math.round(R.t)}px;width:${Math.round(R.w)}px;height:${Math.round(R.h)}px;border-radius:${Math.max(parseFloat(cs.borderTopLeftRadius) || 0, 12) + 6}px${under ? `;clip-path:inset(-24px -24px ${Math.round(under)}px -24px)` : ''}`;
  document.body.appendChild(g);
  ring = g;
  const p = document.createElement('button');
  p.type = 'button';
  p.className = 'ask-pill glass';
  p.style.cssText = tint;
  p.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5l1.8 5.2 5.2 1.8-5.2 1.8L12 17.5l-1.8-5.2L5 10.5l5.2-1.8zM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/></svg><span></span>`;
  p.querySelector('span')!.textContent = tNow('Ask the Coach');
  p.setAttribute('aria-label', `${tNow('Ask the Coach')}: ${about.label}`);
  document.body.appendChild(p);
  // above what is held, 8 px clear of its ring (below it near the top of the screen), centred on it, inside the screen's
  // 16 px edges
  const w = p.offsetWidth, h = p.offsetHeight, vw = window.innerWidth;
  const cx = r.left + r.width / 2;
  const left = Math.round(Math.min(vw - 16 - w, Math.max(16, cx - w / 2)));
  const above = R.t - h - 8 > 72;
  const top = Math.round(above ? R.t - h - 8 : Math.min(window.innerHeight - h - 16, R.t + R.h + 8));
  p.style.left = `${left}px`; p.style.top = `${top}px`;
  p.style.setProperty('--from', above ? '8px' : '-8px');
  p.addEventListener('click', (e) => {
    e.stopPropagation();
    haptic('light');
    dismissAsk();
    useUI.getState().push('coach', { about });
  });
  pill = p;
  requestAnimationFrame(() => { p.classList.add('on'); g.classList.add('on'); });
  document.addEventListener('pointerdown', outside, true);
  window.addEventListener('scroll', dismissAsk, true);
  // left alone, it steps aside by itself
  const mine = p;
  setTimeout(() => { if (pill === mine) dismissAsk(); }, 6000);
}

function down(e: PointerEvent) {
  if (e.button !== 0 || pid !== -1) return;
  const el = (e.target as Element | null)?.closest?.<HTMLElement>('[data-ask]');
  if (!el) return;
  target = el; pid = e.pointerId; x0 = e.clientX; y0 = e.clientY;
  timer = window.setTimeout(() => { if (target === el) fire(el); }, HOLD);
  window.addEventListener('pointermove', move, true);
  window.addEventListener('pointerup', cancel, true);
  window.addEventListener('pointercancel', cancel, true);
}

function click(e: MouseEvent) {
  if (performance.now() < swallowUntil && !(pill && e.target instanceof Node && pill.contains(e.target))) {
    swallowUntil = 0; e.preventDefault(); e.stopPropagation();
  }
}

let installed = false;
export function installAskHold() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener('pointerdown', down, true);
  document.addEventListener('click', click, true);
  // a long press on a tagged item is ours, not the browser's menu or text selection
  document.addEventListener('contextmenu', (e) => { if ((e.target as Element | null)?.closest?.('[data-ask]')) e.preventDefault(); }, true);
}
