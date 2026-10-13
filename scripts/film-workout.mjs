// Films workout moments frame by frame (4x CPU, touches): start, switch to Focus, turn a page, back to List, tick, minimise.
// usage: node scripts/film-workout.mjs [--light] [names…]   (URL defaults to the preview build) → shots/film/<theme>-<name>.jpg
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import { filmer } from './film-act.mjs';
const theme = process.argv.includes('--light') ? 'light' : 'dark';
const want = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const { b, ctx, p } = await launch({ theme, size: { width: 384, height: 832 } });
const cdp = await ctx.newCDPSession(p);
const film = await filmer(ctx, p);
await p.goto(process.env.URL || 'http://127.0.0.1:4173/'); await wait(p, 1500); await skipOnboarding(p); await loadDemo(p); await wait(p, 1000);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
const step = async (name, fn, ms = 1400) => { if (!want.length || want.includes(name)) await film(`${theme}-${name}`, fn, ms); else { await fn(); await wait(p, ms); } };
const swipe = async (dx) => { const bx = await p.locator('.wk-pager').boundingBox(); const y = bx.y + bx.height * 0.4, x0 = dx < 0 ? bx.x + bx.width * 0.85 : bx.x + bx.width * 0.1;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] });
  for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (dx * i) / 10, y }] }); await wait(p, 16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
await step('start', () => p.getByRole('button', { name: /Start workout/ }).first().tap(), 2200);
await step('tick', () => p.getByRole('button', { name: 'Complete set' }).first().tap(), 1400);
await step('to-focus', () => p.getByRole('button', { name: 'Focus view' }).tap(), 1800);
await step('page-next', () => swipe(-280), 1500);
await step('page-back', () => swipe(280), 1500);
await step('to-list', () => p.getByRole('button', { name: 'List view' }).tap(), 1800);
await step('minimise', () => p.getByRole('button', { name: 'Minimise workout' }).tap(), 1600);
await step('resume', () => p.getByLabel('Resume workout').first().tap(), 1800);
await b.close();
