// Probe: a long answer writing itself in. Samples the GPU layer tree (count, painted area in device px) while it writes,
// plus frame times at 4x CPU. usage: node scripts/probe-write.mjs   (CPU=4, URL=…)
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
const { b, ctx, p } = await launch({ size: { width: 384, height: 832 }, dsf: 3.75 });
const reply = 'Pull is logged and done: 14 working sets across back and curls, with solid top sets including 85 kg on T-bar row and 113 kg machine rows.\n\nFood sits at only 505 kcal and 51 g protein so far (1,995 kcal and 147 g protein left). If you haven\'t eaten dinner, you\'ll want something heavy on chicken or skyr to close that protein gap.\n\nWeight was 97.3 kg this morning, and you\'ve got wrestling planned tomorrow.';
await ctx.addInitScript(([reply]) => {
  const real = window.fetch;
  window.fetch = async (url, init) => {
    const u = String(url);
    if (!u.includes('generativelanguage')) return real(url, init);
    if (u.includes('/models?')) return new Response(JSON.stringify({ models: [] }), { headers: { 'content-type': 'application/json' } });
    const txt = JSON.stringify({ reply, actions: [] });
    const enc = new TextEncoder();
    const stream = new ReadableStream({ async start(c) { await new Promise((r) => setTimeout(r, 600)); for (let i = 0; i < txt.length; i += 70) { c.enqueue(enc.encode(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: txt.slice(i, i + 70) }] } }] })}\n\n`)); await new Promise((r) => setTimeout(r, 250)); } c.close(); } });
    return new Response(stream, { headers: { 'content-type': 'text/event-stream' } });
  };
}, [reply]);
if (process.env.CSS) await ctx.addInitScript((css) => { document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); }); }, process.env.CSS);
await p.goto(process.env.URL || 'http://127.0.0.1:5173/'); await wait(p, 1500);
await skipOnboarding(p); await loadDemo(p);
await p.evaluate(() => { localStorage.setItem('aven.keys', JSON.stringify({ gemini: 'AIzaTESTKEY' })); localStorage.setItem('aven.coachNote', '1');
  const at = Date.now() - 60000; localStorage.setItem('aven.coach', JSON.stringify(Array.from({ length: 6 }, (_, i) => [{ id: 'p' + i, role: 'user', text: 'Question ' + i, at }, { id: 'q' + i, role: 'model', text: 'A longer answer about the training of the day, the food so far and what to eat tonight to close the protein gap.', at }]).flat())); });
await p.reload(); await wait(p, 2000);
await p.getByRole('button', { name: 'Coach', exact: true }).first().tap(); await wait(p, 1800);
const cdp = await ctx.newCDPSession(p);
await cdp.send('LayerTree.enable');
let cur = []; cdp.on('LayerTree.layerTreeDidChange', (e) => { if (e.layers) cur = e.layers; });
await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.CPU || 4) });
await wait(p, 500);
const stat = () => { const d = cur.filter((l) => l.drawsContent); return { n: cur.length, draws: d.length, area: Math.round(d.reduce((a, l) => a + l.width * l.height, 0) / 1e3) }; };
const idle = stat();
if (process.env.LIST) {
  await cdp.send('DOM.getDocument', { depth: -1 });
  const tally = {};
  for (const l of cur.filter((l) => l.drawsContent)) {
    let name = '(no node)';
    if (l.backendNodeId) { try { const r = await cdp.send('DOM.pushNodesByBackendIdsToFrontend', { backendNodeIds: [l.backendNodeId] }); const res = await cdp.send('DOM.resolveNode', { nodeId: r.nodeIds[0] }); const v = await cdp.send('Runtime.callFunctionOn', { objectId: res.object.objectId, returnByValue: true, functionDeclaration: 'function(){ const e = this.nodeType === 1 ? this : this.parentElement; return e.tagName.toLowerCase() + "." + String(e.className).trim().split(/\\s+/).slice(0,2).join(".") }' }); name = v.result.value; } catch {} }
    const k = name; tally[k] = tally[k] || { n: 0, a: 0 }; tally[k].n++; tally[k].a += Math.round(l.width * l.height / 1000);
  }
  console.log('TOTAL', Object.values(tally).reduce((a, v) => a + v.a, 0), 'k, layers', Object.values(tally).reduce((a, v) => a + v.n, 0));
  console.log(Object.entries(tally).sort((a, b) => b[1].a - a[1].a).map(([k, v]) => `${v.n}x ${k} ${v.a}k`).join('\n'));
  await b.close(); process.exit(0);
}
await p.evaluate(() => { window.__f = []; let last = performance.now(); const loop = (t) => { window.__f.push(t - last); last = t; if (window.__f.length < 2000) requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
await p.getByLabel('Message the Coach').fill('How is today?');
await p.getByRole('dialog', { name: 'Coach' }).getByRole('button', { name: 'Send', exact: true }).tap();
const samples = []; let changes = 0, lastN = -1;
cdp.on('LayerTree.layerTreeDidChange', () => { changes++; });
for (let i = 0; i < 45; i++) { await wait(p, 200); const s = stat(); samples.push(s.draws); }
const f = await p.evaluate(() => window.__f);
const late = f.filter((x) => x > 20).length;
console.log('idle', JSON.stringify(idle), 'peak draws', Math.max(...samples), 'tree changes', changes, 'end', JSON.stringify(stat()));
console.log('draws over time', samples.join(' '));
console.log('frames', f.length, 'late>20ms', late, 'worst', Math.round(Math.max(...f)));
await b.close();
