import { animate, motion, useMotionValue, useReducedMotion } from 'motion/react';
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { parseNum, fmtNum } from '../lib/units';
import { useLang } from '../lib/i18n';
import { SNAP } from './Sheet';

// ── segmented control (thumb glides between options) ─────────
export function Seg<T extends string | number>({ value, onChange, options, style }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; style?: CSSProperties }) {
  const id = useId();
  return (
    <div className="seg" role="tablist" style={style}>
      {options.map((o) => (
        <button key={String(o.value)} role="tab" aria-selected={o.value === value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.value === value && <motion.span layoutId={`seg-${id}`} className="thumb" style={{ inset: 3 }} transition={SNAP} />}
          <span style={{ position: 'relative' }}>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

// ── animated number ─────────────────────────────────────────
export function Count({ value, format, className, style }: { value: number; format?: (n: number) => string; className?: string; style?: CSSProperties }) {
  const ref = useRef<HTMLSpanElement>(null);
  const mv = useMotionValue(value);
  const reduce = useReducedMotion();
  const fmt = format ?? ((n) => String(Math.round(n)));
  useEffect(() => {
    if (reduce) { mv.set(value); return; }
    const c = animate(mv, value, { duration: 0.55, ease: [0.22, 1, 0.36, 1] });
    return () => c.stop();
  }, [value, reduce, mv]);
  useEffect(() => {
    const u = mv.on('change', (v) => { if (ref.current) ref.current.textContent = fmt(v); });
    if (ref.current) ref.current.textContent = fmt(mv.get());
    return u;
    // eslint-disable-next-line
  }, [mv, format]);
  return <span ref={ref} className={`num ${className ?? ''}`} style={style}>{fmt(value)}</span>;
}

// ── numeric input, locale aware ─────────────────────────────
export function NumInput({ value, onChange, unit, placeholder, className, max = 2, big, compact, min, autoFocus, onEnter, label, step }: {
  value: number | undefined; onChange: (v: number | undefined) => void; unit?: string; placeholder?: string; className?: string; max?: number; big?: boolean; compact?: boolean; min?: number; autoFocus?: boolean; onEnter?: () => void; label?: string; step?: number;
}) {
  const lang = useLang();
  const [txt, setTxt] = useState<string>(value === undefined ? '' : fmtNum(value, lang, max));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setTxt(value === undefined ? '' : fmtNum(value, lang, max));
  }, [value, lang, max]);
  void step;
  return (
    <div className={`input-unit ${unit ? 'has-unit' : ''} ${className ?? ''}`}>
      <input
        className={`input ${big ? 'lg' : ''} ${compact ? 'compact' : ''}`} inputMode="decimal" enterKeyHint="done" autoComplete="off" placeholder={placeholder} aria-label={label ?? unit}
        value={txt} autoFocus={autoFocus}
        onFocus={(e) => { focused.current = true; e.currentTarget.select(); }}
        onBlur={() => { focused.current = false; setTxt(value === undefined ? '' : fmtNum(value, lang, max)); }}
        onKeyDown={(e) => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); onEnter?.(); } }}
        onChange={(e) => {
          const s = e.target.value.replace(/[^0-9.,]/g, '');
          setTxt(s);
          const n = parseNum(s);
          onChange(n !== undefined && (min === undefined || n >= min) ? n : s === '' ? undefined : value);
        }}
      />
      {unit && <span className="unit">{unit}</span>}
    </div>
  );
}

// ── stepper with hold-to-repeat ─────────────────────────────
export function Stepper({ value, onChange, step = 1, min = 0, max = 9999, unit, fmt }: { value: number; onChange: (n: number) => void; step?: number; min?: number; max?: number; unit?: string; fmt?: (n: number) => string }) {
  const lang = useLang();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const val = useRef(value);
  val.current = value;
  const bump = (dir: 1 | -1) => { const n = Math.round((val.current + dir * step) * 1000) / 1000; onChange(Math.min(max, Math.max(min, n))); };
  const start = (dir: 1 | -1) => {
    bump(dir);
    let delay = 380;
    const loop = () => { timer.current = setTimeout(() => { bump(dir); delay = Math.max(60, delay * 0.8); loop(); }, delay); };
    loop();
  };
  const stop = () => clearTimeout(timer.current);
  useEffect(() => stop, []);
  return (
    <div className="row-flex" style={{ gap: 6 }}>
      <button className="icon-btn press" aria-label="Decrease" onPointerDown={() => start(-1)} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}><Icon name="minus" /></button>
      <div className="num" style={{ minWidth: 64, textAlign: 'center', fontWeight: 650, fontSize: 18 }}>{fmt ? fmt(value) : fmtNum(value, lang, 2)}{unit && <span className="t3 small"> {unit}</span>}</div>
      <button className="icon-btn press" aria-label="Increase" onPointerDown={() => start(1)} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}><Icon name="plus" /></button>
    </div>
  );
}

// ── ruler ticks ─────────────────────────────────────────────
export function Ticks({ value, n = 40, over }: { value: number; n?: number; over?: boolean }) {
  const on = Math.round(Math.max(0, Math.min(1, value)) * n);
  return (
    <div className={`ticks ${over ? 'over' : ''}`} aria-hidden="true">
      {Array.from({ length: n }, (_, i) => <i key={i} className={i < on ? 'on' : ''} style={{ transitionDelay: `${Math.min(i, 40) * 7}ms` }} />)}
    </div>
  );
}

export function Empty({ title, body, icon, action }: { title: string; body?: string; icon?: IconName; action?: ReactNode }) {
  return (
    <div className="empty">
      {icon && <div style={{ display: 'grid', placeItems: 'center', marginBottom: 12, color: 'var(--tx3)' }}><Icon name={icon} size={30} /></div>}
      <div className="display display-sm">{title}</div>
      {body && <div className="small" style={{ maxWidth: 280, margin: '6px auto 0' }}>{body}</div>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}

export function Section({ title, right, children }: { title: ReactNode; right?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="row-flex between" style={{ marginBottom: 12 }}>
        <div className="micro">{title}</div>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      style={{ width: 52, height: 32, borderRadius: 99, position: 'relative', background: on ? 'var(--ac)' : 'var(--s4)', transition: 'background 200ms', boxShadow: 'inset 0 1px 2px rgba(0,0,0,.3)', flex: 'none' }}>
      <motion.span layout transition={SNAP} style={{ position: 'absolute', top: 3, left: on ? 23 : 3, width: 26, height: 26, borderRadius: 99, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.4)' }} />
    </button>
  );
}
