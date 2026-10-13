// Stills of the Coach and the orb screen where a hard clip or mask edge could show (list top under the header, list
// bottom over the typing bar, keyboard up, mid-scroll, the orb screen's answer), for the cut-off sweep. AVEN_GPU=1 for blur.
// usage: AVEN_GPU=1 node scripts/shots-cutout.mjs [--light] [out-dir]
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import fs from 'node:fs';
const theme = process.argv.includes('--light') ? 'light' : 'dark';
const out = process.argv.filter((a) => !a.startsWith('--'))[2] || 'shots/cutout'; fs.mkdirSync(out, { recursive: true });
// (PHONE=1: Omar's phone, 412 x 892 at 3.5x)
const { b, ctx, p } = await launch({ theme, size: process.env.PHONE ? { width: 412, height: 892 } : { width: 384, height: 832 }, dsf: process.env.PHONE ? 3.5 : 2 });
const reply = 'Here is the plan.\n\n- **Protein**: about 40 g more today, so a solid dinner closes it.\n- **Sleep**: aim for 8 hours; you averaged 6.5 this week.\n- **Training**: Chest and Biceps today, keep the last set of each one rep short of failure.\n\nThat should leave you fresh for wrestling on Thursday.';
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
    const txt = JSON.stringify({ reply, actions: [] }); const enc = new TextEncoder();
    return new Response(new ReadableStream({ async start(c) { await new Promise((r) => setTimeout(r, 600)); for (let i = 0; i < txt.length; i += 40) { c.enqueue(enc.encode(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: txt.slice(i, i + 40) }] } }] })}\n\n`)); await new Promise((r) => setTimeout(r, 120)); } c.close(); } }), { headers: { 'content-type': 'text/event-stream' } });
  };
}, [reply]);
if (process.env.CSS) await ctx.addInitScript((css) => { document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); }); }, process.env.CSS); // (CSS=…: try a look)
await p.goto(process.env.URL || 'http://127.0.0.1:4173/'); await wait(p, 1500);
await skipOnboarding(p); await loadDemo(p); await wait(p, 800);
const long = 'At 18, 175 cm and hovering around 97.6 kg, you carry serious density and move real weight, putting up 100 kg on bench.\n\nWhat separates your routine from standard bodybuilding is the engine behind it: hard daily cardio and wrestling.';
const older = Array.from({ length: 5 }, (_, i) => [['user', `Question ${i + 1}: give me something about myself.`], ['model', long]]).flat().map(([role, text], i) => ({ id: 'seed' + i, role, text, at: Date.now() - 60000 }));
await p.evaluate((older) => { localStorage.setItem('aven.keys', JSON.stringify({ gemini: 'AIzaTESTKEY' })); localStorage.setItem('aven.coach', JSON.stringify(older)); localStorage.setItem('aven.coachNote', '1'); }, older);
await p.reload(); await wait(p, 2200);
if (process.env.PALETTE) await p.evaluate((pal) => { document.documentElement.dataset.palette = pal; }, process.env.PALETTE); // (PALETTE=aurora…)
const shot = (n) => p.screenshot({ path: `${out}/${theme}${process.env.PALETTE ? '-' + process.env.PALETTE : ''}-${n}.png` });
const sheet = () => p.getByRole('dialog', { name: 'Coach' });
await p.getByRole('button', { name: 'Coach', exact: true }).first().tap(); await wait(p, 2500);
await shot('1-coach-end');
await p.evaluate(() => { const el = document.querySelector('.coach-body'); el.scrollTop = el.scrollTop - 230; }); await wait(p, 700); await shot('2-coach-mid');
await p.evaluate(() => { const el = document.querySelector('.coach-body'); el.scrollTop = 0; }); await wait(p, 700); await shot('3-coach-top');
await p.evaluate(() => { const el = document.querySelector('.coach-body'); el.scrollTop = el.scrollHeight; }); await wait(p, 700);
await p.getByLabel('Message the Coach').tap(); await wait(p, 900); await shot('4-coach-kb');
if (process.env.QUICK) { await b.close(); console.log('shots in', out); process.exit(0); } // (QUICK=1: the Coach only)
await p.evaluate(() => { const el = document.querySelector('.coach-body'); el.scrollTop -= 260; }); await wait(p, 700); await shot('4b-coach-kb-mid');
await p.evaluate(() => { const el = document.querySelector('.coach-body'); el.scrollTop = el.scrollHeight; }); await wait(p, 500);
await p.getByLabel('Message the Coach').fill('Plan my day'); await sheet().getByRole('button', { name: 'Send', exact: true }).tap();
await wait(p, 1900); await shot('5-coach-streaming'); await wait(p, 4000); await shot('6-coach-answered');
await sheet().getByRole('button', { name: 'New chat' }).tap(); await wait(p, 1500); await shot('7-coach-new');
await sheet().getByRole('button', { name: 'Close' }).last().tap(); await wait(p, 1500);
await p.locator('.tabbar').getByRole('button').nth(2).tap(); await wait(p, 1800); await shot('8-orb-open');
const box = p.getByLabel('Type what you ate or did'); if (!(await box.isVisible().catch(() => false))) await p.getByRole('button', { name: 'Type instead' }).tap();
await wait(p, 900); await shot('9-orb-typing');
await box.fill('Plan my day please'); await p.getByRole('dialog', { name: 'Dictation' }).getByRole('button', { name: 'Send', exact: true }).tap();
await wait(p, 2500); await shot('10-orb-streaming'); await wait(p, 5000); await shot('11-orb-answer');
await b.close();
console.log('shots in', out);
