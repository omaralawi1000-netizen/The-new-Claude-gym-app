// Draws the Android app's icon and launch orb: Aven's lit sphere of dots, front half only, with fewer and bolder dots
// than the web icon so it stays crisp at home-screen size. Run: node scripts/gen-android-icon.mjs [outDir]
// Writes the adaptive icon (foreground + a monochrome layer for themed icons), the old-style icon, and the launch orb.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const RES = process.argv[2] || 'android/app/src/main/res';
const DENS = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xhdpi_: 0, xxhdpi: 3, xxxhdpi: 4 };
delete DENS.xhdpi_;

// the sphere, as dots: Fibonacci lattice, tilted, only the half facing us
function dots(n = 300) {
  const g = Math.PI * (3 - Math.sqrt(5)), out = [];
  const L = (() => { const v = [-0.45, -0.6, 0.66], m = Math.hypot(...v); return v.map((x) => x / m); })();
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - y * y), th = g * i;
    const x = Math.cos(th) * r, z0 = Math.sin(th) * r, t = 0.38;
    const yy = y * Math.cos(t) - z0 * Math.sin(t), z = y * Math.sin(t) + z0 * Math.cos(t);
    if (z < 0.12) continue;
    const lam = Math.max(0, x * L[0] + yy * L[1] + z * L[2]);
    out.push({ x, y: yy, z, lam });
  }
  return out;
}
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const SHADOW = [140, 52, 22], EMBER = [236, 116, 59], LIGHT = [255, 178, 128];
function colour(lam) {
  const t = 0.2 + 0.8 * lam;
  return t < 0.6 ? mix(SHADOW, EMBER, t / 0.6) : mix(EMBER, LIGHT, (t - 0.6) / 0.4);
}

/** an svg of `size` px with the orb `diam` px wide in the middle; mono = one flat colour (themed icons) */
function svg(size, diam, { mono = false, glow = false, bg = null, radius = 0 } = {}) {
  const c = size / 2, R = diam / 2, base = R * 0.092;
  const body = dots().sort((a, b) => a.z - b.z).map((p) => {
    const rad = base * (0.22 + 0.78 * Math.pow(p.z, 0.75));
    const fill = mono ? '#fff' : `rgb(${colour(p.lam).join(',')})`;
    return `<circle cx="${(c + p.x * R).toFixed(2)}" cy="${(c + p.y * R).toFixed(2)}" r="${rad.toFixed(2)}" fill="${fill}"/>`;
  }).join('');
  const back = bg ? `<rect width="${size}" height="${size}" rx="${radius}" fill="${bg}"/>` : '';
  const halo = glow ? `<defs><radialGradient id="h"><stop offset="0" stop-color="#f07a3e" stop-opacity=".22"/><stop offset=".55" stop-color="#f07a3e" stop-opacity=".06"/><stop offset="1" stop-color="#f07a3e" stop-opacity="0"/></radialGradient></defs><circle cx="${c}" cy="${c}" r="${R * 1.45}" fill="url(#h)"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${back}${halo}${body}</svg>`;
}

const b = await chromium.launch();
const page = await (await b.newContext({ deviceScaleFactor: 1 })).newPage();
async function png(path, size, markup) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${markup}</body></html>`);
  await page.locator('svg').screenshot({ path, omitBackground: true });
}
for (const [d, k] of Object.entries(DENS)) {
  const dir = `${RES}/mipmap-${d}`; mkdirSync(dir, { recursive: true });
  const fg = 108 * k, orb = 46 * k; // 46 of 108 dp: as big as other apps' symbols, well inside the 66 dp safe circle
  await png(`${dir}/ic_launcher_foreground.png`, fg, svg(fg, orb, { glow: true }));
  await png(`${dir}/ic_launcher_monochrome.png`, fg, svg(fg, orb, { mono: true }));
  const ic = 48 * k; // phones before adaptive icons (not used from Android 8 up, kept for completeness)
  await png(`${dir}/ic_launcher.png`, ic, svg(ic, ic * 46 / 72, { bg: '#05060b', radius: ic * 0.23, glow: true }));
}
// the launch orb, 100 dp wide: Android's own launch screen (288 dp icon area) and Chrome's hand-over splash use the same
// size, so the orb stays put from the tap until the app is drawn
mkdirSync(`${RES}/drawable-xxxhdpi`, { recursive: true });
await png(`${RES}/drawable-xxxhdpi/splash_icon.png`, 288 * 4, svg(288 * 4, 100 * 4));
await png(`${RES}/drawable-xxxhdpi/splash.png`, 120 * 4, svg(120 * 4, 100 * 4));
await b.close();
