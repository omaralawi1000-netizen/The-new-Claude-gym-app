// r13 audit (C): main-thread jank per Coach transition. Phone-sized (384x832, DPR 3.75), CPU slowed 4x, fake keyboard,
// mock Gemini (streams ~3 words per chunk every 70 ms) and mock Groq. Each transition is traced on its own; per transition:
// frames (rAF), dropped (60 Hz headless), main-thread ms per frame, frames over 8.3 ms (a 120 Hz budget miss), long tasks,
// forced layouts/style with their JS stack (mapped to src through the build's source maps), CPU self time by src line,
// paint area, observer storms. PASS=react instead counts React component renders per transition (DevTools hook) and the
// orb's distance from its slot each frame (that pass reads layout, so its timings are not used).
// Build first: AVEN_OUT_DIR=/tmp/claude-0/recC/dist npx vite build --config scripts/probe-r13-C-vite.config.mjs
// usage: URL=http://127.0.0.1:4183/ DIST=/tmp/claude-0/recC/dist [PASS=trace|react] [ONLY=open,type] [N=30] node scripts/probe-r13-C-jank.mjs
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { SourceMapConsumer } from 'source-map-js';

const PASS = process.env.PASS || 'trace';
const DIST = process.env.DIST || '/tmp/claude-0/recC/dist';
const OUT = process.env.OUTJ || `/tmp/claude-0/recC/${PASS}.json`;
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
process.env.AVEN_PALETTE ||= 'golden';

// ── source maps ──
const maps = new Map();
const consumer = (url) => {
  const f = String(url || '').split('?')[0].split('/').pop();
  if (!f || !f.endsWith('.js')) return null;
  if (!maps.has(f)) { const p = path.join(DIST, 'assets', f + '.map'); maps.set(f, fs.existsSync(p) ? new SourceMapConsumer(JSON.parse(fs.readFileSync(p, 'utf8'))) : null); }
  return maps.get(f);
};
// zero-based line/col (CPU profile) -> "src/x.ts:123 fn"
const where = (url, line0, col0, fn = '') => {
  const c = consumer(url);
  if (!c) return `${String(url).split('/').pop() || '(native)'}:${line0 + 1} ${fn}`.trim();
  const o = c.originalPositionFor({ line: line0 + 1, column: Math.max(0, col0) });
  if (!o.source) return `${String(url).split('/').pop()}:${line0 + 1} ${fn}`.trim();
  const src = o.source.replace(/^(\.\.\/)+/, '').replace(/^.*node_modules\//, 'nm/');
  return `${src}:${o.line} ${o.name || fn || ''}`.trim();
};

const { b, ctx, p } = await launch({ size: { width: 384, height: 832 }, dsf: 3.75 });
await ctx.addInitScript((pass) => {
  // the phone's keyboard, faked: the app reads navigator.virtualKeyboard
  const l = {}; const vk = { overlaysContent: false, boundingRect: { height: 0 }, addEventListener: (t, f) => { (l[t] ||= []).push(f); }, removeEventListener: () => {} };
  Object.defineProperty(navigator, 'virtualKeyboard', { value: vk });
  window.__setKb = (h) => { vk.boundingRect = { height: h }; (l.geometrychange || []).forEach((f) => f()); };
  // mock AI: Gemini streams the reply a few words at a time; Groq hears a fixed sentence
  const real = window.fetch;
  window.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes('api.groq.com')) { await new Promise((r) => setTimeout(r, 400)); return new Response(JSON.stringify(u.includes('/models') ? { data: [] } : { text: 'How did my training go today' }), { headers: { 'content-type': 'application/json' } }); }
    if (!u.includes('generativelanguage')) return real(url, init);
    if (u.includes('/models?') || !u.includes('stream')) return new Response(JSON.stringify({ models: [] }), { headers: { 'content-type': 'application/json' } });
    const txt = JSON.stringify({ reply: 'Pull is logged and done: 14 working sets across back and curls, with solid top sets including **85 kg on T-bar row**. That is a strong day.\n\nFood sits at only 505 kcal so far. If you haven\'t eaten dinner, you\'ll want something heavy on chicken or fish, around 50 g of protein, plus rice so tomorrow\'s legs have fuel.\n\n- Eat within the hour\n- Drink another litre of water\n- Sleep eight hours', actions: [] });
    const parts = txt.match(/\S+\s*/g); const chunks = []; for (let i = 0; i < parts.length; i += 3) chunks.push(parts.slice(i, i + 3).join(''));
    const enc = new TextEncoder();
    const stream = new ReadableStream({ async start(c) { await new Promise((r) => setTimeout(r, 700)); for (const ch of chunks) { c.enqueue(enc.encode(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: ch }] } }] })}\n\n`)); await new Promise((r) => setTimeout(r, 70)); } c.close(); } });
    return new Response(stream, { headers: { 'content-type': 'text/event-stream' } });
  };
  // observer storms: how often each kind of observer fires, and how long its callbacks take
  window.__obs = { ro: 0, roMs: 0, mo: 0, moMs: 0, moRecs: 0 };
  const wrap = (C, k) => class extends C { constructor(cb) { super((a, o) => { const t = performance.now(); window.__obs[k]++; if (k === 'mo') window.__obs.moRecs += a.length; try { cb(a, o); } finally { window.__obs[k + 'Ms'] += performance.now() - t; } }); } };
  window.ResizeObserver = wrap(window.ResizeObserver, 'ro'); window.MutationObserver = wrap(window.MutationObserver, 'mo');
  // rAF callers (who keeps a loop running)
  window.__raf = {}; const rAF = window.requestAnimationFrame.bind(window);
  if (pass === 'react') window.requestAnimationFrame = (f) => { if (window.__rafOn) { const s = (new Error().stack || '').split('\n')[2] || '?'; const k = s.trim().replace(/^at /, '').replace(/\(?https?:\/\/[^/]+\/assets\//, '(').slice(0, 90); window.__raf[k] = (window.__raf[k] || 0) + 1; } return rAF(f); };
  // React renders per component (the DevTools hook; production build with kept names)
  if (pass === 'react') {
    window.__rc = null; window.__rcSrc = {}; window.__cn = 0; const seen = new WeakMap();
    // (a subtree React skipped keeps its old fiber objects, flags and all: only fibers new since the last commit rendered)
    const walkOnly = (root, c) => { const st = [root.current]; while (st.length) { const f = st.pop(); seen.set(f, c); if (f.sibling) st.push(f.sibling); if (f.child) st.push(f.child); } };
    const nameOf = (f) => { const t = f.type; if (!t || typeof t === 'string') return null; return t.displayName || t.name || t.type?.displayName || t.type?.name || t.render?.name || null; };
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, renderers: new Map(), inject() { return 1; }, checkDCE() {}, onScheduleFiberRoot() {}, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {}, isDisabled: false,
      onCommitFiberRoot(_, root) {
        const c = ++window.__cn; if (!window.__rc) { walkOnly(root, c); return; } window.__rc.__commits = (window.__rc.__commits || 0) + 1;
        const stack = [root.current];
        while (stack.length) { const f = stack.pop(); const n = nameOf(f); const fresh = seen.get(f) !== c - 1; seen.set(f, c); if (n && fresh && (f.flags & 1)) { window.__rc[n] = (window.__rc[n] || 0) + 1; const t = f.type.type || f.type.render || f.type; if (!window.__rcSrc[n] && typeof t === 'function') window.__rcSrc[n] = String(t).slice(0, 160); } if (f.sibling) stack.push(f.sibling); if (f.child) stack.push(f.child); }
      } };
  }
}, PASS);
const log = (...a) => console.log(...a);
await p.goto(process.env.URL || 'http://127.0.0.1:4183/'); await wait(p, 1500);
await skipOnboarding(p); await loadDemo(p);
await p.evaluate((N) => {
  localStorage.setItem('aven.keys', JSON.stringify({ gemini: 'AIzaTESTKEY', groq: 'gsk_TESTKEY' })); localStorage.setItem('aven.coachNote', '1');
  const old = Date.now() - 3 * 3600_000;
  localStorage.setItem('aven.coach', JSON.stringify(Array.from({ length: N }, (_, i) => [{ id: 'p' + i, role: 'user', text: 'Question ' + i + ' about my training and food today', at: old }, { id: 'q' + i, role: 'model', text: 'A longer answer about the training of the day, the food so far and **what to eat tonight** to close the protein gap.\n\n- Eat 40 g protein\n- Drink water', at: old }]).flat()));
}, Number(process.env.N || 30));
await p.reload(); await wait(p, 2500);
if (process.env.CSS) await p.addStyleTag({ content: process.env.CSS }); // (A/B: try a change)
const cdp = await ctx.newCDPSession(p);
await cdp.send('DOM.enable');
await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.RATE || 4) });
await wait(p, 500);

const CATS = ['toplevel', 'devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'blink', 'blink.user_timing', 'v8', 'cc', ...(process.env.STACK ? ['disabled-by-default-devtools.timeline.stack'] : []), ...(process.env.INV ? ['disabled-by-default-devtools.timeline.invalidationTracking'] : [])];
const results = [];
const box = async () => p.locator('.coach-body').boundingBox();
const swipe = async (dy, steps = 8) => { const bb = await box(); const x = bb.x + bb.width / 2, y = bb.y + bb.height / 2 - dy / 2; await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); for (let i = 1; i <= steps; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + dy * i / steps }] }); await wait(p, 8); } await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };

async function phase(name, action, ms) {
  if (ONLY && !ONLY.has(name)) { await action(); await wait(p, ms); return; }
  const events = [];
  const onData = (e) => events.push(...e.value);
  cdp.on('Tracing.dataCollected', onData);
  await p.evaluate((pass) => {
    window.__fr = []; window.__gap = []; window.__obs = { ro: 0, roMs: 0, mo: 0, moMs: 0, moRecs: 0 }; window.__raf = {}; window.__rafOn = true; if (pass === 'react') window.__rc = {};
    window.__lt = []; try { window.__po?.disconnect(); window.__po = new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push(Math.round(e.duration)))); window.__po.observe({ type: 'longtask' }); } catch {}
    let last = performance.now(); window.__frOn = true;
    const loop = (t) => {
      window.__fr.push(t - last); last = t;
      if (pass === 'react') { const st = document.querySelector('.sphere-stage'), sl = [...document.querySelectorAll('[data-orb-slot]')].filter((e) => e.closest('.coach-composer')).pop(); if (st && sl && getComputedStyle(st).opacity !== '0') { const a = st.getBoundingClientRect(), c = sl.getBoundingClientRect(); window.__gap.push(Math.round(Math.hypot(a.left + a.width / 2 - c.left - c.width / 2, a.top + a.height / 2 - c.top - c.height / 2) * 10) / 10); } }
      if (window.__frOn) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }, PASS);
  if (PASS === 'trace') {
    await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 1000 }); await cdp.send('Profiler.start');
    await cdp.send('Tracing.start', { traceConfig: { includedCategories: CATS }, transferMode: 'ReportEvents' });
  }
  const t0 = Date.now();
  await action();
  const left = ms - (Date.now() - t0); if (left > 0) await wait(p, left);
  const page = await p.evaluate(() => { window.__frOn = false; window.__rafOn = false; const r = { fr: window.__fr.slice(1), gap: window.__gap, obs: window.__obs, raf: window.__raf, rc: window.__rc, lt: window.__lt, rcSrc: window.__rcSrc }; window.__rc = null; return r; });
  const res = { name, ms: Date.now() - t0, frames: page.fr.length, dropped60: page.fr.reduce((n, x) => n + Math.max(0, Math.round(x / 16.67) - 1), 0), worstRaf: Math.max(0, ...page.fr).toFixed(1), obs: page.obs, longtasks: page.lt };
  if (PASS === 'react') {
    res.rc = page.rc && Object.fromEntries(Object.entries(page.rc).map(([k, v]) => [k === '__commits' ? k : srcName(k, page.rcSrc[k]), v])); res.raf = page.raf;
    const g = page.gap.filter((x) => Number.isFinite(x)); res.orbGap = { n: g.length, max: Math.max(0, ...g), over1: g.filter((x) => x > 1).length };
  }
  if (PASS === 'trace') {
    const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
    await cdp.send('Tracing.end'); await done; cdp.off('Tracing.dataCollected', onData);
    const { profile } = await cdp.send('Profiler.stop'); await cdp.send('Profiler.disable');
    Object.assign(res, await analyse(events, profile));
  }
  results.push(res);
  log(`\n== ${name}: frames ${res.frames}, dropped@60 ${res.dropped60}, worst rAF ${res.worstRaf} ms` + (res.perFrame ? `, main/frame median ${res.perFrame.median} p90 ${res.perFrame.p90} max ${res.perFrame.max}, over 8.3: ${res.perFrame.over8}/${res.perFrame.n}, tasks>16 ${res.tasks16.length} >8 ${res.tasks8}` : ''));
  if (res.cats) log('  cats', Object.entries(res.cats).map(([k, v]) => `${k} ${v}`).join(' · '));
  if (res.bigStyle) log('  bigStyle', res.bigStyle.join(' '), '| bigLayout', res.bigLayout.join(' '));
  if (res.self) res.self.slice(0, 8).forEach(([k, v]) => log('  self', v, k));
  if (res.forced) res.forced.slice(0, 6).forEach(([k, v]) => log('  forced', v.n, 'x', v.ms, 'ms', k));
  if (res.paint) res.paint.slice(0, 5).forEach((x) => log('  paint', JSON.stringify(x)));
  log('  obs', JSON.stringify(res.obs), 'longtasks', JSON.stringify(res.longtasks));
  if (res.rc) log('  react', JSON.stringify(Object.entries(res.rc).sort((a, b) => b[1] - a[1]).slice(0, 18)));
  if (res.raf) log('  raf', JSON.stringify(Object.entries(res.raf).sort((a, b) => b[1] - a[1]).slice(0, 6)));
  if (res.orbGap) log('  orbGap', JSON.stringify(res.orbGap));
}

// a minified component name -> its src file:line (found by its own source text in the bundle)
const srcCache = {};
function srcName(n, txt) {
  if (!txt) return n; const key = n + txt; if (srcCache[key]) return srcCache[key];
  let out = n;
  for (const f of fs.readdirSync(path.join(DIST, 'assets')).filter((x) => x.endsWith('.js'))) {
    const code = fs.readFileSync(path.join(DIST, 'assets', f), 'utf8'); const i = code.indexOf(txt.slice(0, 120)); if (i < 0) continue;
    const pre = code.slice(0, i); const line = pre.split('\n').length - 1; const col = i - pre.lastIndexOf('\n') - 1;
    out = where('assets/' + f, line, col).replace(/^.*?src\//, 'src/'); break;
  }
  return (srcCache[key] = out);
}
const nodeName = async (backendNodeId) => {
  try { const r = await cdp.send('DOM.pushNodesByBackendIdsToFrontend', { backendNodeIds: [+backendNodeId] }); const o = await cdp.send('DOM.resolveNode', { nodeId: r.nodeIds[0] }); return (await cdp.send('Runtime.callFunctionOn', { objectId: o.object.objectId, returnByValue: true, functionDeclaration: 'function(){ const e = this.nodeType === 1 ? this : this.parentElement; return e ? e.tagName.toLowerCase() + "." + String(e.className).trim().split(/\\s+/).slice(0,3).join(".") : "doc" }' })).result.value; } catch { return '?'; }
};

const d0 = (k) => 'layer ' + k;
async function analyse(events, profile) {
  const names = {}; for (const e of events) if (e.ph === 'M' && e.name === 'thread_name') names[`${e.pid}:${e.tid}`] = e.args.name;
  // the page's main thread: the renderer main with the most work
  const cnt = {}; for (const e of events) if (e.ph === 'X' && names[`${e.pid}:${e.tid}`] === 'CrRendererMain') cnt[`${e.pid}:${e.tid}`] = (cnt[`${e.pid}:${e.tid}`] || 0) + (e.dur || 0);
  const main = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]?.[0];
  const onMain = (e) => `${e.pid}:${e.tid}` === main;
  const tasks = events.filter((e) => onMain(e) && e.ph === 'X' && e.name === 'RunTask' && e.dur).map((e) => ({ ts: e.ts, end: e.ts + e.dur, dur: e.dur / 1000 }));
  // frames: the main thread's begin-frame ticks
  let ticks = events.filter((e) => onMain(e) && (e.name === 'BeginMainThreadFrame' || e.name === 'BeginFrame')).map((e) => e.ts).sort((a, b) => a - b);
  if (ticks.length < 5) ticks = events.filter((e) => onMain(e) && e.name === 'FireAnimationFrame').map((e) => e.ts).sort((a, b) => a - b);
  ticks = ticks.filter((t, i) => i === 0 || t - ticks[i - 1] > 2000);
  const per = [];
  for (let i = 0; i + 1 < ticks.length; i++) { const a = ticks[i], z = ticks[i + 1]; let busy = 0; for (const t of tasks) { const o = Math.min(z, t.end) - Math.max(a, t.ts); if (o > 0) busy += o; } per.push(busy / 1000); }
  const s = [...per].sort((x, y) => x - y);
  const perFrame = { n: per.length, median: (s[s.length >> 1] ?? 0).toFixed(1), p90: (s[Math.floor(s.length * 0.9)] ?? 0).toFixed(1), max: (s.at(-1) ?? 0).toFixed(1), over8: per.filter((x) => x > 8.33).length, over16: per.filter((x) => x > 16.7).length, sum: per.reduce((x, y) => x + y, 0).toFixed(0) };
  const tasks16 = tasks.filter((t) => t.dur > 16).map((t) => +t.dur.toFixed(1));
  const tasks8 = tasks.filter((t) => t.dur > 8).length;
  const cats = {};
  for (const e of events) if (onMain(e) && e.ph === 'X' && e.dur && ['UpdateLayoutTree', 'Layout', 'PrePaint', 'Paint', 'Layerize', 'Commit', 'FunctionCall', 'EvaluateScript', 'HitTest', 'IntersectionObserverController::computeIntersections', 'ParseHTML', 'MinorGC', 'MajorGC', 'V8.GC_SCAVENGER', 'UpdateLayer'].includes(e.name)) cats[e.name] = (cats[e.name] || 0) + e.dur / 1000;
  for (const k in cats) cats[k] = +cats[k].toFixed(1);
  // forced (synchronous) layout and style: a JS stack on the event
  const forced = {};
  for (const e of events) {
    if (!onMain(e) || !['Layout', 'UpdateLayoutTree'].includes(e.name) || !e.dur) continue;
    const st = e.args?.beginData?.stackTrace || e.args?.data?.stackTrace; if (!st?.length) continue;
    const top = st.slice(0, 3).map((f) => where(f.url, (f.lineNumber || 1) - 1, (f.columnNumber || 1) - 1, f.functionName)).join(' < ');
    const k = `${e.name}: ${top}`; forced[k] = forced[k] || { n: 0, ms: 0 }; forced[k].n++; forced[k].ms += e.dur / 1000;
  }
  const forcedL = Object.entries(forced).map(([k, v]) => [k, { n: v.n, ms: +v.ms.toFixed(1) }]).sort((a, b) => b[1].ms - a[1].ms).slice(0, 12);
  if (process.env.DUMP) { const ps = events.filter((e) => onMain(e) && e.name === 'Paint').slice(0, 4); console.log('PAINT ARGS', JSON.stringify(ps.map((e) => e.args))); }
  if (process.env.INV) { // why styles were recalculated: invalidations by reason and node (the first ones of the phase)
    const inv = {}; for (const e of events) if (/StyleRecalcInvalidationTracking|StyleInvalidatorInvalidationTracking|ScheduleStyleInvalidationTracking/.test(e.name)) { const d = e.args?.data || {}; const k = `${e.name.replace('InvalidationTracking', '')} ${d.reason || d.invalidationList?.[0]?.classes?.join('.') || d.changedClass || d.changedAttribute || d.changedId || d.changedPseudo || d.extraData || ''} ${String(d.nodeName || '').slice(0, 60)}`; inv[k] = (inv[k] || 0) + 1; }
    Object.entries(inv).sort((a, b) => b[1] - a[1]).slice(0, 25).forEach(([k, v]) => console.log('  inv', v, k));
  }
  // the biggest style and layout passes: how many elements / objects each touched
  const bigStyle = events.filter((e) => onMain(e) && e.name === 'UpdateLayoutTree' && e.dur).sort((a, b) => b.dur - a.dur).slice(0, 5).map((e) => `${(e.dur / 1000).toFixed(1)}ms/${e.args?.elementCount ?? e.args?.data?.elementCount ?? '?'}el`);
  const bigLayout = events.filter((e) => onMain(e) && e.name === 'Layout' && e.dur).sort((a, b) => b.dur - a.dur).slice(0, 5).map((e) => `${(e.dur / 1000).toFixed(1)}ms/${e.args?.beginData?.dirtyObjects ?? '?'}of${e.args?.beginData?.totalObjects ?? '?'}`);
  // paint: area per layer/node
  const pn = {}; let paintArea = 0;
  for (const e of events) if (onMain(e) && e.name === 'Paint' && e.dur) { const d = e.args?.data || {}; const k = d.nodeId ?? d.layerId ?? '?'; const c = d.clip; let a = 0; if (c) a = Math.abs((c[2] - c[0]) * (c[5] - c[1])); if (!(a < 2e7)) a = 0; paintArea += a; pn[k] = pn[k] || { n: 0, ms: 0, area: 0 }; pn[k].n++; pn[k].ms += e.dur / 1000; pn[k].area = Math.max(pn[k].area, a); }
  const paint = [];
  for (const [k, v] of Object.entries(pn).sort((a, b) => b[1].ms - a[1].ms).slice(0, 6)) paint.push({ node: d0(k), n: v.n, ms: +v.ms.toFixed(1), maxAreaMpx: +(v.area / 1e6).toFixed(2) });
  // CPU self time by source line
  const self = {};
  const dt = {}; profile.samples.forEach((id, i) => { dt[id] = (dt[id] || 0) + (profile.timeDeltas[i] || 0); });
  for (const n of profile.nodes) { const f = n.callFrame; if (/^\((idle|program|garbage collector|root)\)$/.test(f.functionName)) continue; if (!dt[n.id]) continue; const k = f.url ? where(f.url, f.lineNumber, f.columnNumber, f.functionName) : `(native) ${f.functionName}`; self[k] = (self[k] || 0) + dt[n.id] / 1000; }
  const gc = profile.nodes.filter((n) => n.callFrame.functionName === '(garbage collector)').reduce((x, n) => x + (dt[n.id] || 0), 0) / 1000;
  const selfL = Object.entries(self).map(([k, v]) => [k, +v.toFixed(1)]).sort((a, b) => b[1] - a[1]).slice(0, 25);
  // inclusive (total) time per src function, to catch the caller that drives the cost
  const total = {}; const kids = new Map(profile.nodes.map((n) => [n.id, n.children || []])); const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const incl = (id) => { const n = byId.get(id); let v = dt[id] || 0; for (const c of kids.get(id)) v += incl(c); n.__incl = v; return v; };
  incl(profile.nodes[0].id);
  for (const n of profile.nodes) { const f = n.callFrame; if (!f.url || !/assets\//.test(f.url)) continue; const k = where(f.url, f.lineNumber, f.columnNumber, f.functionName); total[k] = Math.max(total[k] || 0, n.__incl / 1000); }
  const totalL = Object.entries(total).filter(([k]) => /^src\//.test(k)).map(([k, v]) => [k, +v.toFixed(1)]).sort((a, b) => b[1] - a[1]).slice(0, 20);
  return { bigStyle, bigLayout, perFrame, per: per.map((x) => +x.toFixed(1)), tasks16, tasks8, cats, forced: forcedL, paint, paintAreaMpx: +(paintArea / 1e6).toFixed(1), self: selfL, total: totalL, gcMs: +gc.toFixed(1) };
}

const coach = () => p.getByRole('dialog', { name: 'Coach' });
const ta = () => p.getByLabel('Message the Coach');
// ── the transitions ──
await phase('idle-today', async () => {}, 1500);
await phase('open', async () => { await p.getByRole('button', { name: 'Coach', exact: true }).first().tap(); }, 1800);
await phase('idle-coach', async () => { await wait(p, 1200); }, 2500); // (older rows build on idle here)
await phase('fling-up', async () => { for (let k = 0; k < 5; k++) { await swipe(320); await wait(p, 350); } }, 4000);
await phase('fling-down', async () => { for (let k = 0; k < 6; k++) { await swipe(-360); await wait(p, 300); } }, 3500);
await p.evaluate(() => { const el = document.querySelector('.coach-body'); el.scrollTop = el.scrollHeight; }); await wait(p, 600);
const hasTip = await p.locator('.coach-resume .tip').count();
log('tips under the chat:', hasTip);
await phase('tip-send', async () => { if (hasTip) await p.locator('.coach-resume .tip').first().tap(); }, 1100);
await phase('tip-stream', async () => {}, 5200);
await wait(p, 800);
await phase('kb-rise', async () => { await ta().focus(); await p.evaluate(() => window.__setKb(300)); }, 1000);
await phase('typing', async () => { await p.keyboard.type('How is my week going so far?', { delay: 110 }); }, 3600);
await phase('typed-send', async () => { await coach().getByRole('button', { name: 'Send', exact: true }).tap(); }, 1100);
await phase('typed-stream', async () => {}, 5200);
await wait(p, 800);
await phase('kb-drop', async () => { await p.evaluate(() => { document.activeElement?.blur(); window.__setKb(0); }); }, 1000);
await wait(p, 800);
await phase('voice', async () => { await coach().getByRole('button', { name: 'Speak' }).tap(); await wait(p, 1500); await coach().getByRole('button', { name: 'Stop and send' }).first().tap(); }, 3200);
await phase('voice-stream', async () => {}, 5000);
await wait(p, 800);
await phase('close', async () => { await p.keyboard.press('Escape'); }, 1500);
await phase('idle-after', async () => {}, 1500);
fs.writeFileSync(OUT, JSON.stringify(results, null, 1));
log('\nwrote', OUT);
await b.close();
