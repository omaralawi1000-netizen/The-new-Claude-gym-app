// Films the page stepping back behind each pop-up (workout, Settings, Coach, a food sheet), open and close, frame by frame at
// 4x CPU and phone size. usage: node scripts/film-depth.mjs [--light] [names…] → shots/film/depth-<theme>-<name>.jpg
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import { filmer } from './film-act.mjs';
const theme = process.argv.includes('--light') ? 'light' : 'dark';
const want = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const { b, ctx, p } = await launch({ theme, size: { width: 384, height: 832 } });
const cdp = await ctx.newCDPSession(p);
const film = await filmer(ctx, p);
await p.goto(process.env.URL || 'http://127.0.0.1:4173/'); await wait(p, 1500); await skipOnboarding(p); await loadDemo(p); await wait(p, 1000);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: +(process.env.CPU || 4) });
const step = async (name, fn, ms = 1400) => { if (!want.length || want.some((w) => name.startsWith(w))) await film(`depth-${theme}-${name}`, fn, ms, { every: +(process.env.EVERY || 2), cols: 8 }); else { await fn(); await wait(p, ms); } };
await step('settings-open', () => p.getByLabel('Settings').first().tap(), 1300);
await step('settings-close', () => p.keyboard.press('Escape'), 1300);
await step('coach-open', () => p.getByLabel('Coach').first().tap(), 1300);
await step('coach-close', () => p.keyboard.press('Escape'), 1300);
await step('food-open', () => p.getByLabel('Log food').first().tap(), 1300);
await step('food-close', () => p.keyboard.press('Escape'), 1300);
await step('workout-open', () => p.getByRole('button', { name: /Start workout/ }).first().tap(), 2000);
await step('workout-close', () => p.getByRole('button', { name: 'Minimise workout' }).tap(), 1600);
await b.close();
