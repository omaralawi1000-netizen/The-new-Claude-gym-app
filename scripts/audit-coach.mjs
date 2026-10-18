// Coach audit: drives every action of the Coach sheet and the orb answer screen on a phone-size screen at 4x CPU, with a
// simulated keyboard (a fake navigator.virtualKeyboard, 320 px, that comes up when a field is focused and goes when it
// loses focus) and a mocked Gemini stream (70-char pieces every 300 ms). Per action it lists:
//  - frames: frames drawn, late frames (> 20 ms), the worst one, long tasks, script / style / layout time;
//  - pops, jumps and number swaps (pop probe), and on-screen GPU layers dropped (the phone's one-frame flicker);
//  - the conversation's last line against the typing bar (`under`: frames where it sat under the bar).
// usage: node scripts/audit-coach.mjs [--light] [--film name,name] [--only text]   PROFILE=text: self time of that action  TRACE=text: main-thread time by step  UNDER=0: skip the bar check   (URL defaults to the preview build:
//        npx vite build && npx vite preview --port 4173 --host 127.0.0.1)
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import { PROBE } from './pop-probe.mjs';
import { filmer } from './film-act.mjs';
import fs from 'node:fs';
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const theme = process.argv.includes('--light') ? 'light' : 'dark';
const filmOnly = (arg('--film') || '').split(',').filter(Boolean);
const only = arg('--only');
const rate = Number(process.env.CPU || 4);
const { b, ctx, p, errors } = await launch({ theme, size: { width: 384, height: 832 } });
await ctx.addInitScript(process.env.POPS === '0' ? () => { window.__pops = []; } : PROBE); // (POPS=0: without the pop probe, which reads layout per new element)
const reply = 'Ready whenever you are. Just say the word to log a set, check your food, or start training.\n\nYour **Chest and Biceps** session is lined up for today, and you have plenty of protein left on the budget, so a solid dinner will close the day well.';
await ctx.addInitScript(([reply]) => {
  const l = {}; const vk = { overlaysContent: false, boundingRect: { height: 0 }, addEventListener: (t, f) => { (l[t] ||= []).push(f); }, removeEventListener: () => {} };
  Object.defineProperty(navigator, 'virtualKeyboard', { value: vk });
  window.__setKb = (h) => { vk.boundingRect = { height: h }; (l.geometrychange || []).forEach((f) => f()); };
  document.addEventListener('focusin', (e) => { if (/INPUT|TEXTAREA/.test(e.target.tagName)) setTimeout(() => window.__setKb(320), 30); });
  document.addEventListener('focusout', (e) => { if (/INPUT|TEXTAREA/.test(e.target.tagName)) setTimeout(() => { if (!/INPUT|TEXTAREA/.test(document.activeElement?.tagName || '')) window.__setKb(0); }, 30); });
  const real = window.fetch;
  window.fetch = async (url, init) => {
    const u = String(url);
    if (!u.includes('generativelanguage')) return real(url, init);
    if (u.includes('/models?')) return new Response(JSON.stringify({ models: [] }), { headers: { 'content-type': 'application/json' } });
    const body = JSON.parse(init?.body || '{}');
    if (body.generationConfig?.responseModalities?.includes('AUDIO')) return new Response(JSON.stringify({ candidates: [] }), { headers: { 'content-type': 'application/json' } });
    const txt = JSON.stringify({ reply, actions: [] });
    const enc = new TextEncoder();
    const stream = new ReadableStream({ async start(c) {
      await new Promise((r) => setTimeout(r, 900));
      for (let i = 0; i < txt.length; i += 70) { c.enqueue(enc.encode(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: txt.slice(i, i + 70) }] } }] })}\n\n`)); await new Promise((r) => setTimeout(r, 300)); }
      c.close();
    } });
    return new Response(stream, { headers: { 'content-type': 'text/event-stream' } });
  };
}, [reply]);
p.setDefaultTimeout(5000);
const cdp = await ctx.newCDPSession(p);
const film = await filmer(ctx, p);
const URL = process.env.URL || 'http://127.0.0.1:4173/';

if (process.env.CSS) await ctx.addInitScript((css) => { document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); }); }, process.env.CSS); // (CSS=…: try a style change)
if (process.env.UNDER === '0') await ctx.addInitScript(() => { window.__noUnder = true; });
if (process.env.MUT) await ctx.addInitScript(() => { window.__mutOn = true; }); // (MUT=1: count DOM changes per action)
await p.goto(URL); await wait(p, 1500);
await skipOnboarding(p); await loadDemo(p); await wait(p, 800);
const long = 'At 18, 175 cm and hovering around 97.6 kg, you carry serious density and move real weight, putting up 100 kg on bench, 140 kg on hack squats, and 85 kg rows.\n\nWhat separates your routine from standard bodybuilding is the sheer physical engine behind it: pairing failure-intensity lifting with 40 minutes of hard daily cardio, 12k+ steps, and regular mat time in wrestling.';
// SEED=n: how many saved messages the chat starts with (a phone keeps up to 60; 10 under-measured a full chat)
const older = Array.from({ length: Math.ceil(Number(process.env.SEED ?? 60) / 2) }, (_, i) => [['user', `Question ${i + 1}: give me something about myself.`], ['model', long]]).flat()
  .map(([role, text], i) => ({ id: 'seed' + i, role, text, at: Date.now() - 60000 }));
await p.evaluate((older) => { localStorage.setItem('aven.keys', JSON.stringify({ gemini: 'AIzaTESTKEY', groq: 'gsk_TESTKEY' })); /* (a Groq key: the mic records) */ localStorage.setItem('aven.coach', JSON.stringify(older)); localStorage.setItem('aven.coachNote', '1'); }, older);
await p.reload(); await wait(p, 2200);

// ── layer drops (see audit-workout.mjs) ──
// (DROPS=0: without the layer and DOM watchers, which cost main-thread time per new element and per commit)
const watch = process.env.DROPS !== '0';
if (watch) { await cdp.send('DOM.enable'); await cdp.send('LayerTree.enable'); } await cdp.send('Performance.enable');
let cur = []; const events = [];
cdp.on('LayerTree.layerTreeDidChange', (e) => { if (e.layers) { events.push({ t: Date.now(), layers: e.layers }); cur = e.layers; } });
async function drops(startLayers, t0) {
  const seen = new Map();
  for (const l of startLayers) if (l.backendNodeId) seen.set(l.layerId, { l, t: 0 });
  const endIds = new Set(cur.map((l) => l.layerId));
  const out = []; let prev = new Set(startLayers.map((l) => l.layerId));
  for (const ev of events) {
    const now = new Set(ev.layers.map((l) => l.layerId));
    for (const l of ev.layers) if (l.backendNodeId && !seen.has(l.layerId)) seen.set(l.layerId, { l, t: ev.t - t0 });
    for (const id of prev) if (!now.has(id) && seen.has(id)) out.push({ ...seen.get(id), gone: ev.t - t0 });
    prev = now;
  }
  const shown = [];
  for (const d of out) {
    if (endIds.has(d.l.layerId)) continue;
    try {
      const r = await cdp.send('DOM.pushNodesByBackendIdsToFrontend', { backendNodeIds: [d.l.backendNodeId] });
      const id = r.nodeIds[0]; if (!id) continue;
      const res = await cdp.send('DOM.resolveNode', { nodeId: id });
      const v = await cdp.send('Runtime.callFunctionOn', { objectId: res.object.objectId, returnByValue: true, functionDeclaration: 'function(){ if (!this.isConnected) return null; const el = this.nodeType === 1 ? this : this.parentElement; for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.visibility === "hidden" || cs.display === "none" || +cs.opacity === 0) return null; } const r = el.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight || !r.width) return null; const nm = (e) => e ? (e.className && typeof e.className === "string" ? e.tagName.toLowerCase() + "." + e.className.trim().split(/\\s+/).slice(0,2).join(".") : e.tagName.toLowerCase()) : ""; return nm(el) + " <" + nm(el.parentElement) + " " + (el.textContent||"").trim().slice(0,24) }' });
      if (v.result.value) shown.push(`${d.gone}ms ${v.result.value}`);
    } catch { /* gone */ }
  }
  return shown;
}
const m = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
await cdp.send('Emulation.setCPUThrottlingRate', { rate });
const rows = []; const fails = []; const report = [];
async function act(label, fn, settle = 1400) {
  if (only && !label.includes(only)) { try { await fn(); } catch (e) { fails.push(`${label}: ${String(e.message).split('\n')[0]}`); } await wait(p, settle); return; }
  await p.evaluate((l) => {
    window.__act = l; window.__pops.length = 0; window.__orbWhy = {}; window.__dirtyBy = {};
    window.__f = []; window.__lt = []; window.__under = 0; window.__on = true; let last = performance.now();
    const loop = (t) => {
      window.__f.push(t - last); last = t;
      // the last line drawn in the Coach against the top of its typing bar
      const th = document.querySelector('.coach-thread'), comp = document.querySelector('.coach-composer');
      if (!window.__noUnder && th && comp && document.querySelector('.coach-body')?.dataset.pinnedProbe !== '0') {
        const k = th.lastElementChild; const ink = k ? [...k.querySelectorAll('.w, .typing, .said, .speak-btn')].pop() : null;
        const gap = ink ? ink.getBoundingClientRect().bottom - comp.getBoundingClientRect().top : -1e9;
        if (gap > 1) { window.__under++; (window.__gaps ||= []).push(Math.round(gap)); }
      }
      if (window.__on) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    if (window.__mutOn) { const tally = window.__mut = { add: 0, rm: 0, text: 0, attr: {}, frames: 0, maxAdd: 0 }; let fa = 0; window.__mo?.disconnect(); window.__mo = new MutationObserver((rs) => { for (const r of rs) { if (r.type === 'childList') { const a = [...r.addedNodes].filter((n) => n.nodeType === 1).length; tally.add += a; fa += a; tally.rm += [...r.removedNodes].filter((n) => n.nodeType === 1).length; } else if (r.type === 'attributes') tally.attr[r.attributeName] = (tally.attr[r.attributeName] || 0) + 1; else tally.text++; } }); window.__mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true }); const fl = () => { tally.frames++; tally.maxAdd = Math.max(tally.maxAdd, fa); fa = 0; if (window.__on) requestAnimationFrame(fl); else window.__mo.disconnect(); }; requestAnimationFrame(fl); }
    window.__po?.disconnect(); window.__po = new PerformanceObserver((x) => x.getEntries().forEach((e) => window.__lt.push(Math.round(e.duration)))); window.__po.observe({ type: 'longtask' });
  }, label);
  if (watch) await cdp.send('DOM.getDocument', { depth: -1 });
  events.length = 0; const start = cur; const t0 = Date.now();
  const profiling = process.env.PROFILE && label.includes(process.env.PROFILE);
  const tracing = process.env.TRACE && label.includes(process.env.TRACE);
  const trace = [];
  if (tracing) { cdp.on('Tracing.dataCollected', (e) => trace.push(...e.value)); await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline' + (process.env.INV ? ',disabled-by-default-devtools.timeline.invalidationTracking' : ''), transferMode: 'ReportEvents' }); }
  if (profiling) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start'); }
  const a = await m();
  const run = async () => { try { await fn(); } catch (e) { fails.push(`${label}: ${String(e.message).split('\n')[0]}`); } };
  const key = label.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  if (filmOnly.some((f) => key.includes(f))) await film(`coach-${theme}-${key}`, run, settle, { every: 2, cols: 10 });
  else { await run(); await wait(p, settle); }
  const z = await m();
  if (profiling) {
    const { profile } = await cdp.send('Profiler.stop');
    const self = new Map(); const dt = profile.timeDeltas; const byId = new Map(profile.nodes.map((n) => [n.id, n]));
    profile.samples.forEach((id, i) => { const n = byId.get(id); const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + (dt[i] || 0)); });
    console.log(`── ${label}: self time`); [...self].sort((x, y) => y[1] - x[1]).slice(0, 30).forEach(([k, v]) => console.log(`  ${String(Math.round(v / 1000)).padStart(5)}ms  ${k}`));
  }
  if (tracing) {
    const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r)); await cdp.send('Tracing.end'); await done;
    // main-thread time by step (top-level work of the renderer's main thread)
    const main = trace.find((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain');
    const tot = new Map();
    for (const e of trace) if (main && e.pid === main.pid && e.tid === main.tid && e.ph === 'X' && e.dur) tot.set(e.name, (tot.get(e.name) || 0) + e.dur);
    const ult = trace.filter((e) => main && e.pid === main.pid && e.tid === main.tid && e.name === 'UpdateLayoutTree' && e.dur);
    const ec = ult.map((e) => e.args?.elementCount ?? e.args?.data?.elementCount ?? 0).sort((x, y) => y - x);
    console.log(`── ${label}: style recalcs ${ult.length}, elements per recalc (top) ${ec.slice(0, 8).join(' ')} median ${ec[ec.length >> 1] ?? 0}`);
    const big = ult.sort((x, y) => y.dur - x.dur).slice(0, 5).map((e) => `${Math.round(e.dur / 1000)}ms/${e.args?.elementCount ?? '?'}`);
    console.log(`── ${label}: biggest style recalcs ${big.join(' ')}`);
    if (process.env.INV) { const why = new Map(); for (const e of trace) if (/InvalidationTracking/.test(e.name)) { const d = e.args?.data || {}; const k = `${e.name.replace('InvalidationTracking', '')} ${d.reason || ''} ${d.extraData || ''} ${d.nodeName || ''}`.slice(0, 120); why.set(k, (why.get(k) || 0) + 1); } console.log('── invalidations'); [...why].sort((x, y) => y[1] - x[1]).slice(0, 25).forEach(([k, v]) => console.log(`  ${String(v).padStart(5)}  ${k}`)); }
    if (process.env.WHY) for (const e of ult.slice(0, 12)) { const par = trace.filter((x) => x.pid === e.pid && x.tid === e.tid && x.ph === 'X' && x !== e && x.name !== 'RunTask' && x.ts <= e.ts && x.ts + x.dur >= e.ts + e.dur).map((x) => x.name + (x.args?.data?.functionName ? ':' + x.args.data.functionName : '')).join(' > '); const st = (e.args?.beginData?.stackTrace || []).slice(0, 4).map((f) => `${f.functionName}@${String(f.url).split('/').pop()}:${f.lineNumber}`).join(' < '); console.log(`   style ${Math.round(e.dur / 1000)}ms/${e.args?.elementCount} in [${par || 'frame'}] ${st}`); }
    const fails = new Map(); for (const e of trace) if (e.name === 'Animation' && e.args?.data?.compositeFailed) { const k = `${e.args.data.compositeFailed} ${JSON.stringify(e.args.data.unsupportedProperties || [])}`; fails.set(k, (fails.get(k) || 0) + 1); }
    if (fails.size) console.log(`── ${label}: animations not on the compositor`, Object.fromEntries(fails));
    // the biggest tasks, broken down by their direct steps
    const mainX = trace.filter((e) => main && e.pid === main.pid && e.tid === main.tid && e.ph === 'X' && e.dur).sort((x, y) => x.ts - y.ts);
    const tasks = mainX.filter((e) => e.name === 'RunTask' && e.dur > 40000).sort((x, y) => y.dur - x.dur).slice(0, 4);
    for (const tk of tasks) {
      const parts = new Map();
      for (const e of mainX) if (e !== tk && e.ts >= tk.ts && e.ts + e.dur <= tk.ts + tk.dur && e.name !== 'RunTask') {
        const k = e.name + (e.args?.data?.functionName ? `:${e.args.data.functionName}` : '') + (e.name === 'UpdateLayoutTree' ? `/${e.args?.elementCount}` : '');
        parts.set(k, (parts.get(k) || 0) + e.dur);
      }
      console.log(`── task ${Math.round(tk.dur / 1000)}ms: ` + [...parts].sort((x, y) => y[1] - x[1]).slice(0, 9).map(([k, v]) => `${k} ${Math.round(v / 1000)}`).join(' · '));
    }
    console.log(`── ${label}: main thread by step (inclusive)`); [...tot].sort((x, y) => y[1] - x[1]).slice(0, 24).forEach(([k, v]) => console.log(`  ${String(Math.round(v / 1000)).padStart(5)}ms  ${k}`));
  }
  if (process.env.MUT) console.log('mutations', label, JSON.stringify(await p.evaluate(() => window.__mut)));
  if (process.env.ORBWHY) console.log('orbWhy', label, JSON.stringify(await p.evaluate(() => { const top = (o) => Object.entries(o || {}).sort((a, b) => b[1] - a[1]).slice(0, 10); const r = { by: top(window.__dirtyBy), why: top(window.__orbWhy) }; window.__orbWhy = {}; window.__dirtyBy = {}; return r; }), null, 1));
  const { f, lt, under, pops } = await p.evaluate(() => { window.__on = false; return { f: window.__f.slice(1), lt: window.__lt, under: window.__under, pops: window.__pops.slice() }; });
  const d = (k) => Math.round((z[k] - a[k]) * 1000);
  const late = f.filter((x) => x > 20).length; const worst = Math.round(Math.max(0, ...f));
  const dr = await drops(start, t0);
  rows.push({ label, frames: f.length, late, worst, long: lt, script: d('ScriptDuration'), style: d('RecalcStyleDuration'), layout: d('LayoutDuration'), under, pops: pops.length, drops: dr.length });
  report.push({ label, pops, drops: dr });
  const lines = [...pops.map((x) => `  ${x.kind.padEnd(7)} ${x.size ?? x.by ?? ''} ${x.what}${x.kind === 'number' ? ` [${x.was} → ${x.now}]` : ''}`), ...dr.map((x) => `  drop    ${x}`)];
  console.log(`## ${label}  frames ${f.length} late ${late} worst ${worst}ms long [${lt.join(',')}] script ${d('ScriptDuration')} style ${d('RecalcStyleDuration')} layout ${d('LayoutDuration')}${under ? `  UNDER BAR ${under} by [${(await p.evaluate(() => { const g = window.__gaps || []; window.__gaps = []; return g; })).join(',')}]px` : ''}${lines.length ? '' : '  (clean)'}`);
  for (const l of lines.slice(0, 12)) console.log(l); if (lines.length > 12) console.log(`  … ${lines.length - 12} more`);
}
const sheet = () => p.getByRole('dialog', { name: 'Coach' });
const field = () => p.getByLabel('Message the Coach');
const scroll = (dist) => cdp.send('Input.synthesizeScrollGesture', { x: 195, y: 420, yDistance: dist, speed: 1400, gestureSourceType: 'touch', repeatCount: 1 });

await act('coach: open', () => p.getByRole('button', { name: 'Coach', exact: true }).first().tap(), 2000);
await act('coach: idle (older messages build in)', async () => {}, 1500);
await act('coach: scroll up', () => scroll(700), 1400);
await act('coach: scroll back down', () => scroll(-1400), 1400);
await act('coach: keyboard up', () => field().tap(), 1200);
await act('coach: type', () => field().pressSequentially('How is today?', { delay: 60 }), 600);
await act('coach: send (fly, keyboard down, dots)', () => sheet().getByRole('button', { name: 'Send', exact: true }).tap(), 1700);
await act('coach: answer streams in', async () => {}, 5200);
await act('coach: answer ends (play button)', async () => {}, 1800);
await act('coach: keyboard up at rest', () => field().tap(), 1200);
await act('coach: keyboard down (tap the list)', () => p.locator('.coach-body').tap({ position: { x: 190, y: 200 } }), 1200);
await act('coach: play (read aloud)', () => sheet().getByRole('button', { name: 'Read aloud' }).last().tap(), 1200);
await act('coach: new chat', () => sheet().getByRole('button', { name: 'New chat' }).tap(), 1500);
await act('coach: tap a suggestion', () => sheet().locator('.tip').first().tap(), 1700);
await act('coach: suggestion answer', async () => {}, 5500);
// the mic: the orb listens and its ring follows the voice (a fake microphone) — then stop (the upload fails: no real key)
await act('coach: mic recording', () => sheet().getByRole('button', { name: 'Speak' }).tap(), 2500);
await act('coach: mic stop', () => sheet().locator('.coach-orb').tap(), 1500);
await act('coach: close', () => sheet().getByRole('button', { name: 'Close' }).last().tap(), 1500);
// the orb answer screen
await act('orb: open', () => p.locator('.tabbar').getByRole('button').nth(2).tap(), 1800);
await act('orb: type instead', async () => { const box = p.getByLabel('Type what you ate or did'); if (!(await box.isVisible().catch(() => false))) await p.getByRole('button', { name: 'Type instead' }).tap(); }, 1200);
await act('orb: type', () => p.getByLabel('Type what you ate or did').pressSequentially('How is today looking?', { delay: 50 }), 500);
await act('orb: send', () => p.getByRole('dialog', { name: 'Dictation' }).getByRole('button', { name: 'Send', exact: true }).tap(), 2000);
await act('orb: answer streams in', async () => {}, 5000);
await act('orb: answer ends', async () => {}, 1800);
await act('orb: close', () => p.getByRole('dialog', { name: 'Dictation' }).getByRole('button', { name: 'Close' }).tap(), 1500);

console.log(`\nCPU ×${rate}  ${theme}`);
console.log('action'.padEnd(42), 'frames late worst  long        script style layout under pops drops');
for (const r of rows) console.log(r.label.slice(0, 41).padEnd(42), String(r.frames).padStart(6), String(r.late).padStart(4), String(r.worst).padStart(5), `[${r.long.join(',')}]`.padEnd(12), String(r.script).padStart(6), String(r.style).padStart(5), String(r.layout).padStart(6), String(r.under).padStart(5), String(r.pops).padStart(4), String(r.drops).padStart(5));
if (fails.length) console.log('\nFAILED STEPS:\n' + fails.join('\n'));
if (errors.length) console.log('\nERRORS:', errors.slice(0, 5));
fs.mkdirSync('shots', { recursive: true }); fs.writeFileSync(`shots/audit-coach-${theme}.json`, JSON.stringify({ rows, report }, null, 1));
await b.close();
