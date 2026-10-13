// The Coach's bottom melt (the soft fade above the typing bar) while the keyboard comes and goes, frame by frame: where the
// melt sits against where the bar is drawn. A melt left above a bar that has already moved hides the messages in between
// (Omar's recording, 13 Oct: after sending "Ok" the last messages vanished while the keyboard went down, then popped back).
// usage: node scripts/probe-melt.mjs [--light] [--film]   (URL defaults to the preview build on 4173; CPU=4 to throttle)
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import { filmer } from './film-act.mjs';
const theme = process.argv.includes('--light') ? 'light' : 'dark';
const { b, ctx, p } = await launch({ theme, size: { width: 412, height: 892 } });
await ctx.addInitScript(() => {
  const l = {}; const vk = { overlaysContent: false, boundingRect: { height: 0 }, addEventListener: (t, f) => { (l[t] ||= []).push(f); }, removeEventListener: () => {} };
  Object.defineProperty(navigator, 'virtualKeyboard', { value: vk });
  // Chrome on Android tells the keyboard's final height once, as it starts to move (the app springs along with it)
  window.__setKb = (h) => { vk.boundingRect = { height: h }; (l.geometrychange || []).forEach((f) => f()); };
  document.addEventListener('focusin', (e) => { if (/INPUT|TEXTAREA/.test(e.target.tagName)) setTimeout(() => window.__setKb(330), 30); });
  document.addEventListener('focusout', (e) => { if (/INPUT|TEXTAREA/.test(e.target.tagName)) setTimeout(() => { if (!/INPUT|TEXTAREA/.test(document.activeElement?.tagName || '')) window.__setKb(0); }, 30); });
  const real = window.fetch;
  window.fetch = async (url, init) => {
    const u = String(url);
    if (!u.includes('generativelanguage')) return real(url, init);
    if (u.includes('/models?')) return new Response(JSON.stringify({ models: [] }), { headers: { 'content-type': 'application/json' } });
    const body = JSON.parse(init?.body || '{}');
    if (body.generationConfig?.responseModalities?.includes('AUDIO')) return new Response(JSON.stringify({ candidates: [] }), { headers: { 'content-type': 'application/json' } });
    const txt = JSON.stringify({ reply: 'All good. Standing by.', actions: [] }); const enc = new TextEncoder();
    return new Response(new ReadableStream({ async start(c) { await new Promise((r) => setTimeout(r, 1600)); c.enqueue(enc.encode(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: txt }] } }] })}\n\n`)); c.close(); } }), { headers: { 'content-type': 'text/event-stream' } });
  };
});
const film = await filmer(ctx, p);
await p.goto(process.env.URL || 'http://127.0.0.1:4173/'); await wait(p, 1500);
await skipOnboarding(p); await loadDemo(p); await wait(p, 800);
const long = 'You are aiming for 92.5 kg for 8 reps on your top work sets after your warm-up, followed by Pec Deck and Incline Machine Chest Press. Tomorrow is scheduled for wrestling, so locking in high effort today will set you up well.';
const older = [['user', 'Plan?'], ['model', long], ['user', 'And food?'], ['model', long], ['user', 'What is today?'], ['model', long], ['user', 'Yo'], ['model', "Yo Omar, I'm here. Let me know what you need."], ['user', 'Ok'], ['model', 'Ready when you are.']].map(([role, text], i) => ({ id: 'seed' + i, role, text, at: Date.now() - 60000 }));
await p.evaluate((older) => { localStorage.setItem('aven.keys', JSON.stringify({ gemini: 'AIzaTESTKEY' })); localStorage.setItem('aven.coach', JSON.stringify(older)); localStorage.setItem('aven.coachNote', '1'); }, older);
await p.reload(); await wait(p, 2200);
const cdp = await ctx.newCDPSession(p);
if (process.env.CPU) await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.CPU) });
const sheet = () => p.getByRole('dialog', { name: 'Coach' });
const field = () => p.getByLabel('Message the Coach');
await p.getByRole('button', { name: 'Coach', exact: true }).first().tap(); await wait(p, 2200);

// the melt's place, read with a marker placed at var(--melt) inside the list (the same calc the mask uses)
const startProbe = () => p.evaluate(() => {
  const body = document.querySelector('.coach-body');
  // (--melt resolved as the mask resolves it: a marker inside the list placed at top: <its value>, % of the list's height)
  if (getComputedStyle(body).position === 'static') body.style.position = 'relative';
  const mk = document.createElement('i'); Object.assign(mk.style, { position: 'absolute', left: 0, width: 0, height: 0, pointerEvents: 'none' }); body.appendChild(mk);
  const meltAt = () => { const v = getComputedStyle(body).getPropertyValue('--melt').trim(); if (!v) return null; mk.style.top = v; return mk.offsetTop; };
  window.__rec = []; window.__on = true; const t0 = performance.now();
  const loop = (t) => {
    const mc = new MessageChannel(); mc.port1.onmessage = () => {
      const br = body.getBoundingClientRect(), bar = document.querySelector('.coach-composer').getBoundingClientRect();
      const m = meltAt(); const melt = body.hasAttribute('data-scrollable') && m != null ? br.top + m : null;
      const said = [...body.querySelectorAll('.coach-thread [data-mid]')].map((m) => m.getBoundingClientRect().bottom).filter((y) => y < bar.top);
      window.__rec.push({ t: Math.round(t - t0), bar: Math.round(bar.top), melt: melt == null ? null : Math.round(melt), lastAbove: Math.round(Math.max(...said)), cs: (() => { const c = getComputedStyle(body); return ['--kb-now', '--sb-fade-b', '--melt'].map((k) => c.getPropertyValue(k)).join(' ') + ' room ' + document.querySelector('.coach-body').closest('.sheet')?.style.getPropertyValue('--kb-room') + ' st ' + Math.round(body.scrollTop) + '/' + (body.scrollHeight - body.clientHeight); })() });
    };
    mc.port2.postMessage(0);
    if (window.__on) requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
});
const stopProbe = () => p.evaluate(() => { window.__on = false; return window.__rec; });
function analyse(name, rec) {
  // the melt is meant to start just above the bar (its fade ends 22 px below the melt line): how far above the bar it sat
  const gap = rec.filter((f) => f.melt != null).map((f) => f.bar - f.melt);
  const worst = Math.max(...gap), rest = gap[gap.length - 1];
  console.log(`## ${name}: melt above the bar, worst ${worst} px (at rest ${rest} px)${worst - rest > 12 ? '  << messages hidden while the keyboard moved' : ''}`);
  if (process.env.DETAIL) for (const f of rec) console.log(`   ${f.t} bar ${f.bar} melt ${f.melt} gap ${f.melt == null ? '-' : f.bar - f.melt} ${f.cs}`);
  console.log('   bar :', rec.filter((_, i) => i % 3 === 0).map((f) => f.bar).join(' '));
  console.log('   gap :', rec.filter((_, i) => i % 3 === 0).map((f) => (f.melt == null ? '-' : f.bar - f.melt)).join(' '));
}
const act = async (name, fn, ms) => {
  await startProbe();
  if (process.argv.includes('--film')) await film(`melt-${theme}-${name}`, fn, ms, { every: 2, cols: 12 }); else { await fn(); await wait(p, ms); }
  analyse(name, await stopProbe());
};
await act('keyboard-up', () => field().tap(), 900);
await field().fill('Ok'); await wait(p, 300);
await act('send-ok', () => sheet().getByRole('button', { name: 'Send', exact: true }).tap(), 1500);
await wait(p, 2500);
await b.close();
