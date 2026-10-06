// Today's cards: Up next (targets to beat), Muscles this week, Recent records, the week line — and Settings → Today, where the
// cards can be switched off and put in any order (the order is saved and survives a reload).
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import assert from 'node:assert/strict';
const { b, p, errors } = await launch({ size: { width: 384, height: 832 } });
await p.goto('http://127.0.0.1:5173/'); await wait(p, 900); await skipOnboarding(p); await loadDemo(p); await wait(p, 1200);
const home = () => p.locator('.screen').filter({ has: p.getByRole('button', { name: 'Customize Today' }) }).first();
const order = () => p.evaluate(() => {
  const s = [...document.querySelectorAll('.screen')].find((e) => e.offsetParent);
  return [...s.querySelectorAll('.tc-card, .tc-week, .wt')].map((c) => (c.getAttribute('aria-label') || c.querySelector('.micro')?.textContent || '').replace(/ for .*/, ''));
});
const first = await order();
console.log('cards', first);
assert.deepEqual(first, ['Targets', 'Week', 'Muscles this week', 'Recent records', 'Weight'], 'the default order');
assert(first.includes('Muscles this week') && first.includes('Recent records'), 'the new cards show');
const up = home().locator('.tc-card').first();
assert(/kg × \d+/.test(await up.textContent()), 'Up next lists weight × reps to beat');
assert(/of \d+ workouts/.test(await home().textContent()), 'the week line says how the week is going');
assert(!/301 kg/.test(await home().textContent()), 'a set-volume record is shown as the set, not as a weight');
// the Coach's pin: what it noticed, with "Not now" and ✕
const pin = home().locator('.pin');
assert.equal(await pin.count(), 1, 'the Coach pins what it noticed');
await pin.locator('.pin-head').click(); await wait(p, 700);
const items = await pin.locator('.pin-item .pin-t').allTextContents();
console.log('pinned', items);
assert(items.some((x) => /has stalled/.test(x)), 'a stalled lift is pinned');
assert(!items.some((x) => /backup/i.test(x)), 'no backup nag for demo data');
await pin.locator('.pin-item').first().getByRole('button', { name: 'Not now' }).click(); await wait(p, 600);
assert.equal(await pin.locator('.pin-item').count(), items.length - 1, '"Not now" sets it aside');
await p.screenshot({ path: 'shots/today-pin.png' });

// Customize: move Up next down one, switch Muscles off
await p.evaluate(() => { const s = [...document.querySelectorAll('.screen')].find((e) => e.offsetParent); s.scrollTop = 99999; }); await wait(p, 300);
await p.getByRole('button', { name: 'Customize Today' }).click(); await wait(p, 1000);
await p.locator('.today-card-row').first().getByRole('button', { name: 'Move down' }).evaluate((el) => el.click()); await wait(p, 300);
await p.getByRole('switch', { name: 'Muscles this week' }).click(); await wait(p, 300);
await p.keyboard.press('Escape'); await wait(p, 800);
const after = await order();
console.log('after', after);
assert(!after.includes('Muscles this week'), 'switched off: gone');
assert.deepEqual(after, ['Week', 'Targets', 'Recent records', 'Weight'], 'Up next moved below the week');
await p.reload(); await wait(p, 1500);
const reloaded = await order();
assert.deepEqual(reloaded, after, 'the order is kept after a reload');
await p.screenshot({ path: 'shots/today-cards.png' });
assert.equal(errors.length, 0, errors.join('\n'));
await b.close();
console.log('TODAY OK');
