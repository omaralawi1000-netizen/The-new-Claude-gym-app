// Films sending from an old chat (the suggestions under it) at real speed: every frame Chrome draws, kept at its real time,
// as an mp4. usage: OUT=file.mp4 URL=… MODE=tip|type SEED=4 node scripts/film-coach-send.mjs
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const { b, ctx, p } = await launch({ size: { width: 384, height: 832 }, dsf: 2, theme: 'dark' });
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
await p.goto(process.env.URL || 'http://127.0.0.1:5173/'); await wait(p, 1500);
await skipOnboarding(p); await loadDemo(p);
await p.evaluate((n) => { const old = Date.now() - 3 * 3600_000; localStorage.setItem('aven.keys', JSON.stringify({ gemini: 'AIzaTESTKEY' })); localStorage.setItem('aven.coachNote', '1');
  const pre = Array.from({ length: n }, (_, i) => [{ id: 'p' + i, role: 'user', text: 'Question ' + i + ' about my training and food today', at: old }, { id: 'q' + i, role: 'model', text: 'A longer answer about the training of the day, the food so far and what to eat tonight to close the protein gap.', at: old }]).flat();
  localStorage.setItem('aven.coach', JSON.stringify([...pre, { id: 's1', role: 'user', text: 'Yo', at: old }, { id: 's2', role: 'model', text: 'Yo! What\'s on your mind?', at: old }])); }, Number(process.env.SEED ?? 4));
await p.reload(); await wait(p, 2000);
await p.getByRole('button', { name: 'Coach', exact: true }).first().tap(); await wait(p, 1800);
const cdp = await ctx.newCDPSession(p);
const frames = [];
cdp.on('Page.screencastFrame', (f) => { frames.push({ t: f.metadata.timestamp, data: f.data }); cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}); });
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 85, everyNthFrame: 1 });
await wait(p, 500);
if ((process.env.MODE || 'tip') === 'tip') await p.locator('.coach-resume .tip').first().tap();
else { await p.getByLabel('Message the Coach').fill('How is my week going?'); await p.getByRole('dialog', { name: 'Coach' }).getByRole('button', { name: 'Send', exact: true }).tap(); }
await wait(p, Number(process.env.MS || 4200));
await cdp.send('Page.stopScreencast');
const dir = fs.mkdtempSync('/tmp/claude-0/film-'); let list = '';
frames.forEach((f, i) => { const fn = `${dir}/${String(i).padStart(4, '0')}.jpg`; fs.writeFileSync(fn, Buffer.from(f.data, 'base64')); const d = i + 1 < frames.length ? frames[i + 1].t - f.t : 0.1; list += `file '${fn}'\nduration ${Math.max(0.001, d).toFixed(4)}\n`; });
fs.writeFileSync(`${dir}/list.txt`, list);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', `${dir}/list.txt`, '-vf', 'fps=60,scale=768:-2,format=yuv420p', '-c:v', 'libx264', '-crf', '20', process.env.OUT || 'film.mp4']);
console.log('frames', frames.length, 'span', (frames.at(-1).t - frames[0].t).toFixed(2), 's ->', process.env.OUT);
fs.rmSync(dir, { recursive: true, force: true });
await b.close();
