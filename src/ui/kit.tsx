import { animate, useMotionValue, useReducedMotion } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Lens } from './lens';
import { apple } from './motion';
import { Icon, type IconName } from './Icon';
import { parseNum, fmtNum } from '../lib/units';
import { useLang } from '../lib/i18n';

// ── segmented control: a drop of glass flows between options (ui/lens.ts) ─────────
const SEG_LEAD = apple(0.36, 0.1);
const SEG_TRAIL = apple(0.52);
export function Seg<T extends string | number>({ value, onChange, options, style }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; style?: CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const lens = useRef<Lens | null>(null);
  const reduce = useReducedMotion();
  const idx = options.findIndex((o) => o.value === value);
  const place = (glide: boolean) => {
    const el = ref.current; if (!el) return;
    const holder = el.querySelector('.seg-lens') as HTMLElement;
    if (!lens.current) lens.current = new Lens(holder, () => holder.offsetHeight / 2);
    const b = el.querySelectorAll(':scope > button')[idx] as HTMLElement | undefined;
    holder.style.opacity = b ? '' : '0';
    if (!b || b.offsetWidth === 0) return;
    const box = { l: b.offsetLeft, r: b.offsetLeft + b.offsetWidth };
    if (glide && !reduce) lens.current.glide(box, SEG_LEAD, SEG_TRAIL); else lens.current.place(box);
  };
  const placed = useRef(false);
  useLayoutEffect(() => { place(placed.current); placed.current = true; }, [idx]); // eslint-disable-line
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => { if (!lens.current?.moving) place(false); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []); // eslint-disable-line
  return (
    <div className="seg" role="tablist" style={style} ref={ref}>
      <span className="lens seg-lens" aria-hidden><i className="lens-l" /><i className="lens-r" /><i className="lens-m" /></span>
      {options.map((o) => (
        <button key={String(o.value)} role="tab" aria-selected={o.value === value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
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
      className="toggle press" style={{ width: 52, height: 32, borderRadius: 99, position: 'relative', background: on ? 'var(--ac)' : 'var(--s4)', transition: 'background 260ms var(--ease-smooth)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,.3)', flex: 'none' }}>
      {/* the knob springs across on the compositor (a CSS transition on transform, Apple's spring curve) */}
      <span className="toggle-knob" style={{ transform: on ? 'translate3d(20px, 0, 0)' : 'translate3d(0, 0, 0)' }} />
    </button>
  );
}
