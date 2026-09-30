import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import assert from 'node:assert/strict';
const { b, ctx, p, errors } = await launch({ record: process.argv.includes('--record') });
await p.goto('http://127.0.0.1:5173/'); await wait(p, 1000);
await skipOnboarding(p);
await p.locator('.tabbar').getByText('Food', { exact: true }).click(); await wait(p, 700);
const kcal = async () => Number((await p.locator('.plinth.dots .display-xl').first().innerText()).replace(/[^\d]/g, ''));
const primary = () => p.locator('.sheet-foot .btn.primary');
// online results
await p.getByRole('button', { name: 'Add food' }).first().click(); await wait(p, 600);
await p.getByPlaceholder('Search foods and brands').fill('skyr'); await wait(p, 1800);
await p.screenshot({ path: 'shots/fd2-1-online.png' });
assert(await p.getByText('DemoDairy').first().isVisible(), 'online result listed');
await p.getByText('Skyr Naturel').first().click(); await wait(p, 1000);
await p.screenshot({ path: 'shots/fd2-2-offdetail.png' });
assert(await p.getByText('Open Food Facts').first().isVisible(), 'source shown');
await primary().click(); await wait(p, 1200);
console.log('kcal after OFF skyr (1 verified serving 150 g × 62):', await kcal()); assert.equal(await kcal(), 93);
// barcode (manual entry path)
await p.getByRole('button', { name: /Add to Lunch/ }).click(); await wait(p, 600);
await p.getByRole('button', { name: 'Scan' }).first().click(); await wait(p, 900);
await p.getByLabel('Barcode number').fill('5704444444444'); await p.getByRole('button', { name: 'Look up' }).click(); await wait(p, 1500);
await p.screenshot({ path: 'shots/fd2-3-barcode.png' });
await primary().click(); await wait(p, 1200);
// 1 serving(35 g)*205/100 = 71.75 → 72 ; total 93+72=165 (skyr 93 + rugbrød 71.75 = 164.75)
console.log('kcal after barcode item', await kcal()); assert.equal(await kcal(), 165);
// not found barcode → offer to create
await p.getByRole('button', { name: /Add to Lunch/ }).click(); await wait(p, 600);
await p.getByRole('button', { name: 'Scan' }).first().click(); await wait(p, 600);
await p.getByLabel('Barcode number').fill('9999999999999'); await p.getByRole('button', { name: 'Look up' }).click(); await wait(p, 1200);
assert(await p.getByText(/No product found/).isVisible());
await p.getByRole('button', { name: /Add this product/ }).click(); await wait(p, 700);
await p.getByLabel('Name').fill('Protein bar'); await p.getByRole('textbox', { name: /Calories/ }).fill('380'); await wait(p, 200);
await p.screenshot({ path: 'shots/fd2-4-custom.png' });
await p.locator('.sheet-foot .btn.primary').click(); await wait(p, 1200);
await primary().click(); await wait(p, 1200); // detail "Add to Lunch"
console.log('kcal with custom bar (100 g default × 380)', await kcal());
// previous day is independent
await p.getByRole('button', { name: 'Previous day' }).click(); await wait(p, 600);
assert.equal(await kcal(), 0, 'yesterday is empty and unaffected');
await p.getByRole('button', { name: 'Next day' }).click(); await wait(p, 600);
// copy lunch to tomorrow via meal menu
await p.getByRole('button', { name: 'Meal options' }).first().click(); await wait(p, 500);
await p.getByText('Copy meal to…').click(); await wait(p, 500);
await p.screenshot({ path: 'shots/fd2-5-copy.png' });
await p.getByRole('button', { name: /^Tomorrow$/ }).click();
await p.locator('.sheet-foot .btn.primary').click(); await wait(p, 1200);
await p.getByRole('button', { name: 'Next day' }).click(); await wait(p, 700);
const tomorrowK = await kcal(); console.log('tomorrow kcal', tomorrowK); assert(tomorrowK > 0);
await p.getByRole('button', { name: 'Undo' }).last().click().catch(() => {}); 
await ctx.close(); await b.close(); console.log('errors', errors.length);
