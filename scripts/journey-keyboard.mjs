// The keyboard is simulated: Chrome's navigator.virtualKeyboard is replaced by a fake that reports a 300 px keyboard.
// This proves the sheets make room for the reported height and let it go again — NOT how the real Android keyboard feels.
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
await p.getByLabel('Settings').click(); await wait(p, 1300); // sheets arrive calmly (~0.4 s to 95 %, settled by ~1 s)
const dlg = p.getByRole('dialog').last();
const bottom = async () => p.evaluate(() => { const d = [...document.querySelectorAll('[role=dialog]')].pop(); return Math.round(window.innerHeight - d.getBoundingClientRect().bottom); });
assert(Math.abs(await bottom()) <= 1, 'sheet rests on the bottom');
assert.equal(await p.evaluate(() => navigator.virtualKeyboard.overlaysContent), true, 'the app asks for an overlaying keyboard');
// The keyboard slides OVER sheets (nothing is resized while it moves): a full-height sheet stays exactly where it is, and its
// list gets the covered part as extra room at its end, so everything can still be scrolled up above the keyboard.
const top = async () => p.evaluate(() => Math.round([...document.querySelectorAll('[role=dialog]')].pop().getBoundingClientRect().top));
const top0 = await top();
await p.evaluate(() => window.__setKb(300)); await wait(p, 1000);
assert(Math.abs(await bottom()) <= 1 && Math.abs((await top()) - top0) <= 1, 'a full-height sheet stays put under the keyboard');
const room = await p.evaluate(() => [...document.querySelectorAll('.sheet')].pop().style.getPropertyValue('--kb-room'));
assert.equal(room, '300px', 'its list gets the covered part as room');
await p.evaluate(() => window.__setKb(0)); await wait(p, 1000);
assert(Math.abs(await bottom()) <= 1, 'sheet still on the bottom');
assert.equal(await p.evaluate(() => [...document.querySelectorAll('.sheet')].pop().style.getPropertyValue('--kb-room')), '', 'the room goes with the keyboard');
console.log('keyboard ok', errors);
assert.equal(errors.length, 0);
await b.close();
