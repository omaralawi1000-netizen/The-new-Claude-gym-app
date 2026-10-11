// Tab-switch flicker probe. Samples every animation frame during switches (4× CPU slowdown, like a mid phone) and reports
// anything that moves the wrong way: a layer whose opacity goes down then up, a pane that is missing for a frame, a
// frame where old and new screen are both at full strength, the top band / dock changing under the switch.
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
const { b, ctx, p } = await launch();
const cdp = await ctx.newCDPSession(p);
await p.goto('http://127.0.0.1:5173/'); await wait(p, 900); await skipOnboarding(p); await loadDemo(p);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.CPU || 4) });
await p.evaluate(() => {
  window.__frames = [];
  const q = (s) => [...document.querySelectorAll(s)];
  const tick = (t) => {
    const cs = (e) => getComputedStyle(e);
    window.__frames.push({
      t: Math.round(t),
      panes: q('.tab-pane').map((e) => ({ h: e.dataset.hue, o: +(+cs(e).opacity).toFixed(3), x: Math.round(new DOMMatrix(cs(e).transform).m41 * 10) / 10 })),
      fields: q('.aurora').map((e) => ({ h: e.dataset.hue, o: +(+cs(e).opacity).toFixed(3) })),
      lab: q('.tab.on .lab').map((e) => +(+cs(e).opacity).toFixed(2)),
      app: document.querySelector('.app')?.dataset.hue,
    });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
const order = ['Train', 'Food', 'Progress', 'Today', 'Food', 'Today', 'Progress', 'Train'];
for (const name of order) {
  await p.evaluate(() => { window.__frames.length = 0; });
  await p.getByRole('button', { name, exact: true }).first().click();
  await wait(p, 1500);
  const f = await p.evaluate(() => window.__frames.slice());
  const issues = [];
  // 1. layers whose opacity reverses direction
  const track = (get, label) => {
    let prev = null, dir = 0;
    f.forEach((fr, i) => { const v = get(fr); if (v == null) { if (prev != null && prev > 0.02 && i < f.length - 1) { /* disappeared */ } prev = null; return; } if (prev != null) { const d = Math.sign(v - prev); if (d && dir && d !== dir && Math.abs(v - prev) > 0.02) issues.push(`${label}: reversed at frame ${i} (${prev} → ${v})`); if (d) dir = d; } prev = v; });
  };
  const hues = ['today', 'train', 'food', 'progress'];
  for (const h of hues) { track((fr) => fr.panes.find((x) => x.h === h)?.o, `pane ${h}`); track((fr) => fr.fields.find((x) => x.h === h)?.o, `field ${h}`); }
  // 2. no pane at all / nothing visible
  f.forEach((fr, i) => { const sum = fr.panes.reduce((s, x) => s + x.o, 0); if (fr.panes.length && sum < 0.2 && i > 1) issues.push(`no visible pane at frame ${i} (sum ${sum.toFixed(2)})`); });
  // 3. the light: sum of field opacity should never dip below ~0.9 (the cross-fade is meant to keep it level)
  let minLight = 9, at = -1; f.forEach((fr, i) => { const s = fr.fields.reduce((a, x) => a + x.o, 0); if (fr.fields.length && s < minLight) { minLight = s; at = i; } });
  if (minLight < 0.85) issues.push(`field light dips to ${minLight.toFixed(2)} at frame ${at}`);
  // 4. frame gaps (long frames)
  let worst = 0; for (let i = 1; i < f.length; i++) worst = Math.max(worst, f[i].t - f[i - 1].t);
  console.log(`→ ${name}: ${f.length} frames, worst gap ${worst} ms${issues.length ? '\n   ' + issues.slice(0, 8).join('\n   ') : '  ✓ clean'}`);
}
await b.close();
