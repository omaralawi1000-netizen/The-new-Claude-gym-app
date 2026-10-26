// Round 7 of the workout window's way home (landing.ts): each way (A Glide, B Catch, C Lead) filmed minimising into
// Today's card and opening from it, at 120 frames a second in Omar's teal palette.
// usage: AVEN_GPU=1 TAG=r7 [LANDS=ABC] node scripts/film-land.mjs → shots/film/<TAG>-<way>-{min,open}/
import { wait, skipOnboarding } from './lib.mjs';
import { steady } from './film-steady.mjs';
const tag = process.env.TAG || 'r7';
const lands = (process.env.LANDS || 'ABC').split('');
const N = Number(process.env.FRAMES || 132);
const s = await steady({ theme: 'dark', fps: 120, size: { width: 384, height: 832 }, dsf: 3.75 });
const { p } = s;
await p.goto(process.env.URL || 'http://127.0.0.1:4173/'); await wait(p, 1500); await s.advance(300); await skipOnboarding(p); await s.advance(120);
await p.getByLabel('Settings').click(); await s.advance(150);
await p.getByText('Data & backup').click(); await s.advance(120);
await p.getByText('Load demo data').click(); await s.advance(120);
await p.keyboard.press('Escape'); await s.advance(240);
await p.getByLabel('Settings').first().click(); await s.advance(150);
await p.locator('.sheet').getByText('Appearance', { exact: true }).first().click(); await s.advance(150);
await p.locator('.pal-card').filter({ hasText: new RegExp(`^${process.env.PAL || 'aurora'}`, 'i') }).first().click(); await s.advance(120);
await p.locator('.sheet [aria-label=Back]').first().click(); await s.advance(150);
await p.keyboard.press('Escape'); await s.advance(240);
await p.evaluate(() => { for (const a of document.getAnimations()) { const t = a.effect?.target; if (t && t.closest?.('.aurora, .aurora-lite')) { a.pause(); a.currentTime = 9000; } } });
const start = p.getByRole('button', { name: /Start workout/ }).first();
await start.scrollIntoViewIfNeeded().catch(() => {}); await s.advance(60);
await start.tap(); await s.advance(200);
await p.locator('.wk-sheet').getByRole('button', { name: 'Complete set' }).first().tap(); await s.advance(200);
for (const L of lands) {
  await p.evaluate((l) => localStorage.setItem('aven.wkLand', l), L);
  await s.film(`${tag}-${L}-min`, () => p.getByRole('button', { name: 'Minimise workout' }).tap(), N);
  await s.advance(240);
  await s.film(`${tag}-${L}-open`, () => p.getByLabel('Resume workout').first().tap(), N);
  await s.advance(240);
}
await s.close();
