// Probe: what the page does each frame while the keyboard rides up and down under the Coach (fake keyboard, phone-sized,
// DPR 3.75, CPU slowed 4x). Sums the main thread's work by kind from a trace. CSS= injects a stylesheet (to try a change).
// usage: node scripts/probe-kb-cost.mjs
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
const { b, ctx, p } = await launch({ size: { width: 384, height: 832 }, dsf: 3.75 });
await ctx.addInitScript(() => {
  const l = {}; const vk = { overlaysContent: false, boundingRect: { height: 0 }, addEventListener: (t, f) => { (l[t] ||= []).push(f); }, removeEventListener: () => {} };
  Object.defineProperty(navigator, 'virtualKeyboard', { value: vk });
  window.__setKb = (h) => { vk.boundingRect = { height: h }; (l.geometrychange || []).forEach((f) => f()); };
});
await p.goto(process.env.URL || 'http://127.0.0.1:5173/'); await wait(p, 1500);
await skipOnboarding(p); await loadDemo(p);
await p.evaluate(() => { localStorage.setItem('aven.keys', JSON.stringify({ gemini: 'AIzaTESTKEY' })); localStorage.setItem('aven.coachNote', '1');
  const at = Date.now() - 60000; localStorage.setItem('aven.coach', JSON.stringify(Array.from({ length: 8 }, (_, i) => [{ id: 'p' + i, role: 'user', text: 'Question ' + i + ' about my training', at }, { id: 'q' + i, role: 'model', text: 'A longer answer about the training of the day, the food so far and what to eat tonight to close the protein gap.', at }]).flat())); });
await p.reload(); await wait(p, 2000);
await p.getByRole('button', { name: 'Coach', exact: true }).first().tap(); await wait(p, 6000);
if (process.env.CSS) await p.addStyleTag({ content: process.env.CSS });
const cdp = await ctx.newCDPSession(p);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
await wait(p, 300);
const events = [];
cdp.on('Tracing.dataCollected', (e) => events.push(...e.value));
const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
await cdp.send('Tracing.start', { traceConfig: { includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink', 'cc', 'viz', 'disabled-by-default-devtools.timeline.invalidationTracking'] }, transferMode: 'ReportEvents' });
if (process.env.TRACK) await p.evaluate(() => { window.__track = true; });
if (process.env.PROF) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start'); }
await p.evaluate(() => { window.__fr = []; window.__gap = []; let last = performance.now(); const loop = (t) => { window.__fr.push(t - last); last = t; if (window.__track) { const st = document.querySelector('.sphere-stage'), sl = [...document.querySelectorAll('[data-orb-slot]')].filter((e) => e.closest('.coach-bar, .sheet-foot')).pop(); if (st && sl && getComputedStyle(st).opacity !== '0') { const a = st.getBoundingClientRect(), c = sl.getBoundingClientRect(); window.__gap.push(Math.round((a.top + a.height / 2 - c.top - c.height / 2) * 10) / 10); } } if (window.__fr.length < 200) requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
if (!process.env.NOKB) await p.evaluate(() => window.__setKb(300)); await wait(p, 900);
if (!process.env.NOKB) await p.evaluate(() => window.__setKb(0)); await wait(p, 900);
await cdp.send('Tracing.end'); await done;
if (process.env.PROF) { const { profile } = await cdp.send('Profiler.stop'); const self = {}; const byId = new Map(profile.nodes.map((n) => [n.id, n])); const dt = {}; profile.samples.forEach((id, i) => { dt[id] = (dt[id] || 0) + (profile.timeDeltas[i] || 0); });
  for (const n of profile.nodes) { const f = n.callFrame; const k = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber}:${f.columnNumber}`; self[k] = (self[k] || 0) + (dt[n.id] || 0) / 1000; }
  for (const [k, v] of Object.entries(self).filter(([k]) => !/^\((idle|program|garbage)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 18)) console.log('  self', v.toFixed(1), k.slice(0, 100)); }
const sum = {}; const main = events.filter((e) => e.ph === 'X' && e.dur);
const tid = (() => { const c = {}; for (const e of main) if (e.name === 'UpdateLayoutTree' || e.name === 'Paint') c[e.tid] = (c[e.tid] || 0) + 1; return +Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0]; })();
for (const e of main) { if (['Paint', 'UpdateLayoutTree', 'Layout', 'PrePaint', 'Layerize', 'Commit', 'FunctionCall', 'RasterTask', 'ParseHTML', 'ScrollLayer', 'UpdateLayer'].includes(e.name)) { const k = e.name + (e.tid === tid ? '' : '@other'); sum[k] = (sum[k] || 0) + e.dur / 1000; } }
for (const [k, v] of Object.entries(sum).sort((a, b) => b[1] - a[1])) console.log(k.padEnd(24), v.toFixed(1), 'ms');
const fn = {}; for (const e of main) if (e.name === 'FunctionCall' && e.tid === tid) { const d = e.args?.data || {}; const k = (d.functionName || '?') + ' ' + String(d.url || '').split('/').pop() + ':' + d.lineNumber; fn[k] = (fn[k] || 0) + e.dur / 1000; }
for (const [k, v] of Object.entries(fn).sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log('  fn', k.slice(0, 90), v.toFixed(1));
const pn = {}; for (const e of main) if (e.name === 'Paint' && e.tid === tid) { const d = e.args?.data || {}; const k = d.nodeId ?? d.layerId ?? '?'; pn[k] = pn[k] || { n: 0, ms: 0, w: 0 }; pn[k].n++; pn[k].ms += e.dur / 1000; const c = d.clip; if (c) pn[k].w = Math.round(Math.abs(c[2] - c[0])) + 'x' + Math.round(Math.abs(c[5] - c[1])); }
await cdp.send('DOM.getDocument', { depth: -1 });
for (const [k, v] of Object.entries(pn).sort((a, b) => b[1].ms - a[1].ms).slice(0, 10)) { let nm = '?'; try { const r = await cdp.send('DOM.pushNodesByBackendIdsToFrontend', { backendNodeIds: [+k] }); const res = await cdp.send('DOM.resolveNode', { nodeId: r.nodeIds[0] }); nm = (await cdp.send('Runtime.callFunctionOn', { objectId: res.object.objectId, returnByValue: true, functionDeclaration: 'function(){ const e = this.nodeType === 1 ? this : this.parentElement; return e ? e.tagName.toLowerCase() + "." + String(e.className).trim().split(/\\s+/).slice(0,3).join(".") : "doc" }' })).result.value; } catch {} console.log('  paint', k, nm, v.n, v.ms.toFixed(1), v.w); }
const inv = {}; for (const e of events) if (/Invalidation/.test(e.name)) { const d = e.args?.data || {}; const k = e.name + ' ' + (d.nodeName || '') + ' ' + (d.reason || ''); inv[k] = (inv[k] || 0) + 1; }
for (const [k, v] of Object.entries(inv).filter(([k]) => process.env.INV ? new RegExp(process.env.INV).test(k) : true).sort((a, b) => b[1] - a[1]).slice(0, 14)) console.log('  inv', v, k.slice(0, 140));
const fr = await p.evaluate(() => window.__fr.slice(1));
const gap = await p.evaluate(() => window.__gap); console.log('orb vs slot (px) n', gap.length, 'max', Math.max(...gap.map(Math.abs)), gap.filter((g) => Math.abs(g) > 0.6).slice(0, 20).join(' '));
const sorted = [...fr].sort((a, b) => a - b);
console.log('frames', fr.length, 'median', sorted[fr.length >> 1].toFixed(1), 'p90', sorted[Math.floor(fr.length * 0.9)].toFixed(1), 'over 20ms', fr.filter((x) => x > 20).length);
await b.close();
