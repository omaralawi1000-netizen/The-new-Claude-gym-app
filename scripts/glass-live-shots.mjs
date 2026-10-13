// Stills of the glass in "live" states (a meal logged, a workout running and minimised) at phone size, for before/after
// comparisons between two builds. usage: AVEN_GPU=1 URL=http://127.0.0.1:5173/ node scripts/glass-live-shots.mjs [--light] out-prefix
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import fs from 'node:fs';
import path from 'node:path';
const theme = process.argv.includes('--light') ? 'light' : 'dark';
const out = process.argv.filter((a) => !a.startsWith('--')).slice(2)[0] || 'shots/live/x'; fs.mkdirSync(path.dirname(out), { recursive: true });
const { b, p } = await launch({ theme, size: { width: 384, height: 832 } });
p.setDefaultTimeout(8000);
await p.goto(process.env.URL || 'http://127.0.0.1:5173/'); await wait(p, 1500);
await skipOnboarding(p); await loadDemo(p); await wait(p, 2000);
const tab = (t) => p.locator('.tabbar').getByRole('button', { name: t, exact: true }).click();
const top = () => p.evaluate(() => document.querySelectorAll('.screen, .tab-pane').forEach((e) => e.scrollTo?.(0, 0)));
const shot = (n) => p.screenshot({ path: `${out}-${theme}-${n}.png`, timeout: 30000 });
// log two foods from Today's quick chips, so one meal has food in it
for (const c of await p.locator('.chips .chip').all().then((a) => a.slice(0, 2))) { await c.click(); await wait(p, 900); }
await wait(p, 5000); // let the Undo toast go
await p.getByRole('button', { name: /Start workout/ }).first().click(); await wait(p, 2400);
await p.getByRole('button', { name: 'Minimise workout' }).click(); await wait(p, 1800);
await top(); await wait(p, 4500); await shot('today');
await tab('Food'); await wait(p, 1600); await p.evaluate(() => { const m = document.querySelector('.meal.live') || [...document.querySelectorAll('.meal')].find((x) => !/nothing logged/i.test(x.textContent)); m?.scrollIntoView({ block: 'center' }); }); await wait(p, 900); await shot('food');
await tab('Train'); await wait(p, 1600); await top(); await wait(p, 600); await shot('train');
await p.locator('[data-wk="pill"]').first().locator('xpath=..').click(); await wait(p, 2400);
const card = () => { const c = document.querySelector('.wk-set.current'); return c?.closest('.plinth') || c?.parentElement?.parentElement; };
await p.evaluate(`(${card})()?.scrollIntoView({ block: 'center', behavior: 'instant' })`).catch(() => {}); await wait(p, 900);
const box = await p.evaluate(`(() => { const r = (${card})()?.getBoundingClientRect(); return r ? { y: r.y, height: r.height } : null; })()`).catch(() => null);
await p.screenshot({ path: `${out}-${theme}-workout.png`, clip: box ? { x: 0, y: Math.max(0, box.y - 10), width: 384, height: Math.min(400, box.height + 20) } : undefined, timeout: 30000 });
await b.close();
