import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import { useVisit } from './visit';
import { GENTLE } from './motion';

export interface DialRing { value: number; color: string; label: string; over?: boolean }

/**
 * Concentric progress rings. Each ring draws itself in with a spring (outer first), keeps a soft glow in its own colour,
 * and a faint track underneath. Values are 0..1 (clamped); the centre holds whatever the screen wants to say.
 */
export function Dial({ rings, size = 280, stroke = 13, gap = 9, children, label }: { rings: DialRing[]; size?: number; stroke?: number; gap?: number; children?: ReactNode; label: string }) {
  const reduce = useReducedMotion();
  const visit = useVisit();
  const c = size / 2;
  return (
    <div role="img" aria-label={label} data-fly="kcal" style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
      <svg key={visit} width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute', inset: 0, overflow: 'visible' }} aria-hidden>
        <defs>
          {rings.map((r, i) => (
            <filter key={i} id={`dial-glow-${i}`} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5" /></filter>
          ))}
        </defs>
        {rings.map((r, i) => {
          const rad = c - stroke / 2 - i * (stroke + gap) - 2;
          if (rad <= 0) return null;
          const v = Math.max(0, Math.min(1, r.value));
          const col = r.over ? 'var(--bad)' : r.color;
          const p = { cx: c, cy: c, r: rad, fill: 'none', strokeLinecap: 'round' as const, transform: `rotate(-90 ${c} ${c})` };
          return (
            <g key={i}>
              <circle {...p} stroke="var(--s2)" strokeWidth={stroke} />
              <motion.circle {...p} stroke={col} strokeWidth={stroke + 6} filter={`url(#dial-glow-${i})`} opacity={v > 0 ? 0.55 : 0} initial={{ pathLength: reduce ? v : 0 }} animate={{ pathLength: v }} transition={{ ...GENTLE, delay: reduce ? 0 : 0.15 + i * 0.12 }} />
              <motion.circle {...p} stroke={col} strokeWidth={stroke} opacity={v > 0 ? 1 : 0} initial={{ pathLength: reduce ? v : 0 }} animate={{ pathLength: Math.max(v, v > 0 ? 0.012 : 0) }} transition={{ ...GENTLE, delay: reduce ? 0 : 0.15 + i * 0.12 }} />
            </g>
          );
        })}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>{children}</div>
    </div>
  );
}
