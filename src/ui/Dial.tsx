import { motion, useReducedMotion } from 'motion/react';
import { useId, type ReactNode } from 'react';
import { useVisit } from './visit';
import { GENTLE } from './motion';

export interface DialRing { value: number; color: string; label: string; over?: boolean }

/**
 * Concentric progress rings. Each ring draws itself in with a spring (outer first), keeps a soft glow in its own colour,
 * and sits in a track. A little depth, all of it painted once: the track is a soft groove (a darkening under a faint
 * lift that is lighter at the bottom, as if lit from above), and a filled ring is a rounded tube (its colour a touch
 * lighter at the top and deeper at the bottom, with a thin soft highlight along its outer edge). Only pathLength
 * moves, as before; the shading rides with it. Values are 0..1 (clamped); the centre holds whatever the screen wants to say.
 */
export function Dial({ rings, size = 280, stroke = 13, gap = 9, children, label }: { rings: DialRing[]; size?: number; stroke?: number; gap?: number; children?: ReactNode; label: string }) {
  const reduce = useReducedMotion();
  const visit = useVisit();
  const c = size / 2;
  const ids = useId().replace(/:/g, '');
  return (
    <div role="img" aria-label={label} data-fly="kcal" style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
      <svg key={visit} width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute', inset: 0, overflow: 'visible' }} aria-hidden>
        <defs>
          {rings.map((r, i) => (
            <filter key={i} id={`dial-glow-${i}`} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5" /></filter>
          ))}
          {/* top-to-bottom light, in the dial's own space: the groove is lit at the bottom, a tube at the top */}
          <linearGradient id={`${ids}-trk`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={size}>
            <stop offset="0" style={{ stopColor: 'var(--ring-lift-top)' }} />
            <stop offset="1" style={{ stopColor: 'var(--ring-lift-bot)' }} />
          </linearGradient>
          {rings.map((r, i) => {
            const col = r.over ? 'var(--bad)' : r.color;
            return (
              <linearGradient key={i} id={`${ids}-tube-${i}`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={size}>
                <stop offset="0" style={{ stopColor: `color-mix(in srgb, ${col} 90%, #fff)` }} />
                <stop offset="0.5" style={{ stopColor: col }} />
                <stop offset="1" style={{ stopColor: `color-mix(in srgb, ${col} var(--ring-deep), #000)` }} />
              </linearGradient>
            );
          })}
        </defs>
        {rings.map((r, i) => {
          const rad = c - stroke / 2 - i * (stroke + gap) - 2;
          if (rad <= 0) return null;
          const v = Math.max(0, Math.min(1, r.value));
          const col = r.over ? 'var(--bad)' : r.color;
          const p = { cx: c, cy: c, r: rad, fill: 'none', strokeLinecap: 'round' as const, transform: `rotate(-90 ${c} ${c})` };
          const t = { ...GENTLE, delay: reduce ? 0 : 0.15 + i * 0.12 };
          const len = Math.max(v, v > 0 ? 0.012 : 0);
          const hi = stroke * 0.26; // the highlight's width, along the outer half of the tube
          return (
            <g key={i}>
              <circle {...p} stroke="var(--ring-groove)" strokeWidth={stroke} />
              <circle {...p} stroke={`url(#${ids}-trk)`} strokeWidth={stroke} />
              <circle {...p} r={rad + stroke / 2 - 0.6} stroke="var(--ring-rim)" strokeWidth={1.2} />
              <motion.circle {...p} stroke={col} strokeWidth={stroke + 6} filter={`url(#dial-glow-${i})`} opacity={v > 0 ? 0.55 : 0} initial={{ pathLength: reduce ? v : 0 }} animate={{ pathLength: v }} transition={t} />
              <motion.circle {...p} stroke={`url(#${ids}-tube-${i})`} strokeWidth={stroke} opacity={v > 0 ? 1 : 0} initial={{ pathLength: reduce ? v : 0 }} animate={{ pathLength: len }} transition={t} />
              <motion.circle {...p} r={rad + stroke * 0.2} stroke="var(--ring-shine)" strokeWidth={hi} opacity={v > 0 ? 1 : 0} initial={{ pathLength: reduce ? v : 0 }} animate={{ pathLength: len }} transition={t} />
            </g>
          );
        })}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>{children}</div>
    </div>
  );
}
