// A clip of the Coach as Omar uses it: a chat with history, type a message (the keyboard comes up), send it (it flies, the
// keyboard goes down), the dots, then a long answer streaming in (in uneven clumps, as Gemini sends it). Real speed, or at
// half speed (--half: the whole page runs at half speed, page clock and animations, so the clip is twice as smooth).
// usage: node scripts/clip-coach.mjs <out.mp4> [--palette ember|aurora] [--light] [--half]   (URL defaults to 4173)
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const out = process.argv[2] || 'shots/coach-clip.mp4';
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const palette = arg('--palette') || 'ember';
const theme = process.argv.includes('--light') ? 'light' : 'dark';
const half = process.argv.includes('--half');
const W = 412, H = 892;
const { b, ctx, p } = await launch({ theme, size: { width: W, height: H } });
const answer = "Not surprising. You took your chest and biceps sets to failure for over two hours, plus you wrestled yesterday and have cardio built in. Get some solid food in, around 40 g of protein with rice or potatoes, and aim for bed before eleven.\n\nTomorrow is a wrestling day, so keep tonight easy:\n- a warm shower and ten minutes of light stretching\n- water with a pinch of salt\n- no screens in bed\n\nYou have earned the rest. Sleep is where today's work turns into strength.";
await ctx.addInitScript(([answer, half]) => {
  if (half) {
    // the page's clock runs at half speed: springs, the word pace and anything timed by frames (CSS and Web Animations are
    // slowed by the DevTools protocol below, the same factor)
    const pn = performance.now.bind(performance), t0 = pn(), k = 0.5;
    performance.now = () => t0 + (pn() - t0) * k;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => cb(t0 + (t - t0) * k));
    const st = window.setTimeout.bind(window); window.setTimeout = (f, ms, ...a) => st(f, (ms || 0) / k, ...a);
  }
  const l = {}; const vk = { overlaysContent: false, boundingRect: { height: 0 }, addEventListener: (t, f) => { (l[t] ||= []).push(f); }, removeEventListener: () => {} };
  Object.defineProperty(navigator, 'virtualKeyboard', { value: vk });
  // Chrome on Android tells the keyboard's final height once, as it starts to move
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
    const txt = JSON.stringify({ reply: answer, actions: [] }); const enc = new TextEncoder();
    // uneven clumps, the way the stream really lands
    const cuts = [0]; let at = 0; const sizes = [24, 90, 40, 160, 30, 120, 70, 200, 60, 400];
    for (const n of sizes) { at = Math.min(txt.length, at + n); cuts.push(at); if (at >= txt.length) break; }
    if (cuts[cuts.length - 1] < txt.length) cuts.push(txt.length);
    return new Response(new ReadableStream({ async start(c) {
      await new Promise((r) => setTimeout(r, 1200));
      for (let i = 1; i < cuts.length; i++) { c.enqueue(enc.encode(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: txt.slice(cuts[i - 1], cuts[i]) }] } }] })}\n\n`)); await new Promise((r) => setTimeout(r, 260 + (i % 3) * 140)); }
      c.close();
    } }), { headers: { 'content-type': 'text/event-stream' } });
  };
}, [answer, half]);
await p.goto(process.env.URL || 'http://127.0.0.1:4173/'); await wait(p, 1500);
await skipOnboarding(p); await loadDemo(p); await wait(p, 800);
const hist = [['user', 'Yo'], ["model", "Yo Omar, I'm here. What's on your mind?"], ['user', "Yo, what's going on? How's it going?"],
  ['model', 'All good, Omar. You crushed your **Chest & Biceps** session earlier with 4 PRs. Sitting at 1,505 kcal and 136 g of protein logged so far, with wrestling planned for tomorrow. How are you feeling tonight?'],
  ['user', 'Yo'], ['model', "Yo Omar, I'm here. What's up?"]].map(([role, text], i) => ({ id: 'seed' + i, role, text, at: Date.now() - 60000 }));
await p.evaluate(([hist, palette]) => {
  localStorage.setItem('aven.keys', JSON.stringify({ gemini: 'AIzaTESTKEY' })); localStorage.setItem('aven.coach', JSON.stringify(hist)); localStorage.setItem('aven.coachNote', '1');
  window.__palette = palette;
}, [hist, palette]);
await p.reload(); await wait(p, 2000);
await p.evaluate((pal) => { document.documentElement.dataset.palette = pal; }, palette);
const cdp = await ctx.newCDPSession(p);
if (half) { await cdp.send('Animation.enable'); await cdp.send('Animation.setPlaybackRate', { playbackRate: 0.5 }); }
await p.getByRole('button', { name: 'Coach', exact: true }).first().tap(); await wait(p, half ? 4000 : 2200);
const field = p.getByLabel('Message the Coach');

// film: Chrome's screencast, every frame it draws, with its own timestamps
const dir = `${out}.frames`; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
const frames = [];
cdp.on('Page.screencastFrame', (f) => { frames.push({ data: f.data, t: f.metadata.timestamp }); cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}); });
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: W * 2, maxHeight: H * 2, everyNthFrame: 1 });
const k = half ? 2 : 1;
await wait(p, 400 * k);
await field.tap(); await wait(p, 700 * k);
await field.pressSequentially("Oh my God, I'm so tired right now.", { delay: 45 * k }); await wait(p, 350 * k);
await p.getByRole('dialog', { name: 'Coach' }).getByRole('button', { name: 'Send', exact: true }).tap();
await wait(p, 9500 * k);
await cdp.send('Page.stopScreencast');
await b.close();
// to a video at the frames' own timing (a frame lasts until the next one); --half: played back at real time it is half speed
const list = frames.map((f, i) => { const file = `${dir}/${String(i).padStart(4, '0')}.jpg`; fs.writeFileSync(file, Buffer.from(f.data, 'base64')); return { file, d: i + 1 < frames.length ? frames[i + 1].t - f.t : 0.05 }; });
fs.writeFileSync(`${dir}/list.txt`, list.map((x) => `file '${x.file.split('/').pop()}'\nduration ${x.d.toFixed(4)}`).join('\n') + `\nfile '${list[list.length - 1].file.split('/').pop()}'\n`);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', `${dir}/list.txt`, '-vf', 'fps=60,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p', '-c:v', 'libx264', '-crf', '20', out]);
const span = frames[frames.length - 1].t - frames[0].t;
console.log(`clip ${out}: ${frames.length} frames over ${span.toFixed(1)} s (${(frames.length / span).toFixed(0)} fps captured${half ? ', half speed: ' + (2 * frames.length / span).toFixed(0) + ' fps of real motion' : ''})`);
