// Probe (r13 D): the first frame of the keyboard ride under the Coach (fake keyboard). Traces the tap + keyboard start and
// prints the longest main-thread tasks with what they spent time on, and the foot's transform per frame.
// usage: node scripts/probe-r13-D-kbframe.mjs
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
const { b, ctx, p } = await launch({ size: { width: 384, height: 832 }, dsf: 2 });
await ctx.addInitScript(() => {
  const l = {}; const vk = { overlaysContent: false, boundingRect: { height: 0 }, addEventListener: (t, f) => { (l[t] ||= []).push(f); }, removeEventListener: () => {} };
  Object.defineProperty(navigator, 'virtualKeyboard', { value: vk });
  window.__setKb = (h) => { vk.boundingRect = { height: h }; (l.geometrychange || []).forEach((f) => f()); };
});
await p.goto(process.env.URL || 'http://127.0.0.1:5184/'); await wait(p, 1500); await skipOnboarding(p); await loadDemo(p);
await p.evaluate(() => { localStorage.setItem('aven.keys', JSON.stringify({ gemini: 'AIzaTESTKEY' })); localStorage.setItem('aven.coachNote', '1');
  const at = Date.now() - 60000; localStorage.setItem('aven.coach', JSON.stringify(Array.from({ length: 8 }, (_, i) => [{ id: 'p' + i, role: 'user', text: 'Question ' + i + ' about my training', at }, { id: 'q' + i, role: 'model', text: 'A longer answer about the training of the day, the food so far and what to eat tonight to close the protein gap.', at }]).flat())); });
await p.reload(); await wait(p, 2500);
await p.addStyleTag({ content: '*,*::before,*::after{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}' + (process.env.CSS || '') });
await p.getByRole('button', { name: 'Coach', exact: true }).first().tap(); await wait(p, 4000);
await p.locator('.coach-composer textarea').focus(); await wait(p, 600);
const cdp = await ctx.newCDPSession(p);
const events = []; cdp.on('Tracing.dataCollected', (e) => events.push(...e.value));
const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
await cdp.send('Tracing.start', { traceConfig: { includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink'] }, transferMode: 'ReportEvents' });
await p.evaluate(() => { window.__f = []; const t0 = performance.now(); const loop = (t) => { const f = document.querySelector('.sheet-foot'); window.__f.push([Math.round(t - t0), getComputedStyle(f).transform]); if (window.__f.length < 40) requestAnimationFrame(loop); }; requestAnimationFrame(loop); setTimeout(() => window.__setKb(320), 50); });
await wait(p, 900);
await cdp.send('Tracing.end'); await done;
const fr = await p.evaluate(() => window.__f); console.log(fr.slice(0, 14).map((x) => `${x[0]}:${(x[1].split(',')[5] || '0').trim().replace(')', '')}`).join(' '));
const main = events.filter((e) => e.ph === 'X' && e.dur);
const tid = (() => { const c = {}; for (const e of main) if (e.name === 'UpdateLayoutTree') c[e.tid] = (c[e.tid] || 0) + 1; return +Object.entries(c).sort((a, b) => b[1] - a[1])[0][0]; })();
const tasks = main.filter((e) => e.tid === tid && e.name === 'RunTask' && e.dur > 12000).sort((a, b) => b.dur - a.dur).slice(0, 4);
for (const t of tasks) {
  const inside = main.filter((e) => e.tid === tid && e.ts >= t.ts && e.ts + e.dur <= t.ts + t.dur && e !== t);
  const sum = {}; for (const e of inside) if (['UpdateLayoutTree', 'Layout', 'Paint', 'PrePaint', 'Layerize', 'FunctionCall', 'EventDispatch', 'FireAnimationFrame', 'Commit', 'HitTest', 'ParseAuthorStyleSheet', 'RecalculateStyles'].includes(e.name)) sum[e.name] = (sum[e.name] || 0) + e.dur / 1000;
  const lay = inside.filter((e) => e.name === 'Layout').map((e) => e.args?.beginData?.dirtyObjects).filter(Boolean);
  const sty = inside.filter((e) => e.name === 'UpdateLayoutTree').map((e) => e.args?.elementCount).filter(Boolean);
  console.log('task', (t.dur / 1000).toFixed(1), 'ms', JSON.stringify(Object.fromEntries(Object.entries(sum).map(([k, v]) => [k, +v.toFixed(1)]))), 'layout dirty', lay.join('/'), 'styled els', sty.join('/'));
}
await b.close();
