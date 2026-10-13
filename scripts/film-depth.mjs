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
await p.goto(process.env.URL || 'http://127.0.0.1:4173/'); await wait(p, 1500); await skipOnboarding(p); await loadDemo(p); await wait(p, 4500);
const step = async (name, fn, frames = 78) => { if (!want.length || want.some((w) => name.startsWith(w))) await s.film(`${process.env.TAG || 'depth'}-${theme}-${name}`, fn, frames); else { await fn(); await wait(p, frames * 17 + 300); } };
// closing as a person does, with the sheet's own close button (Escape is a keyboard, and leaves a keyboard focus ring)
const close = () => p.getByRole('dialog').last().getByLabel('Close').first().tap();
await step('settings-open', () => p.getByLabel('Settings').first().tap());
await step('settings-close', close);
await step('coach-open', () => p.getByLabel('Coach').first().tap());
await step('coach-close', close);
await step('food-open', () => p.getByLabel('Log food').first().tap());
await step('food-close', close);
// a pop-up over a pop-up: the food search, then the barcode camera / the photo sheet on top of it
await step('stack-food-open', () => p.getByLabel('Log food').first().tap());
await step('stack-scan-open', () => p.getByRole('dialog').last().getByRole('button', { name: 'Scan', exact: true }).first().tap());
await step('stack-scan-close', close);
await step('stack-photo-open', () => p.getByRole('dialog').last().getByRole('button', { name: 'Photo', exact: true }).first().tap());
await step('stack-photo-close', close);
await step('stack-food-close', close);
await step('workout-open', () => p.getByRole('button', { name: /Start workout/ }).first().tap(), 100);
// the exercise list over the live workout: the workout window stacks behind it
await step('stack-picker-open', () => p.getByRole('button', { name: 'Add exercise' }).first().tap(), 90);
await step('stack-picker-close', close, 84);
await step('workout-close', () => p.getByRole('button', { name: 'Minimise workout' }).tap(), 84);
await s.close();
