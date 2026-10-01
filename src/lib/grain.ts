/**
 * Film grain for the colour field, baked once at start-up into a small noise tile (random white at random opacity).
 * It used to be an SVG feTurbulence filter, which the browser has to re-run whenever a layer holding it is rastered;
 * a ready-made tile is just an image blit. Falls back to the SVG in the CSS until (or unless) this runs.
 */
export function installGrain() {
  try {
    const n = 192; // drawn at a quarter of its pixel size: about one noise dot per device pixel on a phone
    const c = document.createElement('canvas'); c.width = c.height = n;
    const x = c.getContext('2d'); if (!x) return;
    const d = x.createImageData(n, n);
    for (let i = 0; i < d.data.length; i += 4) { d.data[i] = d.data[i + 1] = d.data[i + 2] = 255; d.data[i + 3] = (Math.random() * Math.random() * 255) | 0; }
    x.putImageData(d, 0, 0);
    c.toBlob((b) => {
      if (!b) return;
      const root = document.documentElement.style;
      root.setProperty('--grain-url', `url(${URL.createObjectURL(b)})`);
      root.setProperty('--grain-size', `${n / 4}px`);
    });
  } catch { /* the SVG fallback stays */ }
}
