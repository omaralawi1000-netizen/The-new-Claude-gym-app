// Measures the liquid-glass meals play in real time at the phone's pixel density: main-thread paint time while it plays, and the
// number of compositor layers before / during / after (a layer added or dropped when it ends can flicker).
//   AVEN_GPU=1 node scripts/measure-liquid.mjs   (needs vite on :5173... uses http://127.0.0.1:4173/ like film-liquid.mjs)
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
const { b, ctx, p } = await launch({ theme: 'dark', size: { width: 384, height: 802 }, dsf: 3.75 });
await p.goto(process.env.URL || 'http://127.0.0.1:4173/'); await wait(p, 1500); await skipOnboarding(p); await loadDemo(p);
await p.evaluate(() => { const raw = JSON.parse(localStorage.getItem('aven.v1')); raw.entries = raw.entries.filter((e) => e.date !== '2026-09-30'); raw.settings.palette = 'golden'; localStorage.setItem('aven.v1', JSON.stringify(raw)); });
await p.reload(); await wait(p, 1500);
await p.getByRole('button', { name: 'Food', exact: true }).first().click(); await wait(p, 800);
const cdp = await ctx.newCDPSession(p);
let layers = 0; await cdp.send('LayerTree.enable'); cdp.on('LayerTree.layerTreeDidChange', (e) => { layers = (e.layers || []).length; });
await p.getByLabel('Add to Lunch').first().click(); await wait(p, 900);
await p.getByRole('dialog').last().getByLabel('Add').first().click().catch(() => {}); await wait(p, 600);
await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline.frame', transferMode: 'ReturnAsStream' });
const before = layers; let mid = 0; cdp.on('LayerTree.layerTreeDidChange', () => { mid = Math.max(mid, layers); });
await p.getByRole('button', { name: /^Done/ }).first().click(); await wait(p, 2600);
const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r)); await cdp.send('Tracing.end'); const { stream } = await done;
let txt = ''; for (;;) { const c = await cdp.send('IO.read', { handle: stream }); txt += c.data; if (c.eof) break; }
const ev = JSON.parse(txt).traceEvents || JSON.parse(txt);
const sum = (n) => ev.filter((e) => e.name === n && e.ph === 'X').reduce((a, e) => a + e.dur, 0) / 1000;
const frames = ev.filter((e) => e.name === 'DrawFrame').length;
const paints = ev.filter((e) => e.name === 'Paint' && e.ph === 'X').map((e) => e.dur / 1000).sort((a, b) => b - a);
console.log(JSON.stringify({ paintTotalMs: +sum('Paint').toFixed(1), paintCount: paints.length, paintWorstMs: +(paints[0] || 0).toFixed(2), paintMedianMs: +(paints[Math.floor(paints.length / 2)] || 0).toFixed(2), updateLayerMs: +sum('UpdateLayer').toFixed(1), layerizeMs: +sum('Layerize').toFixed(1), drawFrames: frames, layersBefore: before, layersMaxDuring: mid, layersAfter: layers }, null, 1));
await b.close();
