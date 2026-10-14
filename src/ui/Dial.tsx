import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useVisit } from './visit';
import { apple } from './motion';

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
      {/* one tight, soft, static shadow under the whole set: painted once, never animated */}
      <div aria-hidden style={{ position: 'absolute', inset: 2, borderRadius: '50%', boxShadow: 'var(--ring-shadow)', pointerEvents: 'none' }} />
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

/** which way a ring's colour turns along its length, like Apple's (pink → magenta, lime → yellow-green, teal → cyan-blue):
 *  +1 = towards higher hue, -1 = lower. `t` = extra hue for the empty track (teals lean a little towards cyan). */
function turn(css: string): { s: number; t: number; y: boolean; g: boolean } {
  const m = css.match(/[\d.]+/g);
  if (!m || m.length < 3) return { s: 1, t: 0, y: false, g: false };
  let h: number;
  if (css.startsWith('oklch')) h = +m[2];
  else {
    const [r, g, b] = m.slice(0, 3).map((x) => { const v = +x / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), mm = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), q = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    h = (Math.atan2(0.0259040371 * l + 0.7827717662 * mm - 0.808675766 * q, 1.9779984951 * l - 2.428592205 * mm + 0.4505937099 * q) * 180) / Math.PI;
  }
  h = (h + 360) % 360;
  // y: yellows and oranges, whose dark track can't hold much colour without turning brown (kept inside the screen's gamut)
  // g: limes and greens, which turn only a little and take no extra colour (more turns them acid)
  return { s: (h >= 105 && h < 150) || h >= 330 || h < 40 ? -1 : 1, t: h >= 150 && h < 250 ? 8 : 0, y: h >= 55 && h < 110, g: h >= 105 && h < 150 };
}

function Ring({ i, ring, c, rad, stroke, size, id }: { i: number; ring: DialRing; c: number; rad: number; stroke: number; size: number; id: string }) {
  const reduce = useReducedMotion();
  const v = Math.max(0, Math.min(2, ring.value));
  const col = ring.over ? 'var(--bad)' : ring.color;
  const prog = useMotionValue(reduce ? v : 0);
  const len = useTransform(prog, (p) => Math.min(1, Math.max(p, p > 0 ? 0.012 : 0)));
  // past 100 % the ring carries on round a second lap over the first: the part of the one progress value above 1
  const len2 = useTransform(prog, (p) => Math.min(1, Math.max(0, p - 1)));
  // the gloss: a soft stripe on the outer half of the tube, its own round-ended arc that stops short of the tip so it
  // follows the rounded end instead of being cut by it. It joins up into one full circle as the ring closes and stays one
  // circle above both laps, so nothing marks the seam.
  const gw = stroke * 0.36, gr = rad + stroke * 0.2, gAng = (stroke * 0.42 + gw / 2) / gr / (2 * Math.PI);
  const closing = (p: number) => Math.max(0, Math.min(1, (Math.min(p, 1) - 0.9) / 0.1));
  const gLen = useTransform(prog, (p) => { const q = Math.min(p, 1), k = closing(p); return Math.max(0, q - 2 * gAng * (1 - k)); });
  const gOff = useTransform(prog, (p) => gAng * (1 - closing(p)));
  const root = useRef<SVGGElement>(null), cap = useRef<SVGCircleElement>(null), lap = useRef<SVGGElement>(null), head = useRef<SVGGElement>(null), hl = useRef<SVGCircleElement>(null), lap2 = useRef<SVGGElement>(null), tip2 = useRef<SVGGElement>(null), shade2 = useRef<SVGCircleElement>(null), arcG = useRef<SVGGElement>(null), gloss1 = useRef<SVGCircleElement>(null);
  const closed = useRef(false), armed = useRef(false);
  const [{ s, t, y, g }, setTurn] = useState({ s: 1, t: 0, y: false, g: false });
  // read the ring's real colour once (and again if the palette or theme changes) to know which way its hue turns
  useLayoutEffect(() => {
    const read = () => { const el = root.current; if (el) { const n = turn(getComputedStyle(el).color); setTurn((o) => (o.s === n.s && o.t === n.t && o.y === n.y && o.g === n.g ? o : n)); } };
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-palette', 'data-theme'] });
    return () => mo.disconnect();
  }, [col]);
  const R = rad + stroke / 2, r0 = rad - stroke / 2;
  // the leading end's shade: a small black, contained darkening just ahead of the end on a plain track (nothing lighter,
  // nothing wider than the band). Past 100 % the track is covered, and the second lap's tip shades the first lap instead.
  useEffect(() => {
    const ahead = (stroke * 0.3) / rad;
    const clamp = (x: number) => Math.max(0, Math.min(1, x));
    // the closing moment: one narrow glint runs once round the ring (nothing else brightens) and the ring swells a hair
    const shine = { t: 0 }, swell = { s: 0 };
    const paintShine = () => {
      const k = shine.t;
      hl.current?.setAttribute('transform', `rotate(${(k * 360) % 360} ${c} ${c})`);
      hl.current?.setAttribute('opacity', String(k > 0 && k < 1 ? Math.sin(Math.PI * k) * 0.75 : 0));
    };
    const paintSwell = () => arcG.current?.setAttribute('transform', `translate(${c} ${c}) scale(${1 + swell.s * 0.014}) translate(${-c} ${-c})`);
    const controls: { stop: () => void }[] = [];
    const close = () => {
      if (reduce) return;
      controls.push(animate(0, 1, { duration: 1.5, ease: [0.45, 0.05, 0.3, 1], onUpdate: (k) => { shine.t = k; paintShine(); }, onComplete: () => { shine.t = 0; paintShine(); } }));
      controls.push(animate(0, [0, 1, 0], { duration: 1.7, times: [0, 0.3, 1], ease: 'easeInOut', onUpdate: (k) => { swell.s = k; paintSwell(); }, onComplete: () => { swell.s = 0; paintSwell(); } }));
    };
    const place = (p: number) => {
      const a = Math.max(p, 0.012) * Math.PI * 2;
      cap.current?.setAttribute('cx', String(c + rad * Math.sin(a + ahead)));
      cap.current?.setAttribute('cy', String(c - rad * Math.cos(a + ahead)));
      cap.current?.setAttribute('opacity', p < 0.97 && p > 0 ? '1' : '0');
      const deg = (Math.min(p, 1) * 360).toFixed(3);
      // the end's shade on the ring's own start fades in as the end closes in on it
      lap.current?.setAttribute('opacity', String(clamp((Math.min(p, 1) - 0.88) / 0.12)));
      head.current?.setAttribute('transform', `rotate(${deg} ${c} ${c})`); head.current?.setAttribute('opacity', p >= 0.985 ? '1' : '0');
      lap.current?.setAttribute('transform', `rotate(${deg} ${c} ${c})`);
      gloss1.current?.setAttribute('stroke-linecap', p >= 0.999 ? 'butt' : 'round');
      // second lap: its tip (a round end) rides the angle exactly, and a small crisp shade falls ahead of it onto the first lap
      const q = clamp(p - 1), qa = q * Math.PI * 2;
      lap2.current?.setAttribute('opacity', q > 0 ? '1' : '0');
      tip2.current?.setAttribute('transform', `rotate(${(q * 360).toFixed(3)} ${c} ${c})`);
      shade2.current?.setAttribute('opacity', String(clamp(q * 30)));
      shade2.current?.setAttribute('cx', String(c + rad * Math.sin(qa + ahead)));
      shade2.current?.setAttribute('cy', String(c - rad * Math.cos(qa + ahead)));
    };
    // a narrow glint rides just behind the leading end while it travels (on the fill only), brighter the faster it goes, and is gone at rest
    const ride = (p: number) => {
      if (shine.t > 0) return;
      const sp = Math.abs(prog.getVelocity());
      hl.current?.setAttribute('transform', `rotate(${(Math.min(p, 1) * 360 - 3).toFixed(3)} ${c} ${c})`);
      hl.current?.setAttribute('opacity', String(p >= 1 ? 0 : Math.max(0, Math.min(0.5, (sp - 0.04) * 0.9))));
    };
    place(prog.get());
    const off = prog.on('change', (p) => {
      place(p); ride(p);
      if (p >= 0.995 && !closed.current && armed.current) { closed.current = true; close(); }
      else if (p < 0.9) closed.current = false;
    });
    // first draw: outer ring first, each a touch after the last; later changes (a food logged) grow from where the ring is
    // now, nearly together; a ring that closes on the way gets the closing moment. One spring on the whole progress (both
    // laps), run until it is truly still (the default stops a few degrees short and hops).
    // (a ring still at zero is drawing in; a ring that already shows something is growing)
    const first = prog.get() < 0.001;
    const fine = { restDelta: 0.0004, restSpeed: 0.002 };
    const ctl = reduce ? null : animate(prog, v, first ? { ...(v >= 0.97 ? apple(1.35, 0) : apple(1.35, 0.16)), ...fine, delay: 0.2 + i * 0.14 } : { ...(v >= 0.97 ? apple(1.0, 0) : apple(1.0, 0.14)), ...fine, delay: i * 0.05 });
    // the closing moment is for a ring that closes because you logged something, not for every drawing-in
    ctl?.then(() => { hl.current?.setAttribute('opacity', '0'); if (first) { armed.current = true; closed.current = v >= 0.995; } });
    if (!first) armed.current = true;
    if (reduce) { prog.set(v); closed.current = v >= 0.995; }
    return () => { off(); ctl?.stop(); controls.forEach((x) => x.stop()); };
  }, [v, reduce, i, c, rad, stroke, prog]);
  const p = { cx: c, cy: c, r: rad, fill: 'none', strokeLinecap: 'round' as const, transform: `rotate(-90 ${c} ${c})` };
  // colours, all mixed in OKLCH in the ring's own hue: a deep start, a brighter end turned a few degrees along the hue,
  // a dim flat track. Yellows start less deep (deeper turns ochre), limes take no extra colour (it turns them acid).
  const start = `oklch(from ${col} calc(l - var(--ring-dl0) * ${y ? 0.55 : 1}) calc(c * var(--ring-dcs)) calc(h - ${(g ? 3 : 6) * s}))`;
  const end = `oklch(from ${col} min(calc(l + var(--ring-dl1)), .92) calc(c * ${g ? 1 : 'var(--ring-dc1)'}) calc(h + ${(g ? 3 : 6) * s}))`;
  const track = y
    ? `oklch(from ${col} var(--ring-trk-yl, var(--ring-trk-l)) min(calc(c * var(--ring-trk-cm)), var(--ring-trk-yc, var(--ring-trk-c))) h)`
    : `oklch(from ${col} var(--ring-trk-l) min(calc(c * var(--ring-trk-cm)), var(--ring-trk-c)) calc(h + ${t}))`;
  const shade = `oklch(from ${col} calc(l - .25) c h)`;
  // the gradient never wraps: short of full, the few degrees behind the start (its round cap) hold the start colour
  const span = Math.max(Math.min(v, 1), 0.3) * 360, o = v >= 1 ? 0 : 6;
  // the second lap carries on from the first lap's end colour a little brighter: the light keeps rising, the hue keeps turning
  const end2 = `oklch(from ${col} min(calc(l + var(--ring-dl1) + .03), .93) calc(c * ${g ? 1 : 'var(--ring-dc1)'}) calc(h + ${(g ? 4 : 8) * s}))`;
  const lapShade = `oklch(from ${col} calc(l - .42) c h)`;
  const glossArc = (ref: React.Ref<SVGCircleElement>, length: typeof gLen, offset: typeof gOff) => (
    <motion.circle ref={ref} {...p} r={gr} stroke={`url(#${id}-gloss)`} strokeWidth={gw} style={{ pathLength: length, pathOffset: offset }} />
  );
  return (
    <g ref={root} style={{ color: col }}>
      <defs>
        {/* the groove: a thin, crisp shade along the track's inside edge only, the rest of the band stays flat */}
        <radialGradient id={`${id}-groove`} gradientUnits="userSpaceOnUse" cx={c} cy={c} r={R}>
          <stop offset={r0 / R} style={{ stopColor: `oklch(from ${col} var(--ring-in-l) var(--ring-in-c) h / var(--ring-in-a))` }} />
          <stop offset={(r0 + stroke * 0.2) / R} style={{ stopColor: `oklch(from ${col} var(--ring-in-l) var(--ring-in-c) h / 0)` }} />
          <stop offset="1" style={{ stopColor: `oklch(from ${col} var(--ring-in-l) var(--ring-in-c) h / 0)` }} />
        </radialGradient>
        {/* the tube: a touch deeper along its inner edge, lit along its outer one */}
        <radialGradient id={`${id}-tube`} gradientUnits="userSpaceOnUse" cx={c} cy={c} r={R}>
          <stop offset={r0 / R} style={{ stopColor: 'var(--ring-tube-in)' }} />
          <stop offset={(rad - stroke * 0.1) / R} style={{ stopColor: 'var(--ring-tube-in)', stopOpacity: 0 }} />
          <stop offset={(rad + stroke * 0.05) / R} style={{ stopColor: 'var(--ring-tube-out)', stopOpacity: 0 }} />
          <stop offset="1" style={{ stopColor: 'var(--ring-tube-out)' }} />
        </radialGradient>
        {/* the gloss: soft across its width (it fades to nothing at both sides), and lit from the top only */}
        <radialGradient id={`${id}-gloss`} gradientUnits="userSpaceOnUse" cx={c} cy={c} r={gr + gw / 2}>
          <stop offset={(gr - gw / 2) / (gr + gw / 2)} style={{ stopColor: '#fff', stopOpacity: 0 }} />
          <stop offset={gr / (gr + gw / 2)} style={{ stopColor: '#fff', stopOpacity: 'var(--ring-gloss)' }} />
          <stop offset="1" style={{ stopColor: '#fff', stopOpacity: 0 }} />
        </radialGradient>
        <linearGradient id={`${id}-litg`} gradientUnits="userSpaceOnUse" x1="0" y1={c - R} x2="0" y2={c + R}>
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor="#4d4d4d" />
        </linearGradient>
        <mask id={`${id}-lit`} maskUnits="userSpaceOnUse" x="0" y="0" width={size} height={size}>
          <rect x="0" y="0" width={size} height={size} fill={`url(#${id}-litg)`} />
        </mask>
        {/* a small black shade (a soft disc) just ahead of the end on the plain track */}
        <radialGradient id={`${id}-cap`}>
          <stop offset="0" style={{ stopColor: 'var(--ring-cap)' }} />
          <stop offset=".5" style={{ stopColor: 'var(--ring-cap)', stopOpacity: 0.5 }} />
          <stop offset="1" style={{ stopColor: 'var(--ring-cap)', stopOpacity: 0 }} />
        </radialGradient>
        <radialGradient id={`${id}-hl`}>
          <stop offset="0" style={{ stopColor: '#fff', stopOpacity: 0.7 }} />
          <stop offset=".5" style={{ stopColor: '#fff', stopOpacity: 0.22 }} />
          <stop offset="1" style={{ stopColor: '#fff', stopOpacity: 0 }} />
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
        <mask id={`${id}-arc2`} maskUnits="userSpaceOnUse" x="0" y="0" width={size} height={size}>
          <motion.circle {...p} strokeLinecap="butt" stroke="#fff" strokeWidth={stroke} style={{ pathLength: len2 }} />
          <g ref={tip2}><circle cx={c} cy={c - rad} r={stroke / 2} fill="#fff" /></g>
        </mask>
        <radialGradient id={`${id}-shade2`}>
          <stop offset="0" style={{ stopColor: lapShade, stopOpacity: 0.62 }} />
          <stop offset=".55" style={{ stopColor: lapShade, stopOpacity: 0.5 }} />
          <stop offset=".85" style={{ stopColor: lapShade, stopOpacity: 0.12 }} />
          <stop offset="1" style={{ stopColor: lapShade, stopOpacity: 0 }} />
        </radialGradient>
        <mask id={`${id}-band`} maskUnits="userSpaceOnUse" x="0" y="0" width={size} height={size}>
          <circle {...p} stroke="#fff" strokeWidth={stroke} />
        </mask>
        <mask id={`${id}-end`} maskUnits="userSpaceOnUse" x="0" y="0" width={size} height={size}>
          <circle cx={c} cy={c - rad} r={stroke / 2} fill="#fff" />
        </mask>
      </defs>
      <circle {...p} style={{ stroke: track }} strokeWidth={stroke} />
      <circle {...p} stroke={`url(#${id}-groove)`} strokeWidth={stroke} />
      <g mask={`url(#${id}-band)`}>
        <circle ref={cap} r={stroke * 0.55} fill={`url(#${id}-cap)`} opacity="0" />
      </g>
      <g ref={arcG}>
      <g mask={`url(#${id}-arc)`} opacity={v > 0 ? 1 : 0}>
        <foreignObject x="0" y="0" width={size} height={size}>
          <div style={{ width: '100%', height: '100%', background: `var(--ring-dither), conic-gradient(from ${-o}deg, ${start} 0deg, ${start} ${o}deg, ${col} ${o + span * 0.55}deg, ${end} ${o + span}deg, ${end} 360deg)` }} />
        </foreignObject>
        <circle {...p} stroke={`url(#${id}-tube)`} strokeWidth={stroke} />
        {/* the end's shade falls on the ring's own start as it closes */}
        <g ref={lap} opacity="0"><circle cx={c + stroke * 0.5} cy={c - rad} r={stroke * 0.75} fill={`url(#${id}-lap)`} /></g>
        <circle ref={hl} cx={c} cy={c - rad} r={stroke * 0.8} fill={`url(#${id}-hl)`} opacity="0" />
      </g>
      {/* full: the end drawn again on top, in the gradient's exact end colour with the same dither and tube shading, so it lies over the start */}
      <g ref={head} opacity="0">
        <g mask={`url(#${id}-end)`}>
          <foreignObject x="0" y="0" width={size} height={size}><div style={{ width: '100%', height: '100%', background: `var(--ring-dither), ${end}` }} /></foreignObject>
          <circle {...p} stroke={`url(#${id}-tube)`} strokeWidth={stroke} />
        </g>
      </g>
      {/* past 100 %: a small crisp shade ahead of the second lap's tip falls on the first lap, then the second lap itself */}
      <g mask={`url(#${id}-band)`}>
        <circle ref={shade2} r={stroke * 0.62} fill={`url(#${id}-shade2)`} opacity="0" />
      </g>
      <g ref={lap2} mask={`url(#${id}-arc2)`} opacity="0">
        <foreignObject x="0" y="0" width={size} height={size}>
          <div style={{ width: '100%', height: '100%', background: `var(--ring-dither), conic-gradient(${end} 0deg, ${end2} 360deg)` }} />
        </foreignObject>
        <circle {...p} stroke={`url(#${id}-tube)`} strokeWidth={stroke} />
      </g>
      <g mask={`url(#${id}-lit)`} opacity={v > 0 ? 1 : 0}>{glossArc(gloss1, gLen, gOff)}</g>
      </g>
    </g>
  );
}
