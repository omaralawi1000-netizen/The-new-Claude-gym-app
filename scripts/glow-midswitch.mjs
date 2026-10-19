// A theme switch frozen part-way through its circle reveal (default 140 ms), for comparing two builds frame by frame. The
// page is settled first (every finite animation finished, endless ones and Classic's sway held at their start) and nothing
// is tapped, so both builds show the same moment of the same screen.
//   AVEN_GPU=1 AVEN_PALETTE=forest AVEN_BG=classic URL=… node scripts/glow-midswitch.mjs out-dir tag [ms]
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import fs from 'node:fs';
const [out = 'shots/midswitch', tag = 'now', at = '140'] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
const { b, p } = await launch({ theme: 'dark', size: { width: 384, height: 832 }, dsf: 3.75 });
await p.goto(process.env.URL || 'http://127.0.0.1:5173/'); await wait(p, 1500); await skipOnboarding(p); await loadDemo(p); await wait(p, 9000);
const settle = () => p.evaluate(() => {
  for (const a of document.getAnimations()) {
    const t = a.effect?.getComputedTiming();
    if (a.animationName === 'sway' || t?.iterations === Infinity) { a.pause(); a.currentTime = 0; } else if (a.playState === 'running' && Number.isFinite(t?.endTime)) a.finish();
  }
  return document.getAnimations().filter((a) => a.playState === 'running').length;
});
await settle(); await wait(p, 600);
const running = await settle();
await p.evaluate((ms) => {
  const o = Document.prototype.startViewTransition;
  Document.prototype.startViewTransition = function (cb) {
    const t = o.call(this, cb);
    t.ready.then(() => requestAnimationFrame(() => {
      for (const a of document.getAnimations()) {
        if (String(a.effect?.pseudoElement || '').includes('view-transition')) { a.pause(); a.currentTime = ms; }
        else if (a.animationName === 'sway' || a.effect?.getComputedTiming().iterations === Infinity) { a.pause(); a.currentTime = 0; }
      }
      window.__paused = true;
    }));
    return t;
  };
}, Number(at));
await p.emulateMedia({ colorScheme: 'light' });
await p.waitForFunction(() => window.__paused, null, { timeout: 30000 });
await wait(p, 800);
await p.screenshot({ path: `${out}/midswitch-${tag}.png`, timeout: 60000 });
console.log('shot', tag, JSON.stringify({ runningBefore: running, stats: await p.evaluate(() => window.__glowStats ?? null) }));
await b.close();
