/**
 * The light dock's outer shadow (styles.css `.tabbar.glass`, 0 8px 24px -12px rgba(30, 40, 70, .25)) as a dithered picture.
 * The phone draws a blurred shadow in whole levels, which showed as faint coloured rings where it fades out at the dock's
 * corners. Here it is worked out as CSS draws it (the dock's pill, 12 px smaller, 8 px down, a 24 px blur) at half the
 * screen's pixels, rounded up or down at random in proportion (one picture, made once per dock size), and shown in place of
 * the shadow (`.dock-shadow` on the root) under the dock: no layer, nothing redrawn.
 */
const PAD = { t: 30, r: 30, b: 40, l: 30 }; // (where the picture reaches past the dock: styles.css uses the same)

/** a box blur of radius r along rows (`w` wide), in place, through `tmp` */
function boxRows(a: Float32Array, tmp: Float32Array, w: number, h: number, r: number) {
  const k = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += a[o + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[o + x] = acc * k;
      acc += a[o + Math.min(w - 1, x + r + 1)] - a[o + Math.max(0, x - r)];
    }
  }
  a.set(tmp);
}
function transpose(a: Float32Array, w: number, h: number) {
  const t = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) t[x * h + y] = a[y * w + x];
  return t;
}
/** a rounded box's cover of a pixel (its centre's distance to the edge, smoothed over one pixel) */
function cover(px: number, py: number, x0: number, y0: number, x1: number, y1: number, r: number) {
  const cx = Math.min(Math.max(px, x0 + r), x1 - r), cy = Math.min(Math.max(py, y0 + r), y1 - r);
  const d = Math.hypot(px - cx, py - cy) - r;
  return Math.min(1, Math.max(0, 0.5 - d));
}

function paint(W: number, H: number): ImageData {
  const s = Math.max(1, (window.devicePixelRatio || 1) / 2);
  const w = Math.round((W + PAD.l + PAD.r) * s), h = Math.round((H + PAD.t + PAD.b) * s);
  const R = H / 2, spread = -12, dy = 8, sigma = 12 * s;
  // the shadow's shape (the pill, shrunk by the spread and moved down), then three box blurs ≈ the Gaussian CSS uses
  const a = new Float32Array(w * h);
  const sx0 = (PAD.l - spread) * s, sx1 = (PAD.l + W + spread) * s, sy0 = (PAD.t + dy - spread) * s, sy1 = (PAD.t + dy + H + spread) * s;
  const sr = Math.max(0, R + spread) * s;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[y * w + x] = cover(x + 0.5, y + 0.5, sx0, sy0, sx1, sy1, sr);
  // (box radius for three passes: sigma² = 3 · ((2r + 1)² − 1) / 12)
  const r = Math.max(1, Math.round((Math.sqrt(4 * sigma * sigma + 1) - 1) / 2));
  const tmp = new Float32Array(w * h);
  for (let i = 0; i < 3; i++) boxRows(a, tmp, w, h, r);
  let t = transpose(a, w, h); const tmp2 = new Float32Array(w * h);
  for (let i = 0; i < 3; i++) boxRows(t, tmp2, h, w, r);
  t = transpose(t, h, w);
  // only outside the dock itself (an outer shadow), at 25 %, rounded with triangular noise (alpha in levels)
  const bx0 = PAD.l * s, bx1 = (PAD.l + W) * s, by0 = PAD.t * s, by1 = (PAD.t + H) * s, br = R * s;
  const d = new ImageData(w, h), px = d.data;
  let seed = 0x6d2b79f5;
  const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, A = 255 * 0.25 * t[i] * (1 - cover(x + 0.5, y + 0.5, bx0, by0, bx1, by1, br));
    if (A <= 0) continue;
    const e = Math.min(2, A, 255 - A);
    px[i * 4] = 30; px[i * 4 + 1] = 40; px[i * 4 + 2] = 70;
    px[i * 4 + 3] = Math.round(A + (rnd() + rnd() - 1) * e);
  }
  return d;
}

export function installDockShadow() {
  if (typeof ResizeObserver === 'undefined' || typeof OffscreenCanvas === 'undefined') return;
  let made = '', url = '';
  const make = (nav: HTMLElement) => {
    const W = nav.offsetWidth, H = nav.offsetHeight, key = `${W}x${H}`;
    if (!W || !H || key === made) return;
    made = key;
    const d = paint(W, H), c = new OffscreenCanvas(d.width, d.height), g = c.getContext('2d'); if (!g) return;
    g.putImageData(d, 0, 0);
    void c.convertToBlob({ type: 'image/png' }).then(async (b) => {
      const u = URL.createObjectURL(b), im = new Image(); im.src = u; await im.decode().catch(() => {});
      const root = document.documentElement;
      root.style.setProperty('--dock-shadow', `url(${u})`); root.classList.add('dock-shadow');
      if (url) URL.revokeObjectURL(url);
      url = u;
    });
  };
  const find = () => {
    const nav = document.querySelector<HTMLElement>('.tabbar.glass');
    if (!nav) { window.setTimeout(find, 800); return; }
    const idle = () => (typeof requestIdleCallback === 'function' ? requestIdleCallback(() => make(nav), { timeout: 3000 }) : window.setTimeout(() => make(nav), 500));
    new ResizeObserver(idle).observe(nav);
  };
  find();
}
