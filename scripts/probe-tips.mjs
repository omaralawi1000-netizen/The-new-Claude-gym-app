// Probe: sending from a resumed chat (suggestions under it). Logs, per frame, where the suggestions' head and the last
// seeded message sit on screen; a move of > 6 px in one frame is a jump. usage: node scripts/probe-tips.mjs
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
const { b, ctx, p } = await launch({ size: { width: 384, height: 832 } });
await ctx.addInitScript(() => {
  const real = window.fetch;
  window.fetch = async (url, init) => {
    const u = String(url);
    if (!u.includes('generativelanguage')) return real(url, init);
    if (u.includes('/models?')) return new Response(JSON.stringify({ models: [] }), { headers: { 'content-type': 'application/json' } });
    const txt = JSON.stringify({ reply: 'Pull is logged and done: 14 working sets across back and curls, with solid top sets including 85 kg on T-bar row.\n\nFood sits at only 505 kcal so far. If you haven\'t eaten dinner, you\'ll want something heavy on chicken.', actions: [] });
    const enc = new TextEncoder();
    const stream = new ReadableStream({ async start(c) { await new Promise((r) => setTimeout(r, 900)); for (let i = 0; i < txt.length; i += 70) { c.enqueue(enc.encode(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: txt.slice(i, i + 70) }] } }] })}\n\n`)); await new Promise((r) => setTimeout(r, 300)); } c.close(); } });
    return new Response(stream, { headers: { 'content-type': 'text/event-stream' } });
  };
});
p.on('console', (m) => { if (m.text().startsWith('ANIM')) console.log(m.text()); });
await p.goto(process.env.URL || 'http://127.0.0.1:5173/'); await wait(p, 1500);
await skipOnboarding(p); await loadDemo(p);
const old = 0;
await p.evaluate((o) => { const old = Date.now() - 3 * 3600_000; localStorage.setItem('aven.keys', JSON.stringify({ gemini: 'AIzaTESTKEY' })); localStorage.setItem('aven.coachNote', '1');
  const n = o; const pre = Array.from({ length: n }, (_, i) => [{ id: 'p' + i, role: 'user', text: 'Question ' + i + ' about my training and food today', at: old }, { id: 'q' + i, role: 'model', text: 'A longer answer about the training of the day, the food so far and what to eat tonight to close the protein gap.', at: old }]).flat();
  localStorage.setItem('aven.coach', JSON.stringify([...pre, { id: 's1', role: 'user', text: 'Yo', at: old }, { id: 's2', role: 'model', text: 'Yo! What\'s on your mind?', at: old }])); }, Number(process.env.SEED || 0));
await p.reload(); await wait(p, 2000);
await p.getByRole('button', { name: 'Coach', exact: true }).first().tap(); await wait(p, 1500);
const mode = process.env.MODE || 'tip';
await p.evaluate((ms) => { document.documentElement.dataset.ms = ms; }, String(process.env.MS || 2500));
await p.evaluate(() => {
  const A = Element.prototype.animate; Element.prototype.animate = function (k, o) { if (this.classList?.contains('coach-thread')) console.log('ANIM', performance.now()|0, JSON.stringify(k).slice(0, 120)); return A.call(this, k, o); };
  const ro = document.querySelector('.coach-body'); new MutationObserver(() => {}).observe(ro, {childList: true});
  window.__ms = Number(document.documentElement.dataset.ms || 2500); window.__log = []; const t0 = performance.now();
  const loop = () => {
    const q = (s) => { const e = [...document.querySelectorAll(s)].pop(); return e ? Math.round(e.getBoundingClientRect().top * 10) / 10 : null; };
    const micro = [...document.querySelectorAll('.coach-resume .micro')].pop();
    window.__log.push({ t: Math.round(performance.now() - t0), fly: (() => { const f = document.querySelector('.fly-tone'); if (!f) return null; const r = [...f.children].reduce((a, c) => { const b = c.getBoundingClientRect(); return [Math.min(a[0], b.top), Math.max(a[1], b.bottom)]; }, [1e9, -1e9]); return Math.round((r[0] + r[1]) / 2); })(), head: micro ? Math.round(micro.getBoundingClientRect().top) : null, yo: q('[data-mid="s2"]'), scroll: Math.round(document.querySelector('.coach-body').scrollTop), sh: document.querySelector('.coach-body').scrollHeight, fl: !!document.querySelector('.coach-tips-float'), rows: document.querySelector('.coach-thread').children.length, th: Math.round(document.querySelector('.coach-thread').offsetHeight), tr: getComputedStyle(document.querySelector('.coach-thread')).translate, tf: getComputedStyle(document.querySelector('.coach-thread')).transform.slice(0,40) });
    if (performance.now() - t0 < (window.__ms || 2500)) requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
});
if (mode === 'tip') await p.locator('.coach-resume .tip').first().tap();
else { await p.getByLabel('Message the Coach').fill('How is my week going?'); await p.getByRole('dialog', { name: 'Coach' }).getByRole('button', { name: 'Send', exact: true }).tap(); }
await wait(p, Number(process.env.MS || 2500) + 200);
const log = await p.evaluate(() => window.__log);
let prev = null;
for (const r of log) { if (prev) { const dy = r.yo != null && prev.yo != null ? r.yo - prev.yo : 0; const dh = r.head != null && prev.head != null ? r.head - prev.head : 0; if (Math.abs(dy) > 6 || Math.abs(dh) > 6) console.log('JUMP', JSON.stringify(r), 'dyo', dy.toFixed(1), 'dhead', dh); } prev = r; }
if (process.env.EVERY) log.forEach((r, i) => { if (i % Number(process.env.EVERY) === 0) console.log(r.t, 'fly', r.fly, 'yo', r.yo, 'scroll', r.scroll, 'sh', r.sh, 'th', r.th, r.tf); });
console.log('first', JSON.stringify(log[0]), 'last', JSON.stringify(log.at(-1)), 'frames', log.length);
await b.close();
