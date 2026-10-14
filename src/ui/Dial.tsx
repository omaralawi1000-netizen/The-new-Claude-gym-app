import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useVisit } from './visit';
import { GENTLE } from './motion';

export interface DialRing { value: number; color: string; label: string; over?: boolean }

/**
 * Concentric progress rings, built like Apple's Activity rings. Each ring sits in a track of its own colour (dim, carved
 * in: darker along the inside of the groove). The fill is a rounded tube whose colour deepens at the start and brightens
 * towards the leading end (a gradient along the ring, with a faint dither so it never steps), lit along its outer edge
 * and a touch deeper on its inner one, and the leading end casts a small soft shadow onward onto the track (and onto the
 * ring's own start when it is full). Everything is painted once; only the fill's length and its end's shadow move, on the
 * same spring as before (outer ring first). Values are 0..1 (clamped); the centre holds whatever the screen wants to say.
 */
export function Dial({ rings, size = 280, stroke = 13, gap = 9, children, label }: { rings: DialRing[]; size?: number; stroke?: number; gap?: number; children?: ReactNode; label: string }) {
  const visit = useVisit();
  const c = size / 2;
  const ids = useId().replace(/:/g, '');
  return (
    <div role="img" aria-label={label} data-fly="kcal" style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
      <svg key={visit} width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute', inset: 0, overflow: 'visible' }} aria-hidden>
        {rings.map((r, i) => {
          const rad = c - stroke / 2 - i * (stroke + gap) - 2;
          return rad > 0 ? <Ring key={i} i={i} ring={r} c={c} rad={rad} stroke={stroke} size={size} id={`${ids}-${i}`} /> : null;
        })}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>{children}</div>
    </div>
  );
}

function Ring({ i, ring, c, rad, stroke, size, id }: { i: number; ring: DialRing; c: number; rad: number; stroke: number; size: number; id: string }) {
  const reduce = useReducedMotion();
  const v = Math.max(0, Math.min(1, ring.value));
  const col = ring.over ? 'var(--bad)' : ring.color;
  const prog = useMotionValue(reduce ? v : 0);
  const len = useTransform(prog, (p) => Math.max(p, p > 0 ? 0.012 : 0));
  const cap = useRef<SVGCircleElement>(null), head = useRef<SVGGElement>(null);
  const R = rad + stroke / 2, r0 = rad - stroke / 2;
  // the leading end's shadow: a soft round shade just ahead of the end, moved with the fill (two attributes, no layout)
  useEffect(() => {
    const ahead = (stroke * 0.85) / rad;
    const place = (p: number) => {
      const a = Math.max(p, 0.012) * Math.PI * 2;
      cap.current?.setAttribute('cx', String(c + rad * Math.sin(a + ahead)));
      cap.current?.setAttribute('cy', String(c - rad * Math.cos(a + ahead)));
      head.current?.setAttribute('transform', `rotate(${(a * 180) / Math.PI} ${c} ${c})`);
    };
    place(prog.get());
    const off = prog.on('change', place);
    const ctl = reduce ? null : animate(prog, v, { ...GENTLE, delay: 0.15 + i * 0.12 });
    if (reduce) prog.set(v);
    return () => { off(); ctl?.stop(); };
  }, [v, reduce, i, c, rad, stroke, prog]);
  const p = { cx: c, cy: c, r: rad, fill: 'none', strokeLinecap: 'round' as const, transform: `rotate(-90 ${c} ${c})` };
  const span = Math.max(v, 0.3) * 360;
  return (
    <g>
      <defs>
        <filter id={`${id}-glow`} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5" /></filter>
        {/* the groove: darker along its inside, a little along its outer lip, clear in the middle */}
        <radialGradient id={`${id}-groove`} gradientUnits="userSpaceOnUse" cx={c} cy={c} r={R}>
          <stop offset={r0 / R} style={{ stopColor: 'var(--ring-in)' }} />
          <stop offset={(rad - stroke * 0.05) / R} style={{ stopColor: 'var(--ring-in)', stopOpacity: 0 }} />
          <stop offset={(rad + stroke * 0.25) / R} style={{ stopColor: 'var(--ring-out)', stopOpacity: 0 }} />
          <stop offset="1" style={{ stopColor: 'var(--ring-out)' }} />
        </radialGradient>
        {/* the tube: deeper along its inner edge, lit along its outer one */}
        <radialGradient id={`${id}-tube`} gradientUnits="userSpaceOnUse" cx={c} cy={c} r={R}>
          <stop offset={r0 / R} style={{ stopColor: 'var(--ring-tube-in)' }} />
          <stop offset={(rad - stroke * 0.1) / R} style={{ stopColor: 'var(--ring-tube-in)', stopOpacity: 0 }} />
          <stop offset={(rad + stroke * 0.05) / R} style={{ stopColor: 'var(--ring-tube-out)', stopOpacity: 0 }} />
          <stop offset="1" style={{ stopColor: 'var(--ring-tube-out)' }} />
        </radialGradient>
        <radialGradient id={`${id}-cap`}>
          <stop offset="0" style={{ stopColor: 'var(--ring-cap)' }} />
          <stop offset="1" style={{ stopColor: 'var(--ring-cap)', stopOpacity: 0 }} />
        </radialGradient>
        <mask id={`${id}-arc`} maskUnits="userSpaceOnUse" x="0" y="0" width={size} height={size}>
          <motion.circle {...p} stroke="#fff" strokeWidth={stroke} style={{ pathLength: len }} />
        </mask>
        <mask id={`${id}-band`} maskUnits="userSpaceOnUse" x="0" y="0" width={size} height={size}>
          <circle {...p} stroke="#fff" strokeWidth={stroke} />
        </mask>
      </defs>
      <circle {...p} stroke={`color-mix(in oklab, ${col} var(--ring-trk-k), var(--ring-trk-base))`} strokeWidth={stroke} />
      <circle {...p} stroke={`url(#${id}-groove)`} strokeWidth={stroke} />
      <motion.circle {...p} stroke={col} strokeWidth={stroke + 6} filter={`url(#${id}-glow)`} opacity={v > 0 ? 0.5 : 0} style={{ pathLength: prog }} />
      <g mask={`url(#${id}-arc)`} opacity={v > 0 ? 1 : 0}>
        <foreignObject x="0" y="0" width={size} height={size}>
          <div style={{ width: '100%', height: '100%', background: `var(--ring-dither), conic-gradient(color-mix(in oklab, ${col} var(--ring-deep), #000) 0deg, ${col} ${span * 0.55}deg, color-mix(in oklab, ${col} var(--ring-bright), #fff) ${span}deg, color-mix(in oklab, ${col} var(--ring-bright), #fff) 360deg)` }} />
        </foreignObject>
        <circle {...p} stroke={`url(#${id}-tube)`} strokeWidth={stroke} />
      </g>
      <g mask={`url(#${id}-band)`} opacity={v > 0 ? 1 : 0}>
        <circle ref={cap} r={stroke * 0.7} fill={`url(#${id}-cap)`} />
      </g>
      {/* the leading end drawn again on top, so once the ring is full its end lies over its start, with the shadow under it */}
      <g ref={head} opacity={v > 0 ? 1 : 0}>
        <circle cx={c} cy={c - rad} r={stroke / 2} fill={`color-mix(in oklab, ${col} var(--ring-bright), #fff)`} />
        <circle cx={c} cy={c - rad} r={stroke / 2} fill={`url(#${id}-tube)`} />
      </g>
    </g>
  );
}
