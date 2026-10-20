/**
 * The Health screen's drawings, all plain SVG at the size they are shown (no scaling, so lines stay crisp and text stays
 * round): the day ribbon, the night (hypnogram), the heart trace, today's steps over your usual day, the week strip, the
 * weight spark and last night's heart curve. Nothing here animates by itself; Health.tsx moves whole layers (transform and
 * opacity only).
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { routeOf, routePoints, type SleepSession } from '../../lib/watchDetail';
import type { DayRibbon } from './data';

export const C = { sleep: '#a8b4ff', heart: '#ff5c7a', move: '#ff7a2f', cardio: '#ffd060', body: '#f3e3d6', train: '#ff9a5c' };
/** stage colours: awake, light, deep, REM (4 = asleep, no stage: drawn as light) */
export const STAGE = ['#ff9a7a', '#a8b4ff', '#7d6bff', '#c7b8ff', '#a8b4ff'];
/** lanes top to bottom: awake, REM, light, deep */
const LANE = [0, 2, 3, 1, 2];

/** the width an element is drawn at (follows rotation and resizes) */
export function useWidth<T extends HTMLElement>(fallback = 344): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const set = () => { const v = Math.round(el.getBoundingClientRect().width); if (v > 0) setW(v); };
    set();
    const ro = new ResizeObserver(set); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** a smooth line through points (horizontal tangents: it never overshoots a peak) */
export function smoothPath(P: [number, number][]): string {
  if (!P.length) return '';
  let d = `M${P[0][0].toFixed(1)} ${P[0][1].toFixed(1)}`;
  for (let i = 1; i < P.length; i++) { const [x0, y0] = P[i - 1], [x1, y1] = P[i], mx = (x0 + x1) / 2; d += ` C${mx.toFixed(1)} ${y0.toFixed(1)} ${mx.toFixed(1)} ${y1.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`; }
  return d;
}
const avg = (a: number[], k: number) => a.map((_, i) => { const s = a.slice(Math.max(0, i - k), i + k + 1); return s.reduce((x, y) => x + y, 0) / s.length; });

function Svg({ w, h, children, style }: { w: number; h: number; children: ReactNode; style?: CSSProperties }) {
  return <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden style={{ display: 'block', overflow: 'visible', ...style }}>{children}</svg>;
}

/** the night: one lane per stage, bars at least 2 px high, thin steps between them */
export function Hypnogram({ night, w, h = 72, pad = 20 }: { night: SleepSession; w: number; h?: number; pad?: number }) {
  const tot = Math.max(1, (night.end - night.start) / 60000), iw = w - 2 * pad;
  const lane = (s: number) => (LANE[s] * h) / 4.1, bh = h / 5.2;
  const st = night.stages;
  return (
    <Svg w={w} h={h}>
      {[0, 1, 2, 3].map((l) => <rect key={l} x={pad} y={(l * h) / 4.1 + bh / 2 - 0.5} width={iw} height={1} fill="rgba(255,255,255,.05)" />)}
      {st.map((s, i) => {
        const x = pad + (s.from / tot) * iw, x2 = pad + ((s.from + s.min) / tot) * iw;
        const p = i ? st[i - 1].stage : -1;
        return (
          <g key={i}>
            {p >= 0 && LANE[p] !== LANE[s.stage] && <rect x={x - 0.5} y={Math.min(lane(p), lane(s.stage)) + bh / 2} width={1} height={Math.abs(lane(p) - lane(s.stage))} fill="rgba(199,184,255,.35)" />}
            <rect x={x} y={lane(s.stage)} width={Math.max(2, x2 - x - 1)} height={bh} rx={Math.min(4, bh / 2)} fill={STAGE[s.stage]} />
          </g>
        );
      })}
    </Svg>
  );
}

/** a line of daily values with your usual range as two hairlines; today a dot */
export function Trace({ values, band, w, h = 40, pad = 20, color = C.heart, usualLabel, ends }: { values: number[]; band?: [number, number]; w: number; h?: number; pad?: number; color?: string; usualLabel?: string; ends?: [string, string] }) {
  if (values.length < 2) return <div style={{ height: h + 12 }} />;
  const sm = avg(values, 1);
  const lo = Math.min(...sm, band?.[0] ?? Infinity) - 1, hi = Math.max(...sm, band?.[1] ?? -Infinity) + 1;
  const y = (v: number) => 12 + h - ((v - lo) / (hi - lo)) * h;
  const P = sm.map((v, i): [number, number] => [pad + (i / (sm.length - 1)) * (w - 2 * pad), y(v)]);
  return (
    <Svg w={w} h={h + 14 + (ends ? 18 : 0)}>
      {ends && <><text className="hx-ax3" x={pad} y={h + 30}>{ends[0]}</text><text className="hx-ax3" x={w - pad} y={h + 30} textAnchor="end">{ends[1]}</text></>}
      {band && <>
        <rect x={pad} y={y(band[1])} width={w - 2 * pad} height={1} fill={color} opacity={0.28} />
        <rect x={pad} y={y(band[0])} width={w - 2 * pad} height={1} fill={color} opacity={0.28} />
        {usualLabel && <text className="hx-ax3" x={w - pad} y={y(band[1]) - 5} textAnchor="end">{usualLabel}</text>}
      </>}
      <path d={smoothPath(P)} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      <circle cx={P[P.length - 1][0]} cy={P[P.length - 1][1]} r={3.5} fill={color} />
    </Svg>
  );
}

/** today's steps (cumulative) over your usual day: the usual as a faint line, today in orange with its dot at now */
export function StepsDay({ today, usual, w, h = 64, pad = 20, axis }: { today: number[]; usual: number[]; w: number; h?: number; pad?: number; axis?: string[] }) {
  const top = Math.max(1, ...today, ...usual) * 1.08;
  const x = (k: number) => pad + (k / 95) * (w - 2 * pad), y = (v: number) => 4 + h - (v / top) * h;
  const U = usual.map((v, k): [number, number] => [x(k), y(v)]);
  const T = today.map((v, k): [number, number] => [x(k), y(v)]);
  const last = T[T.length - 1];
  return (
    <Svg w={w} h={h + (axis ? 22 : 8)}>
      <rect x={pad} y={y(0)} width={w - 2 * pad} height={1} fill="rgba(255,255,255,.10)" />
      {U.length > 1 && <path d={smoothPath(U)} fill="none" stroke="rgba(255,255,255,.32)" strokeWidth={1.25} strokeDasharray="2 4" strokeLinecap="round" />}
      {T.length > 1 && <>
        <path d={`${smoothPath(T)} L${last[0].toFixed(1)} ${y(0)} L${T[0][0].toFixed(1)} ${y(0)} Z`} fill={C.move} opacity={0.16} />
        <path d={smoothPath(T)} fill="none" stroke={C.move} strokeWidth={2} strokeLinecap="round" />
      </>}
      {last && <><circle cx={last[0]} cy={last[1]} r={6} fill={C.move} /><circle cx={last[0]} cy={last[1]} r={2.4} fill="#fff" /></>}
      {axis && axis.map((l, i) => <text key={i} className="hx-ax3" x={pad + (i / (axis.length - 1)) * (w - 2 * pad)} y={h + 20} textAnchor={i === 0 ? 'start' : i === axis.length - 1 ? 'end' : 'middle'}>{l}</text>)}
    </Svg>
  );
}

/** last night's heart rate as one calm curve, its low point marked */
export function NightHeart({ points, w, h = 90, pad = 20, lowLabel, ends }: { points: { t: number; bpm: number }[]; w: number; h?: number; pad?: number; lowLabel: (bpm: number) => string; ends?: [string, string] }) {
  if (points.length < 4) return null;
  const sm = avg(avg(points.map((p) => p.bpm), 3), 3);
  const lo = Math.min(...sm) - 2, hi = Math.max(...sm) + 2;
  const t0 = points[0].t, t1 = points[points.length - 1].t;
  const x = (t: number) => pad + ((t - t0) / Math.max(1, t1 - t0)) * (w - 2 * pad), y = (v: number) => 18 + h - ((v - lo) / (hi - lo)) * h;
  const P = sm.map((v, i): [number, number] => [x(points[i].t), y(v)]);
  let li = 0; sm.forEach((v, i) => { if (v < sm[li]) li = i; });
  return (
    <Svg w={w} h={h + 24}>
      <path d={smoothPath(P)} fill="none" stroke={C.heart} strokeWidth={1.75} strokeLinecap="round" />
      <rect x={P[li][0] - 0.5} y={P[li][1] + 6} width={1} height={Math.max(0, y(lo) - P[li][1] - 2)} fill={C.heart} opacity={0.35} />
      <circle cx={P[li][0]} cy={P[li][1]} r={4.5} fill={C.heart} />
      {ends && <><text className="hx-ax3" x={pad} y={h + 22}>{ends[0]}</text><text className="hx-ax3" x={w - pad} y={h + 22} textAnchor="end">{ends[1]}</text></>}
      <text className="hx-ax" x={P[li][0]} y={P[li][1] - 10} textAnchor="middle" style={{ fill: '#ff9aae' }}>{lowLabel(Math.round(sm[li]))}</text>
    </Svg>
  );
}

/** a small weight line at cap height */
export function Spark({ values, w = 120, h = 26, color = C.body }: { values: number[]; w?: number; h?: number; color?: string }) {
  if (values.length < 2) return null;
  const sm = avg(values, 1), lo = Math.min(...sm), hi = Math.max(...sm) || lo + 1;
  const P = sm.map((v, i): [number, number] => [1 + (i / (sm.length - 1)) * (w - 2), 2 + (h - 4) - ((v - lo) / Math.max(0.1, hi - lo)) * (h - 4)]);
  return <Svg w={w} h={h}><path d={smoothPath(P)} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" /></Svg>;
}

/** a ring for a score: track, and the arc drawn by two half-disc masks turning (transform only) */
export function ScoreRing({ value, color, size = 88 }: { value: number; color: string; size?: number }) {
  const r = size / 2 - 5, c = size / 2;
  const half = (side: 'r' | 'l') => <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}><path d={side === 'r' ? `M${c} ${c - r} A${r} ${r} 0 0 1 ${c} ${c + r}` : `M${c} ${c + r} A${r} ${r} 0 0 1 ${c} ${c - r}`} fill="none" stroke={color} strokeWidth={9} /></svg>;
  const p = Math.max(0, Math.min(1, value / 100));
  return (
    <div className="hx-ring" style={{ width: size, height: size, ['--p' as string]: p }} data-p={p}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} style={{ position: 'absolute', inset: 0 }}><circle cx={c} cy={c} r={r} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth={9} /></svg>
      <div className="hx-half r" style={{ left: size / 2, width: size / 2, height: size }}><div className="hx-rs" style={{ left: -size / 2, width: size, height: size, transformOrigin: `${c}px ${c}px`, transform: `rotate(${p >= 0.5 ? 0 : -180 + p * 360}deg)` }}>{half('r')}</div></div>
      <div className="hx-half l" style={{ width: size / 2, height: size }}><div className="hx-ls" style={{ width: size, height: size, transformOrigin: `${c}px ${c}px`, transform: `rotate(${p > 0.5 ? -180 + (p - 0.5) * 360 : -180}deg)` }}>{half('l')}</div></div>
    </div>
  );
}

/**
 * The day on one ribbon (the last 24 hours, now at the right): the night's stages along the top, steps as a hill along the
 * bottom, the heart as a thin thread, workouts as capsules, and a marker at now. Each is its own layer so the screen can
 * play the day in once (Health.tsx); at rest it is one still picture.
 */
export function Ribbon({ r, w, labels, axis }: { r: DayRibbon; w: number; labels: { sleep?: string; steps: string }; axis: string[] }) {
  const pad = 20, H = 118, base = H - 6, top = 30;
  const px = (t: number) => pad + ((t - r.from) / (r.to - r.from)) * (w - 2 * pad);
  const lane = [0, 8, 16, 0, 8];
  const sleep = r.sleep.filter((b) => b.stage !== 0);
  const maxS = Math.max(400, ...r.steps);
  const P = r.steps.map((v, i): [number, number] => [px(r.from + (i + 0.5) * 1800000), base - (v / maxS) * 40]);
  const hrLo = 40, hrHi = Math.max(150, ...r.hr.map((p) => p.bpm));
  const hs = avg(avg(r.hr.map((p) => p.bpm), 2), 2);
  const HP = r.hr.map((p, i): [number, number] => [px(p.t), base - ((hs[i] - hrLo) / (hrHi - hrLo)) * (H - 20)]);
  const layer = (k: string, children: ReactNode) => <div className={`hx-rl hx-rl-${k}`} data-rl={k}><div><Svg w={w} h={H + 16}>{children}</Svg></div></div>;
  const firstSleep = sleep[0];
  return (
    <div className="hx-ribbon" style={{ height: H + 16 }}>
      {layer('axis', axis.map((l, i) => <text key={i} className="hx-ax" x={pad + (i / (axis.length - 1)) * (w - 2 * pad)} y={H + 12} textAnchor={i === 0 ? 'start' : i === axis.length - 1 ? 'end' : 'middle'}>{l}</text>))}
      {layer('steps', <>
        <path d={`${smoothPath(P)} L${px(r.to)} ${base} L${pad} ${base} Z`} fill={C.move} opacity={0.2} />
        <path d={smoothPath(P)} fill="none" stroke={C.move} strokeWidth={1.6} />
        {(() => { let k = 0; r.steps.forEach((v, i) => { if (v > r.steps[k]) k = i; }); return r.steps[k] > 300 ? <text className="hx-ax" x={P[k][0]} y={P[k][1] - 8} textAnchor="middle" style={{ fill: '#ffb08a' }}>{labels.steps}</text> : null; })()}
      </>)}
      {layer('sleep', <>
        {sleep.map((b, i) => <rect key={i} x={px(b.from)} y={top + lane[b.stage]} width={Math.max(1.5, px(b.to) - px(b.from))} height={6} rx={1.5} fill={STAGE[b.stage]} />)}
        {firstSleep && labels.sleep && <text className="hx-ax" x={Math.max(pad, px(firstSleep.from))} y={top - 8} style={{ fill: '#c7cfff' }}>{labels.sleep}</text>}
      </>)}
      {layer('moves', r.moves.map((m, i) => (
        <g key={i}>
          <rect x={px(m.from)} y={m.kind === 'cardio' ? top + 30 : top + 44} width={Math.max(10, px(m.to) - px(m.from))} height={10} rx={5} fill={m.kind === 'cardio' ? C.cardio : C.train} />
          <text className="hx-ax" x={px(m.from)} y={(m.kind === 'cardio' ? top + 30 : top + 44) - 5} style={{ fill: m.kind === 'cardio' ? '#ffe39a' : '#ffb98a' }}>{m.label}</text>
        </g>
      )))}
      {layer('heart', HP.length > 1 ? <path d={smoothPath(HP)} fill="none" stroke={C.heart} strokeWidth={1} opacity={0.45} /> : null)}
      {layer('now', <><rect x={px(r.to) - 0.75} y={base - 34} width={1.5} height={34} rx={0.75} fill="#fff" opacity={0.5} /><circle cx={px(r.to)} cy={base - 34} r={3} fill="#fff" /></>)}
    </div>
  );
}

/** the week, day by day: a mark per workout or sport, a hollow ring for a quiet day */
export function WeekStrip({ days, today, letter }: { days: { date: string; marks: string[] }[]; today: string; letter: (d: string) => string }) {
  return (
    <div className="hx-wk">
      {days.map((d) => (
        <div key={d.date} className="d">
          <div className="m">{d.marks.map((k, i) => <span key={i} className={`mk ${k}`} />)}</div>
          <b className={d.date === today ? 'today' : ''}>{letter(d.date)}</b>
        </div>
      ))}
    </div>
  );
}

/** a workout's GPS route as its shape (no map: the line alone, start to finish), loaded from the phone's store */
export function RouteLine({ id, w, h = 130 }: { id: string; w: number; h?: number }) {
  const [pts, setPts] = useState<[number, number][] | null>(null);
  useEffect(() => { let live = true; void routeOf(id).then((r) => { if (live) setPts(r ? routePoints(r.poly) : null); }); return () => { live = false; }; }, [id]);
  if (!pts || pts.length < 2) return null;
  const k = Math.cos((pts[0][0] * Math.PI) / 180);
  const xs = pts.map((p) => p[1] * k), ys = pts.map((p) => -p[0]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const sc = Math.min((w - 16) / Math.max(1e-9, x1 - x0), (h - 16) / Math.max(1e-9, y1 - y0));
  const ox = (w - (x1 - x0) * sc) / 2, oy = (h - (y1 - y0) * sc) / 2;
  const P = xs.map((x, i): [number, number] => [ox + (x - x0) * sc, oy + (ys[i] - y0) * sc]);
  const d = P.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');
  return (
    <Svg w={w} h={h}>
      <path d={d} fill="none" stroke={C.cardio} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={P[0][0]} cy={P[0][1]} r={4} fill="var(--bg)" stroke={C.cardio} strokeWidth={2} />
      <circle cx={P[P.length - 1][0]} cy={P[P.length - 1][1]} r={4} fill={C.cardio} />
    </Svg>
  );
}

