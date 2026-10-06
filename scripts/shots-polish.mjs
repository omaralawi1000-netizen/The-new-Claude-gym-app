// Screenshots for the polish pass: Today on a rest day, the routine editor closed and open, at the S26 Ultra's width.
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import fs from 'node:fs';
const out = process.env.OUT || 'shots/polish'; fs.mkdirSync(out, { recursive: true });
process.env.AVEN_TODAY ||= '2026-10-06T06:37:00+02:00';
const { b, p, errors } = await launch({ size: { width: 412, height: 915 } });
await p.goto('http://127.0.0.1:5173/'); await wait(p, 1200); await skipOnboarding(p); await loadDemo(p); await wait(p, 1200);
await p.screenshot({ path: `${out}/today.png` });
await p.mouse.wheel(0, 500); await wait(p, 700); await p.screenshot({ path: `${out}/today-2.png` });
await p.locator('.tabbar button').nth(1).click(); await wait(p, 900);
await p.locator('.plinth button.grow').first().click(); await wait(p, 900);
await p.screenshot({ path: `${out}/routine.png` });
await p.locator('.sheet-body').evaluate((el) => { el.scrollTop = 220; }); await wait(p, 400);
await p.screenshot({ path: `${out}/routine-scrolled.png` });
await p.locator('.sheet [aria-expanded="false"]').nth(2).click(); await wait(p, 900);
await p.screenshot({ path: `${out}/routine-open.png` });
if (errors.length) console.log('errors', errors);
await b.close();
