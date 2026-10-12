// Main-thread cost of the keyboard opening and closing in a sheet (CPU slowed 4×), with a simulated keyboard (a fake
// navigator.virtualKeyboard that reports 360 px). SHEET=quick (Quick add over Add to Dinner, default) or routine (a tall
// form). Prints style/layout/script time and the frame times while the sheet rides the keyboard up and back down.
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
const { b, ctx, p } = await launch({ size: { width: 384, height: 832 } });
await ctx.addInitScript(() => {
  const l = {}; const vk = { overlaysContent: false, boundingRect: { height: 0 }, addEventListener: (t, f) => { (l[t] ||= []).push(f); }, removeEventListener: () => {} };
  Object.defineProperty(navigator, 'virtualKeyboard', { value: vk });
  window.__setKb = (h) => { vk.boundingRect = { height: h }; (l.geometrychange || []).forEach((f) => f()); };
});
const cdp = await ctx.newCDPSession(p);
await p.goto('http://127.0.0.1:5173/'); await wait(p, 1200); await skipOnboarding(p); await loadDemo(p); await wait(p, 2500);
if ((process.env.SHEET || 'quick') === 'quick') {
  await p.locator('.tabbar').getByRole('button', { name: 'Food', exact: true }).click(); await wait(p, 1000);
  await p.getByRole('button', { name: 'Add to Dinner' }).first().click(); await wait(p, 1300);
  await p.getByRole('button', { name: 'Quick add' }).first().click(); await wait(p, 1500);
} else {
  await p.locator('.tabbar').getByRole('button', { name: 'Train', exact: true }).click(); await wait(p, 1000);
  await p.getByRole('button', { name: /^Push 5/ }).first().click(); await wait(p, 1500);
}
if (process.env.CSS) await p.addStyleTag({ content: process.env.CSS });
await cdp.send('Performance.enable'); await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.CPU || 4) });
const m = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
const rows = [];
for (const [name, h] of [['up', 360], ['down', 0], ['up', 360], ['down', 0]]) {
  await wait(p, 900);
  await p.evaluate(() => { window.__f = []; let last = performance.now(); const loop = (t) => { window.__f.push(Math.round(t - last)); last = t; if (window.__f.length < 40) requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
  const a = await m();
  await p.evaluate((h) => window.__setKb(h), h); await wait(p, 900);
  const z = await m(); const f = await p.evaluate(() => window.__f.slice(1, 24));
  const d = (k) => Math.round((z[k] - a[k]) * 1000);
  const avg = Math.round(f.reduce((s, x) => s + x, 0) / f.length);
  rows.push(`${name.padEnd(5)} style ${String(d('RecalcStyleDuration')).padStart(4)}ms (${Math.round(z.RecalcStyleCount - a.RecalcStyleCount)}×)  layout ${String(d('LayoutDuration')).padStart(4)}ms (${Math.round(z.LayoutCount - a.LayoutCount)}×)  script ${String(d('ScriptDuration')).padStart(4)}ms  frames avg ${avg} max ${Math.max(...f)}: ${f.join(' ')}`);
}
console.log(rows.join('\n')); await b.close();
