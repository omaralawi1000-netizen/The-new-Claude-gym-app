// Polish audit, part 2: the screens part 1 (audit-polish.mjs) doesn't walk: onboarding step by step, Progress, every
// Settings page and the Look page, the finish sheet and the workout summary. Same probe, 4x CPU.
// Usage: node scripts/audit-polish2.mjs [dark|light] [out.json]
import { launch, wait, loadDemo } from './lib.mjs';
import { PROBE } from './pop-probe.mjs';
import fs from 'node:fs';
const theme = process.argv[2] || 'dark';
const out = process.argv[3] || `shots/polish-audit2-${theme}.json`;
const { b, ctx, p } = await launch({ size: { width: 384, height: 832 }, theme });
await ctx.addInitScript(PROBE);
p.setDefaultTimeout(4000);
const cdp = await ctx.newCDPSession(p);
const tab = (t) => p.locator('.tabbar').getByRole('button', { name: t, exact: true }).click();
const esc = async (k = 1) => { for (let i = 0; i < k; i++) { await p.keyboard.press('Escape'); await wait(p, 800); } };
const fails = [];
const act = async (label, fn, settle = 1100) => {
  await p.evaluate((l) => { window.__act = l; }, label);
  try { await fn(); } catch (e) { fails.push(`${label}: ${String(e.message).split('\n')[0]}`); }
  await wait(p, settle);
};
await p.goto('http://127.0.0.1:5173/'); await wait(p, 1500);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

// Onboarding, step by step: fill what's asked, pick the first choice, Continue (or Skip when Continue isn't offered)
for (let i = 0; i < 12; i++) {
  if (await p.getByText('Skip all').count() === 0) break;
  const step = (await p.locator('h1, h2').first().innerText().catch(() => `step ${i}`)).trim().slice(0, 40);
  await act(`onboarding ${i}: fill (${step})`, async () => {
    const inp = p.locator('input[type=text]:visible, input:not([type]):visible').first();
    if (await inp.count() && !(await inp.inputValue())) await inp.fill('Omar');
    const chip = p.locator('.onb [aria-pressed=false]:visible, .chip:visible').first();
    if (await chip.count()) await chip.click({ timeout: 1000 }).catch(() => {});
  }, 700);
  await act(`onboarding ${i}: next (${step})`, async () => {
    const c = p.getByRole('button', { name: /^(Continue|Start|Create a starter plan)$/ }).last();
    if (await c.isVisible().catch(() => false) && await c.isEnabled()) await c.click(); else await p.getByRole('button', { name: 'Skip', exact: true }).last().click();
  }, 1500);
}
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
await act('settings: load demo', async () => { await esc(2); await tab('Today'); await wait(p, 1200); await loadDemo(p); }, 4000);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

// Progress
await act('tab: Progress', () => tab('Progress'), 2000);
const ranges = p.locator('.tab-pane[data-active] .seg button');
for (let i = 0; i < Math.min(4, await ranges.count()); i++) await act(`progress: range ${i}`, () => ranges.nth(i).click(), 1500);
await act('progress: scroll down', () => p.evaluate(() => document.querySelector('.tab-pane[data-active] .screen')?.scrollTo({ top: 1400 })), 1500);
await act('progress: open first row', () => p.locator('.tab-pane[data-active] .li.press, .tab-pane[data-active] button.li').first().click(), 1500);
await act('progress: close', () => esc());
await act('progress: scroll up', () => p.evaluate(() => document.querySelector('.tab-pane[data-active] .screen')?.scrollTo({ top: 0 })), 1000);

// Settings: every page, in and back
await act('tab: Today', () => tab('Today'), 1500);
await act('settings: open', () => p.getByLabel('Settings').first().click(), 1500);
const pages = ['Targets', 'Training', 'Food & water', 'Units & locale', 'Appearance', 'Today', 'Voice & AI', 'Coach memory', 'Reminders', 'Data & backup', 'Privacy', 'About Aven'];
for (const pg of pages) {
  await act(`settings: open ${pg}`, () => p.locator('.sheet').getByText(pg, { exact: true }).first().click(), 1400);
  if (pg === 'Appearance') {
    const segs = p.locator('.sheet .seg');
    await act('look: glow Soft', () => segs.nth(0).locator('button').nth(1).click(), 1400);
    await act('look: glow Off', () => segs.nth(0).locator('button').nth(2).click(), 1400);
    await act('look: glow Full', () => segs.nth(0).locator('button').nth(0).click(), 1400);
    await act(`look: theme ${theme === 'dark' ? 'Light' : 'Dark'}`, () => segs.nth(1).locator('button').nth(theme === 'dark' ? 1 : 2).click(), 1800);
    await act('look: theme back', () => segs.nth(1).locator('button').nth(theme === 'dark' ? 2 : 1).click(), 1800);
    await act('look: motion Reduced', () => segs.nth(2).locator('button').nth(2).click(), 1400);
    await act('look: motion System', () => segs.nth(2).locator('button').nth(0).click(), 1400);
  }
  if (pg === 'Training') {
    await act('training: effort RPE', () => p.locator('.sheet .seg').first().locator('button').nth(1).click(), 1200);
    await act('training: effort Off', () => p.locator('.sheet .seg').first().locator('button').nth(0).click(), 1200);
  }
  await act(`settings: back from ${pg}`, () => p.getByRole('button', { name: 'Back' }).first().click(), 1300);
}
await act('settings: close', () => esc(2));

// A workout to the finish sheet and the summary
await act('workout: start', () => p.getByRole('button', { name: /Start workout/ }).first().click(), 3500);
await act('workout: list view', async () => { const b2 = p.getByRole('button', { name: 'List view' }); if (await b2.isVisible().catch(() => false)) await b2.click(); }, 1500);
await act('workout: complete set', () => p.getByRole('button', { name: 'Complete set' }).first().click(), 1800);
await act('workout: complete set 2', () => p.getByRole('button', { name: 'Complete set' }).first().click(), 1800);
await act('finish: open sheet', () => p.getByRole('button', { name: 'Finish', exact: true }).click(), 1800);
await act('finish: shot', () => p.screenshot({ path: `shots/pa2-finish-${theme}.png` }), 100);
await act('finish: save', () => p.getByRole('button', { name: /Finish and save/ }).click(), 4500);
await act('summary: shot', () => p.screenshot({ path: `shots/pa2-summary-${theme}.png` }), 100);
await act('summary: scroll', () => p.evaluate(() => { const s = document.querySelector('.sheet .sheet-body') ?? document.querySelector('.sheet'); s?.scrollTo({ top: 900 }); }), 1500);
await act('summary: done', () => p.getByRole('button', { name: 'Done', exact: true }).click(), 2500);

await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
const pops = await p.evaluate(() => window.__pops);
fs.writeFileSync(out, JSON.stringify({ pops, fails }, null, 1));
const by = {}; for (const x of pops) (by[x.act] ??= []).push(x);
for (const [k, v] of Object.entries(by)) { console.log(`\n## ${k}`); for (const x of v.slice(0, 10)) console.log(` ${x.kind.padEnd(7)} ${x.size ?? x.by ?? ''} ${x.what}${x.kind === 'number' ? ` [${x.was} → ${x.now}]` : ''}`); if (v.length > 10) console.log(`  … ${v.length - 10} more`); }
console.log('\nFAILED STEPS', fails);
await b.close();
