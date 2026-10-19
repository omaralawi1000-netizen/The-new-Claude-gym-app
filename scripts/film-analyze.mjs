// Films the photo-analysis wait as Omar sees it: camera → shutter → hand-off → the wait → the result, at the app's 60 fps
// (film-steady.mjs), dark, in his palette. A fake Gemini answers after DELAY ms (the wait), so short and long waits can be filmed.
// usage: AVEN_PALETTE=golden AVEN_GPU=1 DELAY=1500 [SCAN=A|B|C] node scripts/film-analyze.mjs <A|B> [--light] [--frames N]  (A|B = how the camera turns into the result)
// → shots/film/analyze-<v>-<theme>-<DELAY>/*.jpg, shots/analyze-<v>-<theme>-<DELAY>.mp4, and prints the settle difference
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { steady } from './film-steady.mjs';
import { wait, skipOnboarding, loadDemo, applySettings } from './lib.mjs';
const v = process.argv[2] || 'A';
const theme = process.argv.includes('--light') ? 'light' : 'dark';
const delay = Number(process.env.DELAY || 2600);
const fi = process.argv.indexOf('--frames'); const frames = fi > 0 ? Number(process.argv[fi + 1]) : Math.round(((delay + 3200) / 1000) * 60);
const tag = `${v}-${theme}-${delay}${process.env.NOFOOD ? '-nofood' : ''}`;
const s = await steady({ theme, size: { width: 412, height: 892 } });
const p = s.p;
await s.ctx.addInitScript(([d, nf]) => {
  const real = window.fetch;
  window.fetch = async (url, init) => {
    const u = String(url);
    if (!u.includes('generativelanguage')) return real(url, init);
    if (u.includes('/models?')) return new Response(JSON.stringify({ models: [] }), { headers: { 'content-type': 'application/json' } });
    let txt = JSON.stringify({ items: [{ name: 'Grilled chicken', grams: 140, kcal: 231, protein: 43, carbs: 0, fat: 5 }, { name: 'Rice', grams: 150, kcal: 195, protein: 4, carbs: 42, fat: 0.5 }, { name: 'Greens', grams: 80, kcal: 30, protein: 2, carbs: 4, fat: 0.5 }], assumptions: 'Plate of about 370 g.' });
    if (nf) txt = '{"items":[],"notFood":true}'; // NOFOOD=1: the AI finds nothing, so the camera shows its empty state
    await new Promise((r) => { const t0 = performance.now(); const tick = () => (performance.now() - t0 >= d ? r() : requestAnimationFrame(tick)); tick(); }); // the wait follows the film's clock, not this machine's
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: txt }] } }] }), { headers: { 'content-type': 'application/json' } });
  };
}, [delay, !!process.env.NOFOOD]);
await p.goto(process.env.URL || 'http://127.0.0.1:4173/'); await wait(p, 1500);
await skipOnboarding(p); await loadDemo(p); await s.advance(120);
await applySettings(p, { scanLook: process.env.SCAN || 'C' }); // SCAN = the wave look (A|B|C); the first argument is only the film's name
await p.evaluate(() => { localStorage.setItem('aven.keys', JSON.stringify({ gemini: 'AIzaTESTKEY' })); });
await p.reload(); await wait(p, 1500); await s.advance(240);
const press = async (loc) => { const b = await loc.boundingBox(); await p.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); };
await p.getByLabel('Photo').first().waitFor({ state: 'visible', timeout: 20000 }); await s.advance(Number(process.env.SETTLE || 3000)); // Today must be fully up before the tap
await press(p.getByLabel('Photo').first()); await p.locator('.cam-shutter').waitFor({ state: 'visible', timeout: 20000 }); await s.advance(150);
await s.film(`analyze-${tag}`, () => press(p.locator('.cam-shutter')), frames);
await s.advance(120);
await s.film(`analyze-${tag}-settled`, async () => {}, 2);
await p.screenshot({ path: `shots/analyze-${tag}-rest.png` }); // the settled result as it rests: nothing shows behind or below the Log bar
await p.evaluate(() => { const b = document.querySelector('.sheet-body'); if (b) b.scrollTop = b.scrollHeight; }); await s.advance(60);
await p.screenshot({ path: `shots/analyze-${tag}-scrolled.png` }); // the list scrolled to its end: the last card clears the Log bar
await s.close();
const d = `shots/film/analyze-${tag}`;
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '60', '-i', `${d}/%03d.jpg`, '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p', '-c:v', 'libx264', '-crf', '16', '-x264-params', 'keyint=2000:min-keyint=2000', `shots/analyze-${tag}.mp4`]);
console.log(`→ shots/analyze-${tag}.mp4`);
