// A film of Orbit (sphereRender.ts, 26 Oct) in Omar's palette (Aurora): open the orb with a pull, the ring gathers in;
// you talk (a speech-like sound fed to the fake microphone: AVEN_MIC=<wav>), it thinks, it logs, it answers (AVEN_COACH=<raw
// 24 kHz 16-bit pcm>); then the orb is dragged and let go (the ring trails it), and swiped away.
// Run: AVEN_GPU=1 AVEN_MIC=… AVEN_COACH=… node scripts/film-orbit.mjs [light]
import { launch, wait, skipOnboarding, loadDemo, applySettings } from './lib.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const theme = process.argv[2] === 'light' ? 'light' : 'dark';
const coach = readFileSync(process.env.AVEN_COACH);
const { b, p, ctx } = await launch({ theme, args: process.env.AVEN_MIC ? [`--use-file-for-fake-audio-capture=${process.env.AVEN_MIC}`] : [] });
let sock = null;
await p.routeWebSocket(/BidiGenerateContent/, (ws) => {
  sock = ws;
  ws.onMessage((raw) => {
    const m = JSON.parse(String(raw));
    if (m.setup) ws.send(JSON.stringify({ setupComplete: {} }));
    if (m.toolResponse) setTimeout(() => {
      // its answer: the voice in 0.25 s pieces (as Gemini sends it), the words with it
      const words = 'Logged 200 g skyr. You have 48 g protein left today, so chicken and rice tonight gets you there.'.split(' ');
      const step = 12000; let i = 0;
      const tick = () => {
        if (i * step >= coach.length) { ws.send(JSON.stringify({ serverContent: { turnComplete: true, interactionStatus: 'IDLE' } })); return; }
        const part = coach.subarray(i * step, (i + 1) * step).toString('base64');
        const w = words.slice(Math.floor(i * words.length / (coach.length / step)), Math.floor((i + 1) * words.length / (coach.length / step))).join(' ');
        ws.send(JSON.stringify({ serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: part } }] }, ...(w ? { outputTranscription: { text: (i ? ' ' : '') + w } } : {}) } }));
        i++; setTimeout(tick, 230);
      };
      tick();
    }, 1700);
  });
});
// a sharp film: the browser's own screen capture at the phone's 2× pixels (the video recorder films at 1×), each frame
// with its time, put together at real speed afterwards
const OUT = process.env.AVEN_FILM_DIR || 'videos/orbit'; mkdirSync(OUT, { recursive: true });
const frames = []; let cdp = null, filming = false;
const film = async () => {
  cdp = await ctx.newCDPSession(p);
  cdp.on('Page.screencastFrame', async (f) => { frames.push({ t: f.metadata.timestamp, data: f.data }); try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch { /* closing */ } });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: 780, maxHeight: 1688, everyNthFrame: 1 }); filming = true;
};
await p.goto('http://127.0.0.1:5173/'); await wait(p, 900); await skipOnboarding(p); await loadDemo(p);
await p.evaluate(() => { localStorage.setItem('aven.keys', JSON.stringify({ gemini: 'AIzaTESTKEY' })); localStorage.setItem('aven.ai', JSON.stringify({ liveOrb: true })); });
await applySettings(p, { palette: 'aurora' }); await p.reload(); await wait(p, 2500);
const centre = async (l) => { const r = await l.boundingBox(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
const drag = async (c, dx, dy, n, hold = 0) => { await p.mouse.move(c.x, c.y); await p.mouse.down(); for (let i = 1; i <= n; i++) { await p.mouse.move(c.x + dx * i / n, c.y + dy * i / n); await wait(p, 16); } await wait(p, hold); await p.mouse.up(); };
await film();
const t0 = Date.now(); const mark = (s) => console.log(((Date.now() - t0) / 1000).toFixed(1), s);
mark('pull up');
await drag(await centre(p.getByRole('button', { name: 'Dictate' }).first()), 0, -140, 22); await wait(p, 2600);
mark('touch: tap the ring');
await p.locator('.voice-orb').click(); await wait(p, 1600);
mark('talking (mic)'); await wait(p, 5200);
sock?.send(JSON.stringify({ serverContent: { inputTranscription: { text: 'Log 200 grams of skyr, and what should I eat tonight?' } } }));
await wait(p, 400);
mark('thinking');
sock?.send(JSON.stringify({ toolCall: { functionCalls: [{ id: 'c1', name: 'aven', args: { actions: [{ type: 'log_food', foods: [{ name: 'skyr', amount: 200, unit: 'g' }] }] } }] } }));
await wait(p, 2000); mark('speaking'); await wait(p, 6500);
mark('drag');
await drag(await centre(p.locator('.voice-orb')), 70, 120, 24, 500); await wait(p, 2200);
mark('away');
await drag(await centre(p.locator('.voice-orb')), 0, 320, 18); await wait(p, 2000);
if (filming) await cdp.send('Page.stopScreencast');
await b.close();
// frames → a real-speed film (each shown until the next one came)
const list = [];
frames.forEach((f, i) => { const name = `${OUT}/f${String(i).padStart(5, '0')}.jpg`; writeFileSync(name, Buffer.from(f.data, 'base64')); const d = i + 1 < frames.length ? frames[i + 1].t - f.t : 0.04; list.push(`file '${resolve(name)}'`, `duration ${Math.max(0.004, d).toFixed(4)}`); });
writeFileSync(`${OUT}/list.txt`, list.join('\n') + '\n');
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', `${OUT}/list.txt`, '-vf', 'fps=60,format=yuv420p', '-c:v', 'libx264', '-crf', '20', `${OUT}/orbit-${theme}.mp4`]);
console.log('filmed', `${OUT}/orbit-${theme}.mp4`, frames.length, 'frames');
