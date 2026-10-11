// Rapid taps must never leave a stuck screen, a second colour field or a closed gate.
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import assert from 'node:assert/strict';
const { b, p, errors } = await launch({ reduced: !!process.env.REDUCED });
await p.goto('http://127.0.0.1:5173/'); await wait(p, 900); await skipOnboarding(p); await loadDemo(p); await wait(p, 1200);
const seq = ['Train', 'Food', 'Progress', 'Train', 'Today', 'Food', 'Food', 'Progress', 'Today'];
for (const n of seq) { await p.getByRole('button', { name: n, exact: true }).first().click(); await p.waitForTimeout(70); }
await wait(p, 2200);
const st = await p.evaluate(() => ({ panes: [...document.querySelectorAll('.tab-pane')].filter((e) => getComputedStyle(e).visibility !== 'hidden').map((e) => [e.dataset.hue, getComputedStyle(e).opacity, e.hasAttribute('data-active')]), fields: [...document.querySelectorAll('.aurora')].filter((e) => e.style.display !== 'none').map((e) => [e.dataset.hue, getComputedStyle(e).opacity]), app: document.querySelector('.app').dataset.hue }));
console.log(JSON.stringify(st));
assert.equal(st.panes.length, 1, 'one screen visible'); assert.equal(st.panes[0][0], 'today'); assert.equal(st.panes[0][1], '1'); assert.ok(st.panes[0][2], 'it is the active one');
assert.equal(st.fields.filter((f) => f[1] !== '0').length, 1, 'one colour field showing'); assert.equal(st.fields[0][1], '1');
// reduced motion: same end state
await b.close(); console.log('ok', errors.length ? errors : '');
