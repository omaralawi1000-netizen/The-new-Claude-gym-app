// Deterministic filmstrip of a tab switch: waits for the switch to start, freezes every animation, then steps the clock
// 30 ms at a time and screenshots each step — the motion as designed, with no jank in it.
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
const [from, to] = [process.argv[2] || 'Train', process.argv[3] || 'Food'];
const { b, p } = await launch();
await p.goto('http://127.0.0.1:5173/'); await wait(p, 900); await skipOnboarding(p); await loadDemo(p); await wait(p, 1500);
if (from !== 'Today') { await p.getByRole('button', { name: from, exact: true }).first().click(); await wait(p, 1800); }
await p.evaluate(() => {
  window.__frozen = 0;
  new MutationObserver(() => { if (window.__frozen || !document.querySelector('.tab-pane[data-go]')) return; window.__frozen = 1; requestAnimationFrame(() => requestAnimationFrame(() => { document.getAnimations().forEach((a) => a.pause()); window.__frozen = 2; })); }).observe(document.querySelector('.stage'), { attributes: true, subtree: true, attributeFilter: ['data-go'] });
});
await p.getByRole('button', { name: to, exact: true }).first().click();
await p.waitForFunction(() => window.__frozen === 2, null, { timeout: 8000 });
const t0 = await p.evaluate(() => document.getAnimations().length);
console.log('animations frozen:', t0);
for (let ms = 0; ms <= 540; ms += 30) {
  await p.evaluate((m) => document.getAnimations().forEach((a) => { const d = a.effect?.getComputedTiming?.(); if (a.timeline && a.timeline.constructor.name !== 'DocumentTimeline') return; if (d && d.iterations === Infinity) return; a.currentTime = m; }), ms);
  await p.waitForTimeout(40);
  await p.screenshot({ path: `shots/film-${String(ms).padStart(3, '0')}.png` });
}
await b.close();
