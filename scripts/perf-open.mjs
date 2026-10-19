// The live workout's start, minimise and resume at 4x CPU: tap → first frame the window moved, frames, late frames (> 20 ms),
// worst frame, long tasks (> 50 ms). A production build (`npx vite preview --port 4173`). RUNS=n repeats.
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
const runs = Number(process.env.RUNS || 3), rate = Number(process.env.CPU || 4);
const out = { start: [], minimise: [], resume: [] };
for (let r = 0; r < runs; r++) {
  const { b, ctx, p } = await launch({ size: { width: 384, height: 802 } });
  const cdp = await ctx.newCDPSession(p);
  await p.goto(process.env.URL || 'http://127.0.0.1:4173/'); await wait(p, 1200); await skipOnboarding(p); await loadDemo(p); await wait(p, 2000);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  const measure = async (name, act, dir, ms = 1800) => {
    await p.evaluate((dir) => {
      window.__f = []; window.__lt = []; window.__on = true; window.__t0 = 0; window.__first = 0; let last = performance.now();
      const top = () => { const s = [...document.querySelectorAll('.wk-sheet')].find((e) => !e.closest('.wk-off')); return s ? s.getBoundingClientRect().top : (dir > 0 ? innerHeight * 3 : 0); };
      window.__top0 = null;
      const loop = (t) => { window.__f.push(t - last); last = t; if (window.__t0 && !window.__first) { const y = top(); if (window.__top0 == null) window.__top0 = y; else if (Math.abs(y - window.__top0) > 1) window.__first = t - window.__t0; } if (window.__on) requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
      addEventListener('pointerdown', () => { window.__t0 = performance.now(); window.__top0 = null; }, { once: true, capture: true });
      window.__po?.disconnect(); window.__po = new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push(Math.round(e.duration)))); window.__po.observe({ type: 'longtask' });
    }, dir);
    await act(); await wait(p, ms);
    const { f, lt, first } = await p.evaluate(() => { window.__on = false; return { f: window.__f.slice(1), lt: window.__lt, first: window.__first }; });
    out[name].push({ first: Math.round(first), frames: f.length, late: f.filter((x) => x > 20).length, worst: Math.round(Math.max(0, ...f)), long: lt }); if (process.env.SEQ) console.log(name, f.slice(0, 70).map((x) => Math.round(x)).join(" "));
  };
  await measure('start', () => p.getByRole('button', { name: /Start workout/ }).first().tap(), 1);
  await wait(p, 600);
  await measure('minimise', () => p.getByRole('button', { name: 'Minimise workout' }).tap(), -1);
  await wait(p, 600);
  await measure('resume', () => p.getByLabel('Resume workout').first().tap(), 1);
  await b.close();
}
console.log(`CPU x${rate}, ${runs} runs (${process.env.TAG || ''})`);
for (const [k, v] of Object.entries(out)) for (const x of v) console.log(k.padEnd(9), `tap→move ${String(x.first).padStart(4)}ms  frames ${x.frames}  late ${x.late}  worst ${x.worst}ms  long [${x.long.join(',')}]`);
