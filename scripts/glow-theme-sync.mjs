// Does a theme switch's first frame already hold the new picture? Reads the tab field's canvas in the same task as the
// switch (a MutationObserver registered after the app's own, so it runs after the app's) and again two frames later.
//   AVEN_GPU=1 AVEN_BG=classic AVEN_PALETTE=forest URL=http://127.0.0.1:5174/ node scripts/glow-theme-sync.mjs
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
const { b, p } = await launch({ size: { width: 384, height: 832 }, dsf: 3.75 });
await p.goto(process.env.URL || 'http://127.0.0.1:5174/'); await wait(p, 1200); await skipOnboarding(p); await loadDemo(p); await wait(p, 6000);
const probe = (to) => p.evaluate((to) => new Promise((res) => {
  const cv = document.querySelector('.fields > [data-k] > canvas.glow-field');
  if (!cv) return res('no field canvas');
  const px = () => { const g = new OffscreenCanvas(1, 1).getContext('2d'); g.drawImage(cv, -(cv.width * 0.75 | 0), -(cv.height * 0.3 | 0)); const d = g.getImageData(0, 0, 1, 1).data; return `${d[0]},${d[1]},${d[2]},${d[3]}${cv.hasAttribute('data-q') ? ' (quick)' : ''}`; };
  const before = px();
  let t0 = 0;
  const mo = new MutationObserver(() => {
    const ms = Math.round(performance.now() - t0);
    mo.disconnect(); const same = px() + ` after ${ms} ms`;
    requestAnimationFrame(() => requestAnimationFrame(() => res({ before, sameTask: same, twoFrames: px() })));
  });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  t0 = performance.now(); document.documentElement.dataset.theme = to;
}), to);
console.log('to light:', JSON.stringify(await probe('light')));
await wait(p, 5000);
console.log('to dark: ', JSON.stringify(await probe('dark')));
await b.close();
