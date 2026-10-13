// Fast tab switching, as when the dock is tapped quickly: under a 4× slowed CPU, taps tabs every GAP ms (default 150) in a
// few orders and reports, per run, how long each tap took to show (input → next frame, the Event Timing API), the frames
// drawn and missed (> 20 ms), the worst frame, main-thread time, and the most screens / colour fields alive at once.
// Run against a production build: `npx vite build && npx vite preview --port 5174 --host 127.0.0.1`, then
//   URL=http://127.0.0.1:5174/ node scripts/perf-tabspam.mjs          (GAP=…, CPU=…, PROFILE=1 for the heaviest functions)
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
const { b, ctx, p } = await launch();
const cdp = await ctx.newCDPSession(p);
const rate = Number(process.env.CPU || 4), gap = Number(process.env.GAP || 150);
await p.goto(process.env.URL || 'http://127.0.0.1:5174/'); await wait(p, 1200); await skipOnboarding(p); await loadDemo(p); await wait(p, 2000);
await p.evaluate(() => {
  window.__ev = [];
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'click') window.__ev.push({ dur: e.duration, proc: e.processingEnd - e.processingStart, delay: e.processingStart - e.startTime }); }).observe({ type: 'event', durationThreshold: 16 });
});
await cdp.send('Performance.enable'); await cdp.send('Emulation.setCPUThrottlingRate', { rate });
const m = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
// real touches (so the browser times them as it does a thumb), sent at a fixed rhythm without waiting for the page; each
// tab's place is read just before its tap (the open tab is wider in the dock, so the others move)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const where = (n) => p.evaluate((n) => { const x = [...document.querySelectorAll('.tabbar button[aria-label]')].find((b) => b.getAttribute('aria-label') === n); const r = x.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, n);
async function tapAll(names, gap) {
  let q = Promise.resolve();
  for (const n of names) {
    const t0 = Date.now();
    q = q.then(() => where(n)).then(([x, y]) => cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })).then(() => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }));
    await sleep(Math.max(0, gap - (Date.now() - t0)));
  }
  await q;
  return p.evaluate(() => document.querySelector('.tabbar .tab.on')?.getAttribute('aria-label'));
}
const runs = [
  ['T→Tr→F→P→T', ['Train', 'Food', 'Progress', 'Today']],
  ['back+forth', ['Progress', 'Today', 'Progress', 'Today', 'Food', 'Train']],
  ['zigzag', ['Food', 'Today', 'Train', 'Progress', 'Food', 'Today']],
];
for (const [name, seq] of runs) {
  await p.evaluate(() => { window.__ev = []; window.__f = []; window.__peak = { panes: 0, fields: 0 }; window.__on = true; let last = performance.now(); const loop = (t) => { window.__f.push(t - last); last = t; const pk = window.__peak; pk.panes = Math.max(pk.panes, document.querySelectorAll('.tab-pane').length); pk.fields = Math.max(pk.fields, document.querySelectorAll('.fields > .aurora').length); if (window.__on) requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
  if (process.env.PROFILE) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start'); }
  const a = await m();
  const tev = [];
  if (process.env.TRACE) { cdp.removeAllListeners('Tracing.dataCollected'); cdp.on('Tracing.dataCollected', (d) => tev.push(...d.value)); await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline,viz', transferMode: 'ReportEvents' }); }
  const landed = await tapAll(seq, gap); await wait(p, 1400);
  const z = await m();
  if (process.env.TRACE) {
    const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r)); await cdp.send('Tracing.end'); await done;
    const st = tev.filter((e) => e.name === 'UpdateLayoutTree' && e.ph === 'X').sort((x, y) => y.dur - x.dur).slice(0, 10);
    console.log('  biggest style recalcs: ' + st.map((e) => `${Math.round(e.dur / 1000)}ms/${e.args?.elementCount ?? '?'}el`).join('  '));
    const df = tev.filter((e) => e.name === 'DirectRenderer::DrawFrame' && e.ph === 'X');
    console.log(`  screen redraws ${df.length}, avg ${(df.reduce((x, e) => x + e.dur, 0) / Math.max(1, df.length) / 1000).toFixed(1)} ms, worst ${(Math.max(0, ...df.map((e) => e.dur)) / 1000).toFixed(1)} ms (software drawing: stands in for the graphics chip)`);
    const ls = tev.filter((e) => e.name === 'Layout' && e.ph === 'X').sort((x, y) => y.dur - x.dur).slice(0, 6);
    console.log('  biggest layouts: ' + ls.map((e) => `${Math.round(e.dur / 1000)}ms/${e.args?.beginData?.dirtyObjects ?? '?'}of${e.args?.beginData?.totalObjects ?? '?'}`).join('  '));
  }
  if (process.env.PROFILE) {
    const { profile } = await cdp.send('Profiler.stop');
    const self = new Map(); const byId = new Map(profile.nodes.map((n) => [n.id, n]));
    profile.samples.forEach((id, i) => { const n = byId.get(id); const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop().split('?')[0]}:${n.callFrame.lineNumber}`; self.set(k, (self.get(k) || 0) + (profile.timeDeltas[i] || 0) / 1000); });
    console.log([...self.entries()].filter(([k]) => !/^\((idle|program)\)/.test(k)).sort((x, y) => y[1] - x[1]).slice(0, 16).map(([k, v]) => `${v.toFixed(0).padStart(6)}  ${k}`).join('\n'));
  }
  const { ev, f, peak } = await p.evaluate(() => { window.__on = false; return { ev: window.__ev, f: window.__f.slice(1), peak: window.__peak }; });
  const d = (k) => Math.round((z[k] - a[k]) * 1000);
  const durs = ev.map((e) => Math.round(e.dur));
  if (process.env.SPLIT) console.log('  wait/handler/to-paint: ' + ev.map((e) => `${Math.round(e.delay)}/${Math.round(e.proc)}/${Math.round(e.dur - e.delay - e.proc)}`).join('  '));
  console.log(`${name.padEnd(12)} taps ${seq.length} → paint ms [${durs.join(' ')}] worst ${Math.max(0, ...durs)} | frames ${f.length} late ${f.filter((x) => x > 20).length} worst ${Math.round(Math.max(...f))} | script ${d('ScriptDuration')} style ${d('RecalcStyleDuration')} layout ${d('LayoutDuration')} | peak panes ${peak.panes} fields ${peak.fields} | ended on ${landed}${landed === seq.at(-1) ? '' : ' (WRONG)'}`);
  await wait(p, 600);
}
console.log(`CPU ${rate}×, a tap every ${gap} ms`);
await b.close();
