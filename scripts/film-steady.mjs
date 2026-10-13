// A steady camera for films of motion. Chrome draws a frame only when asked (begin-frame control), each one exactly 1/60 s
// of the app's time later than the last — its scripts' clock, its springs and the browser's own animations alike — and
// takes a picture of it once it is completely drawn. So however slow this machine is at drawing the frosted glass, a film
// shows the motion as designed, frame by frame: a jump in a film is a jump in the app, not a frame this machine dropped.
// (It shows nothing about the phone's speed: the time a frame takes to build doesn't count here.)
//   const s = await steady({ theme: 'light' }); … await s.film('name', () => tap(), 60); await s.close();
//   await s.advance(30): half a second of the app's time passes, unfilmed
// → shots/film/<name>/000.jpg… (one per 1/60 s), times.json, bar.json (the theme-color at each frame, for the status bar)
import fs from 'node:fs';
import { launch } from './lib.mjs';
// dsf: pixels per CSS px (default 3.5, the phone's). at 1 the browser rounds what moves inside a scrolled list to whole CSS px (it
// snaps to device pixels), which turns the last, slow pixels of every glide into 1 px ticks the phone doesn't have.
// The scanner's camera shows shots/fake-camera.y4m (python3 scripts/fake-camera.py) when it is there.
export async function steady({ theme = 'light', size = { width: 384, height: 802 }, dsf = Number(process.env.FILM_DSF || 3.5) } = {}) {
  const cam = fs.existsSync('shots/fake-camera.y4m') ? ['--use-file-for-fake-video-capture=shots/fake-camera.y4m'] : [];
  const { b, ctx, p, errors } = await launch({ theme, size, dsf, args: ['--deterministic-mode', '--enable-begin-frame-control', '--run-all-compositor-stages-before-draw', `--force-device-scale-factor=${dsf}`, ...cam] });
  await ctx.grantPermissions(['camera', 'microphone']);
  // the page's clock is the frame's time: scripts asking for the time between frames get the time of the frame
  await ctx.addInitScript(() => {
    const pn = performance.now.bind(performance); let last = -1;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => { if (t > last) last = t; cb(t); });
    const tick = () => raf((t) => { if (t > last) last = t; tick(); }); tick();
    performance.now = () => (last >= 0 ? last : pn());
    // and the date too (the workout timer): one frame of film is 1/60 s on the clock, not the second this machine took
    const RealDate = Date; let d0 = 0, f0 = -1;
    const now = () => { if (last < 0) return RealDate.now(); if (f0 < 0) { f0 = last; d0 = RealDate.now(); } return d0 + (last - f0); };
    // eslint-disable-next-line no-global-assign
    Date = class extends RealDate { constructor(...a) { if (a.length) super(...a); else super(now()); } static now() { return now(); } };
  });
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('HeadlessExperimental.enable');
  const STEP = 1000 / 60;
  let tick = Number(process.hrtime.bigint() / 1000000n);
  let q = Promise.resolve();
  const frame = (shot, dt = STEP) => (q = q.then(() => cdp.send('HeadlessExperimental.beginFrame', { frameTimeTicks: (tick += dt), interval: STEP, ...(shot ? { screenshot: { format: 'jpeg', quality: 85 } } : {}) })).catch(() => ({})));
  // between films the page still needs frames (loading, Playwright's own checks)
  let alive = true, pumping = true;
  (async () => { while (alive) { if (pumping) await frame(false); await new Promise((r) => setTimeout(r, 4)); } })();
  const bar = () => p.evaluate(() => document.querySelector('meta[name="theme-color"]')?.getAttribute('content') || '#000').catch(() => '#000');
  async function film(name, fn, frames = 60) {
    pumping = false; await q;
    const dir = `shots/film/${name}`; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    const act = Promise.resolve().then(fn); const times = [], bars = [], log = [], skips = [];
    for (let i = 0; i < frames; i++) {
      let r = await frame(true), tries = 0;
      while (!r.screenshotData && tries++ < 8) r = await frame(true, 0.01); // a frame that drew nothing: ask again, at (almost) the same time
      // FRAMELOG='.sheet, .wk-card': where each of those is at this frame (top edge in px, scale, browser-run animations on it), read from the page itself
      if (process.env.FRAMELOG) log.push(await p.evaluate((sel) => [...document.querySelectorAll(sel)].map((e) => { const r = e.getBoundingClientRect(); return [e.className.split(' ')[0] + (e.getAttribute('aria-label') ? ':' + e.getAttribute('aria-label') : ''), Math.round(r.top * 10) / 10, Math.round((r.width / e.offsetWidth) * 1000) / 1000, e.getAnimations().length]; }), process.env.FRAMELOG).catch(() => null));
      skips.push(tries);
      const out = `${dir}/${String(times.length).padStart(3, '0')}.jpg`;
      if (r.screenshotData) fs.writeFileSync(out, Buffer.from(r.screenshotData, 'base64'));
      else if (times.length) fs.copyFileSync(`${dir}/${String(times.length - 1).padStart(3, '0')}.jpg`, out); // nothing changed
      else continue;
      const t = times.length * STEP / 1000; times.push(t); bars.push([t, await bar()]);
    }
    await act.catch((e) => console.log(name, 'action failed:', String(e.message).slice(0, 160)));
    fs.writeFileSync(`${dir}/times.json`, JSON.stringify(times)); if (log.length) fs.writeFileSync(`${dir}/log.json`, JSON.stringify(log)); fs.writeFileSync(`${dir}/skips.json`, JSON.stringify(skips)); fs.writeFileSync(`${dir}/bar.json`, JSON.stringify(bars));
    pumping = true;
    console.log(`film ${name}: ${times.length} frames`);
  }
  /** Let exactly n frames of the app's time pass, unfilmed (so whatever was moving has landed before the next film). */
  async function advance(n) { pumping = false; await q; for (let i = 0; i < n; i++) await frame(false); pumping = true; }
  return { b, ctx, p, errors, film, advance, close: async () => { alive = false; await q; await b.close(); } };
}
