import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { useT } from '../lib/i18n';
import { Icon } from './Icon';

/** Hand-built SVG charts: thin marks, recessive grid, tap/drag inspection, table view on every card. */

function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(320);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(200, el.clientWidth)));
    ro.observe(el); setW(Math.max(200, el.clientWidth));
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export interface Pt { x: number; y: number; label: string }

function niceRange(min: number, max: number, pad = 0.08): [number, number] {
  if (min === max) { const d = Math.max(1, Math.abs(min) * 0.05); return [min - d, max + d]; }
  const p = (max - min) * pad;
  return [min - p, max + p];
}

export function LineChart({ points, trend, height = 180, fmtY, target, targetLabel, seriesLabel, trendLabel, zeroBase }: {
  points: Pt[]; trend?: { x: number; y: number }[]; height?: number; fmtY: (v: number) => string; target?: number; targetLabel?: string; seriesLabel: string; trendLabel?: string; zeroBase?: boolean;
}) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const padL = 40, padR = 12, padT = 14, padB = 24;
  const xs = points.map((p) => p.x), ys = [...points.map((p) => p.y), ...(trend?.map((p) => p.y) ?? []), ...(target !== undefined ? [target] : [])];
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const [y0, y1] = niceRange(zeroBase ? 0 : Math.min(...ys), Math.max(...ys));
  const X = (x: number) => padL + (x1 === x0 ? (w - padL - padR) / 2 : ((x - x0) / (x1 - x0)) * (w - padL - padR));
  const Y = (y: number) => padT + (1 - (y - y0) / (y1 - y0)) * (height - padT - padB);
  const path = (list: { x: number; y: number }[]) => list.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)} ${Y(p.y).toFixed(1)}`).join('');
  const ticks = [0, 0.5, 1].map((f) => y0 + (y1 - y0) * f);
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    let best = 0, bd = Infinity;
    points.forEach((p, i) => { const d = Math.abs(X(p.x) - px); if (d < bd) { bd = d; best = i; } });
    setHover(best);
  };
  const hp = hover !== null ? points[hover] : null;
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <svg width={w} height={height} style={{ display: 'block', touchAction: 'pan-y' }} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label={seriesLabel}>
        {ticks.map((v, i) => (
          <g key={i}>
            <line x1={padL} x2={w - padR} y1={Y(v)} y2={Y(v)} stroke="var(--line)" strokeWidth="1" />
            <text x={padL - 8} y={Y(v) + 4} textAnchor="end" fontSize="11" fill="var(--tx3)" className="num">{fmtY(v)}</text>
          </g>
        ))}
        {target !== undefined && <g><line x1={padL} x2={w - padR} y1={Y(target)} y2={Y(target)} stroke="var(--tx3)" strokeWidth="1" strokeDasharray="4 4" /><text x={w - padR} y={Y(target) - 5} textAnchor="end" fontSize="11" fill="var(--tx2)">{targetLabel}</text></g>}
        {trend && trend.length > 1 && <motion.path d={path(trend)} fill="none" stroke="var(--ac)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }} />}
        {!trend && points.length > 1 && <motion.path d={path(points)} fill="none" stroke="var(--ac)" strokeWidth="2" strokeLinecap="round" style={{ filter: 'drop-shadow(0 0 6px var(--ac))' }} strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }} />}
        {points.map((p, i) => (
          <circle key={i} cx={X(p.x)} cy={Y(p.y)} r={hover === i ? 5.5 : 4} fill={trend ? 'var(--bg)' : 'var(--ac)'} stroke={trend ? 'var(--tx2)' : 'var(--s1)'} strokeWidth={trend ? 1.5 : 2} />
        ))}
        {hp && <line x1={X(hp.x)} x2={X(hp.x)} y1={padT} y2={height - padB} stroke="var(--line-2)" strokeWidth="1" />}
        <text x={padL} y={height - 6} fontSize="11" fill="var(--tx3)">{points[0]?.label}</text>
        <text x={w - padR} y={height - 6} textAnchor="end" fontSize="11" fill="var(--tx3)">{points.length > 1 ? points[points.length - 1].label : ''}</text>
      </svg>
      {hp && (
        <div className="glass" style={{ position: 'absolute', top: 0, left: Math.min(Math.max(X(hp.x) - 50, 0), w - 110), padding: '6px 10px', borderRadius: 12, pointerEvents: 'none', fontSize: 12.5 }}>
          <div className="num" style={{ fontWeight: 700 }}>{fmtY(hp.y)}</div><div className="t2">{hp.label}</div>
        </div>
      )}
      {trend && <div className="row-flex xs t2" style={{ gap: 14, marginTop: 6 }}><span className="row-flex" style={{ gap: 6 }}><i style={{ width: 8, height: 8, borderRadius: 8, border: '1.5px solid var(--tx2)', display: 'inline-block' }} />{seriesLabel}</span><span className="row-flex" style={{ gap: 6 }}><i style={{ width: 14, height: 3, borderRadius: 2, background: 'var(--ac)', display: 'inline-block' }} />{trendLabel}</span></div>}
    </div>
  );
}

export interface Bar { label: string; value: number; sub?: string; emphasis?: boolean; dim?: boolean }

/** Round a maximum up to 1/2/2.5/5/10 × 10ⁿ so the axis ticks are readable numbers. */
function niceMax(m: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(m)));
  for (const k of [1, 2, 2.5, 4, 5, 10]) if (m <= k * p + 1e-9) return k * p;
  return 10 * p;
}

export function BarChart({ bars, height = 150, fmt, target, targetLabel, label, color = 'var(--ac)' }: { bars: Bar[]; height?: number; fmt: (v: number) => string; target?: number; targetLabel?: string; label: string; color?: string }) {
  const [ref, w] = useWidth();
  const [sel, setSel] = useState<number | null>(null);
  const padL = 36, padR = 6, padT = 14, padB = 22;
  const max = niceMax(Math.max(...bars.map((b) => b.value), target ?? 0, 1));
  const slot = (w - padL - padR) / Math.max(1, bars.length);
  const bw = Math.min(28, Math.max(6, slot - 6));
  const Y = (v: number) => padT + (1 - v / max) * (height - padT - padB);
  const ticks = [0, max / 2, max];
  const every = Math.ceil(bars.length / Math.max(1, Math.floor((w - padL) / 44)));
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <svg width={w} height={height} style={{ display: 'block' }} role="img" aria-label={label}>
        {ticks.map((v, i) => (<g key={i}><line x1={padL} x2={w - padR} y1={Y(v)} y2={Y(v)} stroke="var(--line)" /><text x={padL - 6} y={Y(v) + 4} textAnchor="end" fontSize="11" fill="var(--tx3)" className="num">{fmt(v)}</text></g>))}
        {target !== undefined && <g><line x1={padL} x2={w - padR} y1={Y(target)} y2={Y(target)} stroke="var(--tx3)" strokeDasharray="4 4" /><text x={w - padR} y={Y(target) - 5} textAnchor="end" fontSize="11" fill="var(--tx2)">{targetLabel}</text></g>}
        {bars.map((b, i) => {
          const cx = padL + slot * i + slot / 2;
          const h = Math.max(b.value > 0 ? 3 : 0, (height - padB) - Y(b.value));
          return (
            <g key={i} onPointerEnter={() => setSel(i)} onPointerDown={() => setSel(i === sel ? null : i)} onPointerLeave={() => setSel(null)} style={{ cursor: 'pointer' }}>
              <rect x={cx - slot / 2} y={0} width={slot} height={height - padB} fill="transparent" />
              <motion.rect x={cx - bw / 2} width={bw} rx={4} fill={color} opacity={b.dim ? 0.3 : sel === i || b.emphasis ? 1 : 0.78}
                initial={{ y: height - padB, height: 0 }} animate={{ y: height - padB - h, height: h }} transition={{ duration: 0.5, delay: i * 0.015, ease: [0.22, 1, 0.36, 1] }} />
              {i % every === 0 && <text x={cx} y={height - 6} textAnchor="middle" fontSize="11" fill={b.emphasis ? 'var(--tx)' : 'var(--tx3)'}>{b.label}</text>}
            </g>
          );
        })}
      </svg>
      {sel !== null && (
        <div className="glass" style={{ position: 'absolute', top: 0, left: Math.min(Math.max(padL + slot * sel + slot / 2 - 50, 0), w - 120), padding: '6px 10px', borderRadius: 12, pointerEvents: 'none', fontSize: 12.5 }}>
          <div className="num" style={{ fontWeight: 700 }}>{fmt(bars[sel].value)}</div><div className="t2">{bars[sel].sub ?? bars[sel].label}</div>
        </div>
      )}
    </div>
  );
}

export function Sparkline({ values, w = 96, h = 32 }: { values: number[]; w?: number; h?: number }) {
  if (values.length < 2) return <svg width={w} height={h} />;
  const min = Math.min(...values), max = Math.max(...values);
  const X = (i: number) => 2 + (i / (values.length - 1)) * (w - 4);
  const Y = (v: number) => 3 + (1 - (max === min ? 0.5 : (v - min) / (max - min))) * (h - 6);
  return (
    <svg width={w} height={h} aria-hidden>
      <path d={values.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join('')} fill="none" stroke="var(--ac)" strokeWidth="2" strokeLinecap="round" style={{ filter: 'drop-shadow(0 0 6px var(--ac))' }} strokeLinejoin="round" />
      <circle cx={X(values.length - 1)} cy={Y(values[values.length - 1])} r="3.2" fill="var(--ac)" stroke="var(--bg)" strokeWidth="1.5" />
    </svg>
  );
}

/** A card that can flip to an accessible table of exactly what's plotted. */
export function ChartCard({ title, sub, right, children, table }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; children: ReactNode; table?: { head: string[]; rows: (string | number)[][] } }) {
  const t = useT();
  const [showTable, setShowTable] = useState(false);
  const rows = useMemo(() => table?.rows ?? [], [table]);
  return (
    <div className="plinth" style={{ padding: '16px 14px 14px', borderRadius: 'var(--r-lg)' }}>
      <div className="row-flex between" style={{ padding: '0 4px', marginBottom: 10, alignItems: 'flex-start' }}>
        <div><div className="micro">{title}</div>{sub && <div className="display display-md num" style={{ marginTop: 4 }}>{sub}</div>}</div>
        <div className="row-flex" style={{ gap: 4 }}>{right}{table && <button className="icon-btn flat sm" aria-label={showTable ? t('Show chart') : t('Show as table')} aria-pressed={showTable} onClick={() => setShowTable((v) => !v)}><Icon name={showTable ? 'progress' : 'list'} size={18} /></button>}</div>
      </div>
      {showTable && table ? (
        <div style={{ maxHeight: 220, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }} className="num">
            <thead><tr>{table.head.map((h) => <th key={h} style={{ textAlign: 'left', padding: '6px 4px', color: 'var(--tx3)', fontWeight: 600, position: 'sticky', top: 0, background: 'var(--bg)' }}>{h}</th>)}</tr></thead>
            <tbody>{rows.map((r, i) => <tr key={i} style={{ borderTop: '1px solid var(--line)' }}>{r.map((c, j) => <td key={j} style={{ padding: '7px 4px' }}>{c}</td>)}</tr>)}</tbody>
          </table>
        </div>
      ) : children}
    </div>
  );
}

export function RangeSeg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="row-flex" style={{ gap: 6 }}>
      {options.map((o) => <button key={o.value} className={`chip sm press ${value === o.value ? 'on' : ''}`} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  );
}
