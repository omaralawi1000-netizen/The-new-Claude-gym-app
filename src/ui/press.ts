// The press: every `.press` control sinks under the finger and springs back when it lifts, like a native button.
// CSS `:active` alone misses quick taps (the finger is up before the 80 ms dip shows) and flashes on a finger that is
// starting a scroll. One listener for the whole app instead: a press shows after a short wait (a scroll cancels it
// first), a quick tap still gets a full dip, and the depth is sized to the control (a small icon sinks further than a
// wide card, so both read as the same gentle push). Only `data-pressed` and `--press` are written, on the control itself.

const SEL = '.press:not(.tab)'; // the dock's tabs keep plain CSS :active (see styles.css)
const WAIT = 55;     // ms before a resting finger shows the press (a scroll cancels it inside this window)
const HOLD = 120;    // ms a press stays down at least, so a quick tap still reads
const SLOP = 10;     // px a finger may drift before it counts as a scroll, not a press

let el: HTMLElement | null = null;       // the control under the finger
let held: HTMLElement | null = null;     // a control that was let go, still finishing its dip
let pid = -1, x0 = 0, y0 = 0, shownAt = 0;
let showT = 0, upT = 0;

function show(t: HTMLElement) {
  const r = t.getBoundingClientRect();
  // ~3 px of give on a wide button, ~6 % on a small icon
  const s = 1 - Math.min(0.065, Math.max(0.02, 0.42 / Math.sqrt(Math.max(r.width, r.height, 1))));
  t.style.setProperty('--press', s.toFixed(3));
  t.setAttribute('data-pressed', '');
  shownAt = performance.now();
}

function letGo() {
  if (upT) { clearTimeout(upT); upT = 0; }
  held?.removeAttribute('data-pressed');
  held = null;
}

function end(tap: boolean) {
  window.removeEventListener('pointermove', move, true);
  window.removeEventListener('pointerup', up, true);
  window.removeEventListener('pointercancel', cancel, true);
  const t = el; el = null; pid = -1;
  const waiting = !!showT;
  if (showT) { clearTimeout(showT); showT = 0; }
  if (!t) return;
  if (!tap) { if (!waiting) t.removeAttribute('data-pressed'); return; }
  if (waiting) show(t);                  // a tap quicker than the wait: dip now, so it still reads
  held = t;
  const left = HOLD - (performance.now() - shownAt);
  if (left > 0) upT = window.setTimeout(letGo, left); else letGo();
}

function move(e: PointerEvent) {
  if (e.pointerId !== pid) return;
  if (Math.abs(e.clientX - x0) > SLOP || Math.abs(e.clientY - y0) > SLOP) end(false);
}
function up(e: PointerEvent) { if (e.pointerId === pid) end(true); }
function cancel(e: PointerEvent) { if (e.pointerId === pid) end(false); }

function down(e: PointerEvent) {
  if (!e.isPrimary || e.button > 0) return;
  const t = (e.target as Element | null)?.closest?.(SEL) as HTMLElement | null;
  if (el) end(false);
  if (held && held !== t) letGo();
  else if (held) { clearTimeout(upT); upT = 0; held = null; } // the same control again: it simply stays down
  if (!t || (t as HTMLButtonElement).disabled || t.getAttribute('aria-disabled') === 'true') return;
  el = t; pid = e.pointerId; x0 = e.clientX; y0 = e.clientY;
  // a mouse or pen shows at once; a finger waits a moment in case it is the start of a scroll
  if (e.pointerType === 'touch' && !t.hasAttribute('data-pressed')) showT = window.setTimeout(() => { showT = 0; if (el) show(el); }, WAIT);
  else show(t);
  window.addEventListener('pointermove', move, true);
  window.addEventListener('pointerup', up, true);
  window.addEventListener('pointercancel', cancel, true);
}

export function installPress() {
  if (typeof document === 'undefined') return;
  document.addEventListener('pointerdown', down, { capture: true, passive: true });
}
