// A forced GPU process crash (as the phone's chip can be reset): a frame before, and one 4 s after, with Classic's sway and
// every endless motion held, so the two frames can be compared pixel for pixel. Lists the canvases' lost/restored events.
//   AVEN_GPU=1 AVEN_PALETTE=forest AVEN_BG=classic URL=… node scripts/glow-gpu-reset.mjs out-dir tag
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import fs from 'node:fs';
const [out = 'shots/gpu', tag = 'now'] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
const { b, p } = await launch({ size: { width: 384, height: 832 }, dsf: 3.75 });
await p.addInitScript(() => { window.__ev = []; addEventListener('contextlost', (e) => window.__ev.push(['lost', e.target.className, Math.round(performance.now())]), true); addEventListener('contextrestored', (e) => window.__ev.push(['back', e.target.className, Math.round(performance.now())]), true); });
await p.goto(process.env.URL || 'http://127.0.0.1:5173/'); await wait(p, 1200); await skipOnboarding(p); await loadDemo(p); await wait(p, 8000);
const hold = () => p.evaluate(() => { for (const a of document.getAnimations()) { const t = a.effect?.getComputedTiming(); if (a.animationName === 'sway' || t?.iterations === Infinity) { a.pause(); a.currentTime = 0; } else if (a.playState === 'running' && Number.isFinite(t?.endTime)) a.finish(); } });
await hold(); await wait(p, 600);
await p.screenshot({ path: `${out}/gpu-reset-before-${tag}.png` });
const bc = await b.newBrowserCDPSession(); await bc.send('Browser.crashGpuProcess').catch((e) => console.log('crash:', e.message.split('\n')[0]));
await wait(p, 4000); await hold(); await wait(p, 400);
await p.screenshot({ path: `${out}/gpu-reset-after-${tag}.png` });
console.log(tag, JSON.stringify(await p.evaluate(() => window.__ev)));
await b.close();
