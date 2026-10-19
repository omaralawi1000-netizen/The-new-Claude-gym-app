// Probe (r13 D): per-frame log (page-side rAF) of every Coach icon/button and the moving pieces, across each transition.
// Fake keyboard (navigator.virtualKeyboard stub), mock Gemini stream, Golden hour palette by default.
// usage: MODE=main|tip|scroll|top URL=http://127.0.0.1:5184/ node scripts/probe-r13-D-frames.mjs > out.json
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import fs from 'node:fs';
process.env.AVEN_PALETTE ??= 'golden';
const MODE = process.env.MODE || 'main';
const OUT = process.env.OUT || `/tmp/claude-0/recD/${MODE}.json`;
const { b, ctx, p } = await launch({ size: { width: 384, height: 832 }, dsf: 2 });
await ctx.addInitScript(() => {
  const l = {}; const vk = { overlaysContent: false, boundingRect: { height: 0 }, addEventListener: (t, f) => { (l[t] ||= []).push(f); }, removeEventListener: () => {} };
  Object.defineProperty(navigator, 'virtualKeyboard', { value: vk });
  window.__setKb = (h) => { vk.boundingRect = { height: h }; (l.geometrychange || []).forEach((f) => f()); };
  const real = window.fetch;
  window.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes('api.groq.com')) { await new Promise((r) => setTimeout(r, 700)); return new Response(JSON.stringify({ text: 'How did my training go this week?', language: 'english', duration: 2, segments: [{ text: 'How did my training go this week?', avg_logprob: -0.15, no_speech_prob: 0.01, compression_ratio: 1.2 }] }), { headers: { 'content-type': 'application/json' } }); }
    if (!u.includes('generativelanguage')) return real(url, init);
    if (u.includes('/models?')) return new Response(JSON.stringify({ models: [] }), { headers: { 'content-type': 'application/json' } });
    const txt = JSON.stringify({ reply: 'Pull is logged and done: 14 working sets across back and curls, with solid top sets including 85 kg on T-bar row.\n\nFood sits at only 505 kcal so far. If you haven\'t eaten dinner, you\'ll want something heavy on chicken.', actions: [] });
    const enc = new TextEncoder();
    const stream = new ReadableStream({ async start(c) { await new Promise((r) => setTimeout(r, 900)); for (let i = 0; i < txt.length; i += 70) { c.enqueue(enc.encode(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: txt.slice(i, i + 70) }] } }] })}\n\n`)); await new Promise((r) => setTimeout(r, 300)); } c.close(); } });
    return new Response(stream, { headers: { 'content-type': 'text/event-stream' } });
  };
});
await p.goto(process.env.URL || 'http://127.0.0.1:5184/'); await wait(p, 1500);
await skipOnboarding(p); await loadDemo(p);
const seed = { main: 4, tip: 4, scroll: 30, top: -1, voice: 4, settings: -2, closekb: 4 }[MODE] ?? 4;
const age = MODE === 'tip' ? 3 * 3600_000 : 60_000;
await p.evaluate(([n, age]) => {
  const at = Date.now() - age; localStorage.setItem('aven.keys', JSON.stringify(n === -2 ? { gemini: 'AIzaTESTKEY' } : { gemini: 'AIzaTESTKEY', groq: 'gsk_TESTKEY' })); localStorage.setItem('aven.coachNote', '1');
  if (n === -1) { localStorage.setItem('aven.coach', '[]'); return; }
  n = Math.max(n, 4);
  const pre = Array.from({ length: n }, (_, i) => [{ id: 'p' + i, role: 'user', text: 'Question ' + i + ' about my training and food today', at }, { id: 'q' + i, role: 'model', text: 'A longer answer about the training of the day, the food so far and what to eat tonight to close the protein gap. '.repeat(1 + (i % 3)), at }]).flat();
  localStorage.setItem('aven.coach', JSON.stringify([...pre, { id: 's1', role: 'user', text: 'Yo', at }, { id: 's2', role: 'model', text: 'Yo! What\'s on your mind today? Ask me anything.', at }]));
}, [seed, age]);
await p.reload(); await wait(p, 2500);
// headless only: software blur under the live orb drops the Coach to ~20 fps here, so blur is off for the log (icon
// presence and motion do not depend on it). BLUR=1 keeps it.
if (!process.env.BLUR) await p.addStyleTag({ content: '*,*::before,*::after{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}' });

// the sampler: starts before the Coach opens
await p.evaluate(() => {
  const T = {
    orb: '.sphere-stage', slot: '.coach-composer [data-orb-slot]', seat: '.coach-composer .coach-orb', ring: '.coach-composer .voice-ring',
    cam: '.coach-composer .coach-cam', camSlot: '.coach-composer .coach-cam-slot', field: '.coach-composer .coach-field', cfl: '.coach-composer .cf-tint > .cf-l.cf-b', glass: '.coach-composer .cf-glass',
    send: '.coach-composer .coach-send', go: '.coach-composer .coach-send .cs-go', stop: '.coach-composer .coach-send .cs-stop', stand: '.fly-send', fly: '.coach-fly',
    close: '.sheet.sz-full .sheet-head button[aria-label="Close"]', newc: '.coach-new', tip: '.coach-body .tip-ic', dots: '.coach-thread .typing', speak: '.coach-body .speak-btn',
    sheet: '.sheet.sz-full', foot: '.sheet.sz-full .sheet-foot', body: '.coach-body', thread: '.coach-thread', title: '.sheet.sz-full .sheet-head .display', pane: '.sheet.sz-full > .sheet-pane', page: '.sheet.sz-full .sheet-page', said: '.coach-body .live .said', tipsF: '.coach-tips-float', resume: '.coach-resume:not(.coach-tips-float)', tipsOut: '.coach-tips-out', note: '.coach-thread .coach-after.fresh', look: '.coach-thread .coach-look',
  };
  const eff = (e) => { let o = 1, vis = true; for (let n = e; n && n.nodeType === 1; n = n.parentElement) { const cs = getComputedStyle(n); o *= parseFloat(cs.opacity); if (n === e && cs.visibility === 'hidden') vis = false; if (cs.display === 'none') vis = false; } return vis ? o : 0; };
  const r1 = (v) => Math.round(v * 10) / 10;
  window.__log = []; window.__marks = []; const t0 = performance.now(); window.__t0 = t0;
  window.__mark = (s) => window.__marks.push([Math.round(performance.now() - t0), s]);
  const loop = (ft) => {
    // (t: the frame's own time, the clock the browser's animations are sampled on; the callback itself may run late)
    const row = { t: Math.round((ft ?? performance.now()) - t0), late: Math.round(performance.now() - (ft ?? performance.now())) };
    for (const [k, s] of Object.entries(T)) {
      const all = document.querySelectorAll(s); const e = ['speak', 'dots', 'said', 'note', 'look'].includes(k) ? all[all.length - 1] : all[0];
      if (!e) { row[k] = null; continue; }
      const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
      row[k] = { n: all.length, o: r1(eff(e) * 100) / 100, own: +parseFloat(cs.opacity).toFixed(3), x: r1(r.left), y: r1(r.top), w: r1(r.width), h: r1(r.height), tf: cs.transform === 'none' ? '' : cs.transform.replace(/matrix\(|\)/g, '').split(',').map((v) => +(+v).toFixed(3)).join(','), tr: cs.translate === 'none' ? '' : cs.translate, sc: cs.scale === 'none' ? '' : cs.scale, cls: k === 'send' || k === 'field' ? e.className.baseVal ?? e.className : undefined };
    }
    const bd = document.querySelector('.coach-body'); if (bd) { row.st = r1(bd.scrollTop); row.sh = bd.scrollHeight; }
    const rows = document.querySelectorAll('.coach-thread > [data-mid]'); const last = rows[rows.length - 1];
    if (last) { const r = last.getBoundingClientRect(); row.last = { id: last.dataset.mid, y: r1(r.top), b: r1(r.bottom), n: rows.length, vis: getComputedStyle(last.querySelector('.said') || last).visibility }; }
    const ty = [...document.querySelectorAll('.coach-thread .typing')].pop(); if (ty) row.dotI = [...ty.children].map((i) => +parseFloat(getComputedStyle(i).opacity).toFixed(2)).join('/') + (ty.classList.contains('typing-out') ? ' out' : '');
    row.kb = document.querySelector('.sheet.sz-full')?.dataset.kbRoom || '';
    window.__log.push(row);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
});
const mark = (s) => p.evaluate((s) => window.__mark(s), s);
const dlg = () => p.getByRole('dialog', { name: 'Coach' });
await mark('open');
await p.getByRole('button', { name: 'Coach', exact: true }).first().tap(); await wait(p, 1600);
if (MODE === 'main' || MODE === 'top') {
  await mark('kb-up'); await p.locator('.coach-composer textarea').tap(); await wait(p, 40); await p.evaluate(() => window.__setKb(320)); await wait(p, 1200);
  await mark('type1'); await p.keyboard.type('H'); await wait(p, 900);
  await mark('typeRest'); await p.keyboard.type('ow is my week going? Give me the full picture on training and food'); await wait(p, 900);
  await mark('send'); await dlg().getByRole('button', { name: 'Send', exact: true }).tap(); await wait(p, 9000);
  await mark('kb-down'); await p.evaluate(() => { document.activeElement?.blur(); window.__setKb(0); }); await wait(p, 1400);
} else if (MODE === 'voice') {
  await mark('speak'); await dlg().getByRole('button', { name: 'Speak' }).tap(); await wait(p, 1800);
  await mark('stop-send'); await dlg().getByRole('button', { name: 'Stop and send' }).first().tap(); await wait(p, 9000);
} else if (MODE === 'closekb') {
  await mark('kb-up'); await p.locator('.coach-composer textarea').tap(); await wait(p, 40); await p.evaluate(() => window.__setKb(320)); await wait(p, 1500);
  // (the real keyboard leaves as the field loses focus: the stub follows the blur)
  await p.evaluate(() => document.querySelector('.coach-composer textarea').addEventListener('blur', () => setTimeout(() => window.__setKb(0), 30), { once: true }));
} else if (MODE === 'settings') {
  await mark('to-settings'); await dlg().getByRole('button', { name: 'Speak' }).tap(); await wait(p, 1600);
  await mark('back'); await p.locator('.sheet-page .sheet-head button[aria-label="Back"]').first().tap(); await wait(p, 1400);
} else if (MODE === 'tip') {
  await mark('tip'); await p.locator('.coach-resume .tip').first().tap(); await wait(p, 9000);
} else if (MODE === 'scroll') {
  await mark('scroll'); const box = await p.locator('.coach-body').boundingBox();
  for (let k = 0; k < 6; k++) { await p.mouse.move(box.x + 100, box.y + 300); await p.mouse.wheel(0, -900); await wait(p, 350); }
  await wait(p, 1500);
}
await mark('close'); await dlg().getByRole('button', { name: 'Close' }).first().tap(); await wait(p, 1400);
const log = await p.evaluate(() => window.__log), marks = await p.evaluate(() => window.__marks);
fs.writeFileSync(OUT, JSON.stringify({ marks, log }));
console.log('frames', log.length, 'marks', JSON.stringify(marks), '->', OUT);
await b.close();
