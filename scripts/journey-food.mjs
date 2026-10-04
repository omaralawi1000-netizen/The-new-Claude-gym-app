import { launch, wait, skipOnboarding, sayTyped } from './lib.mjs';
import assert from 'node:assert/strict';
const record = process.argv.includes('--record');
const { b, ctx, p, errors } = await launch({ record });
await p.goto('http://127.0.0.1:5173/'); await wait(p, 1000);
await skipOnboarding(p);
await p.locator('.tabbar').getByRole('button', { name: 'Food', exact: true }).click(); await wait(p, 700);
const ledgerKcal = async () => (await p.locator('[data-testid="ledger-kcal"]').first().innerText()).replace(/[^\d]/g, '');
// empty state
assert(await p.getByLabel('Nothing logged yet').isVisible());
await p.screenshot({ path: 'shots/fd-0-empty.png' });
// 1. search + detail + portion
await p.getByRole('button', { name: /^Add to / }).first().click(); await wait(p, 700);
await p.getByPlaceholder('Search foods and brands').fill('skyr'); await wait(p, 900);
await p.screenshot({ path: 'shots/fd-1-search.png' });
await p.getByText('Skyr, plain', { exact: true }).first().click(); await wait(p, 1000);
await p.screenshot({ path: 'shots/fd-2-detail.png' });
const amount = p.getByRole('textbox', { name: 'Amount' });
await amount.fill('200'); await p.getByRole('button', { name: /^g$/ }).click(); await wait(p, 600);
await p.screenshot({ path: 'shots/fd-3-portion.png' });
// 200 g skyr = 126 kcal
assert((await p.locator('.sheet-foot, [role=dialog]').last().innerText()).includes('126'), 'live kcal preview = 126');
await p.locator('.sheet-foot .btn.primary').click(); await wait(p, 1200);
await p.screenshot({ path: 'shots/fd-4-added.png' });
// Skyr 200 g: 63*2 = 126 kcal. No goal set → "Eaten today" shows eaten kcal
console.log('ledger after add:', await ledgerKcal());
assert.equal(await ledgerKcal(), '126');
// 2. edit: tap the entry, change to 300 g
await p.getByRole('button', { name: /Skyr, plain, 126 kcal/ }).click(); await wait(p, 900);
await p.getByRole('textbox', { name: 'Amount' }).fill('300'); await p.locator('.sheet-foot .btn.primary').click(); await wait(p, 1200);
assert.equal(await ledgerKcal(), '189', '300 g → 189 kcal');
// 3. delete via menu then Undo restores
await p.getByRole('button', { name: /Skyr, plain, 189 kcal/ }).click(); await wait(p, 800);
await p.getByRole('button', { name: 'Delete entry' }).click(); await wait(p, 900);
assert.equal(await ledgerKcal(), '0');
await p.getByRole('button', { name: 'Undo' }).last().click(); await wait(p, 900);
assert.equal(await ledgerKcal(), '189', 'undo restores exactly');
await p.screenshot({ path: 'shots/fd-5-undo.png' });
// 4. say it to the orb (typed here): it logs it straight away, with an Undo
await p.getByRole('button', { name: 'Dictate' }).first().click(); await wait(p, 1200);
await p.screenshot({ path: 'shots/fd-6-voice.png' });
assert(await p.getByRole('dialog', { name: 'Dictation' }).isVisible(), 'the orb screen opens');
await sayTyped(p, '200 grams of skyr, one banana and 60 grams of oats'); await wait(p, 2600);
await p.screenshot({ path: 'shots/fd-9-logged.png' });
// 189 + skyr 126 + banana 105 + oats 223 = 643 (the Coach picks the clear best match; the card says what it matched)
const k = Number(await ledgerKcal()); console.log('ledger after saying it', k); assert(k >= 600 && k <= 700, 'logged all three');
// 5. recipe → log a serving
await p.getByRole('button', { name: /Add to Dinner/ }).click(); await wait(p, 700);
await p.getByRole('button', { name: 'Recipes' }).click(); await wait(p, 600);
await p.getByRole('button', { name: 'New recipe' }).click(); await wait(p, 600);
await p.getByLabel('Name').fill('Overnight oats');
await p.getByPlaceholder('Add ingredient — search foods').fill('oats'); await wait(p, 300);
await p.getByText('Oats, rolled, dry').last().click(); await wait(p, 300);
await p.locator('input[aria-label="Amount"], .plinth-2 input').first().fill('100').catch(() => {});
await p.screenshot({ path: 'shots/fd-10-recipe.png' });
await ctx.close(); await b.close();
console.log('errors', errors.length);
