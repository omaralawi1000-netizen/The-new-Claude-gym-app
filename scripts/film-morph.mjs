// The live workout growing out of Today's card and the resume bar, and back, with the steady camera (film-steady.mjs), in
// Omar's teal (aurora) palette at 120 frames a second (a half-speed film is the same frames played at 60).
// usage: AVEN_GPU=1 TAG=after [URL=…] [PAL=sunset] node scripts/film-morph.mjs [moments…] → shots/film/<TAG>-<moment>/
//   moments: open tick minimise resume pill-min pill-resume (default: all)
import { wait, skipOnboarding } from './lib.mjs';
import { steady } from './film-steady.mjs';
const tag = process.env.TAG || 'morph';
const want = process.argv.slice(2);
const s = await steady({ theme: process.argv.includes('--light') ? 'light' : 'dark', fps: 120, size: { width: 384, height: 832 }, dsf: 3.75 });
const { p } = s;
// (the launch plays out first, in the film's own time: on a slow emulated GPU too few frames passed in real seconds)
await p.goto(process.env.URL || 'http://127.0.0.1:4173/'); await wait(p, 1500); await s.advance(300); await skipOnboarding(p); await s.advance(120);
// the demo data, step by step in film time (lib.mjs's loadDemo waits in real time, which a slow emulated GPU never fills)
await p.getByLabel('Settings').click(); await s.advance(150);
await p.getByText('Data & backup').click(); await s.advance(120);
await p.getByText('Load demo data').click(); await s.advance(120);
await p.keyboard.press('Escape'); await s.advance(240);
await p.getByLabel('Settings').first().click(); await s.advance(150);
await p.locator('.sheet').getByText('Appearance', { exact: true }).first().click(); await s.advance(150);
await p.locator('.pal-card').filter({ hasText: new RegExp(`^${process.env.PAL || 'aurora'}`, 'i') }).first().click(); await s.advance(120);
await p.locator('.sheet [aria-label=Back]').first().click(); await s.advance(150);
await p.keyboard.press('Escape'); await s.advance(240);
// the colour field holds still, so frame differences are the motion
await p.evaluate(() => { for (const a of document.getAnimations()) { const t = a.effect?.target; if (t && t.closest?.('.aurora, .aurora-lite')) { a.pause(); a.currentTime = 9000; } } });
// LAND=B|D…: which way home (landing.ts aven.wkLand; unset: the app's default)
if (process.env.LAND) await p.evaluate((l) => localStorage.setItem('aven.wkLand', l), process.env.LAND);
const film = async (name, fn, n) => { if (!want.length || want.includes(name)) await s.film(`${tag}-${name}`, fn, n); else { await fn(); await s.advance(n); } };
const start = p.getByRole('button', { name: /Start workout/ }).first();
// BEST=1: a close films with a fresh "New best" tag showing on the first set (it is ticked off and on again 90 frames before)
const best = async () => {
  if (!process.env.BEST) return;
  await p.locator('.wk-sheet').getByRole('button', { name: 'Mark set not done' }).first().tap(); await s.advance(30);
  await p.locator('.wk-sheet').getByRole('button', { name: 'Complete set' }).first().tap(); await s.advance(60);
  // (and the list back at its top, as every close is filmed from: one run of r10b found it scrolled 147 px down by then)
  await p.evaluate(() => document.querySelector('.wk-sheet .wk-list')?.scrollTo({ top: 0 })); await s.advance(30);
};
await start.scrollIntoViewIfNeeded().catch(() => {}); await s.advance(60);
await film('open', () => start.tap(), 150);
await s.advance(200);
await film('tick', () => p.locator('.wk-sheet').getByRole('button', { name: 'Complete set' }).first().tap(), 150);
await s.advance(120); await best();
await film('minimise', () => p.getByRole('button', { name: 'Minimise workout' }).tap(), 150);
await s.advance(200);
await film('resume', () => p.getByLabel('Resume workout').first().tap(), 150);
await s.advance(200);
// the resume bar: minimise on another tab
await p.getByRole('button', { name: 'Minimise workout' }).tap(); await s.advance(200);
await p.getByRole('button', { name: 'Train', exact: true }).first().tap(); await s.advance(240);
await film('pill-resume', () => p.getByLabel('Resume workout').first().tap(), 150);
await s.advance(200); await best();
await film('pill-min', () => p.getByRole('button', { name: 'Minimise workout' }).tap(), 150);
// a finger pulling the window down from its header and letting go (SWIPE=1): on the resume bar's tab, then on Today
const touch = await s.ctx.newCDPSession(p);
const swipe = async () => {
  const h = await p.getByRole('dialog', { name: 'Active workout' }).locator('.wk-meta').first().boundingBox();
  const x = h.x + 60, y = h.y + 10, at = (dy) => [{ x, y: y + dy, id: 1 }];
  const nextFrame = () => p.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
  // a real finger (touch events), one step a drawn frame (the film itself draws them): 16 px a frame at 120 Hz, then let go
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) }); await nextFrame();
  for (let i = 1; i <= 14; i++) { await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(16 * i) }); await nextFrame(); }
  console.log('drag at release:', await p.evaluate(() => getComputedStyle(document.querySelector('.wk-card')).transform));
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};
if (process.env.SWIPE) {
  await s.advance(200);
  await p.getByLabel('Resume workout').first().tap(); await s.advance(240); await best();
  await film('pill-swipe', swipe, 170);
  await s.advance(200);
  await p.getByRole('button', { name: 'Today', exact: true }).first().tap(); await s.advance(240);
  await p.getByLabel('Resume workout').first().tap(); await s.advance(240); await best();
  await film('swipe-min', swipe, 170);
}
// a move turned round half way (round 7): a finger taps the window's minimise arrow 30 frames into an opening, and the card
// 30 frames into a minimise; each must turn round from where it is, at its speed, with no jump
const fingerTap = async (sel) => {
  const r = await p.evaluate((q) => { const e = [...document.querySelectorAll(q)].find((x) => x.getBoundingClientRect().width > 0); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, sel);
  if (!r) { console.log('no target', sel); return; }
  // (where the finger lands, and when, in the film's time: TAPLOG=1)
  if (process.env.TAPLOG) console.log('tap', sel, await p.evaluate(({ x, y }) => { const e = document.elementFromPoint(x, y); return `${Math.round(performance.now())} ${e?.tagName}.${String(e?.className).slice(0, 40)} ${e?.closest('[aria-label]')?.getAttribute('aria-label')}`; }, r));
  const nextFrame = () => p.evaluate(() => new Promise((ok) => requestAnimationFrame(() => ok())));
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x, y: r.y, id: 2 }] }); await nextFrame();
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};
const frames = (n) => p.evaluate((k) => new Promise((ok) => { let i = 0; const f = () => (++i >= k ? ok() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
if (!want.length || want.includes('open-int') || want.includes('min-int')) {
  await s.advance(200);
  if (!process.env.SWIPE) { await p.getByRole('button', { name: 'Today', exact: true }).first().tap(); await s.advance(240); }
  const card = '[aria-label="Resume workout"]', minBtn = '[aria-label="Minimise workout"]';
  await film('open-int', async () => { await fingerTap(card); await frames(30); await fingerTap(minBtn); }, 190);
  await s.advance(240);
  await fingerTap(card); await s.advance(240);
  await film('min-int', async () => { await fingerTap(minBtn); await frames(30); await fingerTap(card); }, 190);
}
await s.close();
