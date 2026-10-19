import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { springCurve, SMOOTH } from './motion';

/**
 * A number that rolls to its new value, like iOS's numeric text: only the digits that changed move, the old one sliding
 * out and the new one in from the side it came from (up when the number grew, down when it shrank), on the app's calm
 * spring. Transform and opacity only, run by the browser; nothing happens per frame on the page. Digits line up from the
 * right, so 99 → 100 rolls the last two and the new first digit simply arrives. Reduced motion: the text just changes.
 */
const reduced = () => document.documentElement.dataset.motion === 'reduce'
  || (document.documentElement.dataset.motion !== 'full' && matchMedia('(prefers-reduced-motion: reduce)').matches);
const digits = (s: string) => Number(s.replace(/[^\d]/g, '')) || 0;

/** (`still`: this change is a catch-up, not a tick (the number was not on screen while it changed): it just shows the new value) */
export function Roll({ text, className, style, still = false }: { text: string; className?: string; style?: CSSProperties; still?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(text);
  useLayoutEffect(() => {
    const was = prev.current; prev.current = text;
    const root = ref.current;
    if (!root || was === text || still || reduced()) return;
    const up = digits(text) >= digits(was);
    const c = springCurve(SMOOTH);
    const opts = { duration: Math.max(420, c.duration), easing: c.easing };
    const d = up ? 1 : -1;
    const cells = root.children;
    for (let i = 0; i < text.length; i++) {
      const old = was[was.length - text.length + i];
      const ch = text[i];
      if (old === ch || !(/\d/.test(ch) || (old !== undefined && /\d/.test(old)))) continue;
      const cell = cells[i] as HTMLElement | undefined;
      const inner = cell?.firstElementChild as HTMLElement | null;
      if (!cell || !inner) continue;
      // held at its end (its plain resting look): a finished roll that let go of its layer left the digit missing for a frame on
      // the phone, once a second while the rest counted down
      inner.animate([{ transform: `translateY(${0.62 * d}em)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { ...opts, fill: 'both' });
      if (old === undefined || old === ' ') continue;
      const ghost = document.createElement('span');
      ghost.className = 'roll-ghost'; ghost.textContent = old; ghost.setAttribute('aria-hidden', 'true');
      cell.appendChild(ghost);
      const a = ghost.animate([{ transform: 'none', opacity: 1 }, { transform: `translateY(${-0.62 * d}em)`, opacity: 0 }], { ...opts, fill: 'forwards' });
      a.onfinish = a.oncancel = () => ghost.remove();
    }
  }, [text]);
  // keyed from the right, so a cell keeps its place value as the number grows or shrinks
  return (
    <span ref={ref} className={`roll num${className ? ` ${className}` : ''}`} style={style} aria-label={text} role="text">
      {[...text].map((ch, i) => <span key={text.length - i} className="roll-c" aria-hidden><span>{ch}</span></span>)}
    </span>
  );
}
