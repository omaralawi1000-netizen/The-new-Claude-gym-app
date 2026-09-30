import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import assert from 'node:assert/strict';
const record = process.argv.includes('--record');
const { b, ctx, p, errors } = await launch({ record });
const url = 'http://127.0.0.1:5173/';
await p.goto(url); await wait(p, 1000);
await skipOnboarding(p);
await loadDemo(p);
// 1. start from the hero
await p.getByRole('button', { name: /Start workout/ }).click();
await wait(p, 1200);
await p.screenshot({ path: 'shots/wk-1-active.png' });
assert(await p.getByRole('dialog', { name: 'Active workout' }).isVisible(), 'active workout is open');
// 2. complete first set with pre-filled targets (tap)
const complete = p.getByRole('button', { name: 'Complete set' });
const n0 = await complete.count();
console.log('sets visible', n0);
await complete.first().click(); await wait(p, 600);
assert(await p.getByText('Rest', { exact: true }).first().isVisible(), 'rest timer shows');
await p.screenshot({ path: 'shots/wk-2-rest.png' });
// 3. type values into the second set and press Enter to complete
const w = p.getByLabel('Weight').nth(1); const r = p.getByLabel('Reps').nth(1);
await w.fill('62,5'); await r.fill('9'); await r.press('Enter'); await wait(p, 500);
const done = await p.getByRole('button', { name: 'Mark set not done' }).count();
console.log('done sets', done); assert(done >= 2);
// 4. reject empty reps on a fresh exercise set? (skip) — add a set then undo delete
await p.getByRole('button', { name: /^Set$|\+ Set/ }).first().click().catch(() => {});
// 5. minimise → pill → resume
await p.getByRole('button', { name: 'Minimise workout' }).click(); await wait(p, 900);
await p.screenshot({ path: 'shots/wk-3-pill.png' });
assert(await p.locator('button[aria-label="Resume workout"]').isVisible(), 'pill visible');
await p.locator('button[aria-label="Resume workout"]').click(); await wait(p, 900);
// 6. reload mid-workout → recover
await p.reload(); await wait(p, 1200);
assert(await p.locator('button[aria-label="Resume workout"]').first().isVisible(), 'active workout recovered after reload');
await p.locator('button[aria-label="Resume workout"]').first().click(); await wait(p, 900);
const doneAfter = await p.getByRole('button', { name: 'Mark set not done' }).count();
assert.equal(doneAfter, done, 'checked sets survive reload');
const val = await p.getByLabel('Weight').nth(1).inputValue(); console.log('weight after reload', val);
assert(['62,5', '62.5'].includes(val), 'typed weight survived');
// 7. finish with unchecked sets → confirm
await p.getByRole('button', { name: 'Finish', exact: true }).click(); await wait(p, 700);
await p.screenshot({ path: 'shots/wk-4-confirm.png' });
await p.getByRole('button', { name: /Finish and save/ }).click(); await wait(p, 1200);
await p.screenshot({ path: 'shots/wk-5-summary.png' });
await p.getByRole('button', { name: 'Done', exact: true }).click(); await wait(p, 900);
// 8. history shows it and values are saved
await p.locator('.tabbar').getByText('Train', { exact: true }).click(); await wait(p, 600);
await p.getByRole('tab', { name: 'History' }).click(); await wait(p, 600);
await p.screenshot({ path: 'shots/wk-6-history.png' });
await p.getByText('Pull').first().click(); await wait(p, 800);
await p.screenshot({ path: 'shots/wk-7-detail.png' });
const weights = await p.getByLabel('Weight').evaluateAll((els) => els.map((e) => e.value));
console.log('saved weights in detail', weights.slice(0, 6));
assert(weights.includes('62,5') || weights.includes('62.5'), 'saved weight present in detail');
console.log('errors:', errors.length);
await ctx.close(); await b.close();
