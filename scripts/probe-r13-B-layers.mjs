// Probe (r13 B): every Coach transition, phone-sized (384x832, DPR 3.75), Golden hour, dark. For each transition it records
// the compositor's layer tree on every commit (CDP LayerTree) and lists each layer MADE or DROPPED during or at the end of
// the transition, with its element and Chrome's reason for the layer; DOM mounts/unmounts of icons and buttons; and which
// elements gained/lost backdrop-filter or will-change between the start and the end.
// FRAMES=open,kbup,... also films those transitions frame by frame (whole page slowed WARP times, lossless png screenshots)
// into OUT (default /tmp/claude-0/recB/frames/<step>/).
// usage: AVEN_GPU=1 AVEN_PALETTE=golden URL=http://127.0.0.1:4182/ node scripts/probe-r13-B-layers.mjs
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import fs from 'node:fs';
const FR = (process.env.FRAMES || '').split(',').filter(Boolean);
const OUT = process.env.OUT || '/tmp/claude-0/recB/frames';
const WARP = Number(process.env.WARP || 0.04);
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const { b, ctx, p } = await launch({ size: { width: 384, height: 832 }, dsf: Number(process.env.DSF || 3.75) });
await ctx.addInitScript(() => {
  // fake Android keyboard
  const l = {}; const vk = { overlaysContent: false, boundingRect: { height: 0 }, addEventListener: (t, f) => { (l[t] ||= []).push(f); }, removeEventListener: () => {} };
  Object.defineProperty(navigator, 'virtualKeyboard', { value: vk });
  window.__setKb = (h) => { vk.boundingRect = { height: h }; (l.geometrychange || []).forEach((f) => f()); };
  // time warp: performance.now, rAF timestamps and timers slow down together with the CSS/WAAPI clock (set over CDP)
  const pn = performance.now.bind(performance); let r0 = pn(), v0 = r0, rate = 1;
  const now = () => v0 + (pn() - r0) * rate;
  performance.now = now;
  const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => raf(() => cb(now()));
  const st = window.setTimeout.bind(window); window.setTimeout = (f, ms = 0, ...a) => st(f, (Number(ms) || 0) / rate, ...a);
  const si = window.setInterval.bind(window); window.setInterval = (f, ms = 0, ...a) => si(f, (Number(ms) || 0) / rate, ...a);
  if (window.requestIdleCallback) { const ric = window.requestIdleCallback.bind(window); window.requestIdleCallback = (f, o) => ric(f, o && o.timeout ? { timeout: o.timeout / rate } : o); }
  window.__warp = (r) => { const t = now(); r0 = pn(); v0 = t; rate = r; };
  // mock AI: Gemini streams a two-paragraph answer; Groq hears a sentence
  const real = window.fetch;
  window.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes('api.groq.com')) {
      if (u.includes('/models')) return new Response(JSON.stringify({ data: [] }), { headers: { 'content-type': 'application/json' } });
      return new Response(JSON.stringify({ text: 'How did my pull day go today', language: 'english', segments: [{ avg_logprob: -0.1, no_speech_prob: 0.01, compression_ratio: 1.2, text: 'How did my pull day go today' }] }), { headers: { 'content-type': 'application/json' } });
    }
    if (!u.includes('generativelanguage')) return real(url, init);
    if (u.includes('/models?')) return new Response(JSON.stringify({ models: [] }), { headers: { 'content-type': 'application/json' } });
    const txt = JSON.stringify({ reply: 'Pull is logged and done: 14 working sets across back and curls, with solid top sets including 85 kg on T-bar row.\n\nFood sits at only 505 kcal so far. If you haven\'t eaten dinner, you\'ll want something heavy on chicken.', actions: [] });
    const enc = new TextEncoder();
    const stream = new ReadableStream({ async start(c) { await new Promise((r) => setTimeout(r, 900)); for (let i = 0; i < txt.length; i += 70) { c.enqueue(enc.encode(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: txt.slice(i, i + 70) }] } }] })}\n\n`)); await new Promise((r) => setTimeout(r, 300)); } c.close(); } });
    return new Response(stream, { headers: { 'content-type': 'text/event-stream' } });
  };
});
await p.goto(process.env.URL || 'http://127.0.0.1:4182/'); await wait(p, 1500);
await skipOnboarding(p); await loadDemo(p);
await p.evaluate((n) => {
  localStorage.setItem('aven.keys', JSON.stringify({ gemini: 'AIzaTESTKEY', groq: 'gsk_TESTKEY' })); localStorage.setItem('aven.coachNote', '1');
  const old = Date.now() - 3 * 3600_000;
  const pre = Array.from({ length: n }, (_, i) => [{ id: 'p' + i, role: 'user', text: 'Question ' + i + ' about my training and food today', at: old }, { id: 'q' + i, role: 'model', text: 'A longer answer about the training of the day, the food so far and what to eat tonight to close the protein gap. '.repeat(1 + (i % 2)), at: old }]).flat();
  localStorage.setItem('aven.coach', JSON.stringify([...pre, { id: 's1', role: 'user', text: 'Yo', at: old }, { id: 's2', role: 'model', text: 'Yo! What\'s on your mind?', at: old }]));
}, Number(process.env.SEED || 14));
if (process.env.PATCH) await ctx.addInitScript((which) => {
  // candidate fixes, tried without touching src/: (W) every reply word keeps its layer (no mass drop when .writing goes),
  // (C) the camera's press rim keeps a layer, (V) a landing bubble is hidden with opacity 0 instead of visibility (keeps its layer)
  const css = [which.includes('W') && '.coach-body .coach-reply .w { will-change: opacity; }', which.includes('C') && '.coach-cam::after { will-change: opacity; }', which.includes('T') && '.coach-body .tip { will-change: transform; }'].filter(Boolean).join('\n');
  addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    if (which.includes('V')) new MutationObserver((l) => { for (const m of l) { const e = m.target; if (!e.classList?.contains('said') || !e.closest('.coach-thread')) continue; if (e.style.visibility === 'hidden') { e.style.visibility = ''; e.style.opacity = '0'; e.dataset.vh = '1'; } } }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['style'] });
    if (which.includes('V')) new MutationObserver((l) => { if (l.some((m) => [...m.removedNodes].some((n) => n.classList?.contains('coach-fly')))) document.querySelectorAll('.said[data-vh]').forEach((e) => { e.style.opacity = ''; delete e.dataset.vh; }); }).observe(document.body, { subtree: true, childList: true });
  });
}, process.env.PATCH);
await p.reload(); await wait(p, 2500);
const cdp = await ctx.newCDPSession(p);
await cdp.send('DOM.enable'); await cdp.send('LayerTree.enable'); await cdp.send('Animation.enable');
let cur = []; let events = []; let recording = false; let t0 = 0;
const desc = new Map(); // layerId -> promise of {name, reasons}
const nameOf = async (backendNodeId) => {
  try {
    const r = await cdp.send('DOM.resolveNode', { backendNodeId });
    const v = await cdp.send('Runtime.callFunctionOn', { objectId: r.object.objectId, returnByValue: true, functionDeclaration: `function(){ const e = this.nodeType === 1 ? this : this.parentElement || this.parentNode; if (!e || !e.tagName) return '#' + this.nodeName; const nm = (x) => x && x.tagName ? x.tagName.toLowerCase() + (typeof x.className === 'string' && x.className.trim() ? '.' + x.className.trim().split(/\\s+/).slice(0, 3).join('.') : '') : ''; return nm(e) + ' < ' + nm(e.parentElement) + ' < ' + nm(e.parentElement && e.parentElement.parentElement); }` });
    return v.result.value;
  } catch { try { const d = await cdp.send('DOM.describeNode', { backendNodeId }); const n = d.node; const a = n.attributes || []; const ci = a.indexOf('class'); return (n.pseudoType ? '::' + n.pseudoType + ' of ' : '') + n.nodeName.toLowerCase() + (ci >= 0 ? '.' + a[ci + 1].split(/\s+/).slice(0, 3).join('.') : '') + ' (gone)'; } catch { return '(unknown)'; } }
};
const pseudoName = async (l) => { // a pseudo element's layer: describe it
  try { const d = await cdp.send('DOM.describeNode', { backendNodeId: l.backendNodeId }); if (d.node.pseudoType) return '::' + d.node.pseudoType; } catch { }
  return '';
};
const learn = (layers) => { for (const l of layers) if (!desc.has(l.layerId)) desc.set(l.layerId, (async () => {
  const reasons = await cdp.send('LayerTree.compositingReasons', { layerId: l.layerId }).then((r) => (r.compositingReasonIds || r.compositingReasons || []).join(','), () => '?');
  const nm = l.backendNodeId ? (await pseudoName(l)) + (await nameOf(l.backendNodeId)) : '(no node) ' + Math.round(l.width) + 'x' + Math.round(l.height);
  return { nm, reasons, w: Math.round(l.width), h: Math.round(l.height), draws: l.drawsContent };
})()); };
cdp.on('LayerTree.layerTreeDidChange', (e) => { if (!e.layers) return; cur = e.layers; if (recording) { events.push({ t: Date.now() - t0, layers: e.layers }); learn(e.layers); } });
// (the tree is only sent on a change: make one, so the first step has its starting tree)
await p.evaluate(() => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;will-change:transform;opacity:.01'; document.body.appendChild(d); setTimeout(() => d.remove(), 300); });
await wait(p, 1200);
await cdp.send('DOM.getDocument', { depth: -1 });
const shownNow = async (backendNodeId) => {
  try { const r = await cdp.send('DOM.resolveNode', { backendNodeId }); const v = await cdp.send('Runtime.callFunctionOn', { objectId: r.object.objectId, returnByValue: true, functionDeclaration: `function(){ const e = this.nodeType === 1 ? this : this.parentElement; if (!e || !e.isConnected) return false; const r = e.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return false; for (let x = e; x; x = x.parentElement) { const s = getComputedStyle(x); if (s.display === 'none' || s.visibility === 'hidden') return false; } return true; }` }); return v.result.value; } catch { return false; }
};
// in-page logs: mounts/unmounts of icons and buttons, class flips, and computed blur/will-change sets
await p.evaluate(() => {
  const key = new WeakMap(); let n = 0; const id = (e) => { if (!key.has(e)) key.set(e, ++n); return key.get(e); };
  const nm = (e) => e && e.tagName ? e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 3).join('.') : (e.className && e.className.baseVal ? '.' + e.className.baseVal.split(/\s+/)[0] : '')) : '';
  const path = (e) => [e, e.parentElement, e.parentElement?.parentElement].filter(Boolean).map(nm).join(' < ');
  window.__mut = []; window.__mutOn = false; const t0 = { v: 0 };
  window.__mutStart = () => { window.__mut = []; window.__mutOn = true; t0.v = performance.now(); };
  new MutationObserver((list) => { if (!window.__mutOn) return; const t = Math.round(performance.now() - t0.v);
    for (const m of list) {
      if (m.type === 'childList') {
        for (const x of m.addedNodes) if (x.nodeType === 1 && (x.matches('svg, button, i, img, .tip, .said, .typing, .coach-fly, [class*=coach], [class*=fly], .reply-foot, .speak-btn') || x.querySelector('svg, button'))) window.__mut.push([t, '+', path(x), x.querySelectorAll('svg').length + (x.tagName === 'svg' ? 1 : 0)]);
        for (const x of m.removedNodes) if (x.nodeType === 1 && (x.matches('svg, button, i, img, .tip, .said, .typing, .coach-fly, [class*=coach], [class*=fly], .reply-foot, .speak-btn') || x.querySelector('svg, button'))) window.__mut.push([t, '-', nm(x) + ' (from ' + path(m.target) + ')', x.querySelectorAll('svg').length + (x.tagName === 'svg' ? 1 : 0)]);
      } else if (m.type === 'attributes' && m.attributeName === 'class') {
        const e = m.target; if (e.classList?.contains('w') || e.classList?.contains('w-in')) continue;
        const was = (m.oldValue || '').split(/\s+/).filter(Boolean), now = [...(e.classList || [])];
        const add = now.filter((c) => !was.includes(c)), rem = was.filter((c) => !now.includes(c));
        if (add.length || rem.length) window.__mut.push([t, '~', path(e), (add.length ? '+' + add.join('+') : '') + (rem.length ? ' -' + rem.join('-') : '')]);
      }
    }
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
  window.__props = () => { const bd = {}, wc = {};
    for (const e of document.querySelectorAll('.app *')) { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); if (!r.width || r.bottom < 0 || r.top > innerHeight) continue;
      if (s.backdropFilter && s.backdropFilter !== 'none') bd[id(e)] = path(e) + ' [' + s.backdropFilter + '] op=' + s.opacity;
      if (s.willChange && s.willChange !== 'auto') wc[id(e)] = path(e) + ' [' + s.willChange + ']';
      for (const ps of ['::before', '::after']) { const q = getComputedStyle(e, ps); if (q.content && q.content !== 'none' && q.backdropFilter && q.backdropFilter !== 'none') bd[id(e) + ps] = path(e) + ps + ' [' + q.backdropFilter + ']'; }
    }
    return { bd, wc }; };
});
const dir = (s) => { const d = `${OUT}/${s}`; fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); return d; };
const report = [];
async function step(name, act, settle = 2200) {
  if (ONLY.length && !ONLY.includes(name)) { await act(); await wait(p, settle); return; }
  await wait(p, 400);
  await cdp.send('DOM.getDocument', { depth: -1 });
  const start = new Map(cur.map((l) => [l.layerId, l])); learn(cur);
  const props0 = await p.evaluate(() => window.__props());
  events = []; recording = true; t0 = Date.now();
  await p.evaluate(() => window.__mutStart());
  const filming = FR.includes(name);
  let shots = 0, d;
  if (filming) { d = dir(name); await cdp.send('Animation.setPlaybackRate', { playbackRate: WARP }); await p.evaluate((w) => window.__warp(w), WARP); }
  try { await act(); } catch (e) { console.log(name, 'FAILED', e.message.split('\n')[0]); }
  if (filming) {
    const until = Date.now() + settle / WARP * Number(process.env.FILMK || 0.6);
    while (Date.now() < until && shots < Number(process.env.MAXF || 140)) { const vt = await p.evaluate(() => Math.round(performance.now())); await p.screenshot({ path: `${d}/${String(shots).padStart(4, '0')}_${vt}.png`, scale: process.env.SCALE || 'css' }); shots++; }
    await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 }); await p.evaluate(() => window.__warp(1));
  }
  await wait(p, filming ? 800 : settle);
  recording = false;
  const mut = await p.evaluate(() => { window.__mutOn = false; return window.__mut; });
  const props1 = await p.evaluate(() => window.__props());
  // layers made / dropped
  const born = new Map(), died = new Map(); let prev = new Set(start.keys()); const all = new Map(start);
  for (const ev of events) {
    const now = new Set(ev.layers.map((l) => l.layerId));
    for (const l of ev.layers) { if (!all.has(l.layerId)) { all.set(l.layerId, l); born.set(l.layerId, ev.t); } }
    for (const idd of prev) if (!now.has(idd) && !died.has(idd)) died.set(idd, ev.t);
    for (const idd of now) if (died.has(idd)) died.delete(idd); // came back
    prev = now;
  }
  const endIds = new Set(cur.map((l) => l.layerId));
  const lines = [];
  for (const [idd, t] of born) { const L = all.get(idd); const dd = await desc.get(idd); const gone = died.has(idd) ? died.get(idd) : null;
    lines.push(`  ${gone == null ? 'MADE' : 'MADE+DROPPED'} @${t}${gone != null ? '..' + gone : ''}ms ${dd?.w}x${dd?.h}${dd?.draws ? ' draws' : ''} ${dd?.nm} {${dd?.reasons}}`); }
  for (const [idd, t] of died) { if (born.has(idd)) continue; const L = all.get(idd); const dd = await desc.get(idd); const vis = L.backendNodeId ? await shownNow(L.backendNodeId) : false;
    lines.push(`  ${vis ? 'DROPPED-WHILE-SHOWN' : 'dropped(elem gone/hidden)'} @${t}ms ${dd?.w}x${dd?.h}${dd?.draws ? ' draws' : ''} ${dd?.nm} {${dd?.reasons}}`); }
  const bdA = Object.keys(props1.bd).filter((k) => !props0.bd[k]).map((k) => '  +blur ' + props1.bd[k]);
  const bdR = Object.keys(props0.bd).filter((k) => !props1.bd[k]).map((k) => '  -blur ' + props0.bd[k]);
  const wcA = Object.keys(props1.wc).filter((k) => !props0.wc[k]).map((k) => '  +will-change ' + props1.wc[k]);
  const wcR = Object.keys(props0.wc).filter((k) => !props1.wc[k]).map((k) => '  -will-change ' + props0.wc[k]);
  const out = [`== ${name}: layers start ${start.size} end ${cur.length}, commits ${events.length}, made ${born.size}, dropped ${died.size}${filming ? `, frames ${shots}` : ''}`, ...lines, ...bdA, ...bdR, ...wcA.slice(0, 30), ...wcR.slice(0, 30),
    ...mut.slice(0, Number(process.env.MUTN || 80)).map((m) => `  dom @${m[0]} ${m[1]} ${m[2]} ${m[3]}`), mut.length > Number(process.env.MUTN || 80) ? `  … +${mut.length - Number(process.env.MUTN || 80)} dom changes` : ''].filter(Boolean);
  console.log(out.join('\n')); report.push(out.join('\n'));
}
const coachBtn = () => p.getByRole('button', { name: 'Coach', exact: true }).first();
const field = () => p.getByLabel('Message the Coach');
const swipe = async (dy) => { const box = await p.locator('.coach-body').boundingBox(); const x = box.x + box.width / 2, y = box.y + box.height / 2; await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); for (let i = 1; i <= 12; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + dy * i / 12 }] }); await wait(p, 16); } await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
const SEQ = process.env.SEQ || 'main';
if (SEQ === 'main') {
  await step('open', () => coachBtn().tap({ force: true }), 2600);
  await step('scroll-history', async () => { for (let k = 0; k < 4; k++) { await swipe(320); await wait(p, 450); } }, 1800);
  await step('scroll-back', async () => { for (let k = 0; k < 6; k++) { await swipe(-400); await wait(p, 350); } }, 1500);
  await step('tip-send', () => p.locator('.coach-resume .tip').first().tap({ force: true }), 1500);
  await step('reply-stream', () => wait(p, 10), 5200);
  await step('kb-rise', async () => { await field().focus(); await p.evaluate(() => window.__setKb(320)); }, 1400);
  await step('first-char', () => p.keyboard.type('H'), 1200);
  await step('more-chars', () => p.keyboard.type('ow is my week going'), 1000);
  await step('typed-send', () => p.getByRole('dialog', { name: 'Coach' }).getByRole('button', { name: 'Send', exact: true }).tap({ force: true }), 1600);
  await step('reply-stream-2', () => wait(p, 10), 5200);
  await step('kb-drop', async () => { await p.evaluate(() => { document.activeElement?.blur(); window.__setKb(0); }); }, 1400);
  await step('mic-start', () => p.locator('.coach-orb').tap({ force: true }), 1500);
  await step('mic-stop', () => p.locator('.coach-orb').tap({ force: true }), 3500);
  await step('reply-stream-3', () => wait(p, 10), 4500);
  p.on('filechooser', () => {});
  await step('camera-tap', () => p.locator('.coach-cam').tap({ force: true }), 1500);
  await step('close', () => p.keyboard.press('Escape'), 1800);
  await step('reopen', () => coachBtn().tap({ force: true }), 2600);
  await step('close-2', () => p.keyboard.press('Escape'), 1800);
}
fs.mkdirSync('/tmp/claude-0/recB', { recursive: true });
fs.writeFileSync(process.env.REPORT || '/tmp/claude-0/recB/layers.txt', report.join('\n\n'));
await b.close();
