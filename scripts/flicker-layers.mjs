// usage: npx vite build && npx vite preview --port 4173 --host 127.0.0.1, then node scripts/flicker-layers.mjs [settings|tab …]
// The flicker's fingerprint: an element that is still on screen loses its GPU layer when its animation ends (its pixels
// must then be redrawn into the layer below; on the phone they are missing for one frame). Counts those drops per
// navigation. Layers that go because their element left the page (a closed page, a removed screen) are not counted.
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
const only = process.argv.slice(2);
const { b, ctx, p } = await launch();
const cdp = await ctx.newCDPSession(p);
await p.goto(process.env.URL || 'http://127.0.0.1:4173/'); await wait(p, 900); await skipOnboarding(p); await loadDemo(p); await wait(p, 1200);
await cdp.send('DOM.enable');
await cdp.send('LayerTree.enable');
let cur = [];
const events = [];
cdp.on('LayerTree.layerTreeDidChange', (e) => { if (e.layers) { events.push({ t: Date.now(), layers: e.layers }); cur = e.layers; } });
const tab = (n) => () => p.getByRole('button', { name: n, exact: true }).first().click();
const scen = [
  ['tab Train', tab('Train')], ['tab Food', tab('Food')], ['tab Progress', tab('Progress')], ['tab Today', tab('Today')],
  ['settings open', () => p.getByLabel('Settings').click()],
  ['settings → Training', () => p.getByText('Training', { exact: true }).first().click()],
  ['settings ← back', () => p.getByLabel('Back').first().click()],
  ['settings → Appearance', () => p.getByText('Appearance', { exact: true }).first().click()],
  ['settings ← back 2', () => p.getByLabel('Back').first().click()],
  ['settings close', () => p.keyboard.press('Escape')],
  ['food tab', tab('Food')],
  ['food search open', () => p.getByLabel(/^Add to /).first().click()],
  ['food search close', () => p.keyboard.press('Escape')],
  ['today tab', tab('Today')],
  // the Coach (phase 4): open over Today, scroll its chat, close
  ['coach open', async () => { await p.evaluate(() => { const l = []; for (let i = 0; i < 30; i++) l.push({ id: 's' + i, role: i % 2 ? 'model' : 'user', text: 'A message long enough to wrap onto two lines in the Coach, so the chat scrolls. '.repeat(i % 2 ? 3 : 1), at: Date.now() - 3600000 }); localStorage.setItem('aven.coach', JSON.stringify(l)); }); await p.getByRole('button', { name: 'Coach', exact: true }).first().click(); }],
  ['coach scroll', () => p.locator('.coach-body').evaluate((el) => el.scrollBy({ top: -400 }))],
  ['coach close', () => p.keyboard.press('Escape')],
].filter(([n]) => !only.length || only.some((o) => n.includes(o)));
let total = 0;
for (const [name, act] of scen) {
  await wait(p, 300);
  await cdp.send('DOM.getDocument', { depth: -1 });
  events.length = 0;
  const t0 = Date.now();
  const startLayers = cur;
  try { await act(); } catch (e) { console.log(name, 'FAILED', e.message.split('\n')[0]); continue; }
  await wait(p, 2200);
  // a layer counts as dropped-while-shown if its node is still connected now and the layer is gone at the end
  const seen = new Map();
  for (const l of startLayers) if (l.backendNodeId) seen.set(l.layerId, { l, t: 0 });
  const endIds = new Set(cur.map((l) => l.layerId));
  const drops = [];
  let prev = new Set(startLayers.map((l) => l.layerId));
  for (const ev of events) {
    const now = new Set(ev.layers.map((l) => l.layerId));
    for (const l of ev.layers) if (l.backendNodeId && !seen.has(l.layerId)) seen.set(l.layerId, { l, t: ev.t - t0 });
    for (const id of prev) if (!now.has(id) && seen.has(id)) drops.push({ ...seen.get(id), gone: ev.t - t0 });
    prev = now;
  }
  const shown = [];
  for (const d of drops) {
    if (endIds.has(d.l.layerId)) continue;
    let ok = false, nm = '?';
    try {
      const r = await cdp.send('DOM.pushNodesByBackendIdsToFrontend', { backendNodeIds: [d.l.backendNodeId] });
      const id = r.nodeIds[0];
      if (id) { const res = await cdp.send('DOM.resolveNode', { nodeId: id }); const v = await cdp.send('Runtime.callFunctionOn', { objectId: res.object.objectId, functionDeclaration: 'function(){ if (!this.isConnected) return null; const r = (this.nodeType === 1 ? this : this.parentElement || document.body).getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight || !r.width) return null; const nm = (e) => e ? (e.className && typeof e.className === "string" ? e.tagName.toLowerCase() + "." + e.className.trim().split(/\\s+/).slice(0,2).join(".") : e.tagName.toLowerCase()) : ""; return nm(this) + " <" + nm(this.parentElement) + " <" + nm(this.parentElement && this.parentElement.parentElement) + " " + (this.textContent||"").trim().slice(0,20) }', returnByValue: true }); if (v.result.value) { ok = true; nm = v.result.value; } }
    } catch { }
    if (ok) shown.push(`${d.gone}ms ${nm}`);
  }
  total += shown.length;
  console.log(`${name}: ${shown.length} on-screen layer drops after the animation${shown.length ? '\n    ' + shown.slice(0, 12).join('\n    ') + (shown.length > 12 ? `\n    … +${shown.length - 12}` : '') : ''}  (layers now ${cur.length})`);
}
console.log('TOTAL', total);
await b.close();
