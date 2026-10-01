import { launch, wait } from './lib.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { b, ctx, p, errors } = await launch({ record: process.argv.includes('--record') });
const state = () => p.evaluate(() => JSON.parse(localStorage.getItem('aven.v1')));
await p.goto('http://127.0.0.1:5173/'); await wait(p, 1000);
// ── onboarding: goal, experience, schedule, units, targets, starter plan ──
await p.getByLabel('What should I call you?').fill('Omar');
await p.getByText('Build muscle').click(); await p.getByRole('button', { name: 'Continue' }).click(); await wait(p, 500);
await p.getByText('Home with dumbbells').click(); await p.getByRole('button', { name: 'Continue' }).click(); await wait(p, 500);
await p.screenshot({ path: 'shots/ms-1-schedule.png' });
await p.getByRole('button', { name: 'Continue' }).click(); await wait(p, 500); // keep Mon/Wed/Fri
await p.getByRole('button', { name: 'Continue' }).click(); await wait(p, 500); // units
await p.getByRole('textbox', { name: 'Calories per day' }).or(p.getByLabel('Calories per day')).first().fill('2600').catch(async () => { await p.locator('input').first().fill('2600'); });
await p.getByRole('button', { name: 'Continue' }).click(); await wait(p, 500);
await p.screenshot({ path: 'shots/ms-2-finish.png' });
await p.getByRole('button', { name: 'Start', exact: true }).click(); await wait(p, 1200);
let s = await state();
console.log('routines', s.routines.map((r) => `${r.name}(${r.items.length})`), 'onboarded', s.settings.onboarded, 'kcal', s.settings.goals.kcal);
assert(s.settings.onboarded && s.routines.length >= 2 && s.settings.goals.kcal === 2600 && s.settings.name === 'Omar');
const eqOK = s.routines.every((r) => r.items.every((i) => !['barbell-row', 'bench-press', 'back-squat', 'leg-press'].includes(i.exerciseId)));
assert(eqOK, 'home-dumbbell plan avoids barbell/machine exercises');
await p.screenshot({ path: 'shots/ms-3-today.png' });
assert(await p.getByText('Omar').first().isVisible());
// ── recipe: create, log a serving, edit recipe → old entry unchanged ──
await p.locator('.tabbar').getByRole('button', { name: 'Food', exact: true }).click(); await wait(p, 600);
await p.getByRole('button', { name: 'Add food' }).first().click().catch(() => {});
await p.getByRole('button', { name: /Add to (Breakfast|Lunch|Dinner|Snacks)/ }).first().click().catch(() => {}); await wait(p, 500);
await p.getByRole('button', { name: 'Recipes' }).click(); await wait(p, 600);
await p.getByRole('button', { name: 'New recipe' }).click(); await wait(p, 700);
const rd = p.getByRole('dialog', { name: 'Recipe', exact: true });
await rd.getByLabel('Name').fill('Overnight oats');
const addIng = async (q, pickText, amt) => {
  await rd.getByPlaceholder('Add ingredient — search foods').fill(q); await wait(p, 300);
  await rd.getByText(pickText, { exact: true }).first().click(); await wait(p, 300);
  await rd.getByRole('textbox', { name: 'Amount' }).fill(String(amt)); await rd.getByRole('button', { name: 'Add', exact: true }).click(); await wait(p, 400);
};
await addIng('oats', 'Oats, rolled, dry', 100);
await addIng('milk', 'Milk, semi-skimmed 1.5%', 200);
await rd.getByRole('textbox', { name: 'Servings' }).fill('2').catch(() => {});
await p.screenshot({ path: 'shots/ms-4-recipe.png' });
const txt = await rd.innerText(); console.log(txt.match(/PER SERVING[\s\S]{0,60}/)?.[0].replace(/\n/g, ' '));
await rd.getByRole('button', { name: 'Save recipe' }).click(); await wait(p, 900);
s = await state(); const rc = s.recipes[0]; assert.equal(rc.ingredients.length, 2);
// oats 100 g = 372; milk 200 ml = 92 → total 464, 2 servings → 232 per serving
await p.getByRole('dialog', { name: 'Recipes' }).getByText('Overnight oats').click(); await wait(p, 900);
await p.getByRole('button', { name: /1 serving/ }).first().click().catch(() => {});
await p.screenshot({ path: 'shots/ms-5-recipe-detail.png' });
await p.getByRole('button', { name: /^Add to .* · 232 kcal/ }).click(); await wait(p, 1200);
s = await state(); const e = s.entries.find((x) => x.snap.name === 'Overnight oats');
console.log('serving kcal', e?.nutrients.kcal); assert(Math.abs(e.nutrients.kcal - 232) < 0.5, 'per-serving kcal = 232');
// edit recipe: change oats to 50 g; the logged entry must not change
await p.locator('.tabbar').getByRole('button', { name: 'Food', exact: true }).click(); await wait(p, 300);
await p.getByRole('button', { name: /Add to (Breakfast|Lunch|Dinner|Snacks)/ }).first().click(); await wait(p, 500);
await p.getByRole('button', { name: 'Recipes' }).click(); await wait(p, 500);
await p.getByRole('button', { name: 'Edit', exact: true }).first().click(); await wait(p, 600);
await rd.getByRole('button', { name: 'Remove' }).first().click(); await wait(p, 300);
await rd.getByRole('button', { name: 'Save recipe' }).click(); await wait(p, 900);
s = await state(); assert.equal(s.recipes[0].ingredients.length, 1);
assert(Math.abs(s.entries.find((x) => x.snap.name === 'Overnight oats').nutrients.kcal - 232) < 0.5, 'history unchanged after recipe edit');
await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await wait(p, 600);
// ── water quick-add + undo ──
const w0 = (await state()).water.length;
await p.getByRole('button', { name: 'Add 250 ml' }).click(); await wait(p, 500);
assert.equal((await state()).water.length, w0 + 1);
await p.getByRole('button', { name: 'Undo' }).last().click(); await wait(p, 500);
assert.equal((await state()).water.length, w0, 'water undo');
// ── units: lb ──
await p.locator('.tabbar').getByRole('button', { name: 'Today', exact: true }).click(); await wait(p, 500);
await p.getByLabel('Settings').click(); await wait(p, 600);
await p.getByText('Units & locale').click(); await wait(p, 500);
await p.getByRole('dialog', { name: 'Settings' }).getByRole('tab', { name: 'lb' }).click(); await wait(p, 400);
await p.keyboard.press('Escape'); await wait(p, 500);
await p.getByLabel('Settings').click().catch(() => {});
// log a weight 80 kg-equivalent: type 176.4 lb → 80.01 kg
await p.keyboard.press('Escape'); await wait(p, 400);
await p.evaluate(() => {});
await p.locator('.tabbar').getByRole('button', { name: 'Progress', exact: true }).click(); await wait(p, 600);
await p.getByRole('button', { name: 'Log' }).first().click(); await wait(p, 600);
await p.getByRole('textbox', { name: 'Weight' }).fill('176,4'); await p.getByRole('button', { name: 'Save', exact: true }).click(); await wait(p, 700);
s = await state(); const wlog = s.weights.at(-1); console.log('176.4 lb →', wlog.kg, 'kg');
assert(Math.abs(wlog.kg - 80.01) < 0.05, 'lb → kg conversion');
await p.screenshot({ path: 'shots/ms-6-progress.png' });
await p.keyboard.press('Escape'); await wait(p, 500);
// ── export → fresh context → import ──
await p.getByLabel('Settings').or(p.locator('.tabbar').getByRole('button', { name: 'Today', exact: true })).first().click().catch(() => {});
await p.locator('.tabbar').getByRole('button', { name: 'Today', exact: true }).click(); await wait(p, 500);
await p.getByLabel('Settings').click(); await wait(p, 600);
await p.getByText('Data & backup').click(); await wait(p, 500);
const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Download backup' }).click()]);
const path = await dl.path(); const backup = JSON.parse(readFileSync(path, 'utf8'));
console.log('backup', backup.app, backup.v, Object.keys(backup.data).length, 'keys', backup.data.entries.length, 'entries');
assert(backup.app === 'aven' && backup.data.entries.length === (await state()).entries.length);
const ctx2 = await (await import('playwright')).chromium.launch().then((x) => x.newContext({ viewport: { width: 390, height: 844 } }));
const p2 = await ctx2.newPage(); await p2.goto('http://127.0.0.1:5173/'); await wait(p2, 800);
await p2.getByText('Skip all').click(); await wait(p2, 500);
await p2.getByLabel('Settings').click(); await wait(p2, 500); await p2.getByText('Data & backup').click(); await wait(p2, 400);
await p2.locator('input[type=file]').first().setInputFiles(path); await wait(p2, 600);
await p2.getByRole('button', { name: 'Replace my data' }).click(); await wait(p2, 800);
const r = await p2.evaluate(() => JSON.parse(localStorage.getItem('aven.v1')));
assert.equal(r.entries.length, backup.data.entries.length); assert.equal(r.routines.length, backup.data.routines.length); assert.equal(r.settings.name, 'Omar'); assert.equal(r.settings.units.weight, 'lb');
console.log('import OK; undo restores previous');
await p2.getByRole('button', { name: 'Undo' }).last().click(); await wait(p2, 500);
assert.equal((await p2.evaluate(() => JSON.parse(localStorage.getItem('aven.v1')))).entries.length, 0);
// invalid file
await p2.locator('input[type=file]').first().setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"nope":1}') }); await wait(p2, 500);
assert(await p2.getByText(/isn’t a valid Aven backup/).isVisible(), 'invalid backup rejected gracefully');
console.log('errors', errors.length);
await ctx.close(); process.exit(0);
