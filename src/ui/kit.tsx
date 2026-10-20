import { Roll } from './Roll';
import { usePresence, useReducedMotion } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Lens, type LensBox } from './lens';
import { apple } from './motion';
import { Icon, type IconName } from './Icon';
import { parseNum, fmtNum } from '../lib/units';
import { useLang } from '../lib/i18n';
import { haptic } from '../state/ui';

// ── segmented control: a drop of glass flows between options (ui/lens.ts) ─────────
/** When the drop and the track differ a lot (the dark theme's white drop), each label changes colour exactly as much as
 *  the drop covers it, frame by frame, so no label is ever light on white or dark on dark mid-glide. The colours come from
 *  `--seg-ink` / `--seg-ink-on` on the .seg; without them the labels keep their plain CSS fade. */
function inkFollow(seg: HTMLElement, run: { boxes: LensBox[]; duration: number } | null): Animation[] {
  if (!run) return [];
  const cs = getComputedStyle(seg), off = cs.getPropertyValue('--seg-ink').trim(), on = cs.getPropertyValue('--seg-ink-on').trim();
  if (!off || !on) return [];
  const o = seg.getBoundingClientRect().left + seg.clientLeft;
  const out: Animation[] = [];
  for (const label of seg.querySelectorAll<HTMLElement>(':scope > button > span')) {
    const r = label.getBoundingClientRect(), x0 = r.left - o, x1 = r.right - o;
    if (x1 - x0 < 1) continue;
    const cover = run.boxes.map((b) => { const f = Math.min(1, Math.max(0, (Math.min(b.r, x1) - Math.max(b.l, x0)) / (x1 - x0))); return f * f * (3 - 2 * f); });
    if (cover.every((c) => c === cover[0])) continue;
    const n = cover.length;
    out.push(label.animate(cover.map((c, i) => ({ offset: i / (n - 1), color: `color-mix(in srgb, ${on} ${(c * 100).toFixed(1)}%, ${off})` })), { duration: run.duration, easing: 'linear' }));
  }
  return out;
}

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
    ink.current.forEach((a) => a.cancel()); ink.current = [];
    if (glide && !reduce) ink.current = inkFollow(el, lens.current.glide(box, SEG_LEAD, SEG_TRAIL)); else lens.current.place(box);
  };
  const ink = useRef<Animation[]>([]);
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
        <button key={String(o.value)} role="tab" aria-selected={o.value === value} className={o.value === value ? 'on' : ''} onClick={() => { if (o.value !== value) haptic('select'); onChange(o.value); }}>
          <span style={{ position: 'relative' }}>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

// ── animated number ─────────────────────────────────────────
/** A number that rolls to its new value (ui/Roll.tsx). It used to count through every value in between, rewriting the
 * text (and laying the line out again) on every frame. */
export function Count({ value, format, className, style }: { value: number; format?: (n: number) => string; className?: string; style?: CSSProperties }) {
  return <Roll text={(format ?? ((n) => String(Math.round(n))))(value)} className={className} style={style} />;
}

// ── numeric input, locale aware ─────────────────────────────
export function NumInput({ value, onChange, unit, placeholder, className, max = 2, big, compact, min, autoFocus, onEnter, label, step }: {
  value: number | undefined; onChange: (v: number | undefined) => void; unit?: string; placeholder?: string; className?: string; max?: number; big?: boolean; compact?: boolean; min?: number; autoFocus?: boolean; onEnter?: () => void; label?: string; step?: number;
}) {
  const lang = useLang();
  const [txt, setTxt] = useState<string>(value === undefined ? '' : fmtNum(value, lang, max));
  const focused = useRef(false);
  // Tapping a number puts the caret after it and the first digit you type replaces it. (Selecting it all on focus did the
  // same job, but on Android every selection pops the Cut / Copy / Translate bar right over the form.)
  const fresh = useRef(false);
  useEffect(() => {
    if (!focused.current) setTxt(value === undefined ? '' : fmtNum(value, lang, max));
  }, [value, lang, max]);
  return (
    <div className={`input-unit ${unit ? 'has-unit' : ''} ${className ?? ''}`}>
      <input
        className={`input ${big ? 'lg' : ''} ${compact ? 'compact' : ''}`} inputMode="decimal" enterKeyHint="done" autoComplete="off" placeholder={placeholder} aria-label={label ?? unit}
        value={txt} autoFocus={autoFocus}
        onFocus={(e) => {
          focused.current = true; fresh.current = true;
          const el = e.currentTarget; requestAnimationFrame(() => { try { el.setSelectionRange(el.value.length, el.value.length); } catch { /* ignore */ } });
        }}
        onPointerDown={() => { if (focused.current) fresh.current = false; }} // a second tap means "edit where I tapped"
        onBlur={() => { focused.current = false; fresh.current = false; setTxt(value === undefined ? '' : fmtNum(value, lang, max)); }}
        onKeyDown={(e) => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); onEnter?.(); } }}
        onChange={(e) => {
          let raw = e.target.value;
          // first keystroke after focusing: typed at the end of the old number → the typed part replaces it
          if (fresh.current) { fresh.current = false; if (raw.length > txt.length && raw.startsWith(txt)) raw = raw.slice(txt.length); }
          // keep one separator, no more than 2 decimals (or the field's own), and no absurd lengths ("1.2.3", "82.55555", "99999999")
          const cleaned = raw.replace(/[^0-9.,]/g, '');
          const cut = cleaned.search(/[.,]/);
          const whole = (cut < 0 ? cleaned : cleaned.slice(0, cut)).slice(0, 6);
          const s = cut < 0 ? whole : `${whole}${cleaned[cut]}${cleaned.slice(cut + 1).replace(/[.,]/g, '').slice(0, Math.max(max, 2))}`;
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
/** `compact`: smaller buttons and a value box sized to its content, so two fit side by side on a phone. */
export function Stepper({ value, onChange, step = 1, min = 0, max = 9999, unit, fmt, compact, label }: { value: number; onChange: (n: number) => void; step?: number; min?: number; max?: number; unit?: string; fmt?: (n: number) => string; compact?: boolean; label?: string }) {
  const lang = useLang();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const val = useRef(value);
  val.current = value;
  /** one step; false once the limit is reached (a disabled button never hears the finger lift, so the repeat stops itself) */
  const bump = (dir: 1 | -1) => {
    const n = Math.min(max, Math.max(min, Math.round((val.current + dir * step) * 1000) / 1000));
    if (n !== val.current) onChange(n);
    val.current = n;
    return dir > 0 ? n < max : n > min;
  };
  const start = (dir: 1 | -1) => {
    stop();
    if (!bump(dir)) return;
    // the finger lifting anywhere ends it too (the button may have turned disabled under it)
    window.addEventListener('pointerup', stop, { once: true });
    window.addEventListener('pointercancel', stop, { once: true });
    let delay = 380;
    const loop = () => { timer.current = setTimeout(() => { if (!bump(dir)) { stop(); return; } delay = Math.max(60, delay * 0.8); loop(); }, delay); };
    loop();
  };
  function stop() {
    clearTimeout(timer.current);
    timer.current = undefined;
    window.removeEventListener('pointerup', stop);
    window.removeEventListener('pointercancel', stop);
  }
  useEffect(() => stop, []);
  // the number rolls the way it moved (up on +, down on −); nothing moves on the first draw
  const prev = useRef(value);
  const dir = value > prev.current ? 'up' : value < prev.current ? 'down' : '';
  useEffect(() => { prev.current = value; }, [value]);
  const shown = <span key={value} className={`step-val${dir ? ` roll-${dir}` : ''}`}>{fmt ? fmt(value) : fmtNum(value, lang, 2)}{unit && <span className="t3 small"> {unit}</span>}</span>;
  const hold = (dir: 1 | -1) => ({ onPointerDown: () => start(dir), onPointerUp: stop, onPointerLeave: stop, onPointerCancel: stop });
  if (compact) {
    // one slim capsule: − value +. Light, and every one in a list lines up on the right
    return (
      <div className="stepper pill" role="group" aria-label={label}>
        <button className="pill-btn" aria-label="Decrease" disabled={value <= min} {...hold(-1)}><Icon name="minus" size={16} sw={2.2} /></button>
        <div className="num pill-val" aria-live="polite">{shown}</div>
        <button className="pill-btn" aria-label="Increase" disabled={value >= max} {...hold(1)}><Icon name="plus" size={16} sw={2.2} /></button>
      </div>
    );
  }
  return (
    <div className="row-flex stepper" style={{ gap: 6 }} role="group" aria-label={label}>
      <button className="icon-btn press" aria-label="Decrease" disabled={value <= min} {...hold(-1)}><Icon name="minus" size={22} /></button>
      <div className="num step-box" style={{ minWidth: 64, textAlign: 'center', fontWeight: 650, fontSize: 18, whiteSpace: 'nowrap' }}>{shown}</div>
      <button className="icon-btn press" aria-label="Increase" disabled={value >= max} {...hold(1)}><Icon name="plus" size={22} /></button>
    </div>
  );
}

// ── collapse / reveal ───────────────────────────────────────
const STARTING_STYLE = typeof window !== 'undefined' && 'CSSStartingStyleRule' in window;
/**
 * Opens and closes its content by sliding a grid row between 0fr and 1fr: the browser lays it out as it goes, and no script
 * measures heights on every frame. (Motion's height: 'auto' and `layout` animations measured the whole page each time
 * anything changed — most of the pause when a workout opened.) `appear`: grows in when mounted. Inside AnimatePresence it
 * also folds away before it is removed. Once open, its content may overflow (a set's glow and "+2.5 kg" rise above it).
 */
export function Collapse({ open = true, appear: appearProp = false, children, className, style, ms = 320 }: { open?: boolean; appear?: boolean; children: ReactNode; className?: string; style?: CSSProperties; ms?: number }) {
  // `appear` counts only when the row first mounts, and its class goes once the row has grown: a row React later moves
  // (Move up / down re-inserts it) would otherwise meet @starting-style again and fold shut and open mid-move
  const [appear] = useState(appearProp);
  const [isPresent, safeToRemove] = usePresence();
  const reduce = useReducedMotion();
  // Where the browser has @starting-style the row grows from the very first frame (the CSS gives it its 0fr start); older
  // browsers draw one frame closed and then open it, two frames later
  const [grown, setGrown] = useState(!appear || !!reduce || STARTING_STYLE);
  const [settled, setSettled] = useState(!appear);
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (grown) return;
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setGrown(true))); // one laid-out frame at 0fr first
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line
  }, []);
  const on = grown && open && isPresent;
  const first = useRef(true);
  useEffect(() => {
    // mounted already open: nothing is moving, so no re-render and no timer per row (a workout mounts dozens of these)
    if (first.current) { first.current = false; if (!appear) return; }
    const el = ref.current; if (!el) return;
    setSettled(false);
    const done = (e?: TransitionEvent) => { if (e && e.target !== el) return; setSettled(on); if (!isPresent) safeToRemove?.(); };
    el.addEventListener('transitionend', done);
    const t = setTimeout(() => done(), (reduce ? 0 : ms) + 60);
    return () => { el.removeEventListener('transitionend', done); clearTimeout(t); };
    // eslint-disable-next-line
  }, [on, isPresent]); // an already folded section must still release its parent's exit
  return (
    <div ref={ref} className={`collapse${appear && !settled ? ' appear' : ''}${on ? ' on' : ''}${on && settled ? ' settled' : ''}${className ? ` ${className}` : ''}`} style={{ ['--collapse-ms' as string]: `${reduce ? 0 : ms}ms`, ...style }}>
      <div className="collapse-in">{children}</div>
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
    <button role="switch" aria-checked={on} aria-label={label} onClick={() => { onChange(!on); haptic('select'); }}
      className="toggle press" style={{ width: 52, height: 32, borderRadius: 99, position: 'relative', background: on ? 'var(--ac)' : 'var(--s4)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,.3)', flex: 'none' }}>
      {/* the knob springs across on the compositor (a CSS transition on transform, Apple's spring curve) */}
      <span className="toggle-knob" style={{ transform: on ? 'translate3d(20px, 0, 0)' : 'translate3d(0, 0, 0)' }} />
    </button>
  );
}
