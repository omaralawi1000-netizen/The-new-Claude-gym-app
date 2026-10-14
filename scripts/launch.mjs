// Cold launch: opens the app the way tapping its icon does (a fresh page, files from the service worker's copy, data
// already on the phone), times it and optionally films it. Run against a production build:
//   npx vite build && npx vite preview --port 4173 --host 127.0.0.1
//   node scripts/launch.mjs [--url=http://127.0.0.1:4173/] [--palette=aurora|ember] [--cpu=4] [--runs=5] [--film=out.mp4]
// Prints per run: first paint (the first thing drawn), app drawn (the Today screen and dock on screen), ready (the last
// long task of the start is over, so a tap is answered at once) and the JS the start had to run.
// --film: records the screen from the page's first frame (CDP screencast, every frame the compositor makes) and prefixes
// half a second of the Android launch screen (ink + the launch orb), which is what the phone shows before the page.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const URL = arg('url', 'http://127.0.0.1:4173/');
const palette = arg('palette', 'aurora');
const cpu = Number(arg('cpu', '1'));
const runs = Number(arg('runs', '1'));
const film = arg('film', '');
const size = { width: 412, height: 892 }; // the S26 Ultra's page size in CSS px
const SC = Number(arg('scale', '1')); // film resolution (1 = CSS px; the screencast keeps up better small)

const gpu = process.env.AVEN_GPU ? ['--enable-gpu', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [];
const b = await chromium.launch({ args: gpu });
const ctx = await b.newContext({ viewport: size, deviceScaleFactor: 2, colorScheme: 'dark', isMobile: true, hasTouch: true });

// the palette, written before the app reads its data on every opening (the app writes its data back as a page closes,
// so a change made from a page wouldn't stick)
await ctx.addInitScript((pal) => {
  try { const d = JSON.parse(localStorage.getItem('aven.v1') || 'null'); if (d?.settings) { d.settings.palette = pal; d.settings.theme = 'dark'; localStorage.setItem('aven.v1', JSON.stringify(d)); } } catch { /* first opening */ }
}, palette);
// set up once: onboarding skipped, demo data, the palette; the service worker installed (as on the phone)
{
  const p = await ctx.newPage();
  await p.goto(URL); await p.waitForTimeout(1200);
  await p.getByText('Skip all').click(); await p.waitForTimeout(600);
  await p.getByLabel('Settings').click(); await p.waitForTimeout(500);
  await p.getByText('Data & backup').click(); await p.waitForTimeout(400);
  await p.getByText('Load demo data').click(); await p.waitForTimeout(400);
  await p.keyboard.press('Escape'); await p.waitForTimeout(600);
  await p.evaluate(async () => { await navigator.serviceWorker?.ready; });
  await p.close();
}

const results = [];
for (let i = 0; i < runs; i++) {
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  await cdp.send('Performance.enable');
  await p.addInitScript(() => {
    const w = window;
    w.__l = { long: [], drawn: 0, settled: 0 };
    // the launch screen (if the build has one) has handed over to the app: the moment the app is fully on screen
    const gone = () => { if (document.readyState !== 'loading' && !document.getElementById('launch')) w.__l.settled = performance.now(); else requestAnimationFrame(gone); };
    requestAnimationFrame(gone);
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__l.long.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true }); } catch { /* */ }
    const look = () => { if (document.querySelector('.tabbar') && document.querySelector('.screen')) requestAnimationFrame(() => { w.__l.drawn = performance.now(); }); else requestAnimationFrame(look); };
    requestAnimationFrame(look);
  });
  const frames = [];
  if (film && i === 0) {
    cdp.on('Page.screencastFrame', (f) => { frames.push({ t: f.metadata.timestamp, data: f.data }); cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}); });
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, everyNthFrame: 1, maxWidth: size.width * SC, maxHeight: size.height * SC });
  }
  const t0 = Date.now();
  await p.goto(URL, { waitUntil: 'commit' });
  await p.waitForTimeout(film && i === 0 ? 4500 : 4000);
  if (film && i === 0) await cdp.send('Page.stopScreencast');
  const r = await p.evaluate(() => {
    const paint = Object.fromEntries(performance.getEntriesByType('paint').map((e) => [e.name, e.startTime]));
    const long = window.__l.long;
    // ready: the end of the last long task that starts before the first 1.5 s with no long task at all
    let ready = window.__l.drawn;
    for (const [s, d] of long.sort((a, b) => a[0] - b[0])) { if (s - ready > 1500) break; ready = Math.max(ready, s + d); }
    const js = performance.getEntriesByType('resource').filter((e) => e.name.endsWith('.js')).map((e) => ({ n: e.name.split('/').pop(), kb: Math.round((e.decodedBodySize || 0) / 1024) }));
    const mk = Object.fromEntries(performance.getEntriesByType('mark').filter((m) => m.name.startsWith('aven:')).map((m) => [m.name.slice(5), Math.round(m.startTime)]));
    const fonts = performance.getEntriesByType('resource').filter((e) => e.name.endsWith('.woff2')).map((e) => Math.round(e.responseEnd));
    const main = performance.getEntriesByType('resource').find((e) => /\/index-[^/]*\.js$/.test(e.name));
    mk.mainJs = main ? Math.round(main.responseEnd) : null; mk.fontsDone = fonts.length ? Math.max(...fonts) : null;
    return { mk, fp: paint['first-paint'] ?? null, fcp: paint['first-contentful-paint'] ?? null, drawn: window.__l.drawn, settled: Math.max(window.__l.settled, window.__l.drawn), ready, longTasks: long.length, longMs: Math.round(long.reduce((s, x) => s + x[1], 0)), js };
  });
  const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
  r.script = Math.round(m.ScriptDuration * 1000);
  results.push(r);
  console.log(`run ${i + 1}: first paint ${Math.round(r.fp)} ms · first content ${Math.round(r.fcp)} ms · app drawn ${Math.round(r.drawn)} ms · launch done ${Math.round(r.settled)} ms · ready ${Math.round(r.ready)} ms · long tasks ${r.longTasks} (${r.longMs} ms) · script ${r.script} ms`);
  console.log('  marks:', JSON.stringify(r.mk));
  if (i === 0) console.log('  js at start:', r.js.map((j) => `${j.n} ${j.kb} KB`).join(', '));
  if (film && i === 0) await writeFilm(frames, film);
  await p.close();
  void t0;
}
const med = (k) => { const v = results.map((r) => r[k]).sort((a, b) => a - b); return Math.round(v[Math.floor(v.length / 2)]); };
console.log(`median (${runs} runs, CPU ${cpu}x): first paint ${med('fp')} ms · first content ${med('fcp')} ms · app drawn ${med('drawn')} ms · launch done ${med('settled')} ms · ready ${med('ready')} ms · script ${med('script')} ms`);
await b.close();

/** frames (with their compositor timestamps) → a 60 fps mp4, after half a second of the Android launch screen */
async function writeFilm(frames, out) {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'launch-'));
  // the Android launch screen: ink with the 100 dp launch orb in the middle (android/.../splash_icon.png)
  const splash = path.join(dir, 'splash.jpg');
  const orb = path.resolve('android/app/src/main/res/drawable-xxxhdpi/splash.png');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `color=c=0x05060b:s=${size.width * SC}x${size.height * SC}`, '-i', orb,
    '-filter_complex', `[1]scale=${120 * SC}:${120 * SC}[o];[0][o]overlay=(W-w)/2:(H-h)/2`, '-frames:v', '1', '-q:v', '2', splash]);
  const list = [`file '${splash}'`, 'duration 0.5'];
  frames.forEach((f, i) => {
    const fp = path.join(dir, `f${String(i).padStart(5, '0')}.jpg`);
    fs.writeFileSync(fp, Buffer.from(f.data, 'base64'));
    const next = frames[i + 1]?.t ?? f.t + 0.5;
    list.push(`file '${fp}'`, `duration ${Math.max(0.001, next - f.t).toFixed(4)}`);
  });
  list.push(`file '${path.join(dir, `f${String(frames.length - 1).padStart(5, '0')}.jpg`)}'`);
  fs.writeFileSync(path.join(dir, 'list.txt'), list.join('\n'));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.txt'),
    '-vf', `scale=${size.width * SC}:${size.height * SC},fps=60,format=yuv420p`, '-c:v', 'libx264', '-crf', '20', out]);
  console.log(`  film: ${out} (${frames.length} frames captured)`);
}
