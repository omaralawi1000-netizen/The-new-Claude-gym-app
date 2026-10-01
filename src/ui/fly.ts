import { buzz } from '../state/ui';

/**
 * Cause → effect: when something you said is logged and the orb steps aside, a small light flies from where you said it
 * into where it landed — the calorie ring on the screen you are looking at, or the Food / Train tab — and that target
 * gives a soft pulse. Compositor-only (one fixed dot animated with transform/opacity), skipped with reduced motion.
 */
export function flyLogged(kind: 'food' | 'train', from: { x: number; y: number }) {
  const root = document.documentElement.dataset;
  if (root.motion === 'reduce' || (root.motion !== 'full' && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
  const visible = (el: Element | null) => { if (!el) return null; const r = el.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < innerHeight ? el as HTMLElement : null; };
  const target = (kind === 'food' ? visible(document.querySelector('.tab-pane[data-active] [data-fly="kcal"]')) : null)
    ?? visible(document.querySelector(`.tabbar button[aria-label="${kind === 'food' ? 'Food' : 'Train'}"], .tabbar [data-tab="${kind}"]`));
  if (!target) return;
  const r = target.getBoundingClientRect();
  const to = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  const dot = document.createElement('i');
  dot.className = 'fly-dot';
  dot.style.left = `${from.x}px`; dot.style.top = `${from.y}px`;
  document.body.appendChild(dot);
  const dx = to.x - from.x, dy = to.y - from.y;
  // an arc: up and over, then down into the target
  const lift = -Math.min(160, Math.abs(dx) * 0.35 + 70);
  const a = dot.animate([
    { transform: 'translate(-50%, -50%) scale(0.4)', opacity: 0 },
    { transform: `translate(calc(-50% + ${dx * 0.42}px), calc(-50% + ${dy * 0.3 + lift}px)) scale(1.15)`, opacity: 1, offset: 0.42 },
    { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.55)`, opacity: 0.9 },
  ], { duration: 720, easing: 'cubic-bezier(0.45, 0, 0.25, 1)' });
  a.onfinish = () => {
    dot.remove();
    target.classList.remove('fly-hit'); void target.offsetWidth; target.classList.add('fly-hit');
    setTimeout(() => target.classList.remove('fly-hit'), 700);
    buzz(10);
  };
}
