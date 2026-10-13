// Counts what Chrome repaints while pop-ups move: Paint events and raster tasks (tiles), per action, at phone size. A
// full-screen layer repainted every frame (e.g. a variable written on a big painted element) shows as dozens of extra tiles. usage: node scripts/paint-count.mjs [--light]  (preview build on :4173)
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
const theme = process.argv.includes('--light') ? 'light' : 'dark';
const { b, ctx, p } = await launch({ theme, size: { width: 384, height: 832 } });
await p.goto(process.env.URL || 'http://127.0.0.1:4173/'); await wait(p, 1500); await skipOnboarding(p); await loadDemo(p); await wait(p, 1200);
const screen = 384 * 832;
async function measure(name, fn, ms = 1300) {
  await b.startTracing(p, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'cc', 'disabled-by-default-cc.debug'] });
  await fn(); await wait(p, ms);
  const buf = await b.stopTracing();
  const ev = JSON.parse(buf.toString()).traceEvents;
  const paints = ev.filter((e) => e.name === 'Paint' && e.ph === 'X');
  const raster = ev.filter((e) => e.name === 'RasterTask' && e.ph === 'X').length;
  console.log(`${name.padEnd(16)} paints ${String(paints.length).padStart(4)}  raster tiles ${String(raster).padStart(4)}`);
}
await measure('settings open', () => p.getByLabel('Settings').first().tap());
await measure('settings close', () => p.keyboard.press('Escape'));
await measure('workout open', () => p.getByRole('button', { name: /Start workout/ }).first().tap(), 2000);
await measure('workout minimise', () => p.getByRole('button', { name: 'Minimise workout' }).tap(), 1600);
await measure('workout resume', () => p.getByLabel('Resume workout').first().tap(), 1600);
await b.close();
