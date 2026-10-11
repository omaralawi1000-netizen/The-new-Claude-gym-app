// Where the main thread goes during one tab switch (CPU slowed 4×): top self-time functions.
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
const to = process.argv[2] || 'Progress';
const { b, ctx, p } = await launch();
const cdp = await ctx.newCDPSession(p);
await p.goto('http://127.0.0.1:5173/'); await wait(p, 900); await skipOnboarding(p); await loadDemo(p); await wait(p, 1500);
await p.getByRole('button', { name: to, exact: true }).first().click(); await wait(p, 1500);
await p.getByRole('button', { name: 'Today', exact: true }).first().click(); await wait(p, 1500);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start');
await p.getByRole('button', { name: to, exact: true }).first().click(); await wait(p, 1500);
const { profile } = await cdp.send('Profiler.stop');
const self = new Map(); const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const dt = profile.timeDeltas; profile.samples.forEach((id, i) => { const n = byId.get(id); const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').slice(-2).join('/')}:${n.callFrame.lineNumber}`; self.set(k, (self.get(k) || 0) + dt[i] / 1000); });
console.log([...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18).map(([k, v]) => `${v.toFixed(0).padStart(5)}ms ${k}`).join('\n'));
await b.close();
