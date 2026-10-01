// The keyboard is simulated: Chrome's navigator.virtualKeyboard is replaced by a fake that reports a 300 px keyboard.
// This proves the sheets follow the reported height with a spring and come back down — NOT how the real Android keyboard feels.
import { launch, wait, skipOnboarding } from './lib.mjs';
import assert from 'node:assert/strict';
const { b, ctx, p, errors } = await launch({});
await ctx.addInitScript(() => {
  const l = {}; const vk = { overlaysContent: false, boundingRect: { height: 0 }, addEventListener: (t, f) => { (l[t] ||= []).push(f); }, removeEventListener: () => {} };
  Object.defineProperty(navigator, 'virtualKeyboard', { value: vk });
  window.__setKb = (h) => { vk.boundingRect = { height: h }; (l.geometrychange || []).forEach((f) => f()); };
});
await p.goto('http://127.0.0.1:5173/'); await wait(p, 900);
await skipOnboarding(p);
await p.getByLabel('Settings').click(); await wait(p, 700);
const dlg = p.getByRole('dialog').last();
const bottom = async () => p.evaluate(() => { const d = [...document.querySelectorAll('[role=dialog]')].pop(); return Math.round(window.innerHeight - d.getBoundingClientRect().bottom); });
assert.equal(await bottom(), 0, 'sheet rests on the bottom');
assert.equal(await p.evaluate(() => navigator.virtualKeyboard.overlaysContent), true, 'the app asks for an overlaying keyboard');
await p.evaluate(() => window.__setKb(300)); await wait(p, 800);
const up = await bottom(); assert(Math.abs(up - 300) <= 2, `sheet lifts to the keyboard (${up})`);
await p.evaluate(() => window.__setKb(0)); await wait(p, 800);
assert.equal(await bottom(), 0, 'sheet comes back down');
console.log('keyboard ok', errors);
assert.equal(errors.length, 0);
await b.close();
