import { springCurve, SURFACE } from '../../ui/motion';

/**
 * List ↔ Focus with the card as one object (iOS's shared element): the exercise you're on doesn't fade out of the list and
 * a copy fade in on its page, it glides from where it was to where it lands while everything around it fades. Measured
 * once at the tap and once when the other view is laid out; the glide itself is a transform the compositor runs on the
 * sheets' own spring, so it costs nothing per frame. Skipped (the plain crossfade stays) with reduced motion, or when the
 * card isn't on screen to start from.
 */

const reduced = () => document.documentElement.dataset.motion === 'reduce'
  || (document.documentElement.dataset.motion !== 'full' && matchMedia('(prefers-reduced-motion: reduce)').matches);

/** the card of exercise `id` in the list, and whether enough of it is on screen to glide from */
function listCard(list: HTMLElement, id: string) {
  const el = list.querySelector<HTMLElement>(`[data-flip="${CSS.escape(id)}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect(), v = list.getBoundingClientRect();
  return { el, r, onScreen: r.top < v.bottom - 80 && r.bottom > v.top + 40 };
}

const glide = (el: HTMLElement, dx: number, dy: number) => {
  const c = springCurve(SURFACE);
  el.animate([{ transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)` }, { transform: 'none' }], { duration: c.duration, easing: c.easing });
};

export type Morph = { id: string; x: number; y: number; from: HTMLElement };
// the card hidden while its twin is shown in the other view (one at a time: a new switch shows the last one again)
let hidden: HTMLElement | null = null;
const hide = (el: HTMLElement | null) => { if (hidden && hidden !== el) hidden.style.visibility = ''; hidden = el; if (el) el.style.visibility = 'hidden'; };
// the list item that glided back instead of fading in with the others: it keeps no fade until the next switch (resetting it
// sooner replayed the list's fade on it, and the fade itself stays on the others so their layers aren't dropped as it ends)
let still: HTMLElement | null = null;
const unstill = () => { if (still) still.style.animation = ''; still = null; };

/** At the tap, going to Focus: where the card of `id` sits in the list (null: no glide, crossfade as before). */
export function morphStart(list: HTMLElement | null, id: string | undefined): Morph | null {
  hide(null);
  if (!list || !id || reduced()) return null;
  const c = listCard(list, id);
  return c?.onScreen ? { id, x: c.r.left, y: c.r.top, from: c.el } : null;
}

/** Focus is laid out (and about to be shown): its card starts where the list's was and glides home; the list's one hides. */
export function morphLand(focus: HTMLElement | null, m: Morph) {
  const el = focus?.querySelector<HTMLElement>(`.wk-page.cur [data-flip="${CSS.escape(m.id)}"]`);
  if (!el) return;
  const r = el.getBoundingClientRect();
  hide(m.from);
  if (Math.abs(m.x - r.left) + Math.abs(m.y - r.top) > 1) glide(el, m.x - r.left, m.y - r.top);
}

/**
 * At the tap, going back to the list: the list scrolls (unseen, it is still hidden) so the card waits about where it is on
 * the page, the page's card hides, and the list's glides the rest of the way. Returns false when there is nothing to glide
 * (the list then fades in as before).
 */
export function morphBack(list: HTMLElement | null, focus: HTMLElement | null): boolean {
  unstill();
  const from = focus?.querySelector<HTMLElement>('.wk-page.cur [data-flip]');
  if (!list || !from || reduced()) { hide(null); return false; }
  const id = from.dataset.flip!;
  const f = from.getBoundingClientRect();
  const first = listCard(list, id);
  if (!first) { hide(null); return false; }
  list.scrollTop += first.r.top - f.top;
  const r = first.el.getBoundingClientRect();
  hide(from);
  // everything else in the list fades in; this card is already there
  const item = first.el.closest<HTMLElement>('.wk-list > *');
  if (item) { item.style.animation = 'none'; still = item; }
  if (Math.abs(f.left - r.left) + Math.abs(f.top - r.top) > 1) glide(first.el, f.left - r.left, f.top - r.top);
  return true;
}
