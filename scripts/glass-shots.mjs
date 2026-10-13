// Before/after stills of the "Aven glass" material (html[data-glass="v2"]) on a few surfaces, at phone size.
// usage: AVEN_GPU=1 node scripts/glass-shots.mjs [--light] [out-dir]
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import fs from 'node:fs';
const theme = process.argv.includes('--light') ? 'light' : 'dark';
const out = process.argv.filter((a) => !a.startsWith('--')).slice(2)[0] || 'shots/glass'; fs.mkdirSync(out, { recursive: true });
const { b, p } = await launch({ theme, size: { width: 384, height: 832 } });
await p.goto(process.env.URL || 'http://127.0.0.1:5173/'); await wait(p, 1500);
await skipOnboarding(p); await loadDemo(p); await wait(p, 2000);
const both = async (name, clip) => {
  for (const v of ['before', 'after']) {
    await p.evaluate((on) => { if (on) document.documentElement.dataset.glass = 'v2'; else delete document.documentElement.dataset.glass; }, v === 'after');
    await wait(p, 500);
    await p.screenshot({ path: `${out}/${theme}-${name}-${v}.png`, clip, timeout: 30000 });
  }
};
const tab = (t) => p.locator('.tabbar').getByRole('button', { name: t, exact: true }).click();
await p.evaluate(() => document.querySelector('.screen')?.scrollTo?.(0, 0));
await both('today', { x: 0, y: 380, width: 384, height: 452 });
await tab('Train'); await wait(p, 1500);
await both('train', { x: 0, y: 60, width: 384, height: 389 });
await tab('Today'); await wait(p, 1200);
await p.getByRole('button', { name: /Start workout/ }).first().click(); await wait(p, 2200);
if (process.env.FULL) await p.screenshot({ path: `${out}/${theme}-workout-full.png` });
await both('workout', { x: 0, y: Number(process.env.WY || 330), width: 384, height: Number(process.env.WH || 300) });
await p.getByRole('dialog', { name: 'Active workout' }).getByRole('button', { name: /Add exercise/ }).last().click(); await wait(p, 1800);
await p.evaluate(() => { const s = [...document.querySelectorAll('.sheet')].pop(); s.querySelector('.sheet-body').scrollTo(0, 260); }); await wait(p, 500);
await both('picker-top', { x: 0, y: 20, width: 384, height: 300 });
await both('picker-bottom', { x: 0, y: 696, width: 384, height: 136 });
await p.locator('.sheet .sheet-body .list .li button.grow').nth(3).click(); await p.locator('.sheet .sheet-body .list .li button.grow').nth(4).click(); await wait(p, 400);
await both('picker-ready', { x: 0, y: 696, width: 384, height: 136 });
await b.close();
