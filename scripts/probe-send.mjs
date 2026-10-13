// Your sent message's flight in the Coach, measured frame by frame: where the flying copy is drawn, where its bubble is,
// and the hand-over between them. Cases: keyboard up / down, short / long, first message of a fresh chat.
// usage: node scripts/probe-send.mjs [--light] [--film]   (URL defaults to the preview build on 4173; CPU=4 to throttle)
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import { filmer } from './film-act.mjs';
const theme = process.argv.includes('--light') ? 'light' : 'dark';
const { b, ctx, p } = await launch({ theme, size: { width: 384, height: 832 } });
const reply = 'Sure. Your **Chest and Biceps** session is lined up for today.';
await ctx.addInitScript(([reply]) => {
  const l = {}; const vk = { overlaysContent: false, boundingRect: { height: 0 }, addEventListener: (t, f) => { (l[t] ||= []).push(f); }, removeEventListener: () => {} };
  Object.defineProperty(navigator, 'virtualKeyboard', { value: vk });
  // the keyboard slides (about 250 ms), as a real one does
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
    const txt = JSON.stringify({ reply, actions: [] }); const enc = new TextEncoder();
    return new Response(new ReadableStream({ async start(c) { await new Promise((r) => setTimeout(r, 1400)); c.enqueue(enc.encode(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: txt }] } }] })}\n\n`)); c.close(); } }), { headers: { 'content-type': 'text/event-stream' } });
  };
}, [reply]);
const film = await filmer(ctx, p);
if (process.env.DETAIL) await ctx.addInitScript(() => { window.__detail = true; });
await p.goto(process.env.URL || 'http://127.0.0.1:4173/'); await wait(p, 1500);
await skipOnboarding(p); await loadDemo(p); await wait(p, 800);
const long = 'At 18, 175 cm and hovering around 97.6 kg, you carry serious density and move real weight.\n\nWhat separates your routine is the engine behind it.';
const older = Array.from({ length: 3 }, (_, i) => [['user', `Question ${i + 1}: give me something about myself.`], ['model', long]]).flat().map(([role, text], i) => ({ id: 'seed' + i, role, text, at: Date.now() - 60000 }));
await p.evaluate((older) => { localStorage.setItem('aven.keys', JSON.stringify({ gemini: 'AIzaTESTKEY' })); localStorage.setItem('aven.coach', JSON.stringify(older)); localStorage.setItem('aven.coachNote', '1'); }, older);
await p.reload(); await wait(p, 2200);
const cdp = await ctx.newCDPSession(p);
if (process.env.CPU) await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.CPU) });
const sheet = () => p.getByRole('dialog', { name: 'Coach' });
const field = () => p.getByLabel('Message the Coach');
await p.getByRole('button', { name: 'Coach', exact: true }).first().tap(); await wait(p, 2200);

const startProbe = () => p.evaluate(() => {
  window.__rec = []; window.__on = true; const t0 = performance.now();
  const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left * 10) / 10, Math.round(b.top * 10) / 10, Math.round(b.width), Math.round(b.height)]; };
  const loop = (t) => {
    const copy = document.querySelector('.coach-fly');
    const bubbles = document.querySelectorAll('.coach-thread [data-mid] .said'); const bub = bubbles[bubbles.length - 1];
    // measured after the frame is drawn (what was on screen), not before the frame's own work
    const mc = new MessageChannel(); mc.port1.onmessage = () => window.__rec.push({ t: Math.round(t - t0), copy: r(copy), bub: r(bub), vis: bub ? getComputedStyle(bub).visibility[0] : '-', comp: Math.round(document.querySelector('.coach-composer')?.getBoundingClientRect().top ?? 0), st: Math.round(document.querySelector('.coach-body')?.scrollTop ?? 0), kids: window.__detail ? [...document.querySelectorAll('.coach-thread > *, .coach-thread .reply-foot, .coach-body > *')].map((k) => `${k.className || k.dataset.mid}:${Math.round(k.offsetTop)}+${Math.round(k.getBoundingClientRect().height * 10) / 10}`) : null, th: getComputedStyle(document.querySelector('.coach-thread')).transform.split(',')[5]?.trim().replace(')', '') });
    mc.port2.postMessage(0);
    if (window.__on) requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
});
const stopProbe = () => p.evaluate(() => { window.__on = false; return window.__rec; });
function analyse(name, rec) {
  // what you see of your message each frame: the copy while it flies, the bubble once it is shown
  const seen = rec.map((f) => ({ t: f.t, box: f.copy ?? (f.vis === 'v' ? f.bub : null), who: f.copy ? 'copy' : f.vis === 'v' ? 'bub' : '' })).filter((f) => f.box);
  const hand = seen.findIndex((f, i) => i && f.who === 'bub' && seen[i - 1].who === 'copy');
  const jumpAt = hand > 0 ? seen[hand].box.map((v, j) => Math.round((v - seen[hand - 1].box[j]) * 10) / 10) : null;
  // a move is one move when its speed rises then falls once (no second push, no reversal)
  const ys = seen.map((f) => f.box[1]); const xs = seen.map((f) => f.box[0]);
  const dy = ys.slice(1).map((y, i) => y - ys[i]); const dx = xs.slice(1).map((x, i) => x - xs[i]);
  const flips = (d) => { let n = 0, s = 0; for (const v of d) { if (Math.abs(v) < 0.6) continue; const k = Math.sign(v); if (s && k !== s) n++; s = k; } return n; };
  const speed = dy.map((v, i) => Math.hypot(v, dx[i])); let pushes = 0; for (let i = 1; i < speed.length - 1; i++) if (speed[i] > speed[i - 1] + 2 && speed[i] > speed[i + 1] && i > 1) pushes++;
  const restY = ys[ys.length - 1]; const settle = seen.findIndex((f, i) => seen.slice(i).every((g) => Math.abs(g.box[1] - restY) < 0.6));
  console.log(`## ${name}: frames ${seen.length}, handover ${hand > 0 ? `at ${seen[hand].t}ms, jump [x,y,w,h] ${jumpAt}` : 'none seen'}, y reversals ${flips(dy)}, x reversals ${flips(dx)}, extra speed peaks ${pushes}, still from ${seen[settle]?.t}ms`);
  if (process.env.DETAIL) for (const f of rec) if (f.copy) console.log(`   ${f.t}ms copy ${f.copy[1]} bubble ${f.bub?.[1]} diff ${Math.round((f.copy[1] - (f.bub?.[1] ?? 0)) * 10) / 10} scroll ${f.st} thread ${f.th} bar ${f.comp}`);
  if (process.env.DETAIL) { const a = rec.find((f) => f.copy)?.kids || [], z = rec[rec.length - 1].kids; console.log('   start', a.slice(-8).join(' | ')); console.log('   end  ', z.slice(-8).join(' | ')); }
  console.log('   y:', seen.map((f) => `${f.who === 'copy' ? '' : '*'}${Math.round(f.box[1])}`).join(' '));
}
const sendCase = async (name, text, { kbDown = false } = {}) => {
  await field().tap(); await wait(p, 500);
  await field().fill(text); await wait(p, 300);
  if (kbDown) { await p.evaluate(() => document.activeElement?.blur()); await wait(p, 600); }
  await startProbe();
  const go = () => sheet().getByRole('button', { name: 'Send', exact: true }).tap();
  if (process.argv.includes('--film')) await film(`send-${theme}-${name}`, go, 1700, { every: 1, cols: 10 }); else { await go(); await wait(p, 1700); }
  analyse(name, await stopProbe());
  await wait(p, 2500);
};
await sendCase('kb-up-short', 'How is today?');
await sendCase('kb-up-long', 'Can you look at my whole week and tell me where I am falling short on protein and sleep, and what to change tomorrow?');
await sendCase('kb-down-short', 'And tomorrow?', { kbDown: true });
await sendCase('kb-down-long', 'Plan me a short wrestling conditioning block for Thursday that will not wreck my legs for Saturday.', { kbDown: true });
await sheet().getByRole('button', { name: 'New chat' }).tap(); await wait(p, 1500);
await sendCase('fresh-first', 'Hi coach, what should I eat tonight?');
await b.close();
