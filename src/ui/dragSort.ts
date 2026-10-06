import { flushSync } from 'react-dom';
import { buzz } from '../state/ui';

/**
 * Drag a card by its grip to reorder a list, the way iOS does: the card lifts (a touch bigger, a deeper shadow) and follows
 * the finger, the others slide aside as it passes their middle (a soft tick each time), and the list scrolls by itself near
 * the top or bottom edge. On release the new order is committed and every card glides from where it was drawn to its new
 * place. Everything moves on transforms: the list is measured once at the start and once at the end.
 *
 * The cards are the `[data-flip]` children of `root`; `move(from, to)` changes the order in state.
 */
export function startDragSort(e: React.PointerEvent, root: HTMLElement | null, id: string, move: (from: number, to: number) => void) {
  if (!root || (e.pointerType === 'mouse' && e.button !== 0)) return;
  const cards = [...root.querySelectorAll<HTMLElement>('[data-flip]')];
  const from = cards.findIndex((c) => c.dataset.flip === id);
  if (from < 0) return;
  e.preventDefault();
  const grip = e.currentTarget as HTMLElement;
  try { grip.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  const scroller = root.closest<HTMLElement>('.sheet-body') ?? document.scrollingElement as HTMLElement;
  const rects = cards.map((c) => c.getBoundingClientRect());
  const card = cards[from];
  // how far the others step aside: the dragged card's height plus the gap below it
  const gap = from < cards.length - 1 ? rects[from + 1].top - rects[from].bottom : from > 0 ? rects[from].top - rects[from - 1].bottom : 10;
  const shift = rects[from].height + gap;
  const mids = rects.map((r) => r.top + r.height / 2);
  const startY = e.clientY, startScroll = scroller.scrollTop;
  let lastY = startY, to = from, raf = 0, done = false;

  card.classList.add('dragging');
  cards.forEach((c, i) => { if (i !== from) c.classList.add('drag-sib'); });
  buzz(8);

  const place = () => {
    const dy = lastY - startY + (scroller.scrollTop - startScroll);
    card.style.transform = `translate3d(0, ${dy.toFixed(1)}px, 0) scale(1.03)`;
    const centre = mids[from] + dy;
    let next = from;
    for (let i = from + 1; i < cards.length; i++) if (centre > mids[i]) next = i;
    for (let i = from - 1; i >= 0; i--) if (centre < mids[i]) next = i;
    if (next !== to) {
      to = next; buzz(5);
      cards.forEach((c, i) => {
        if (i === from) return;
        const off = i > from && i <= to ? -shift : i < from && i >= to ? shift : 0;
        c.style.transform = off ? `translate3d(0, ${off}px, 0)` : '';
      });
    }
  };
  // near the top or bottom edge of the list's scroller, it scrolls by itself (faster the closer you are)
  const tick = () => {
    if (done) return;
    const box = scroller.getBoundingClientRect();
    const edge = 72;
    const v = lastY < box.top + edge ? -(box.top + edge - lastY) / edge : lastY > box.bottom - edge ? (lastY - (box.bottom - edge)) / edge : 0;
    if (v) { const before = scroller.scrollTop; scroller.scrollTop += Math.max(-1, Math.min(1, v)) * 12; if (scroller.scrollTop !== before) place(); }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  const onMove = (ev: PointerEvent) => { if (ev.pointerId !== e.pointerId) return; lastY = ev.clientY; place(); };
  const finish = (ev: PointerEvent) => {
    if (ev.pointerId !== e.pointerId || done) return;
    done = true;
    cancelAnimationFrame(raf);
    grip.removeEventListener('pointermove', onMove);
    grip.removeEventListener('pointerup', finish);
    grip.removeEventListener('pointercancel', finish);
    // where each card is drawn now (lifted, or stepped aside)…
    const was = new Map(cards.map((c) => [c.dataset.flip!, c.getBoundingClientRect().top]));
    cards.forEach((c) => { c.style.transform = ''; c.classList.remove('drag-sib'); });
    if (to !== from) { flushSync(() => move(from, to)); buzz(10); }
    // …and where it belongs now: each one glides the difference; the lifted one settles back to its size as it lands
    for (const c of root.querySelectorAll<HTMLElement>('[data-flip]')) {
      const before = was.get(c.dataset.flip!);
      if (before === undefined) continue;
      const dy = before - c.getBoundingClientRect().top;
      if (c === card) {
        c.animate([{ transform: `translate3d(0, ${dy.toFixed(1)}px, 0) scale(1.03)` }, { transform: 'none' }], { duration: 380, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' })
          .finished.catch(() => {}).finally(() => c.classList.remove('dragging'));
      } else if (Math.abs(dy) > 0.5) {
        c.animate([{ transform: `translate3d(0, ${dy.toFixed(1)}px, 0)` }, { transform: 'none' }], { duration: 300, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
      }
    }
    if (!card.isConnected) card.classList.remove('dragging');
  };
  grip.addEventListener('pointermove', onMove);
  grip.addEventListener('pointerup', finish);
  grip.addEventListener('pointercancel', finish);
}
