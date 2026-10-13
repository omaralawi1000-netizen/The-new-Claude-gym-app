// The orb's moves in the Coach and on the orb screen, measured after each frame is drawn: where the orb is drawn (its
// stage), how big, and how that changes frame to frame. One move should rise in speed and settle once (no second push,
// no reversal, no jump), and land on its slot.
// usage: node scripts/probe-orb.mjs [--light] [--film]   (preview build on 4173 by default; CPU=4 to throttle)
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import { filmer } from './film-act.mjs';
const theme = process.argv.includes('--light') ? 'light' : 'dark';
const { b, ctx, p } = await launch({ theme, size: { width: 384, height: 832 } });
await ctx.addInitScript(() => {
  const l = {}; const vk = { overlaysContent: false, boundingRect: { height: 0 }, addEventListener: (t, f) => { (l[t] ||= []).push(f); }, removeEventListener: () => {} };
  Object.defineProperty(navigator, 'virtualKeyboard', { value: vk });
  let cur = 0, anim = 0; window.__setKb = (h) => { cancelAnimationFrame(anim); const from = cur, t0 = performance.now(); const step = () => { const k = Math.min(1, (performance.now() - t0) / 250); cur = from + (h - from) * (1 - Math.pow(1 - k, 3)); vk.boundingRect = { height: cur }; (l.geometrychange || []).forEach((f) => f()); if (k < 1) anim = requestAnimationFrame(step); }; step(); };
  document.addEventListener('focusin', (e) => { if (/INPUT|TEXTAREA/.test(e.target.tagName)) setTimeout(() => window.__setKb(320), 30); });
  document.addEventListener('focusout', (e) => { if (/INPUT|TEXTAREA/.test(e.target.tagName)) setTimeout(() => { if (!/INPUT|TEXTAREA/.test(document.activeElement?.tagName || '')) window.__setKb(0); }, 30); });
  const real = window.fetch;
  window.fetch = async (url, init) => {
    const u = String(url);
    if (!u.includes('generativelanguage')) return real(url, init);
    if (u.includes('/models?')) return new Response(JSON.stringify({ models: [] }), { headers: { 'content-type': 'application/json' } });
    const body = JSON.parse(init?.body || '{}');
    if (body.generationConfig?.responseModalities?.includes('AUDIO')) return new Response(JSON.stringify({ candidates: [] }), { headers: { 'content-type': 'application/json' } });
    const txt = JSON.stringify({ reply: 'Your Chest and Biceps session is lined up for today, and you have plenty of protein left.', actions: [] }); const enc = new TextEncoder();
    return new Response(new ReadableStream({ async start(c) { await new Promise((r) => setTimeout(r, 1200)); c.enqueue(enc.encode(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: txt }] } }] })}\n\n`)); c.close(); } }), { headers: { 'content-type': 'text/event-stream' } });
  };
});
const film = await filmer(ctx, p);
await p.goto(process.env.URL || 'http://127.0.0.1:4173/'); await wait(p, 1500);
await skipOnboarding(p); await loadDemo(p); await wait(p, 800);
await p.evaluate(() => { localStorage.setItem('aven.keys', JSON.stringify({ gemini: 'AIzaTESTKEY' })); localStorage.setItem('aven.coach', JSON.stringify([{ id: 'a', role: 'user', text: 'Hi', at: Date.now() - 6e4 }, { id: 'b', role: 'model', text: 'Hello there.', at: Date.now() - 6e4 }])); localStorage.setItem('aven.coachNote', '1'); });
await p.reload(); await wait(p, 2200);
const cdp = await ctx.newCDPSession(p);
if (process.env.CPU) await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.CPU) });
const start = () => p.evaluate(() => {
  window.__rec = []; window.__on = true; const t0 = performance.now();
  const loop = (t) => { const mc = new MessageChannel(); mc.port1.onmessage = () => { const s = document.querySelector('.sphere-stage'); if (!s) return; const r = s.getBoundingClientRect(); window.__rec.push({ t: Math.round(performance.now() - t0), x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, op: +getComputedStyle(s).opacity }); }; mc.port2.postMessage(0); if (window.__on) requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
});
const stop = () => p.evaluate(() => { window.__on = false; return window.__rec; });
const slot = (id) => p.evaluate((id) => { const s = document.querySelector(`[data-orb-slot="${id}"]`); if (!s) return null; const r = s.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: Math.min(r.width, r.height) }; }, id);
function report(name, rec, end) {
  const moving = rec.filter((f, i) => i && (Math.abs(f.x - rec[i - 1].x) > 0.05 || Math.abs(f.y - rec[i - 1].y) > 0.05 || Math.abs(f.w - rec[i - 1].w) > 0.05));
  const sp = rec.slice(1).map((f, i) => Math.hypot(f.x - rec[i].x, f.y - rec[i].y) / Math.max(1, f.t - rec[i].t) * 16.7); // px per 60 Hz frame
  const gs = rec.slice(1).map((f, i) => (f.w - rec[i].w) / Math.max(1, f.t - rec[i].t) * 16.7);
  const peaks = (a) => { let n = 0; for (let i = 1; i < a.length - 1; i++) if (Math.abs(a[i]) > 1 && Math.abs(a[i]) > Math.abs(a[i - 1]) + 0.8 && Math.abs(a[i]) >= Math.abs(a[i + 1])) n++; return n; };
  const flips = (a) => { let n = 0, s = 0; for (const v of a) { if (Math.abs(v) < 0.4) continue; const k = Math.sign(v); if (s && k !== s) n++; s = k; } return n; };
  const dx = rec.slice(1).map((f, i) => f.x - rec[i].x), dy = rec.slice(1).map((f, i) => f.y - rec[i].y);
  const last = rec[rec.length - 1];
  const land = end ? `landing off by x ${(last.x - end.x).toFixed(1)} y ${(last.y - end.y).toFixed(1)} size ${(last.w - end.w).toFixed(1)}` : '';
  console.log(`## ${name}: ${rec.length} frames, moving ${moving.length}, top speed ${Math.max(0, ...sp).toFixed(1)} px/frame, speed peaks ${peaks(sp)}, size peaks ${peaks(gs)}, x/y/size reversals ${flips(dx)}/${flips(dy)}/${flips(gs)} ${land}`);
  if (process.env.DETAIL) console.log('   ' + rec.map((f) => `${f.t}:${Math.round(f.x)},${Math.round(f.y)},${Math.round(f.w)}${f.op < 1 ? 'o' + f.op.toFixed(2) : ''}`).join(' '));
}
const step = async (name, fn, ms, endSlot) => {
  await start();
  if (process.argv.includes('--film')) await film(`orb-${theme}-${name}`, fn, ms, { every: 1, cols: 10 }); else { await fn(); await wait(p, ms); }
  report(name, await stop(), endSlot ? await slot(endSlot) : null);
};
await step('coach-open', () => p.getByRole('button', { name: 'Coach', exact: true }).first().tap(), 1600, 'coach');
await step('coach-keyboard-up', () => p.getByLabel('Message the Coach').tap(), 1200, 'coach');
await step('coach-keyboard-down', () => p.locator('.coach-body').tap({ position: { x: 190, y: 200 } }), 1200, 'coach');
await step('coach-close', () => p.getByRole('dialog', { name: 'Coach' }).getByRole('button', { name: 'Close' }).last().tap(), 1600, 'tab');
await step('orb-open', () => p.locator('.tabbar').getByRole('button').nth(2).tap(), 1800, 'voice');
await step('orb-type-instead', async () => { const box = p.getByLabel('Type what you ate or did'); if (!(await box.isVisible().catch(() => false))) await p.getByRole('button', { name: 'Type instead' }).tap(); }, 1400, 'voice');
await p.getByLabel('Type what you ate or did').fill('How is today looking?');
await step('orb-send-think-answer', () => p.getByRole('dialog', { name: 'Dictation' }).getByRole('button', { name: 'Send', exact: true }).tap(), 3500, 'voice');
await step('orb-close', () => p.getByRole('dialog', { name: 'Dictation' }).getByRole('button', { name: 'Close' }).tap(), 1600, 'tab');
await b.close();
