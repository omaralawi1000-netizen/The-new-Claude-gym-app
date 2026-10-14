import type { GlowLayer, GlowSrc, GlowStop } from './glow';

/**
 * Reads an element's CSS background (its gradients, its colour, a picture) the way the browser works it out, so glow.ts can
 * paint exactly the same picture with a dither. Only what the app's glows use is understood: radial and linear gradients
 * (no repeating ones, no colour hints) and one plain picture; anything else returns null and the CSS stays as it is.
 */

// ── text → parts ──────────────────────────────────────────

/** splits at `sep` outside brackets */
function split(s: string, sep: string): string[] {
  const out: string[] = []; let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') depth++; else if (ch === ')') depth--;
    if (depth === 0 && (sep === ' ' ? /\s/.test(ch) : ch === sep)) { if (cur.trim()) out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** a length (px, %, calc() of the two) against `ref` px; null if it isn't one */
export function len(tok: string, ref: number): number | null {
  const t = tok.trim();
  const kw: Record<string, number> = { left: 0, top: 0, center: 50, right: 100, bottom: 100 };
  if (t in kw) return (kw[t] / 100) * ref;
  if (t === '0') return 0;
  const toks = t.replace(/calc\(/g, '(').match(/-?\d*\.?\d+(?:e[-+]?\d+)?(?:px|%)?|[-+*/()]/gi);
  if (!toks || toks.join('').length < t.replace(/calc|\s/g, '').length) return null;
  let i = 0;
  const atom = (): number => {
    const k = toks[i++];
    if (k === '(') { const v = sum(); i++; return v; }
    if (k === '-') return -atom();
    const m = k.match(/^(-?\d*\.?\d+(?:e[-+]?\d+)?)(px|%)?$/i); if (!m) throw new Error('len');
    const v = Number(m[1]); return m[2] === '%' ? (v / 100) * ref : v;
  };
  const prod = (): number => { let v = atom(); while (toks[i] === '*' || toks[i] === '/') { const o = toks[i++], w = atom(); v = o === '*' ? v * w : v / w; } return v; };
  const sum = (): number => { let v = prod(); while (toks[i] === '+' || toks[i] === '-') { const o = toks[i++], w = prod(); v = o === '+' ? v + w : v - w; } return v; };
  try { const v = sum(); return i === toks.length && Number.isFinite(v) ? v : null; } catch { return null; }
}

let probe: CanvasRenderingContext2D | null = null;
/** a CSS colour → straight 0-255 colour and 0-1 alpha; `legacy`: an rgb()-style colour (CSS mixes those in sRGB) */
export function color(tok: string): { c: [number, number, number, number]; legacy: boolean } | null {
  const t = tok.trim();
  if (t === 'transparent') return { c: [0, 0, 0, 0], legacy: true };
  let m = t.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
  if (m) return { c: [+m[1], +m[2], +m[3], m[4] ? (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4]) : 1], legacy: true };
  m = t.match(/^color\(srgb\s+([-\d.e]+)\s+([-\d.e]+)\s+([-\d.e]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/);
  if (m) return { c: [+m[1] * 255, +m[2] * 255, +m[3] * 255, m[4] ? (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4]) : 1], legacy: false };
  // oklch() / oklab() (the light sky's colours): worked out here, to the fraction (a pixel read back is whole levels, and
  // worse for a see-through colour)
  m = t.match(/^ok(lch|lab)\(\s*([-\d.e]+%?)\s+([-\d.e]+%?)\s+([-\d.e]+)(?:deg)?(?:\s*\/\s*([\d.]+%?))?\s*\)$/);
  if (m) {
    const n = (v: string, pct: number) => (v.endsWith('%') ? (parseFloat(v) / 100) * pct : parseFloat(v));
    const L = n(m[2], 1), x = n(m[3], m[1] === 'lch' ? 0.4 : 0.4), y = parseFloat(m[4]);
    const [A, B] = m[1] === 'lch' ? [x * Math.cos((y * Math.PI) / 180), x * Math.sin((y * Math.PI) / 180)] : [x, y];
    const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3, mm = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3, ss = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
    const g = (v: number) => Math.min(1, Math.max(0, v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)) * 255;
    const al = m[5] ? (m[5].endsWith('%') ? parseFloat(m[5]) / 100 : +m[5]) : 1;
    return { c: [g(4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * ss), g(-1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * ss), g(-0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * ss), al], legacy: false };
  }
  // anything else (a named colour, #hex, lab()…): let the browser draw one pixel of it
  if (!probe) { const c = document.createElement('canvas'); c.width = c.height = 1; probe = c.getContext('2d', { willReadFrequently: true }); }
  if (!probe) return null;
  probe.fillStyle = '#010203'; probe.fillStyle = t;
  if (String(probe.fillStyle) === '#010203' && t.toLowerCase() !== '#010203') return null; // not a colour
  probe.clearRect(0, 0, 1, 1); probe.fillRect(0, 0, 1, 1);
  const d = probe.getImageData(0, 0, 1, 1).data;
  const a = d[3] / 255;
  return { c: a ? [d[0], d[1], d[2], a] : [0, 0, 0, 0], legacy: /^(#|[a-z]+$)/i.test(t) };
}

/** a colour stop: its colour, then none, one or two positions */
function stopsOf(args: string[], ray: number): GlowStop[] | null {
  const raw: { c: [number, number, number, number]; p: number | null }[] = [];
  let legacy = true;
  for (const a of args) {
    const parts = split(a, ' ');
    const col = color(parts[0]); if (!col) return null; // (a bare position is a colour hint: not used here)
    legacy &&= col.legacy;
    const ps = parts.slice(1).map((p) => len(p, ray));
    if (ps.some((p) => p === null)) return null;
    if (!ps.length) raw.push({ c: col.c, p: null });
    for (const p of ps) raw.push({ c: col.c, p: (p as number) / ray });
  }
  if (raw.length < 2) return null;
  // positions as CSS fixes them up: the ends at 0 and 1, never backwards, the missing ones spread evenly
  if (raw[0].p === null) raw[0].p = 0;
  if (raw[raw.length - 1].p === null) raw[raw.length - 1].p = 1;
  let hi = -Infinity;
  for (const r of raw) if (r.p !== null) { r.p = Math.max(r.p, hi); hi = r.p; }
  for (let i = 1; i < raw.length; i++) {
    if (raw[i].p !== null) continue;
    let j = i; while (raw[j].p === null) j++;
    const a = raw[i - 1].p as number, b = raw[j].p as number;
    for (let k = i; k < j; k++) raw[k].p = a + ((b - a) * (k - i + 1)) / (j - i + 1);
  }
  const out = raw.map((r) => ({ c: r.c, p: r.p as number }));
  (out as GlowStop[] & { legacy?: boolean }).legacy = legacy;
  return out;
}

const isStop = (a: string) => color(split(a, ' ')[0]) !== null && !/^(circle|ellipse|closest|farthest|at\b|to\b|-?[\d.])/.test(a);

/** one gradient in a W × H box (the element's background box), or null */
export function gradient(src: string, W: number, H: number): GlowLayer | null {
  const m = src.match(/^(radial|linear)-gradient\((.*)\)$/s);
  if (!m) return null;
  const args = split(m[2], ',');
  const geo = args.length && !isStop(args[0]) ? args.shift()! : '';
  if (m[1] === 'linear') {
    let dx = 0, dy = 1; // to bottom
    const g = geo.trim();
    if (g.startsWith('to ')) {
      const w = g.slice(3).split(/\s+/);
      const sx = w.includes('right') ? 1 : w.includes('left') ? -1 : 0, sy = w.includes('bottom') ? 1 : w.includes('top') ? -1 : 0;
      if (sx && sy) { dx = sx * H; dy = sy * W; } else { dx = sx; dy = sy; } // a corner: across the box's diagonal, as CSS draws it
      const n = Math.hypot(dx, dy); dx /= n; dy /= n;
    } else if (g) {
      const a = g.match(/^(-?[\d.]+)(deg|rad|turn|grad)$/); if (!a) return null;
      const r = +a[1] * ({ deg: Math.PI / 180, rad: 1, turn: Math.PI * 2, grad: Math.PI / 200 } as Record<string, number>)[a[2]];
      dx = Math.sin(r); dy = -Math.cos(r);
    }
    const L = Math.abs(W * dx) + Math.abs(H * dy);
    const stops = stopsOf(args, L); if (!stops || !L) return null;
    return { k: 'l', g: [W / 2 - (dx * L) / 2, H / 2 - (dy * L) / 2, dx / L, dy / L], stops, oklab: !(stops as { legacy?: boolean }).legacy };
  }
  // radial: [shape] [size] [at x y]
  const [sz, at] = geo.includes(' at ') || geo.startsWith('at ') ? [geo.slice(0, geo.indexOf('at ')).trim(), geo.slice(geo.indexOf('at ') + 3).trim()] : [geo.trim(), ''];
  let cx = W / 2, cy = H / 2;
  if (at) {
    let p = split(at, ' ');
    if (p.length === 1) p = /^(top|bottom)$/.test(p[0]) ? ['center', p[0]] : [p[0], 'center'];
    if (/^(top|bottom)$/.test(p[0]) || /^(left|right)$/.test(p[1])) p = [p[1], p[0]];
    const x = len(p[0], W), y = len(p[1], H); if (x === null || y === null) return null;
    cx = x; cy = y;
  }
  const words = split(sz, ' ');
  const shape = words.includes('circle') ? 'circle' : words.includes('ellipse') ? 'ellipse' : '';
  const rest = words.filter((w) => w !== 'circle' && w !== 'ellipse');
  const key = rest.find((w) => /^(closest|farthest)-(side|corner)$/.test(w)) ?? (rest.length ? '' : 'farthest-corner');
  const sides = [cx, W - cx, cy, H - cy].map(Math.abs), corners = [[0, 0], [W, 0], [0, H], [W, H]].map(([x, y]) => Math.hypot(x - cx, y - cy));
  let rx: number, ry: number;
  const circle = shape === 'circle' || (!shape && rest.length === 1 && !key);
  if (!key) {
    const a = len(rest[0], W), b = rest[1] ? len(rest[1], H) : a; if (a === null || b === null) return null;
    rx = a; ry = circle ? a : b;
  } else if (circle) {
    rx = ry = key === 'closest-side' ? Math.min(...sides) : key === 'farthest-side' ? Math.max(...sides) : key === 'closest-corner' ? Math.min(...corners) : Math.max(...corners);
  } else {
    const near = key.startsWith('closest');
    rx = near ? Math.min(sides[0], sides[1]) : Math.max(sides[0], sides[1]);
    ry = near ? Math.min(sides[2], sides[3]) : Math.max(sides[2], sides[3]);
    if (key.endsWith('corner')) { rx *= Math.SQRT2; ry *= Math.SQRT2; }
  }
  if (!(rx > 0 && ry > 0)) return null;
  const stops = stopsOf(args, rx); if (!stops) return null;
  return { k: 'r', g: [cx, cy, rx, ry], stops, oklab: !(stops as { legacy?: boolean }).legacy };
}

/** an element's background: its gradients (bottom first), or a picture's address; null if there's something else in it */
export function background(cs: CSSStyleDeclaration, W: number, H: number): { layers: GlowLayer[]; url?: string } | null {
  const img = cs.backgroundImage;
  if (!img || img === 'none') return { layers: [] };
  const parts = split(img, ',');
  // the default box, size and repeat only: an element that sets them otherwise is a picture laid out its own way
  const url = parts.length === 1 && parts[0].match(/^url\("?(.*?)"?\)$/);
  if (url) return { layers: [], url: url[1] };
  if (cs.backgroundSize.split(',').some((s) => s.trim() !== 'auto' && s.trim() !== 'auto auto')) return null;
  const layers: GlowLayer[] = [];
  for (const p of parts.reverse()) { const g = gradient(p, W, H); if (!g) return null; layers.push(g); }
  return { layers };
}

/** where an element's box sits inside `host`, in CSS px (by the layout, not by where a motion has it right now) */
function offsetIn(el: HTMLElement, host: HTMLElement): [number, number] | null {
  let x = 0, y = 0;
  for (let e: HTMLElement | null = el; e && e !== host; e = e.offsetParent as HTMLElement | null) {
    if (!e.offsetParent && e !== host) return null;
    x += e.offsetLeft + (e === el ? 0 : e.clientLeft); y += e.offsetTop + (e === el ? 0 : e.clientTop);
    if (e.offsetParent === host) return [x, y];
  }
  return el === host ? [0, 0] : null;
}

/** an element's 2D transform as (a, b, c, d, e, f) */
function matrix(cs: CSSStyleDeclaration): number[] | null {
  const t = cs.transform;
  if (!t || t === 'none') return null;
  const v = t.match(/\((.*)\)/)?.[1].split(',').map(Number);
  if (!v) return null;
  return t.startsWith('matrix3d') ? [v[0], v[1], v[4], v[5], v[12], v[13]] : v;
}

export type ReadOpts = {
  /** canvas px per CSS px */ s: number;
  /** take in the element's own opacity (and its parents' up to the host) and transform: it is painted into the host's picture */
  inHost?: boolean;
  /** what to read instead of the element's own colour and gradients (the element is the canvas's host: its own CSS is off) */
  cs?: CSSStyleDeclaration;
};
/** One element's picture as a glow source, placed in `host`'s canvas; null if it can't be painted (then nothing is) */
export function readSrc(el: HTMLElement, host: HTMLElement, o: ReadOpts): GlowSrc | null {
  const cs = o.cs ?? getComputedStyle(el);
  const W = el.clientWidth, H = el.clientHeight;
  if (!W || !H) return null;
  const bg = background(cs, W, H); if (!bg) return null;
  const col = color(cs.backgroundColor);
  let op = 1, off: [number, number] | null = [0, 0], M: number[] | null = null, origin = [0, 0];
  if (o.inHost) {
    for (let e: HTMLElement | null = el; e && e !== host; e = e.parentElement) op *= parseFloat(e === el ? cs.opacity : getComputedStyle(e).opacity);
    off = offsetIn(el, host); if (!off) return null;
    M = matrix(cs);
    if (M) origin = cs.transformOrigin.split(' ').map(parseFloat);
  }
  // canvas px → the element's own px: undo the canvas's scale, the element's place in the host and its transform
  let m = [1 / o.s, 0, 0, 1 / o.s, -off[0], -off[1]];
  if (M) {
    const [a, b, c, d, e, f] = M, det = a * d - b * c;
    if (!det) return null;
    const ia = d / det, ib = -b / det, ic = -c / det, id = a / det;
    // local = o + Minv · (host − off − o − t)
    const hx = -off[0] - origin[0] - e, hy = -off[1] - origin[1] - f;
    m = [ia / o.s, ib / o.s, ic / o.s, id / o.s, origin[0] + ia * hx + ic * hy, origin[1] + ib * hx + id * hy];
  }
  const src: GlowSrc = { op, m, w: W, h: H, clip: !!o.inHost, bg: col && col.c[3] > 0 ? col.c : null, layers: bg.layers };
  if (bg.url) {
    // a picture: placed as CSS places it (cover, or a width with auto height, at its position); fetched before painting
    const size = cs.backgroundSize.trim(), pos = cs.backgroundPosition.split(' ');
    src.img = { bm: null as unknown as ImageBitmap, url: bg.url, x: 0, y: 0, w: 0, h: 0 };
    (src.img as unknown as { fit: string; pos: string[] }).fit = size;
    (src.img as unknown as { fit: string; pos: string[] }).pos = pos;
  }
  return src;
}

/** an SVG picture's own size (an SVG with only a viewBox has none the page reports) */
function svgSize(url: string): [number, number] | null {
  if (!url.startsWith('data:image/svg+xml')) return null;
  const t = decodeURIComponent(url.slice(url.indexOf(',') + 1));
  const w = t.match(/<svg[^>]*\swidth=['"]([\d.]+)/), h = t.match(/<svg[^>]*\sheight=['"]([\d.]+)/);
  if (w && h) return [+w[1], +h[1]];
  const vb = t.match(/viewBox=['"][-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)/);
  return vb ? [+vb[1], +vb[2]] : null;
}

/** Fetches the pictures of `srcs` and draws each into a w × h canvas-sized picture, where CSS puts it */
export async function loadPictures(srcs: GlowSrc[], w: number, h: number): Promise<boolean> {
  for (const src of srcs) {
    const im = src.img as (GlowSrc['img'] & { fit: string; pos: string[] }) | undefined;
    if (!im?.url) continue;
    const el = new Image(); el.src = im.url;
    try { await el.decode(); } catch { return false; }
    const [iw, ih] = svgSize(im.url) ?? [el.naturalWidth || 300, el.naturalHeight || 150], W = src.w, H = src.h;
    let dw: number, dh: number;
    if (im.fit === 'cover' || im.fit === 'contain') { const k = (im.fit === 'cover' ? Math.max : Math.min)(W / iw, H / ih); dw = iw * k; dh = ih * k; }
    else {
      const [a, b = 'auto'] = im.fit.split(' '), x = a === 'auto' ? null : len(a, W), y = b === 'auto' ? null : len(b, H);
      dw = x ?? (y !== null ? (y * iw) / ih : iw); dh = y ?? (dw * ih) / iw;
    }
    // a position in % is a share of the room left over (CSS's rule); in px it is a plain offset
    const at = (p: string | undefined, free: number) => (p?.endsWith('%') ? (parseFloat(p) / 100) * free : len(p ?? '0', 0) ?? 0);
    const x0 = at(im.pos[0], W - dw), y0 = at(im.pos[1], H - dh);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); if (!g) return false;
    // element px → canvas px: the inverse of src.m
    const [ma, mb, mc, md, me, mf] = src.m, det = ma * md - mb * mc;
    g.setTransform(md / det, -mb / det, -mc / det, ma / det, (mc * mf - md * me) / det, (mb * me - ma * mf) / det);
    g.imageSmoothingQuality = 'high';
    g.drawImage(el, x0, y0, dw, dh);
    im.bm = await createImageBitmap(c); im.x = 0; im.y = 0; im.w = w; im.h = h;
  }
  return true;
}
