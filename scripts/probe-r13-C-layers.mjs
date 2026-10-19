// r13 audit (C): which compositor layers repaint, and how many layers exist, while the Coach streams an answer, while you
// type, and while older rows load. Phone-sized (DPR 3.75), mock Gemini (a few words every 70 ms), fake keyboard.
// usage: URL=http://127.0.0.1:4183/ node scripts/probe-r13-C-layers.mjs
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
process.env.AVEN_PALETTE ||= 'golden';
const { b, ctx, p } = await launch({ size: { width: 384, height: 832 }, dsf: 3.75 });
await ctx.addInitScript(() => {
  const l = {}; const vk = { overlaysContent: false, boundingRect: { height: 0 }, addEventListener: (t, f) => { (l[t] ||= []).push(f); }, removeEventListener: () => {} };
  Object.defineProperty(navigator, 'virtualKeyboard', { value: vk });
  window.__setKb = (h) => { vk.boundingRect = { height: h }; (l.geometrychange || []).forEach((f) => f()); };
  const real = window.fetch;
  window.fetch = async (url, init) => {
    const u = String(url);
    if (!u.includes('generativelanguage')) return real(url, init);
    if (!u.includes('stream')) return new Response(JSON.stringify({ models: [] }), { headers: { 'content-type': 'application/json' } });
    const txt = JSON.stringify({ reply: 'Pull is logged and done: 14 working sets across back and curls, with solid top sets including **85 kg on T-bar row**. That is a strong day.\n\nFood sits at only 505 kcal so far. If you haven\'t eaten dinner, you\'ll want something heavy on chicken or fish, around 50 g of protein, plus rice so tomorrow\'s legs have fuel.\n\n- Eat within the hour\n- Drink another litre of water\n- Sleep eight hours', actions: [] });
    const parts = txt.match(/\S+\s*/g); const chunks = []; for (let i = 0; i < parts.length; i += 3) chunks.push(parts.slice(i, i + 3).join(''));
    const enc = new TextEncoder();
    return new Response(new ReadableStream({ async start(c) { await new Promise((r) => setTimeout(r, 700)); for (const ch of chunks) { c.enqueue(enc.encode(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: ch }] } }] })}\n\n`)); await new Promise((r) => setTimeout(r, 70)); } c.close(); } }), { headers: { 'content-type': 'text/event-stream' } });
  };
});
await p.goto(process.env.URL || 'http://127.0.0.1:4183/'); await wait(p, 1500);
await skipOnboarding(p); await loadDemo(p);
await p.evaluate((N) => { localStorage.setItem('aven.keys', JSON.stringify({ gemini: 'AIzaTESTKEY' })); localStorage.setItem('aven.coachNote', '1'); const old = Date.now() - 3 * 3600_000;
  localStorage.setItem('aven.coach', JSON.stringify(Array.from({ length: N }, (_, i) => [{ id: 'p' + i, role: 'user', text: 'Question ' + i + ' about my training and food today', at: old }, { id: 'q' + i, role: 'model', text: 'A longer answer about the training of the day, the food so far and **what to eat tonight** to close the protein gap.\n\n- Eat 40 g protein\n- Drink water', at: old }]).flat())); }, Number(process.env.N || 30));
await p.reload(); await wait(p, 2500);
const cdp = await ctx.newCDPSession(p);
await cdp.send('DOM.enable'); await cdp.send('LayerTree.enable');
await cdp.send('DOM.getDocument', { depth: -1 });
let layers = []; cdp.on('LayerTree.layerTreeDidChange', (e) => { if (e.layers) layers = e.layers; });
const painted = {}; let on = false; cdp.on('LayerTree.layerPainted', (e) => { if (!on) return; const k = e.layerId; painted[k] = painted[k] || { n: 0, area: 0 }; painted[k].n++; painted[k].area = Math.max(painted[k].area, e.clip.width * e.clip.height); });
const name = async (l) => { if (!l?.backendNodeId) return '(none)'; try { await cdp.send('DOM.getDocument', { depth: -1 }); const r = await cdp.send('DOM.pushNodesByBackendIdsToFrontend', { backendNodeIds: [l.backendNodeId] }); const res = await cdp.send('DOM.resolveNode', { nodeId: r.nodeIds[0] }); const v = await cdp.send('Runtime.callFunctionOn', { objectId: res.object.objectId, returnByValue: true, functionDeclaration: 'function(){ const e = this.nodeType === 1 ? this : this.parentElement; return e ? e.tagName.toLowerCase() + "." + String(e.className).trim().split(/\\s+/).slice(0,3).join(".") : "doc" }' }); return v.result.value; } catch { return '(gone)'; } };
async function window_(label, fn, ms) {
  for (const k in painted) delete painted[k];
  const counts = []; const iv = setInterval(() => counts.push(layers.length), 100);
  on = true; await fn(); await wait(p, ms); on = false; clearInterval(iv);
  const byId = new Map(layers.map((l) => [l.layerId, l]));
  console.log(`\n== ${label}: layers min ${Math.min(...counts)} max ${Math.max(...counts)}`);
  for (const [k, v] of Object.entries(painted).sort((a, b) => b[1].n * b[1].area - a[1].n * a[1].area).slice(0, 8)) { const l = byId.get(k); console.log('  painted', v.n, 'x', Math.round(v.area), 'px²', l ? `${Math.round(l.width)}x${Math.round(l.height)}` : '', await name(l)); }
}
await window_('open', async () => { await p.getByRole('button', { name: 'Coach', exact: true }).first().tap(); }, 1500);
if (process.env.CSS) await p.addStyleTag({ content: process.env.CSS });
if (process.env.SPLIT) { // what repaints the list's mask: the list scrolling, or the list growing?
  await wait(p, 6000);
  await window_('scroll only (script)', async () => { await p.evaluate(async () => { const el = document.querySelector('.coach-body'); for (let i = 0; i < 30; i++) { el.scrollTop -= 15; await new Promise((r) => setTimeout(r, 50)); } }); }, 300);
  await window_('grow only (scrolled up, a line added below)', async () => { await p.evaluate(async () => { const th = document.querySelector('.coach-thread'); for (let i = 0; i < 20; i++) { const d = document.createElement('div'); d.textContent = 'x'; th.appendChild(d); await new Promise((r) => setTimeout(r, 80)); } }); }, 300);
  await window_('text grows in place (scrolled up, no size change)', async () => { await p.evaluate(async () => { const r = [...document.querySelectorAll('.coach-reply')].pop(); const s = document.createElement('span'); r.appendChild(s); for (let i = 0; i < 20; i++) { s.textContent = i % 2 ? 'a' : 'b'; await new Promise((r) => setTimeout(r, 80)); } }); }, 300);
  await b.close(); process.exit(0);
}
if (process.env.ONLYSTREAM) { await wait(p, 6000); }
else await window_('older rows load (idle)', async () => {}, 4000);
await p.evaluate(() => { const el = document.querySelector('.coach-body'); el.scrollTop = el.scrollHeight; }); await wait(p, 500);
await window_('tip send + stream', async () => { await p.locator('.coach-resume .tip').first().tap(); }, 6000);
await window_('kb rise', async () => { await p.getByLabel('Message the Coach').focus(); await p.evaluate(() => window.__setKb(300)); }, 1000);
await window_('typing', async () => { await p.keyboard.type('How is my week going so far?', { delay: 110 }); }, 500);
await window_('typed send + stream', async () => { await p.getByRole('dialog', { name: 'Coach' }).getByRole('button', { name: 'Send', exact: true }).tap(); }, 6000);
await window_('kb drop', async () => { await p.evaluate(() => { document.activeElement?.blur(); window.__setKb(0); }); }, 1000);
await window_('idle in coach', async () => {}, 2000);
await b.close();
