// How heavy the workout window's grow and land are, on phone-like terms: the phone's screen (384×832 at 3.75 px per px),
// the CPU slowed 4× and the GPU emulated (AVEN_GPU=1, so the glass and every see-through layer is really drawn). Per
// move: frames drawn, late frames (> 12 ms: a missed 120 Hz frame, > 20 ms: a missed 60 Hz one), the worst frame, the main
// thread's long tasks (> 50 ms), script / style / layout time, and in mid-move the layers the compositor draws (count,
// how much screen they cover, as screens' worth of pixels: the overdraw).
// Needs `npx vite build && npx vite preview --port 4173 --host 127.0.0.1`.
//   AVEN_GPU=1 LAND=D node scripts/perf-morph.mjs     CPU=6 the slow-down; PROFILE=open also prints the busiest functions
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
const { b, ctx, p } = await launch({ size: { width: 384, height: 832 }, dsf: 3.75 });
const cdp = await ctx.newCDPSession(p);
const rate = Number(process.env.CPU || 4), prof = process.env.PROFILE || '';
const m = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
let layers = [];
cdp.on('LayerTree.layerTreeDidChange', (e) => { if (e.layers) layers = e.layers; });
const rows = [];
async function measure(name, act, ms = 1600) {
  await p.evaluate(() => {
    window.__f = []; window.__lt = []; window.__on = true; let last = performance.now();
    const loop = (t) => { window.__f.push(t - last); last = t; if (window.__on) requestAnimationFrame(loop); }; requestAnimationFrame(loop);
    window.__po?.disconnect(); window.__po = new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push(Math.round(e.duration)))); window.__po.observe({ type: 'longtask' });
  });
  const profiling = prof && name.startsWith(prof);
  if (profiling) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start'); }
  const a = await m();
  await cdp.send('LayerTree.enable');
  await act();
  // mid-move: the layers being drawn
  await wait(p, 180);
  const W = 384 * 3.75, H = 832 * 3.75;
  const drawn = layers.filter((l) => l.drawsContent && !l.invisible);
  const area = drawn.reduce((s, l) => s + Math.min(l.width * 3.75, W * 1.5) * Math.min(l.height * 3.75, H * 1.5), 0) / (W * H);
  const big = drawn.filter((l) => l.width * l.height > 384 * 832 * 0.25).length;
  await cdp.send('LayerTree.disable');
  await wait(p, ms - 180);
  const z = await m();
  const { f, lt } = await p.evaluate(() => { window.__on = false; return { f: window.__f.slice(1), lt: window.__lt }; });
  const d = (k) => Math.round((z[k] - a[k]) * 1000);
  const busy = f.slice(0, 120);
  rows.push(`${name.padEnd(13)} frames ${String(f.length).padStart(3)}  >12ms ${String(busy.filter((x) => x > 12).length).padStart(3)}  >20ms ${String(busy.filter((x) => x > 20).length).padStart(3)}  worst ${String(Math.round(Math.max(0, ...f))).padStart(4)}ms  long [${lt.join(',')}]  script ${String(d('ScriptDuration')).padStart(4)}  style ${String(d('RecalcStyleDuration')).padStart(4)}  layout ${String(d('LayoutDuration')).padStart(4)}  layers ${drawn.length} (big ${big}, ${area.toFixed(1)} screens)`);
  if (profiling) {
    const { profile } = await cdp.send('Profiler.stop');
    const self = new Map(); const dt = profile.timeDeltas; const byId = new Map(profile.nodes.map((n) => [n.id, n]));
    profile.samples.forEach((id, i) => { const n = byId.get(id); const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + (dt[i] || 0)); });
    console.log(`── ${name}: self time`); [...self].sort((x, y) => y[1] - x[1]).slice(0, 20).forEach(([k, v]) => console.log(`  ${String(Math.round(v / 1000)).padStart(5)}ms  ${k}`));
  }
}

await p.goto(process.env.URL || 'http://127.0.0.1:4173/'); await wait(p, 1200); await skipOnboarding(p); await loadDemo(p); await wait(p, 1500);
if (process.env.LAND) await p.evaluate((l) => localStorage.setItem('aven.wkLand', l), process.env.LAND);
await p.keyboard.press('Escape'); await wait(p, 800);
await cdp.send('Performance.enable'); await cdp.send('Emulation.setCPUThrottlingRate', { rate });
await p.getByRole('button', { name: /Start workout/ }).first().scrollIntoViewIfNeeded().catch(() => {}); await wait(p, 600);
await measure('open', () => p.getByRole('button', { name: /Start workout/ }).first().tap(), 2000);
await measure('minimise', () => p.getByRole('button', { name: 'Minimise workout' }).tap(), 2000);
await measure('resume', () => p.getByLabel('Resume workout').first().tap(), 2000);
await p.getByRole('button', { name: 'Minimise workout' }).tap(); await wait(p, 2000);
await p.getByRole('button', { name: 'Train', exact: true }).first().tap(); await wait(p, 1500);
await measure('pill-resume', () => p.getByLabel('Resume workout').first().tap(), 2000);
await measure('pill-min', () => p.getByRole('button', { name: 'Minimise workout' }).tap(), 2000);
console.log(`CPU ×${rate}, ${process.env.AVEN_GPU ? 'GPU emulated' : 'software'}, way ${process.env.LAND || 'default'}`); rows.forEach((r) => console.log(r));
await b.close();
