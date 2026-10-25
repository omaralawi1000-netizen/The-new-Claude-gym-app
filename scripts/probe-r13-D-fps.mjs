// Probe (r13 D): headless frame rate on Home and in the Coach (median rAF interval), optionally with CSS= injected.
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
const { b, p } = await launch({ size: { width: 384, height: 832 }, dsf: Number(process.env.DSF || 2) });
await p.goto(process.env.URL || 'http://127.0.0.1:5184/'); await wait(p, 1500); await skipOnboarding(p); await loadDemo(p); await wait(p, 1500);
if (process.env.CSS) await p.addStyleTag({ content: process.env.CSS });
const m = () => p.evaluate(() => new Promise((r) => { const a = []; let l = performance.now(); const f = (t) => { a.push(t - l); l = t; if (a.length < 60) requestAnimationFrame(f); else r(a.sort((x, y) => x - y)[30]); }; requestAnimationFrame(f); }));
console.log('home', await m());
await p.getByRole('button', { name: 'Coach', exact: true }).first().tap(); await wait(p, 1600);
console.log('coach', await m());
await b.close();
