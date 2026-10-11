// Main-thread cost of a tab switch: style / layout / script time and long frames, per switch (CPU slowed 4×).
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
const { b, ctx, p } = await launch();
const cdp = await ctx.newCDPSession(p);
await p.goto('http://127.0.0.1:5173/'); await wait(p, 900); await skipOnboarding(p); await loadDemo(p);
if (process.env.NOBAR) await p.evaluate(() => { const st = document.documentElement.style; const o = st.setProperty.bind(st); st.setProperty = (k, v, pr) => (k === '--bar' || k === '--bar-shown' ? undefined : o(k, v, pr)); });
await cdp.send('Performance.enable'); await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.CPU || 4) });
const m = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
const rows = [];
for (const name of ['Train', 'Food', 'Progress', 'Today', 'Food', 'Train']) {
  await wait(p, 1200);
  await p.evaluate(() => { window.__long = []; window.__po = new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(Math.round(e.duration)))); window.__po.observe({ entryTypes: ['long-animation-frame', 'longtask'] }); });
  const a = await m();
  await p.getByRole('button', { name, exact: true }).first().click(); await wait(p, 1300);
  const z = await m(); const long = await p.evaluate(() => { window.__po.disconnect(); return window.__long; });
  const d = (k) => Math.round((z[k] - a[k]) * 1000);
  rows.push(`${name.padEnd(9)} style ${String(d('RecalcStyleDuration')).padStart(4)}ms (${Math.round(z.RecalcStyleCount - a.RecalcStyleCount)}×)  layout ${String(d('LayoutDuration')).padStart(4)}ms  script ${String(d('ScriptDuration')).padStart(4)}ms  long frames: ${long.join(',') || '–'}`);
}
console.log(rows.join('\n')); await b.close();
