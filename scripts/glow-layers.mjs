// Layer changes AFTER a transition: launch, tab switches, theme and palette changes, the orb screen, the Coach. The glow
// pictures must not add or drop a layer once a motion is under way or has ended (v0.1.123's black frames). Prints, per
// step, every layer that appears or goes between `from` ms after the action and the end, with its element.
//   AVEN_GPU=1 AVEN_BG=classic AVEN_PALETTE=forest URL=http://127.0.0.1:5174/ node scripts/glow-layers.mjs [from=300]
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
const from = Number(process.argv[2] || 300);
const { b, ctx, p } = await launch({ size: { width: 384, height: 832 }, dsf: 3.75 });
const cdp = await ctx.newCDPSession(p);
await p.goto(process.env.URL || 'http://127.0.0.1:5174/'); await wait(p, 1200); await skipOnboarding(p); await loadDemo(p); await wait(p, 2500);
await cdp.send('DOM.enable'); await cdp.send('LayerTree.enable');
let cur = [];
const events = [];
cdp.on('LayerTree.layerTreeDidChange', (e) => { if (e.layers) { events.push({ t: Date.now(), layers: e.layers }); cur = e.layers; } });
const name = async (id) => {
  try {
    const r = await cdp.send('DOM.pushNodesByBackendIdsToFrontend', { backendNodeIds: [id] });
    const res = await cdp.send('DOM.resolveNode', { nodeId: r.nodeIds[0] });
    const v = await cdp.send('Runtime.callFunctionOn', { objectId: res.object.objectId, returnByValue: true, functionDeclaration: 'function(){ const nm = (e) => e && e.tagName ? e.tagName.toLowerCase() + (typeof e.className === "string" && e.className.trim() ? "." + e.className.trim().split(/\\s+/).slice(0,2).join(".") : "") : ""; const e = this.nodeType === 1 ? this : this.parentElement; return (this.isConnected ? "" : "(gone) ") + nm(e) + " < " + nm(e && e.parentElement) + " < " + nm(e && e.parentElement && e.parentElement.parentElement); }' });
    return v.result.value;
  } catch { return '#' + id; }
};
const drawn = (ls) => new Map(ls.filter((l) => l.drawsContent && !l.invisible).map((l) => [l.layerId, l]));
const tab = (n) => () => p.locator('.tabbar').getByRole('button', { name: n, exact: true }).click();
const steps = [
  ['launch (reload)', async () => { await p.reload(); }, 5000],
  ['tab Train', tab('Train'), 3500], ['tab Today', tab('Today'), 3500],
  ['theme → light', () => p.emulateMedia({ colorScheme: 'light' }), 4000], ['theme → dark', () => p.emulateMedia({ colorScheme: 'dark' }), 4000],
  ['orb screen open', () => p.locator('.tabbar .sphere-slot').first().click(), 4500], ['orb screen close', () => p.keyboard.press('Escape'), 3000],
  ['Coach open', () => p.getByRole('button', { name: 'Coach', exact: true }).first().click(), 4000], ['Coach close', () => p.keyboard.press('Escape'), 3500],
];
// the glow's own layers: by element (Chrome renumbers layers when it rebuilds the tree, so they are tracked by element)
const GLOW = /glow|fields|aurora|bgx|bg-|veil|wk-top|wk-field|wk-breath|wk-stage|exd-stage/;
const names = new Map();
const nameOf = async (id) => { if (!names.has(id)) names.set(id, await name(id)); return names.get(id); };
for (const [label, act, dur] of steps) {
  await wait(p, 400); events.length = 0;
  const t0 = Date.now(), first = [{ t: 0, ids: new Set([...drawn(cur).values()].map((l) => l.backendNodeId).filter(Boolean)) }];
  try { await act(); } catch (e) { console.log(label, 'FAILED', e.message.split('\n')[0]); continue; }
  await wait(p, dur);
  await cdp.send('DOM.getDocument', { depth: -1 });
  const snaps = first.concat(events.map((ev) => ({ t: ev.t - t0, ids: new Set([...drawn(ev.layers).values()].map((l) => l.backendNodeId).filter(Boolean)) })));
  const all = new Set(snaps.flatMap((x) => [...x.ids]));
  const rows = [];
  for (const id of all) {
    const nm = await nameOf(id); if (!GLOW.test(nm)) continue;
    // its layer's life: the moments it was there
    let on = false, since = 0; const spans = [];
    for (const sn of snaps) { const has = sn.ids.has(id); if (has && !on) { on = true; since = sn.t; } else if (!has && on) { on = false; spans.push(`${since}-${sn.t}`); } }
    if (on) spans.push(`${since}-end`);
    const flips = spans.length > 1 || !/^0-/.test(spans[0]) || !/-end$/.test(spans[0]);
    rows.push(`${flips ? '!' : ' '} ${nm}: ${spans.join(', ')} ms`);
  }
  console.log(`${label}:\n  ${rows.sort().join('\n  ')}`);
}
await b.close();
