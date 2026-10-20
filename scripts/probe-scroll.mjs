// Probe: scrolling the Coach chat up and back down. Which GPU layers are made or dropped while it scrolls (a layer made
// new is drawn from nothing: on the phone, a flicker), and when rows are added. usage: node scripts/probe-scroll.mjs
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
const { b, ctx, p } = await launch({ size: { width: 384, height: 832 }, dsf: 3.75 });
await p.goto(process.env.URL || 'http://127.0.0.1:5173/'); await wait(p, 1500);
await skipOnboarding(p); await loadDemo(p);
await p.evaluate((N) => { localStorage.setItem('aven.keys', JSON.stringify({ gemini: 'AIzaTESTKEY' })); localStorage.setItem('aven.coachNote', '1');
  const at = Date.now() - 60000; localStorage.setItem('aven.coach', JSON.stringify(Array.from({ length: N }, (_, i) => [{ id: 'p' + i, role: 'user', text: 'Question ' + i, at }, { id: 'q' + i, role: 'model', text: 'A longer answer about the training of the day, the food so far and what to eat tonight to close the protein gap.', at }]).flat())); }, Number(process.env.N || 30));
await p.reload(); await wait(p, 2000);
await p.getByRole('button', { name: 'Coach', exact: true }).first().tap(); await wait(p, 2500);
const cdp = await ctx.newCDPSession(p);
await cdp.send('DOM.enable'); await cdp.send('LayerTree.enable');
let cur = []; const evs = []; cdp.on('LayerTree.layerTreeDidChange', (e) => { if (e.layers) { cur = e.layers; evs.push({ t: Date.now(), layers: e.layers }); } });
await wait(p, 800);
await cdp.send('DOM.getDocument', { depth: -1 });
const name = async (l) => { if (!l.backendNodeId) return '(none)'; try { const r = await cdp.send('DOM.pushNodesByBackendIdsToFrontend', { backendNodeIds: [l.backendNodeId] }); const res = await cdp.send('DOM.resolveNode', { nodeId: r.nodeIds[0] }); const v = await cdp.send('Runtime.callFunctionOn', { objectId: res.object.objectId, returnByValue: true, functionDeclaration: 'function(){ const e = this.nodeType === 1 ? this : this.parentElement; return e.tagName.toLowerCase() + "." + String(e.className).trim().split(/\\s+/).slice(0,2).join(".") }' }); return v.result.value; } catch { return '(gone)'; } };
const before = new Map(cur.filter((l) => l.drawsContent).map((l) => [l.layerId, l]));
evs.length = 0; const t0 = Date.now();
const rows = await p.evaluate(() => { const out = []; const th = document.querySelector('.coach-thread'); const t0 = performance.now(); new MutationObserver(() => out.push([Math.round(performance.now() - t0), th.children.length])).observe(th, { childList: true }); window.__rows = out; return th.children.length; });
console.log('rows at start', rows);
const box = await p.locator('.coach-body').boundingBox();
const swipe = async (dy) => { const x = box.x + box.width / 2, y = box.y + box.height / 2; await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); for (let i = 1; i <= 12; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + dy * i / 12 }] }); await wait(p, 16); } await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
for (let k = 0; k < 4; k++) { await swipe(300); await wait(p, 500); }
for (let k = 0; k < 4; k++) { await swipe(-300); await wait(p, 500); }
await wait(p, 400);
console.log('rows added', JSON.stringify(await p.evaluate(() => window.__rows)).slice(0, 400));
const seenNew = new Map(), gone = new Map(); console.log('events', evs.length, evs.map((e) => e.t - t0).slice(0, 20).join(','), 'drawing before', before.size);
for (const e of evs.filter((e) => e.t - t0 < 9000)) {
  const ids = new Set(e.layers.map((l) => l.layerId));
  for (const l of e.layers) if (l.drawsContent && !before.has(l.layerId) && !seenNew.has(l.layerId)) seenNew.set(l.layerId, { l, t: e.t - t0 });
  for (const [id, l] of before) if (!ids.has(id) && !gone.has(id)) gone.set(id, { l, t: e.t - t0 });
}
for (const [, x] of seenNew) console.log('NEW', x.t + 'ms', Math.round(x.l.width) + 'x' + Math.round(x.l.height), await name(x.l));
for (const [, x] of gone) console.log('DROP', x.t + 'ms', Math.round(x.l.width) + 'x' + Math.round(x.l.height), await name(x.l));
await b.close();
