// Films the in-app camera pop-up at the app's own 60 fps (film-steady.mjs), from both entrances:
//   food:  Today → camera icon → live preview → shutter → hand-off (the photo is read) → closes
//   coach: Coach → camera icon → live preview → shutter → the photo lands in the Coach's bar
// usage: python3 scripts/fake-camera-plate.py; npx vite preview --port 4173 &; AVEN_PALETTE=golden node scripts/film-camera.mjs food|coach
// → shots/film/camera-<which>/*.jpg and shots/camera-<which>.mp4
import { execFileSync } from 'node:child_process';
import { steady } from './film-steady.mjs';
import { wait, skipOnboarding, loadDemo } from './lib.mjs';
const which = process.argv[2] || 'food';
const s = await steady({ theme: 'dark', size: { width: 412, height: 892 } });
const p = s.p;
if (process.env.FILMDEBUG) { p.on('console', (m) => console.log('console', m.type(), m.text().slice(0, 200))); p.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 200))); }
await s.ctx.addInitScript(() => {
  const real = window.fetch;
  window.fetch = async (url, init) => {
    const u = String(url);
    if (!u.includes('generativelanguage')) return real(url, init);
    if (u.includes('/models?')) return new Response(JSON.stringify({ models: [] }), { headers: { 'content-type': 'application/json' } });
    const txt = JSON.stringify({ items: [{ name: 'Grilled chicken', grams: 140, kcal: 231, protein: 43, carbs: 0, fat: 5 }, { name: 'Rice', grams: 150, kcal: 195, protein: 4, carbs: 42, fat: 0.5 }, { name: 'Greens', grams: 80, kcal: 30, protein: 2, carbs: 4, fat: 0.5 }], assumptions: 'Plate of about 370 g.' });
    await new Promise((r) => setTimeout(r, 1500));
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: txt }] } }] }), { headers: { 'content-type': 'application/json' } });
  };
});
await p.goto(process.env.URL || 'http://127.0.0.1:4173/'); await wait(p, 1500);
await skipOnboarding(p); await loadDemo(p); await s.advance(120);
await p.evaluate(() => { localStorage.setItem('aven.keys', JSON.stringify({ gemini: 'AIzaTESTKEY' })); localStorage.setItem('aven.coachNote', '1'); });
await p.reload(); await wait(p, 1500); await s.advance(240);
const press = async (loc) => { const b = await loc.boundingBox(); await p.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); };
await p.getByLabel('Photo').first().waitFor({ state: 'visible', timeout: 20000 }); await s.advance(180);
let opener;
if (which === 'coach') { await press(p.getByRole('button', { name: 'Coach', exact: true }).first()); await s.advance(150); opener = p.getByLabel('Send a photo'); }
else { await press(p.getByLabel('Photo').first()); await s.advance(150); opener = p.getByRole('button', { name: 'Camera', exact: true }); } // Today's camera icon opens the plate sheet; its Camera button opens the camera
await s.film(`camera-${which}-open`, () => press(opener), 90);
await s.advance(90); // the live picture settles in
await s.film(`camera-${which}-shot`, () => press(p.locator('.cam-shutter')), which === 'food' ? 150 : 120);
await s.advance(60);
await s.film(`camera-${which}-rest`, async () => {}, 12);
await s.close();
// one clip: the three films joined, real speed (60 fps)
const dirs = ['open', 'shot', 'rest'].map((k) => `shots/film/camera-${which}-${k}`);
const list = dirs.map((d) => `file '${process.cwd()}/${d}/%03d.jpg'`);
const inputs = dirs.flatMap((d) => ['-framerate', '60', '-i', `${d}/%03d.jpg`]);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', '[0:v][1:v][2:v]concat=n=3:v=1[v];[v]scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p[o]', '-map', '[o]', '-c:v', 'libx264', '-crf', '20', `shots/camera-${which}.mp4`]);
console.log(`→ shots/camera-${which}.mp4`);
