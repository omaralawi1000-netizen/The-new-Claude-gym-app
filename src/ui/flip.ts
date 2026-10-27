/**
 * A reorder that moves smoothly (the workout's Move up / Move down). Where each [data-flip] child of `root` sits is noted,
 * `change` runs, and on the next frame — React has put them in their new order by then — each one slides from its old place
 * to the new one on a transform the compositor runs. Measured once, at the tap; nothing is measured while it moves. (The
 * list used to keep Motion's `layout` on every exercise and set for this, which re-measured the whole page on every change.)
 * `lead`: the [data-flip] id of the item that was moved; it passes over the others (see .flip-lead in styles.css).
 */
export function flip(root: Element | null, change: () => void, ms = 420, lead?: string) {
  const reduce = document.documentElement.dataset.motion === 'reduce'
    || (document.documentElement.dataset.motion !== 'full' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  if (!root || reduce) { change(); return; }
  // (the workout's set outline, setRing.ts, waits out the move: these slides run on transforms nothing else reports)
  root.dispatchEvent(new CustomEvent('flipstart', { detail: ms }));
  const before = new Map<string, number>();
  root.querySelectorAll<HTMLElement>('[data-flip]').forEach((el) => before.set(el.dataset.flip!, el.getBoundingClientRect().top));
  change();
  requestAnimationFrame(() => {
    root.querySelectorAll<HTMLElement>('[data-flip]').forEach((el) => {
      const was = before.get(el.dataset.flip!);
      if (was === undefined) return;
      const dy = was - el.getBoundingClientRect().top;
      if (Math.abs(dy) < 1) return;
      el.animate([{ transform: `translateY(${dy.toFixed(1)}px)` }, { transform: 'none' }], { duration: ms, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
      // the one you moved rides over the others like a lifted iOS row: on top, on a solid backing that fades in and out with
      // the move (the cards are see-through, so without it their texts showed through each other as they passed)
      if (el.dataset.flip === lead) { el.style.setProperty('--flip-ms', `${ms}ms`); el.classList.add('flip-lead'); setTimeout(() => el.classList.remove('flip-lead'), ms + 40); }
    });
  });
}
