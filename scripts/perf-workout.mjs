// The live workout's smoothness at 4× CPU (a phone stand-in), on a production build (`npx vite build && npx vite preview
// --port 4173 --host 127.0.0.1`). Per moment: frames drawn, late frames (> 20 ms), the worst frame, the main thread's
// long tasks (> 50 ms) and script / style / layout time. A rest is counted standing still (the timer ticking down).
//   node scripts/perf-workout.mjs                 ONLY=tick,rest… a subset; CPU=6 the slow-down; URL= another server
//   PROFILE=tick node scripts/perf-workout.mjs    also prints the functions that took the most time in that moment
//                                                 (use the dev server, URL=http://127.0.0.1:5173/, for readable names)
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
const { b, ctx, p } = await launch();
const cdp = await ctx.newCDPSession(p);
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const prof = process.env.PROFILE || '';
const rate = Number(process.env.CPU || 4);
const m = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
const rows = [];
async function measure(name, act, ms = 1400) {
  if (only && !only.some((k) => name.startsWith(k))) { await act(); await wait(p, ms); return; }
  await p.evaluate(() => {
    window.__f = []; window.__lt = []; window.__on = true; let last = performance.now();
    const loop = (t) => { window.__f.push(t - last); last = t; if (window.__on) requestAnimationFrame(loop); }; requestAnimationFrame(loop);
    window.__po?.disconnect(); window.__po = new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push(Math.round(e.duration)))); window.__po.observe({ type: 'longtask' });
  });
  const profiling = prof && name.startsWith(prof);
  if (profiling) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start'); }
  const a = await m();
  await act(); await wait(p, ms);
  const z = await m();
  const { f, lt } = await p.evaluate(() => { window.__on = false; return { f: window.__f.slice(1), lt: window.__lt }; });
  const d = (k) => Math.round((z[k] - a[k]) * 1000);
  const late = f.filter((x) => x > 20).length; const worst = Math.round(Math.max(0, ...f));
  rows.push(`${name.padEnd(15)} frames ${String(f.length).padStart(3)}  late ${String(late).padStart(3)}  worst ${String(worst).padStart(4)}ms  long [${lt.join(',')}]  script ${String(d('ScriptDuration')).padStart(4)}  style ${String(d('RecalcStyleDuration')).padStart(4)}  layout ${String(d('LayoutDuration')).padStart(4)}`);
  if (profiling) {
    const { profile } = await cdp.send('Profiler.stop');
    const self = new Map(); const dt = profile.timeDeltas; const byId = new Map(profile.nodes.map((n) => [n.id, n]));
    profile.samples.forEach((id, i) => { const n = byId.get(id); const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + (dt[i] || 0)); });
    console.log(`── ${name}: self time`); [...self].sort((x, y) => y[1] - x[1]).slice(0, 25).forEach(([k, v]) => console.log(`  ${String(Math.round(v / 1000)).padStart(5)}ms  ${k}`));
  }
}
const scroll = (dist) => cdp.send('Input.synthesizeScrollGesture', { x: 195, y: 560, yDistance: dist, speed: 1600, gestureSourceType: 'touch', repeatCount: 1 });
const tick = () => p.locator('.wk-sheet').getByRole('button', { name: 'Complete set' }).first().tap();

await p.goto(process.env.URL || 'http://127.0.0.1:4173/'); await wait(p, 1200); await skipOnboarding(p); await loadDemo(p); await wait(p, 2000);
await cdp.send('Performance.enable'); await cdp.send('Emulation.setCPUThrottlingRate', { rate });

await measure('open', () => p.getByRole('button', { name: /Start workout/ }).first().tap(), 2400);
await measure('scroll-down', () => scroll(-900), 1600);
await measure('scroll-up', () => scroll(900), 1600);
await measure('tick-1', tick, 1600);
await measure('rest-idle', async () => {}, 3000);
await measure('tick-2', tick, 1600);
await measure('tick-3', tick, 1600);
await measure('add-set', () => p.locator('.wk-list .wk-add-set').first().tap(), 1400);
await measure('rest-panel', () => p.locator('.wk-bar-main').tap(), 1400);
await measure('rest-panel-close', () => p.locator('.wk-bar-main').tap(), 1400);
await measure('edit-kg', async () => { const f = p.locator('.wk-sheet input[inputmode="decimal"]').first(); await f.tap(); await p.keyboard.type('7'); await p.keyboard.press('Enter'); }, 1400);
await measure('minimise', () => p.getByRole('button', { name: 'Minimise workout' }).tap(), 1600);
await measure('idle-minimised', async () => {}, 3000);
await measure('reopen', () => p.getByLabel('Resume workout').first().tap(), 2000);
await measure('focus-enter', () => p.getByRole('button', { name: 'Focus view' }).tap(), 1800);
await measure('focus-tick', () => p.locator('.wk-page.cur').getByRole('button', { name: 'Complete set' }).first().tap(), 1600);
await measure('focus-leave', () => p.getByRole('button', { name: 'List view' }).tap(), 1600);
console.log(`CPU ×${rate}`); rows.forEach((r) => console.log(r));
await b.close();
