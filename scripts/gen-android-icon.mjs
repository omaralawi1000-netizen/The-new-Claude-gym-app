// Draws the Android app's icon and launch orb: Aven's lit sphere of dots, seen front on, in even rings so the outline is a
// true circle and every dot stays a clear dot at home-screen size. Run: node scripts/gen-android-icon.mjs [outDir]
// Writes the adaptive icon (foreground + a monochrome layer for themed icons), the old-style icon, and the launch orb.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const RES = process.argv[2] || 'android/app/src/main/res';
const DENS = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xhdpi_: 0, xxhdpi: 3, xxxhdpi: 4 };
delete DENS.xhdpi_;

import { svg } from './orb-svg.mjs';

const b = await chromium.launch();
const page = await (await b.newContext({ deviceScaleFactor: 1 })).newPage();
async function png(path, size, markup) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${markup}</body></html>`);
  await page.locator('svg').screenshot({ path, omitBackground: true });
}
for (const [d, k] of Object.entries(DENS)) {
  const dir = `${RES}/mipmap-${d}`; mkdirSync(dir, { recursive: true });
  const fg = 108 * k, orb = 50 * k; // 50 of 108 dp: as big as other apps' symbols, well inside the 66 dp safe circle
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
