/**
 * Film grain for the colour field, baked once at start-up into a small noise tile (random white at random opacity).
 * It used to be an SVG feTurbulence filter, which the browser has to re-run whenever a layer holding it is rastered;
 * a ready-made tile is just an image blit. Falls back to the SVG in the CSS until (or unless) this runs.
 */
let tile: { cv: HTMLCanvasElement; a: Uint8Array; n: number } | null = null;
/** the grain's tile (its canvas, and its alpha by pixel), so the dithered field pictures (ui/glow.ts) can draw the very same
 * grain the CSS shows; null until installGrain has run */
export const grainTile = () => tile;

export function installGrain() {
  try {
    const n = 192; // drawn at a quarter of its pixel size: about one noise dot per device pixel on a phone
    const c = document.createElement('canvas'); c.width = c.height = n;
    // (kept in memory, not on the graphics chip: the quick glow pictures draw from it, and reading back from the chip stalls)
    const x = c.getContext('2d', { willReadFrequently: true }); if (!x) return;
    const d = x.createImageData(n, n);
    for (let i = 0; i < d.data.length; i += 4) { d.data[i] = d.data[i + 1] = d.data[i + 2] = 255; d.data[i + 3] = (Math.random() * Math.random() * 255) | 0; }
    x.putImageData(d, 0, 0);
    const a = new Uint8Array(n * n); for (let i = 0; i < a.length; i++) a[i] = d.data[i * 4 + 3];
    tile = { cv: c, a, n };
    c.toBlob((b) => {
      if (!b) return;
      const root = document.documentElement.style;
      root.setProperty('--grain-url', `url(${URL.createObjectURL(b)})`);
      root.setProperty('--grain-size', `${n / 4}px`);
    });
  } catch { /* the SVG fallback stays */ }
}

/**
 * Dither for dark frosted glass (CSS --dither, see styles.css "Dither" for why). One noise dot per screen pixel, baked once
 * here at the screen's own pixel size and repeated: each dot is black (white for light glass: --dither-light) at 0 to 40
 * of 255 alpha, evenly spread. A dot lets a little less of the blurred backdrop through, and that is mixed in at full
 * precision, which breaks the glow's colour
 * steps up. The dark sheet tint (--sheet-tint) is worked out for the dots' mean (20 of 255).
 */
export function installDither() {
  try {
    const n = 128, dpr = window.devicePixelRatio || 1;
    const c = document.createElement('canvas'); c.width = c.height = n;
    const x = c.getContext('2d'); if (!x) return;
    const d = x.createImageData(n, n); // black, so only the alpha is set
    for (let i = 3; i < d.data.length; i += 4) d.data[i] = Math.round(Math.random() * 40);
    x.putImageData(d, 0, 0);
    c.toBlob((b) => {
      if (b) document.documentElement.style.setProperty('--dither-dark', `url(${URL.createObjectURL(b)}) 0 0 / ${n / dpr}px ${n / dpr}px`);
    });
    // the same dots in white, for light glass (it lightens by the same mean instead)
    const l = document.createElement('canvas'); l.width = l.height = n;
    const y = l.getContext('2d'); if (!y) return;
    const e = y.createImageData(n, n);
    for (let i = 0; i < e.data.length; i += 4) { e.data[i] = e.data[i + 1] = e.data[i + 2] = 255; e.data[i + 3] = Math.round(Math.random() * 40); }
    y.putImageData(e, 0, 0);
    l.toBlob((b) => {
      if (b) document.documentElement.style.setProperty('--dither-light', `url(${URL.createObjectURL(b)}) 0 0 / ${n / dpr}px ${n / dpr}px`);
    });
  } catch { /* the glass stays plain */ }
}
