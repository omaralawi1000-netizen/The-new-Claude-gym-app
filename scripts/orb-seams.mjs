// Every move the orb makes between its homes, filmed with the steady camera (film-steady.mjs, one frame per 1/60 s of the
// app's time) with the orb's and every slot's box logged at each drawn frame. Then each move is checked for seams: a jump
// (a frame that travels much further than its neighbours), a size snap, a hitch (it stops and starts again), a landing off
// its slot, and the moment the orb and its button come apart.
// usage: TAG=live node scripts/orb-seams.mjs [--light] [names…]  (dev server on 5173 by default; AVEN_GPU=1 for the glass)
//   → shots/film/<TAG>-<theme>-<name>/ (frames, geo.json) and shots/film/<TAG>-<theme>-seams.json
import fs from 'node:fs';
import { wait, skipOnboarding, loadDemo } from './lib.mjs';
import { steady } from './film-steady.mjs';
const theme = process.argv.includes('--light') ? 'light' : 'dark';
const want = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const tag = process.env.TAG || 'orb';
const s = await steady({ theme, size: { width: 384, height: 832 } });
const { p, ctx } = s;
await ctx.addInitScript(() => {
  // the orb drawn on the page: a worker's OffscreenCanvas never reaches the headless camera's pictures (same pixels)
  delete HTMLCanvasElement.prototype.transferControlToOffscreen;
  // a keyboard that rises and falls like the phone's (the app reads navigator.virtualKeyboard)
  const l = {}; const vk = { overlaysContent: false, boundingRect: { height: 0 }, addEventListener: (t, f) => { (l[t] ||= []).push(f); }, removeEventListener: () => {} };
  Object.defineProperty(navigator, 'virtualKeyboard', { value: vk });
  let cur = 0, anim = 0; window.__setKb = (h) => { cancelAnimationFrame(anim); const from = cur, t0 = performance.now(); const step = () => { const k = Math.min(1, (performance.now() - t0) / 250); cur = from + (h - from) * (1 - Math.pow(1 - k, 3)); vk.boundingRect = { height: cur }; (l.geometrychange || []).forEach((f) => f()); if (k < 1) anim = requestAnimationFrame(step); }; step(); };
  document.addEventListener('focusin', (e) => { if (/INPUT|TEXTAREA/.test(e.target.tagName)) setTimeout(() => window.__setKb(320), 30); });
  document.addEventListener('focusout', (e) => { if (/INPUT|TEXTAREA/.test(e.target.tagName)) setTimeout(() => { if (!/INPUT|TEXTAREA/.test(document.activeElement?.tagName || '')) window.__setKb(0); }, 30); });
  // an assistant that answers after a moment
  localStorage.setItem('aven.keys', JSON.stringify({ gemini: 'AIzaTESTKEY' })); localStorage.setItem('aven.coachNote', '1');
  const real = window.fetch;
  window.fetch = async (url, init) => {
    const u = String(url);
    if (!u.includes('generativelanguage')) return real(url, init);
    if (u.includes('/models?')) return new Response(JSON.stringify({ models: [] }), { headers: { 'content-type': 'application/json' } });
    const body = JSON.parse(init?.body || '{}');
    if (body.generationConfig?.responseModalities?.includes('AUDIO')) return new Response(JSON.stringify({ candidates: [] }), { headers: { 'content-type': 'application/json' } });
    const txt = JSON.stringify({ reply: 'Your Pull day is lined up for today, and you have plenty of protein left.', actions: [] }); const enc = new TextEncoder();
    return new Response(new ReadableStream({ async start(c) { await new Promise((r) => setTimeout(r, 900)); c.enqueue(enc.encode(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: txt }] } }] })}\n\n`)); c.close(); } }), { headers: { 'content-type': 'text/event-stream' } });
  };
  // after each drawn frame: where the orb is drawn and where every slot (and the button around it) is
  window.__geo = []; window.__geoOn = false; window.__orbDbg = [];
  const box = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, r.width, r.height]; };
  const rec = () => {
    const o = document.querySelector('.sphere-stage');
    if (!o) return;
    const f = { orb: [...box(o), +getComputedStyle(o).opacity, +o.style.zIndex], slots: {}, dbg: window.__orbDbg?.[window.__orbDbg.length - 1] };
    for (const sl of document.querySelectorAll('[data-orb-slot]')) {
      const b = sl.closest('button, .sphere-slot') ?? sl;
      f.slots[sl.dataset.orbSlot] = [...box(sl), ...box(b)];
    }
    window.__geo.push(f);
  };
  const loop = () => { const mc = new MessageChannel(); mc.port1.onmessage = () => { if (window.__geoOn) rec(); }; mc.port2.postMessage(0); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
});

const seams = {};
/** Film one move, with its geometry; `to` is the slot the orb should end on. */
async function step(name, fn, frames, to) {
  if (want.length && !want.includes(name)) { await fn(); await s.advance(frames); return; }
  await p.evaluate(() => { window.__geo = []; window.__geoOn = true; });
  await s.film(`${tag}-${theme}-${name}`, fn, frames);
  const geo = await p.evaluate(() => { window.__geoOn = false; return window.__geo; });
  fs.writeFileSync(`shots/film/${tag}-${theme}-${name}/geo.json`, JSON.stringify(geo));
  seams[name] = analyse(geo, to);
  console.log(name.padEnd(16), JSON.stringify(seams[name]));
  if (process.env.UNTIL === name) { await s.close(); process.exit(0); }
}
function analyse(geo, to) {
  const o = geo.map((g) => g.orb);
  const d = o.slice(1).map((f, i) => Math.hypot(f[0] - o[i][0], f[1] - o[i][1]));
  const dw = o.slice(1).map((f, i) => f[2] - o[i][2]);
  const out = { frames: geo.length, moving: d.filter((v) => v > 0.05).length, top: +Math.max(0, ...d).toFixed(1) };
  // a jump: a frame that moves more than twice as far as both neighbours (and more than 4 px)
  const spikes = (a) => a.map((v, i) => [i, v]).filter(([i, v]) => Math.abs(v) > 4 && Math.abs(v) > 2 * Math.max(Math.abs(a[i - 1] ?? 0), 0.5) && Math.abs(v) > 2 * Math.max(Math.abs(a[i + 1] ?? 0), 0.5)).map(([i, v]) => `${i + 1}:${v.toFixed(1)}`);
  out.jumps = spikes(d); out.sizeSnaps = spikes(dw);
  // a hitch: moving, then (almost) still for a frame or more, then moving again
  const hitches = [];
  for (let i = 1; i < d.length - 1; i++) if (d[i] < 0.15 && Math.max(...d.slice(Math.max(0, i - 3), i)) > 2 && Math.max(...d.slice(i + 1, i + 4)) > 2) hitches.push(i + 1);
  out.hitches = hitches;
  // speed changes direction more than once (a second push, a bounce back)
  const vy = o.slice(1).map((f, i) => f[1] - o[i][1]); let flips = 0, sg = 0;
  for (const v of vy) { if (Math.abs(v) < 0.4) continue; const k = Math.sign(v); if (sg && k !== sg) flips++; sg = k; }
  out.yReversals = flips;
  const last = geo[geo.length - 1];
  if (to && last.slots[to]) {
    const sl = last.slots[to], z = Math.min(sl[2], sl[3]);
    out.landing = [+(last.orb[0] - sl[0]).toFixed(2), +(last.orb[1] - sl[1]).toFixed(2), +(last.orb[2] - z).toFixed(2)];
    // apart from its button: frames where the orb's centre is off the centre of the button that will hold it while that
    // button is on screen and the orb has nearly arrived (the last 40 % of the way)
    const start = geo[0].orb, total = Math.hypot(sl[0] - start[0], sl[1] - start[1]) || 1;
    let apart = 0, worst = 0;
    for (const g of geo) {
      const b = g.slots[to]; if (!b) continue;
      const left = Math.hypot(b[0] - g.orb[0], b[1] - g.orb[1]);
      if (left / total < 0.4 && b[5] > 0 && b[5] < 832) { worst = Math.max(worst, left); if (left > 3) apart++; }
    }
    out.apartFrames = apart; out.apartWorst = +worst.toFixed(1);
  }
  return out;
}

await p.goto(process.env.URL || 'http://127.0.0.1:5173/'); await wait(p, 1800); await s.advance(60);
// onboarding: the big orb steps down to its small place, then flies to the dock as setup closes
await step('onb-next', () => p.getByRole('button', { name: 'Continue' }).tap(), 70, 'onb');
await step('onb-done', () => p.getByText('Skip all').tap(), 90, 'tab');
await loadDemo(p); await s.advance(120);
await step('tab-switch', () => p.getByRole('button', { name: 'Food', exact: true }).tap(), 70, 'tab');
await step('tab-back', () => p.getByRole('button', { name: 'Today', exact: true }).tap(), 70, 'tab');
await s.advance(60);
await step('orb-open', () => p.locator('.tabbar').getByRole('button').nth(2).tap(), 100, 'voice');
await step('orb-type', async () => { const box = p.getByLabel('Type what you ate or did'); if (!(await box.isVisible().catch(() => false))) await p.getByRole('button', { name: 'Type instead' }).tap(); }, 80, 'voice');
await step('orb-to-coach', () => p.getByRole('dialog', { name: 'Dictation' }).getByRole('button', { name: 'Coach' }).tap(), 100, 'coach');
await step('coach-close', () => p.getByRole('dialog', { name: 'Coach' }).getByRole('button', { name: 'Close' }).last().tap(), 90, 'tab');
await s.advance(60);
await step('coach-open', () => p.getByRole('button', { name: 'Coach', exact: true }).first().tap(), 90, 'coach');
await step('coach-kb-up', () => p.getByLabel('Message the Coach').tap(), 60, 'coach');
await step('coach-kb-down', () => p.locator('.coach-body').tap({ position: { x: 190, y: 200 } }), 60, 'coach');
await step('coach-close2', () => p.getByRole('dialog', { name: 'Coach' }).getByRole('button', { name: 'Close' }).last().tap(), 90, 'tab');
await s.advance(60);
await step('orb-open2', () => p.locator('.tabbar').getByRole('button').nth(2).tap(), 100, 'voice');
await step('orb-close', () => p.getByRole('dialog', { name: 'Dictation' }).getByRole('button', { name: 'Close' }).tap(), 90, 'tab');
await s.advance(60);
// the live workout: the orb rides up in the bar, rests, opens the orb screen from the bar, goes down with the window
const start = p.getByRole('button', { name: /Start workout/ }).first();
await start.scrollIntoViewIfNeeded().catch(() => {}); await s.advance(40);
await step('wk-start', () => start.tap(), 100, 'workout');
await step('wk-rest', () => p.locator('.wk-sheet').getByRole('button', { name: 'Complete set' }).first().tap(), 60, 'workout');
await step('wk-go', () => p.evaluate(async () => { const { useStore } = await import('/src/state/store.ts'); const st = useStore.getState(); const a = st.active; useStore.setState({ active: { ...a, rest: { ...a.rest, endsAt: Date.now() + 250 } } }); }), 70, 'workout');
await step('wk-orb-open', () => p.getByLabel('Dictate sets').tap(), 100, 'voice');
await step('wk-orb-close', () => p.getByRole('dialog', { name: 'Dictation' }).getByRole('button', { name: 'Close' }).tap(), 90, 'workout');
await step('wk-minimise', () => p.getByRole('button', { name: 'Minimise workout' }).tap(), 90, 'tab');
await s.advance(60);
await step('wk-resume', () => p.getByLabel('Resume workout').first().tap(), 100, 'workout');
fs.writeFileSync(`shots/film/${tag}-${theme}-seams.json`, JSON.stringify(seams, null, 1));
await s.close();
