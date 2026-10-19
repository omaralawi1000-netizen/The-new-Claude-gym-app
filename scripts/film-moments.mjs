// The live workout's small moments with the steady camera: ticking a set (the tick, the progress bar, the rest bar coming
// in), then "+ Set". usage: AVEN_GPU=1 TAG=x node scripts/film-moments.mjs [--light] → shots/film/<TAG>-<theme>-moments/
import { wait, skipOnboarding, loadDemo } from './lib.mjs';
import { steady } from './film-steady.mjs';
const theme = process.argv.includes('--light') ? 'light' : 'dark';
const tag = process.env.TAG || 'mo';
const s = await steady({ theme });
const { p } = s;
await p.goto(process.env.URL || 'http://127.0.0.1:4173/'); await wait(p, 1500); await skipOnboarding(p); await loadDemo(p); await s.advance(240);
const start = p.getByRole('button', { name: /Start workout/ }).first();
await start.scrollIntoViewIfNeeded().catch(() => {}); await s.advance(40);
await (async () => { const t = start.tap(); await s.advance(150); await t; })();
await s.advance(120);
const sheet = p.locator('.wk-sheet');
await s.film(`${tag}-${theme}-moments`, async () => {
  await sheet.getByRole('button', { name: 'Complete set' }).first().tap();
  await s.advance(70);
  await sheet.getByRole('button', { name: 'Complete set' }).first().tap();
  await s.advance(70);
  await sheet.locator('.wk-add-set').first().tap();
}, 110);
await s.close();
