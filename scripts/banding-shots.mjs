// Stills of the soft glows behind the sheets (Settings, Coach, Scan barcode) and Today, at the phone's size and pixel density
// (S26 Ultra: 1440 x 3120 = 384 x 832 at 3.75), to judge colour banding. usage:
// AVEN_GPU=1 PALETTE=aurora URL=http://127.0.0.1:4173/ node scripts/banding-shots.mjs out-dir [tag]
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import fs from 'node:fs';
const [out = 'shots/banding', tag = 'x'] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
const palette = process.env.PALETTE || 'aurora';
const { b, p } = await launch({ theme: process.env.THEME || 'dark', size: { width: 384, height: 832 }, dsf: Number(process.env.DSF || 3.75) });
await p.goto(process.env.URL || 'http://127.0.0.1:4173/'); await wait(p, 1500);
await skipOnboarding(p); await loadDemo(p); await wait(p, 800);
// his palette, picked the way he picks it
await p.getByLabel('Settings').first().click(); await wait(p, 900);
await p.locator('.sheet').getByText('Appearance', { exact: true }).first().click(); await wait(p, 1200);
await p.locator(`.pal-card`).filter({ hasText: new RegExp(`^${palette}`, 'i') }).first().click(); await wait(p, 600);
await p.locator('.sheet [aria-label=Back]').first().click(); await wait(p, 1200);
// the field drifts: hold it still at one moment so before and after match
const still = () => p.evaluate(() => { for (const a of document.getAnimations()) { const t = a.effect?.target; if (t && t.closest?.('.aurora, .aurora-lite')) { a.pause(); a.currentTime = 9000; } } });
const shot = async (name) => { await still(); await wait(p, 900); await p.screenshot({ path: `${out}/${palette}-${name}-${tag}.png`, timeout: 60000 }); };
await shot('settings');
await p.keyboard.press('Escape'); await wait(p, 1400);
await p.evaluate(() => document.querySelector('.screen')?.scrollTo?.(0, 0));
await shot('today');
await p.getByLabel('Coach').first().click(); await wait(p, 1800);
await shot('coach');
await p.keyboard.press('Escape'); await wait(p, 1400);
await p.locator('.tabbar').getByRole('button', { name: 'Food', exact: true }).click(); await wait(p, 1500);
await p.getByRole('button', { name: /^Add to / }).first().click(); await wait(p, 1200);
await p.getByRole('button', { name: 'Scan' }).first().click(); await wait(p, 2000);
await p.getByLabel('Barcode number').fill('5701234567890'); await p.locator('input:focus').blur().catch(() => {}); await wait(p, 600);
await shot('scan');
await b.close();
