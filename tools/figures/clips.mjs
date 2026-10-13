// node clips.mjs <outDir> move1 move2 ...  — renders each move's rep as a see-through WebM (VP9 + alpha), 2.8 s at 30 fps.
// The pose depends only on how far into the rep it is, so each distinct pose is rendered once and reused for its frames.
import { chromium } from 'playwright'; import http from 'node:http'; import { readFileSync, mkdirSync, rmSync, copyFileSync, statSync, existsSync } from 'node:fs';
import { extname, join } from 'node:path'; import { execFileSync } from 'node:child_process';
import { rep } from './rig.js';
const [outDir, ...moves] = process.argv.slice(2);
const RW = 1260, RH = 840, OW = 840, OH = 560, FRAMES = 84, FPS = 30;
const root = new URL('.', import.meta.url).pathname;
const srv = http.createServer((q, r) => { try { const f = join(root, decodeURIComponent(q.url.split('?')[0])); r.writeHead(200, { 'content-type': extname(f) === '.js' ? 'text/javascript' : 'text/html' }); r.end(readFileSync(f)); } catch { r.writeHead(404); r.end(); } }).listen(0);
const b = await chromium.launch({ args: ['--enable-gpu', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: RW, height: RH } });
await p.goto(`http://127.0.0.1:${srv.address().port}/render.html?w=${RW}&h=${RH}`); await p.waitForFunction(() => document.title);
mkdirSync(outDir, { recursive: true });
for (const m of moves) {
  const t0 = Date.now(), tmp = join(root, 'out', 'clip-' + m); rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  const samples = [], map = [];
  for (let f = 0; f < FRAMES; f++) { const t = f / FRAMES, c = rep(t); let i = samples.findIndex((s) => Math.abs(s.c - c) < 0.005); if (i < 0) { samples.push({ c, t }); i = samples.length - 1; } map.push(i); }
  for (let i = 0; i < samples.length; i++) {
    await p.evaluate(([m, t]) => window.draw(m, t, true), [m, samples[i].t]);
    await p.locator('canvas').screenshot({ path: join(tmp, `s${i}.png`), omitBackground: true });
  }
  map.forEach((i, f) => copyFileSync(join(tmp, `s${i}.png`), join(tmp, `f${String(f).padStart(3, '0')}.png`)));
  const out = join(outDir, `${m}.webm`);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', join(tmp, 'f%03d.png'), '-vf', `scale=${OW}:${OH}:flags=lanczos,format=yuva420p`,
    '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', process.env.CRF ?? '46', '-deadline', 'good', '-cpu-used', '2', '-row-mt', '1', '-auto-alt-ref', '0', '-g', String(FRAMES), '-an', out]);
  console.log(m, samples.length, 'poses', Math.round((Date.now() - t0) / 1000), 's', Math.round(statSync(out).size / 1024), 'KB');
}
await b.close(); srv.close();
