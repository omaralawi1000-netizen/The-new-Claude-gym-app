// Does switching tabs leave anything behind? 60 switches; every 10, count what is still around and how slow frames are.
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
const { b, ctx, p } = await launch();
const cdp = await ctx.newCDPSession(p);
await p.goto('http://127.0.0.1:5173/'); await wait(p, 900); await skipOnboarding(p); await loadDemo(p); await wait(p, 1200);
await cdp.send('Performance.enable');
await p.evaluate(() => { window.__ft = []; let last = performance.now(); const f = (t) => { window.__ft.push(t - last); last = t; requestAnimationFrame(f); }; requestAnimationFrame(f); });
const tabs = ['Train', 'Food', 'Progress', 'Today'];
for (let i = 1; i <= Number(process.env.N || 60); i++) {
  await p.getByRole('button', { name: tabs[i % 4], exact: true }).first().click(); await wait(p, Number(process.env.GAP || 450));
  if (i % Number(process.env.EVERY || 10) === 0) {
    await cdp.send('HeapProfiler.collectGarbage'); const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
    const s = await p.evaluate(() => { const ft = window.__ft.splice(0); ft.sort((a, b) => a - b); return { anims: document.getAnimations().length, panes: document.querySelectorAll('.tab-pane').length, fields: [...document.querySelectorAll(".aurora")].filter((e) => e.style.display !== "none").length, nodes: document.getElementsByTagName('*').length, p50: Math.round(ft[ft.length >> 1]), p95: Math.round(ft[Math.floor(ft.length * 0.95)]) }; });
    console.log(`after ${i}: nodes ${s.nodes} anims ${s.anims} panes ${s.panes} fields ${s.fields} listeners ${m.JSEventListeners} heap ${(m.JSHeapUsedSize / 1e6).toFixed(1)}MB  frame p50 ${s.p50}ms p95 ${s.p95}ms`);
  }
}
await b.close();
