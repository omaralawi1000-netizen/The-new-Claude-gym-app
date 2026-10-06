// Screenshots of the live workout at the S26 Ultra's width: fresh, after ticking two sets, scrolled to the end, and empty.
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import fs from 'node:fs';
const out = process.env.OUT || 'shots/workout'; fs.mkdirSync(out, { recursive: true });
const { b, p, errors } = await launch({ size: { width: 412, height: 915 } });
await p.goto('http://127.0.0.1:5173/'); await wait(p, 1200); await skipOnboarding(p); await loadDemo(p); await wait(p, 900);
await p.getByRole('button', { name: /Start workout/ }).first().click(); await wait(p, 2600);
await p.screenshot({ path: `${out}/1-fresh.png` });
const checks = p.locator('.wk-list [aria-label="Complete set"]');
await checks.nth(0).evaluate((el) => el.click()); await wait(p, 300);
await checks.nth(0).evaluate((el) => el.click()); await wait(p, 900);
await p.screenshot({ path: `${out}/2-ticked.png` });
await p.locator('.wk-list').evaluate((el) => { el.scrollTop = el.scrollHeight; }); await wait(p, 600);
await p.screenshot({ path: `${out}/3-end.png` });
await b.close();
// an empty workout, started from a rest day's +
process.env.AVEN_TODAY = '2026-09-29T18:00:00+02:00';
const two = await launch({ size: { width: 412, height: 915 } });
await two.p.goto('http://127.0.0.1:5173/'); await wait(two.p, 1200); await skipOnboarding(two.p); await loadDemo(two.p); await wait(two.p, 900);
await two.p.getByRole('button', { name: 'Empty session' }).first().click(); await wait(two.p, 2400);
await two.p.screenshot({ path: `${out}/4-empty.png` });
await two.b.close();
if (errors.length) console.log('errors', errors);
