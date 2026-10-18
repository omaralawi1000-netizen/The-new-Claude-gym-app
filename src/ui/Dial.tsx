import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
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
  const svg = useRef<SVGSVGElement>(null);
  // Chrome kept every ring that left the page (a <foreignObject> in an <svg> going away with it) and with it the whole tab
  // it was on: ~240 nodes and 13 listeners per tab switch, for good. Emptied and taken out first, they are let go (React
  // has already removed the old copy on a re-visit, so this only ever empties a node no longer shown).
  useLayoutEffect(() => { const el = svg.current; return () => { el?.querySelectorAll('foreignObject').forEach((f) => f.replaceChildren()); el?.replaceChildren(); el?.remove(); }; }, [visit]);
  return (
    <div role="img" aria-label={label} data-fly="kcal" style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
      <svg ref={svg} key={visit} width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute', inset: 0, overflow: 'visible' }} aria-hidden>
        {rings.map((r, i) => {
          const rad = c - stroke / 2 - i * (stroke + gap) - 2;
          return rad > 0 ? <Ring key={i} i={i} ring={r} c={c} rad={rad} stroke={stroke} size={size} id={`${ids}-${i}`} /> : null;
        })}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>{children}</div>
    </div>
  );
}

/** which way a ring's colour turns along its length, like Apple's (pink → magenta, lime → yellow-green, teal → cyan-blue):
 *  +1 = towards higher hue, -1 = lower. `t` = extra hue for the empty track (teals lean a little towards cyan). */
function turn(css: string): { s: number; t: number; y: boolean } {
  const m = css.match(/[\d.]+/g);
  if (!m || m.length < 3) return { s: 1, t: 0, y: false };
  let h: number;
  if (css.startsWith('oklch')) h = +m[2];
  else {
    const [r, g, b] = m.slice(0, 3).map((x) => { const v = +x / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), mm = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), q = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    h = (Math.atan2(0.0259040371 * l + 0.7827717662 * mm - 0.808675766 * q, 1.9779984951 * l - 2.428592205 * mm + 0.4505937099 * q) * 180) / Math.PI;
  }
  h = (h + 360) % 360;
  // y: yellows and oranges, whose dark track can't hold much colour without turning brown (kept inside the screen's gamut)
  return { s: (h >= 105 && h < 150) || h >= 330 || h < 40 ? -1 : 1, t: h >= 150 && h < 250 ? 8 : 0, y: h >= 55 && h < 110 };
}

function Ring({ i, ring, c, rad, stroke, size, id }: { i: number; ring: DialRing; c: number; rad: number; stroke: number; size: number; id: string }) {
  const reduce = useReducedMotion();
  const v = Math.max(0, Math.min(1, ring.value));
  const col = ring.over ? 'var(--bad)' : ring.color;
  const prog = useMotionValue(reduce ? v : 0);
  const len = useTransform(prog, (p) => Math.max(p, p > 0 ? 0.012 : 0));
  const root = useRef<SVGGElement>(null), cap = useRef<SVGCircleElement>(null), lap = useRef<SVGGElement>(null), head = useRef<SVGGElement>(null);
  const [{ s, t, y }, setTurn] = useState({ s: 1, t: 0, y: false });
  // read the ring's real colour once (and again if the palette or theme changes) to know which way its hue turns
  useLayoutEffect(() => {
    const read = () => { const el = root.current; if (el) { const n = turn(getComputedStyle(el).color); setTurn((o) => (o.s === n.s && o.t === n.t && o.y === n.y ? o : n)); } };
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-palette', 'data-theme'] });
    return () => mo.disconnect();
  }, [col]);
  const R = rad + stroke / 2, r0 = rad - stroke / 2;
  // the leading end's shadow: a soft round shade half a band ahead of the end, moved with the fill (attributes only, no
  // layout). Once the ring is full the end is drawn again over its start, with the shadow falling on the ring itself.
  useEffect(() => {
    const ahead = (stroke * 0.5) / rad;
    const place = (p: number) => {
      const a = Math.max(p, 0.012) * Math.PI * 2;
      cap.current?.setAttribute('cx', String(c + rad * Math.sin(a + ahead)));
      cap.current?.setAttribute('cy', String(c - rad * Math.cos(a + ahead)));
      const full = p >= 0.985 ? '1' : '0';
      for (const el of [head.current, lap.current]) { el?.setAttribute('transform', `rotate(${(a * 180) / Math.PI} ${c} ${c})`); el?.setAttribute('opacity', full); }
    };
    place(prog.get());
    const off = prog.on('change', place);
    const ctl = reduce ? null : animate(prog, v, { ...GENTLE, delay: 0.15 + i * 0.12 });
    if (reduce) prog.set(v);
    return () => { off(); ctl?.stop(); };
  }, [v, reduce, i, c, rad, stroke, prog]);
  const p = { cx: c, cy: c, r: rad, fill: 'none', strokeLinecap: 'round' as const, transform: `rotate(-90 ${c} ${c})` };
  // colours, all mixed in OKLCH in the ring's own hue: a start no darker than the plain colour, a brighter end turned
  // ~12° along the hue (the depth comes from the turn, not from darkening), a dim carved track
  const start = `oklch(from ${col} calc(l - var(--ring-dl0)) c calc(h - ${6 * s}))`;
  const end = `oklch(from ${col} min(calc(l + var(--ring-dl1)), .97) calc(c * var(--ring-dc1)) calc(h + ${6 * s}))`;
  const track = y
    ? `oklch(from ${col} var(--ring-trk-yl, var(--ring-trk-l)) min(calc(c * var(--ring-trk-cm)), var(--ring-trk-yc, var(--ring-trk-c))) h)`
    : `oklch(from ${col} var(--ring-trk-l) min(calc(c * var(--ring-trk-cm)), var(--ring-trk-c)) calc(h + ${t}))`;
  const shade = `oklch(from ${col} calc(l - .25) c h)`;
  // the gradient never wraps: short of full, the few degrees behind the start (its round cap) hold the start colour
  const span = Math.max(v, 0.3) * 360, o = v >= 1 ? 0 : 6;
  return (
    <g ref={root} style={{ color: col }}>
      <defs>
        <filter id={`${id}-glow`} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5" /></filter>
        {/* the groove: darker along its inside (in the ring's own hue on light), a little along its outer lip, clear in the middle */}
        <radialGradient id={`${id}-groove`} gradientUnits="userSpaceOnUse" cx={c} cy={c} r={R}>
          <stop offset={r0 / R} style={{ stopColor: `oklch(from ${col} var(--ring-in-l) var(--ring-in-c) h / var(--ring-in-a))` }} />
          <stop offset={(rad - stroke * 0.05) / R} style={{ stopColor: `oklch(from ${col} var(--ring-in-l) var(--ring-in-c) h / 0)` }} />
          <stop offset={(rad + stroke * 0.25) / R} style={{ stopColor: 'var(--ring-out)', stopOpacity: 0 }} />
          <stop offset="1" style={{ stopColor: 'var(--ring-out)' }} />
        </radialGradient>
        {/* the tube: a touch deeper along its inner edge, lit along its outer one */}
        <radialGradient id={`${id}-tube`} gradientUnits="userSpaceOnUse" cx={c} cy={c} r={R}>
          <stop offset={r0 / R} style={{ stopColor: 'var(--ring-tube-in)' }} />
          <stop offset={(rad - stroke * 0.1) / R} style={{ stopColor: 'var(--ring-tube-in)', stopOpacity: 0 }} />
          <stop offset={(rad + stroke * 0.05) / R} style={{ stopColor: 'var(--ring-tube-out)', stopOpacity: 0 }} />
          <stop offset="1" style={{ stopColor: 'var(--ring-tube-out)' }} />
        </radialGradient>
        {/* a soft round shade (a blurred disc): neutral on the track, the ring's own darker hue on the ring */}
        <radialGradient id={`${id}-cap`}>
          <stop offset="0" style={{ stopColor: 'var(--ring-cap)' }} />
          <stop offset=".4" style={{ stopColor: 'var(--ring-cap)', stopOpacity: 0.75 }} />
          <stop offset=".75" style={{ stopColor: 'var(--ring-cap)', stopOpacity: 0.25 }} />
          <stop offset="1" style={{ stopColor: 'var(--ring-cap)', stopOpacity: 0 }} />
        </radialGradient>
        <radialGradient id={`${id}-lap`}>
          <stop offset="0" style={{ stopColor: shade, stopOpacity: 0.35 }} />
          <stop offset=".4" style={{ stopColor: shade, stopOpacity: 0.26 }} />
          <stop offset=".75" style={{ stopColor: shade, stopOpacity: 0.09 }} />
          <stop offset="1" style={{ stopColor: shade, stopOpacity: 0 }} />
        </radialGradient>
        <mask id={`${id}-arc`} maskUnits="userSpaceOnUse" x="0" y="0" width={size} height={size}>
          <motion.circle {...p} stroke="#fff" strokeWidth={stroke} style={{ pathLength: len }} />
        </mask>
        <mask id={`${id}-band`} maskUnits="userSpaceOnUse" x="0" y="0" width={size} height={size}>
          <circle {...p} stroke="#fff" strokeWidth={stroke} />
        </mask>
        <mask id={`${id}-end`} maskUnits="userSpaceOnUse" x="0" y="0" width={size} height={size}>
          <circle cx={c} cy={c - rad} r={stroke / 2} fill="#fff" />
        </mask>
      </defs>
      <circle {...p} style={{ stroke: track }} strokeWidth={stroke} />
      <circle {...p} stroke={`url(#${id}-groove)`} strokeWidth={stroke} />
      <motion.circle {...p} stroke={col} strokeWidth={stroke + 6} filter={`url(#${id}-glow)`} style={{ pathLength: prog, opacity: v > 0 ? 'var(--ring-glow)' : 0 }} />
      <g mask={`url(#${id}-band)`} opacity={v > 0 ? 1 : 0}>
        <circle ref={cap} r={stroke * 0.75} fill={`url(#${id}-cap)`} />
      </g>
      <g mask={`url(#${id}-arc)`} opacity={v > 0 ? 1 : 0}>
        <foreignObject x="0" y="0" width={size} height={size}>
          <div style={{ width: '100%', height: '100%', background: `var(--ring-dither), conic-gradient(from ${-o}deg, ${start} 0deg, ${start} ${o}deg, ${col} ${o + span * 0.55}deg, ${end} ${o + span}deg, ${end} 360deg)` }} />
        </foreignObject>
        <circle {...p} stroke={`url(#${id}-tube)`} strokeWidth={stroke} />
        {/* full: the end's shade falls on the ring's own start */}
        <g ref={lap} opacity="0"><circle cx={c + stroke * 0.5} cy={c - rad} r={stroke * 0.75} fill={`url(#${id}-lap)`} /></g>
      </g>
      {/* full: the end drawn again on top, in the gradient's exact end colour with the same dither and tube shading, so it lies over the start */}
      <g ref={head} opacity="0">
        <g mask={`url(#${id}-end)`}>
          <foreignObject x="0" y="0" width={size} height={size}><div style={{ width: '100%', height: '100%', background: `var(--ring-dither), ${end}` }} /></foreignObject>
          <circle {...p} stroke={`url(#${id}-tube)`} strokeWidth={stroke} />
        </g>
      </g>
    </g>
  );
}
