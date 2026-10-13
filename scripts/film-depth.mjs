// Films the page stepping back behind each pop-up (Settings, Coach, a food sheet, the workout) and pop-ups stacking on
// pop-ups (Food → Scan / Photo, the workout → Add exercise), open and close, at phone size with a steady camera
// (film-steady.mjs: every frame is exactly 1/60 s of the app's time). The app is filmed at the size it has under Android's
// status bar; bar.json beside the frames has the bar's colour at each frame, to draw it on top.
// usage: AVEN_GPU=1 node scripts/film-depth.mjs [--light] [names…] → shots/film/<TAG>-<theme>-<name>/
import { wait, skipOnboarding, loadDemo } from './lib.mjs';
import { steady } from './film-steady.mjs';
const theme = process.argv.includes('--light') ? 'light' : 'dark';
const want = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const s = await steady({ theme });
const { p } = s;
if (process.env.FILMDEBUG) { p.on('console', (m) => console.log('console', m.type(), m.text().slice(0, 200))); p.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 200))); }
// the photo sheet as it is with an AI key (a stand-in: nothing is sent, the film never takes a photo)
await s.ctx.addInitScript(() => { try { localStorage.setItem('aven.keys', JSON.stringify({ gemini: 'film-stand-in' })); } catch { /* */ } });
await p.goto(process.env.URL || 'http://127.0.0.1:4173/'); await wait(p, 1500); await skipOnboarding(p); await loadDemo(p); await s.advance(240);
// Every step starts from a still screen: what it taps is scrolled into view first and given time to land, so the film shows
// only the tap and what follows (a tap that has to scroll first moved the list a frame before the pop-up). Steps not filmed
// still play, frame by frame, so the next one doesn't start in the middle of them.
// A step whose button is out of view (scrolled: true) films the scroll too, as a person scrolls to it, so no film cuts
// from one place in a list to another.
const scrollTo = (loc) => loc.evaluate((e) => new Promise((done) => {
  const box = e.closest('.wk-list, .wk-page, .sheet-body, .screen'); e.scrollIntoView({ block: 'center', behavior: 'smooth' });
  let y = -1, still = 0; const look = () => { const now = box ? box.scrollTop : 0; still = now === y ? still + 1 : 0; y = now; if (still > 10) done(); else requestAnimationFrame(look); }; look();
}));
const step = async (name, target, frames = 78, { scrolled = false } = {}) => {
  const loc = target();
  if (!scrolled) await loc.scrollIntoViewIfNeeded().catch(() => {});
  await s.advance(40);
  const act = async () => { if (scrolled) { await scrollTo(loc); } await loc.tap(); };
  if (!want.length || want.some((w) => name.startsWith(w))) await s.film(`${process.env.TAG || 'depth'}-${theme}-${name}`, act, frames);
  else { const t = act(); await s.advance(frames); await t; }
};
// closing as a person does, with the sheet's own close button (Escape is a keyboard, and leaves a keyboard focus ring)
const close = () => p.getByRole('dialog').last().getByLabel('Close').first();
await step('settings-open', () => p.getByLabel('Settings').first());
await step('settings-close', close);
await step('coach-open', () => p.getByLabel('Coach').first());
await step('coach-close', close);
await step('food-open', () => p.getByLabel('Log food').first());
await step('food-close', close);
// a pop-up over a pop-up: the food search, then the barcode camera / the photo sheet on top of it
await step('stack-food-open', () => p.getByLabel('Log food').first());
await step('stack-scan-open', () => p.getByRole('dialog').last().getByRole('button', { name: 'Scan', exact: true }).first());
await step('stack-scan-close', close);
await step('stack-photo-open', () => p.getByRole('dialog').last().getByRole('button', { name: 'Photo', exact: true }).first());
await step('stack-photo-close', close);
await step('stack-food-close', close);
await step('workout-open', () => p.getByRole('button', { name: /Start workout/ }).first(), 100);
// the exercise list over the live workout: the workout window stacks behind it
await step('stack-picker-open', () => p.getByRole('button', { name: 'Add exercise' }).first(), 150, { scrolled: true });
await step('stack-picker-close', close, 84);
await step('workout-close', () => p.getByRole('button', { name: 'Minimise workout' }), 84);
await s.close();
