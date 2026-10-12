// Focus view (screens/workout/Focus.tsx): switch to it, swipe between exercises, tick through an exercise and glide on,
// the bar's "next set" finds its page, and back to the list.
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import assert from 'node:assert/strict';
const record = process.argv.includes('--record');
const { b, ctx, p, errors } = await launch({ record });
await p.goto('http://127.0.0.1:5173/'); await wait(p, 1000);
await skipOnboarding(p);
await loadDemo(p);
await p.getByRole('button', { name: /Start workout/ }).click(); await wait(p, 1400);
const dlg = p.getByRole('dialog', { name: 'Active workout' });
await dlg.getByRole('button', { name: 'Focus view' }).click(); await wait(p, 900);
await p.screenshot({ path: 'shots/focus-1.png' });
const sel = async () => p.locator('.wk-dot').evaluateAll((els) => els.findIndex((e) => e.getAttribute('aria-selected') === 'true'));
const n = await p.locator('.wk-dot').count();
console.log('exercises', n, 'on', await sel());
assert(n >= 2, 'a dot per exercise');
assert.equal(await sel(), 0, 'opens on the exercise with the next set');
assert(await p.locator('.wk-list').evaluate((e) => getComputedStyle(e).visibility === 'hidden'), 'the list has faded out');
// swipe to the next page with a held mouse (pointer events, as a finger)
const box = await p.locator('.wk-pager').boundingBox();
const y = box.y + 120;
// dx over `steps` moves `ms` apart; `hold` waits before lifting (a finger that stopped has no flick left)
const swipe = async (dx, steps = 8, ms = 16, hold = 0) => { await p.mouse.move(box.x + box.width / 2, y); await p.mouse.down(); for (let i = 1; i <= steps; i++) { await p.mouse.move(box.x + box.width / 2 + (dx * i) / steps, y); await wait(p, ms); } if (hold) await wait(p, hold); await p.mouse.up(); await wait(p, 900); };
await swipe(-220);
assert.equal(await sel(), 1, 'a swipe left goes to the next exercise');
await p.screenshot({ path: 'shots/focus-2-swiped.png' });
await swipe(240);
assert.equal(await sel(), 0, 'a swipe right comes back');
await swipe(260);
assert.equal(await sel(), 0, 'the first page resists and stays');
// a short slow drag springs back; a short quick flick turns the page; a slow drag past a quarter turns it too
await swipe(-50, 12, 40, 200);
assert.equal(await sel(), 0, 'a short slow drag springs back');
await swipe(-60, 4, 16);
assert.equal(await sel(), 1, 'a short flick turns the page');
await swipe(box.width * 0.3, 15, 40, 200);
assert.equal(await sel(), 0, 'a slow drag past a quarter turns the page');
// tick every set of the first exercise: it glides on to the next one by itself
const page = p.locator('.wk-page.cur');
let guard = 0;
while ((await page.getByRole('button', { name: 'Complete set' }).count()) > 0 && guard++ < 12) { await page.getByRole('button', { name: 'Complete set' }).first().click(); await wait(p, 350); }
await wait(p, 1800);
await p.screenshot({ path: 'shots/focus-3-advanced.png' });
assert.equal(await sel(), 1, 'after its last set it moves on to the next exercise');
assert(await p.locator('.wk-dot').first().evaluate((e) => e.classList.contains('done')), 'the finished exercise has a filled dot');
// go back, then the bar's "next set" brings you to it
await p.locator('.wk-dot').first().click(); await wait(p, 1000);
assert.equal(await sel(), 0, 'a dot takes you to its exercise');
// skip the rest so the bar shows the next set
const bar = p.locator('.wk-bar-main');
if (await p.locator('.wk-bar.rest').isVisible()) { await bar.click(); await wait(p, 400); await p.getByRole('button', { name: 'Skip' }).click(); await wait(p, 600); }
await bar.click(); await wait(p, 1300);
assert.equal(await sel(), 1, 'the bar takes you to the exercise of the next set');
// back to the list, which kept its place
await dlg.getByRole('button', { name: 'List view' }).click(); await wait(p, 900);
assert(await p.locator('.wk-list').evaluate((e) => getComputedStyle(e).visibility === 'visible'), 'the list is back');
assert.equal(await p.locator('.wk-focus').count(), 0, 'Focus is let go once it has faded out');
// remembered: minimise and reopen → still the list; switch to focus, reload → focus
await dlg.getByRole('button', { name: 'Focus view' }).click(); await wait(p, 700);
await p.reload(); await wait(p, 1200);
await p.locator('button[aria-label="Resume workout"]').first().click(); await wait(p, 1200);
assert(await p.locator('.wk-focus.on').isVisible(), 'Focus is remembered');
await p.screenshot({ path: 'shots/focus-4-reopen.png' });
console.log('errors:', errors.length);
assert.equal(errors.length, 0, 'no errors');
await ctx.close(); await b.close();
