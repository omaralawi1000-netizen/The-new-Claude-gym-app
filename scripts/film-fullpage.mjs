// The live workout, start → minimise → resume, with the steady camera (film-steady.mjs), plus a still of the open window
// with a set ticked. Used to compare the card-style window with the full-page one.
// usage: AVEN_GPU=1 TAG=before node scripts/film-fullpage.mjs [--light] → shots/film/<TAG>-<theme>-<step>/
import { wait, skipOnboarding, loadDemo } from './lib.mjs';
import { steady } from './film-steady.mjs';
const theme = process.argv.includes('--light') ? 'light' : 'dark';
const tag = process.env.TAG || 'fp';
const s = await steady({ theme });
const { p } = s;
await p.goto(process.env.URL || 'http://127.0.0.1:4173/'); await wait(p, 1500); await skipOnboarding(p); await loadDemo(p); await s.advance(240);
const start = p.getByRole('button', { name: /Start workout/ }).first();
await start.scrollIntoViewIfNeeded().catch(() => {}); await s.advance(40);
await s.film(`${tag}-${theme}-start`, () => start.tap(), 90);
await s.advance(120);
const tick = p.locator('.wk-sheet').getByRole('button', { name: 'Complete set' }).first();
await (async () => { const t = tick.tap(); await s.advance(150); await t; })();
await s.film(`${tag}-${theme}-still`, async () => {}, 60);
await s.film(`${tag}-${theme}-minimise`, () => p.getByRole('button', { name: 'Minimise workout' }).tap(), 80);
await s.advance(60);
await s.film(`${tag}-${theme}-resume`, () => p.getByLabel('Resume workout').first().tap(), 80);
await s.close();
