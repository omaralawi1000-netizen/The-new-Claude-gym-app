// Polish audit: walks the app doing everyday things (log and delete food, add and remove sets and exercises, search,
// toggles, sheets, toasts) at 4x CPU slowdown with the pop probe on, and lists what popped, vanished, jumped or changed
// a number without rolling, per action. Usage: node scripts/audit-polish.mjs [out.json]
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import { PROBE } from './pop-probe.mjs';
import fs from 'node:fs';
const out = process.argv[2] || 'shots/polish-audit.json';
const { b, ctx, p } = await launch({ size: { width: 384, height: 832 } });
await ctx.addInitScript(PROBE);
p.setDefaultTimeout(4000);
const cdp = await ctx.newCDPSession(p);
const tab = (t) => p.locator('.tabbar').getByRole('button', { name: t, exact: true }).click();
const esc = async (k = 1) => { for (let i = 0; i < k; i++) { await p.keyboard.press('Escape'); await wait(p, 800); } };
const fails = [];
const act = async (label, fn, settle = 1100) => {
  await p.evaluate((l) => { window.__act = l; }, label);
  const t0 = Date.now();
  try { await fn(); } catch (e) { fails.push(`${label}: ${String(e.message).split('\n')[0]}`); }
  if (process.env.V) console.log(label, Date.now() - t0, 'ms');
  await wait(p, settle);
};
await p.goto('http://127.0.0.1:5173/'); await wait(p, 1500);
await act('onboarding: skip', () => skipOnboarding(p));
await act('settings: load demo', () => loadDemo(p), 4000);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

// Today
await act('today: +250 ml water', () => p.getByRole('button', { name: /^\+250/ }).first().click(), 2500);
await act('today: undo toast', () => p.getByRole('button', { name: 'Undo' }).last().click(), 2500);
await act('today: log weight sheet', () => p.getByRole('button', { name: 'Log weight' }).first().click());
await act('today: close weight sheet', () => esc());
await act('today: week day tap', () => p.getByRole('group', { name: 'Week' }).getByRole('button').nth(1).click().catch(() => p.locator('[aria-label="Week"] button').nth(1).click()));
await act('today: week back to today', () => p.locator('[aria-label="Week"] button').nth(2).click());

// Food
await act('tab: Food', () => tab('Food'), 1500);
await act('food: open Add to Lunch', () => p.getByRole('button', { name: /^Add to Lunch/ }).first().click());
await act('food: type skyr', () => p.getByPlaceholder('Search foods and brands').fill('skyr'), 2200);
await act('food: type more (skyr van)', () => p.getByPlaceholder('Search foods and brands').fill('skyr van'), 2200);
await act('food: clear search', () => p.getByPlaceholder('Search foods and brands').fill(''), 1500);
await act('food: search skyr again', () => p.getByPlaceholder('Search foods and brands').fill('skyr'), 2200);
await act('food: open Skyr detail', () => p.getByText('Skyr, plain', { exact: true }).first().click(), 1400);
await act('food: change amount 200', () => p.getByRole('textbox', { name: 'Amount' }).fill('200'));
await act('food: add to meal', () => p.locator('.sheet-foot .btn.primary').click(), 2500);
await act('food: open entry', () => p.getByRole('button', { name: /Skyr, plain/ }).first().click());
await act('food: delete entry', () => p.getByRole('button', { name: 'Delete entry' }).click(), 2000);
await act('food: undo delete', () => p.getByRole('button', { name: 'Undo' }).last().click(), 2000);
await act('food: quick add sheet', async () => { await p.getByRole('button', { name: /^Add to Dinner/ }).first().click(); await wait(p, 900); await p.getByRole('button', { name: 'Quick add' }).first().click(); });
await act('food: close quick add', () => esc(2));
await act('food: water +', () => p.locator('[aria-label^="Add"]').filter({ hasText: /ml/ }).first().click(), 2000);

// Train
await act('tab: Train', () => tab('Train'), 1500);
await act('train: Library', () => p.locator('.tab-pane[data-active] .seg button').nth(1).click(), 1500);
await act('train: library search "row"', () => p.locator('.tab-pane[data-active] input').first().fill('row'), 1500);
await act('train: library clear', () => p.locator('.tab-pane[data-active] input').first().fill(''), 1500);
await act('train: History', () => p.locator('.tab-pane[data-active] .seg button').nth(2).click(), 1500);
await act('train: Plan', () => p.locator('.tab-pane[data-active] .seg button').nth(0).click(), 1500);
await act('train: open routine', () => p.getByRole('button', { name: /^Push/ }).first().click(), 1500);
await act('routine: move down', () => p.locator('.sheet').getByRole('button', { name: 'Move down' }).first().click());
await act('routine: remove exercise', () => p.locator('.sheet').getByRole('button', { name: 'Remove' }).last().click(), 1500);
await act('routine: undo?', () => p.getByRole('button', { name: 'Undo' }).last().click({ timeout: 1500 }), 1500);
await act('routine: close', () => esc(2));

// Workout (list view)
await act('tab: Today', () => tab('Today'), 1500);
await act('workout: start', () => p.getByRole('button', { name: /Start workout/ }).first().click(), 3500);
await act('workout: list view', async () => { const b2 = p.getByRole('button', { name: 'List view' }); if (await b2.isVisible().catch(() => false)) await b2.click(); }, 1500);
await act('workout: complete set', () => p.getByRole('button', { name: 'Complete set' }).first().click(), 1500);
await act('workout: add set', () => p.locator('.wk-list button').filter({ hasText: /^\s*Set\s*$/ }).first().click(), 1500);
await act('workout: add warm-up', () => p.locator('.wk-list button').filter({ hasText: /Warm-up/ }).first().click(), 1500);
await act('workout: set options', () => p.getByRole('button', { name: 'Set options' }).first().click(), 1200);
await act('workout: delete set', () => p.getByRole('button', { name: /Delete set|Delete/ }).last().click(), 2000);
await act('workout: undo delete set', () => p.getByRole('button', { name: 'Undo' }).last().click({ timeout: 1500 }), 2000);
await act('workout: type weight', () => p.getByLabel('Weight').nth(1).fill('70'));
await act('workout: exercise options', () => p.getByRole('button', { name: 'Exercise options' }).first().click(), 1200);
await act('workout: move exercise down', () => p.getByRole('button', { name: 'Move down' }).last().click(), 1500);
await act('workout: exercise options 2', () => p.getByRole('button', { name: 'Exercise options' }).first().click(), 1200);
await act('workout: remove exercise', () => p.getByRole('button', { name: /^Remove/ }).last().click(), 2000);
await act('workout: undo remove', () => p.getByRole('button', { name: 'Undo' }).last().click({ timeout: 1500 }), 2000);
await act('workout: add exercise picker', () => p.getByRole('button', { name: /Add exercise/ }).last().click(), 1500);
await act('picker: search curl', () => p.locator('.sheet input').first().fill('curl'), 1500);
await act('picker: choose first', () => p.locator('.sheet .li, .sheet [role=button]').filter({ hasText: /Curl/ }).first().click(), 1500);
await act('picker: shot', () => p.screenshot({ path: 'shots/pa-picker.png' }), 100);
await act('picker: confirm add', async () => { const c = p.getByRole('button', { name: /^Add( \d+)?$|^Add exercise/ }).last(); if (await c.isVisible().catch(() => false)) await c.click(); }, 2000);
await act('picker: close if open', async () => { if (await p.locator('.sheet').count()) await esc(); }, 800);
await act('workout: minimise', () => p.getByRole('button', { name: 'Minimise workout' }).click(), 1500);
await act('workout: resume', () => p.getByLabel('Resume workout').first().click(), 2000);
await act('workout: finish sheet', () => p.getByRole('button', { name: 'Finish', exact: true }).click(), 1500);
await act('workout: finish and save', () => p.getByRole('button', { name: /Finish and save/ }).click(), 4000);
await act('summary: done', () => p.getByRole('button', { name: 'Done', exact: true }).click(), 2000);

// Progress
await act('tab: Progress', () => tab('Progress'), 2000);
await act('progress: scroll', () => p.evaluate(() => document.querySelector('.tab-pane[data-active] .screen')?.scrollTo(0, 900)), 1500);
await act('progress: log weight', () => p.getByRole('button', { name: 'Log', exact: true }).first().click(), 1500);
await act('progress: close', () => esc());

// Settings
await act('settings: open', () => p.getByLabel('Settings').first().click().catch(async () => { await tab('Today'); await wait(p, 900); await p.getByLabel('Settings').first().click(); }), 1500);
await act('settings: Training', () => p.locator('.sheet').getByText('Training', { exact: true }).first().click(), 1500);
await act('settings: toggle first switch', () => p.locator('.sheet [role=switch]').first().click(), 1200);
await act('settings: toggle back', () => p.locator('.sheet [role=switch]').first().click(), 1200);
await act('settings: back', () => p.getByRole('button', { name: 'Back' }).first().click(), 1200);
await act('settings: Appearance', () => p.locator('.sheet').getByText('Appearance', { exact: true }).first().click(), 1500);
await act('settings: segmented', () => p.locator('.sheet .seg button').nth(1).click(), 1500);
await act('settings: segmented back', () => p.locator('.sheet .seg button').nth(0).click(), 1500);
await act('settings: close', () => esc(2));

await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
const pops = await p.evaluate(() => window.__pops);
fs.writeFileSync(out, JSON.stringify({ pops, fails }, null, 1));
const by = {}; for (const x of pops) (by[x.act] ??= []).push(x);
for (const [k, v] of Object.entries(by)) { console.log(`\n## ${k}`); for (const x of v.slice(0, 12)) console.log(` ${x.kind.padEnd(7)} ${x.size ?? x.by ?? ''} ${x.what}${x.kind === 'number' ? ` [${x.was} → ${x.now}]` : ''}`); if (v.length > 12) console.log(`  … ${v.length - 12} more`); }
console.log('\nFAILED STEPS', fails);
await b.close();
