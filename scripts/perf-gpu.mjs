// Graphics-chip cost probe: what the compositor holds and draws, at the phone's real size (Galaxy S26 Ultra: 384 x 832 CSS px
// at 3.75 = 1440 x 3120). Prints the composited layers (count, device-pixel area, and what draws content), and the tile memory
// the compositor keeps (memory-infra dump). Run against a production build on :5174.
//   AVEN_BG=classic AVEN_GLOW=full node scripts/perf-gpu.mjs     (TAB=Train; SHEET=1 opens a sheet first; VERBOSE=1 lists layers)
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
const DSF = 3.75;
const { b, ctx, p } = await launch({ size: { width: 384, height: 832 }, dsf: DSF });
const cdp = await ctx.newCDPSession(p);
await p.goto(process.env.URL || 'http://127.0.0.1:5174/'); await wait(p, 1200); await skipOnboarding(p); await loadDemo(p); await wait(p, 2000);
if (process.env.TAB) { await p.locator('.tabbar').getByRole('button', { name: process.env.TAB, exact: true }).click(); await wait(p, 1500); }
if (process.env.SHEET) { await p.locator('.tabbar').getByRole('button', { name: 'Food', exact: true }).click(); await wait(p, 1400); await p.getByRole('button', { name: 'Add to Dinner' }).first().click(); }
await wait(p, Number(process.env.WAIT || 15000));
if (process.env.CSS) { await p.addStyleTag({ content: process.env.CSS }); await wait(p, 1500); }
await cdp.send('DOM.enable'); await cdp.send('LayerTree.enable');
const doc = (await cdp.send('DOM.getDocument', { depth: -1, pierce: true })).root;
const byBackend = new Map();
const label = (n) => (n.localName || n.nodeName || '?') + (n.pseudoType ? '::' + n.pseudoType : '') + (() => { const a = n.attributes || []; const i = a.indexOf('class'); return i >= 0 && a[i + 1] ? '.' + a[i + 1].trim().split(/\s+/).join('.') : ''; })();
const walk = (n, path) => { const me = [...path, label(n)].slice(-3); byBackend.set(n.backendNodeId, me.join(' > ')); for (const c of [...(n.children || []), ...(n.pseudoElements || [])]) walk(c, me); };
walk(doc, []);
let layers = [];
cdp.on('LayerTree.layerTreeDidChange', (e) => { if (e.layers) layers = e.layers; });
await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
// nudge one frame so a fresh tree is reported
await p.evaluate(() => { document.body.style.outline = '0px solid transparent'; });
await wait(p, 1200);
const W = 384 * DSF, H = 832 * DSF;
const vis = (l) => l.drawsContent && !l.invisible;
let area = 0, n = 0;
const rows = [];
for (const l of layers) {
  if (!vis(l)) continue;
  // area clipped to the screen (layers bigger than the screen still raster only what is near it)
  const w = Math.min(l.width * DSF, W * 1.5), h = Math.min(l.height * DSF, H * 1.5);
  area += w * h; n++;
  let why = '';
  if (process.env.VERBOSE) { try { const r = await cdp.send('LayerTree.compositingReasons', { layerId: l.layerId }); why = (r.compositingReasonIds || r.compositingReasons || []).join(','); } catch {} }
  const name = l.backendNodeId ? (byBackend.get(l.backendNodeId) || '#' + l.backendNodeId) : '';
  rows.push({ w: Math.round(l.width), h: Math.round(l.height), name, why, paints: l.paintCount });
}
// tile memory via memory-infra
const events = []; cdp.on('Tracing.dataCollected', (d) => events.push(...d.value));
const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
await cdp.send('Tracing.start', { traceConfig: { includedCategories: ['disabled-by-default-memory-infra'], memoryDumpConfig: { triggers: [] } }, transferMode: 'ReportEvents' });
await wait(p, 300);
await cdp.send('Tracing.requestMemoryDump', { levelOfDetail: 'detailed' });
await wait(p, 300);
await cdp.send('Tracing.end'); await done;
let tile = 0, gpuRes = 0;
for (const e of events) {
  const dumps = e.args?.dumps?.allocators; if (!dumps) continue;
  for (const [k, v] of Object.entries(dumps)) {
    const sz = v.attrs?.size ? parseInt(v.attrs.size.value, 16) : 0;
    if (/^cc\/tile_memory$/.test(k)) tile += sz;
    if (/^gpu\/(gl|shared_images)$/.test(k)) gpuRes += sz;
  }
}
console.log(`${(process.env.LABEL || '').padEnd(18)} layers ${String(n).padStart(3)}  area ${(area / (W * H)).toFixed(2)} screens  tiles ${(tile / 1048576).toFixed(1)} MB  gpu ${(gpuRes / 1048576).toFixed(1)} MB`);
if (process.env.VERBOSE) for (const r of rows.sort((a, c) => c.w * c.h - a.w * a.h)) console.log(`   ${String(r.w).padStart(5)}x${String(r.h).padEnd(5)} paints ${String(r.paints).padStart(3)} ${r.name}  ${r.why}`);
await b.close();
