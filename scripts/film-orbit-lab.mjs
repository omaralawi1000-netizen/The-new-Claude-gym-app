// Films Orbit's lab (scripts/orbit-lab) at an exact 60 fps: every frame drawn on the timeline, then put together.
// Run: node scripts/film-orbit-lab.mjs <out.mp4> [theme=light] [palette=ember] [reduced=1]
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const out = process.argv[2] ?? 'videos/orbit-lab.mp4';
const q = process.argv.slice(3).join('&');
const dir = out.replace(/\.mp4$/, '-frames'); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
const b = await chromium.launch(); const p = await b.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto(`http://127.0.0.1:5173/scripts/orbit-lab/index.html?${q}`); await p.waitForFunction(() => (window).lab);
await p.evaluate(() => window.lab.load());
const n = await p.evaluate(() => window.lab.frames);
for (let i = 0; i < n; i++) {
  const d = await p.evaluate((i) => { window.lab.frame(i); return window.lab.png(); }, i);
  writeFileSync(`${dir}/${String(i).padStart(5, '0')}.jpg`, Buffer.from(d.split(',')[1], 'base64'));
}
await b.close();
execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', '60', '-i', `${dir}/%05d.jpg`, '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', out]);
console.log('filmed', out, n, 'frames');
