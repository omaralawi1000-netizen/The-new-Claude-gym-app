// node sheet.mjs <out.png> <w> <h> <t,t> move1 move2 ...  — a contact sheet: rows = moves, columns = times
import { chromium } from 'playwright'; import http from 'node:http'; import { readFileSync } from 'node:fs'; import { extname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
const [out, w, h, ts, ...moves] = process.argv.slice(2);
const root = new URL('.', import.meta.url).pathname;
const srv = http.createServer((q, r) => { try { const f = join(root, decodeURIComponent(q.url.split('?')[0])); r.writeHead(200, { 'content-type': extname(f) === '.js' ? 'text/javascript' : 'text/html' }); r.end(readFileSync(f)); } catch { r.writeHead(404); r.end(); } }).listen(0);
const b = await chromium.launch({ args: ['--enable-gpu', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
p.on('pageerror', (e) => console.log('ERR', e.message.slice(0, 400)));
await p.goto(`http://127.0.0.1:${srv.address().port}/render.html?w=${w}&h=${h}`);
await p.waitForFunction(() => document.title);
const files = [];
for (const m of moves) for (const t of ts.split(',')) {
  try { await p.evaluate(([m, t]) => window.draw(m, +t, false), [m, t]); } catch (e) { console.log(m, t, e.message.slice(0, 300)); continue; }
  const f = `out/sh-${m}-${t}.png`; await p.locator('canvas').screenshot({ path: f }); files.push(f);
}
await b.close(); srv.close();
const cols = ts.split(',').length, rows = Math.ceil(files.length / cols);
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...files.flatMap((f) => ['-i', f]), '-filter_complex', `xstack=inputs=${files.length}:layout=${files.map((_, i) => `${(i % cols) * +w}_${Math.floor(i / cols) * +h}`).join('|')}`, out]);
console.log('done', files.length);
