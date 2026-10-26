// Films one design of the orb lab (scripts/orb-lab) at an exact 60 fps: every frame drawn on the timeline, then put together.
// Run: node scripts/film-orb-lab.mjs <0…4> <out.mp4> [--stills=1.5,5,10]  (stills: only those moments, as one picture)
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const [o = '0', out = 'videos/orb-lab.mp4'] = process.argv.slice(2);
const stills = (process.argv.find((a) => a.startsWith('--stills=')) ?? '').slice(9).split(',').filter(Boolean).map(Number);
const dir = out.replace(/\.(mp4|png)$/, '-frames'); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
const b = await chromium.launch({ args: ['--enable-gpu', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
p.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text().slice(0, 600)); });
await p.goto(`http://127.0.0.1:5173/scripts/orb-lab/index.html?o=${o}`); await p.waitForFunction(() => (window).lab, null, { timeout: 30000 });
await p.evaluate(() => window.lab.load());
const n = await p.evaluate(() => window.lab.frames);
const want = new Set(stills.map((s) => Math.round(s * 60)));
const t0 = Date.now(); let k = 0;
for (let i = 0; i < n; i++) {
  if (stills.length && i > Math.max(...want)) break;
  const keep = !stills.length || want.has(i);
  const d = await p.evaluate(([i, keep]) => { window.lab.frame(i); return keep ? window.lab.png() : ''; }, [i, keep]);
  if (keep) writeFileSync(`${dir}/${String(k++).padStart(5, '0')}.jpg`, Buffer.from(d.split(',')[1], 'base64'));
}
await b.close();
if (stills.length) execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', `${dir}/%05d.jpg`, '-vf', `scale=300:-1,tile=${k}x1`, '-frames:v', '1', out]);
else execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', '60', '-i', `${dir}/%05d.jpg`, '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', out]);
console.log('done', out, k, 'frames', ((Date.now() - t0) / 1000).toFixed(0) + 's');
