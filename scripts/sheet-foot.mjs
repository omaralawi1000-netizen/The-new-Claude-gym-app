// Sheet bottom buttons with the keyboard up: the Add button floats over the form, which scrolls on under a soft frost.
// The keyboard is simulated (a fake navigator.virtualKeyboard reporting 360 px, about a Galaxy S26 Ultra's number pad).
// Usage: AVEN_GPU=1 node scripts/sheet-foot.mjs [out-dir]
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import fs from 'node:fs';
const out = process.argv[2] || 'shots/sheet-foot'; fs.mkdirSync(out, { recursive: true });
const { b, ctx, p, errors } = await launch({ theme: process.env.THEME || 'dark', size: { width: 384, height: 832 } });
await ctx.addInitScript(() => {
  const l = {}; const vk = { overlaysContent: false, boundingRect: { height: 0 }, addEventListener: (t, f) => { (l[t] ||= []).push(f); }, removeEventListener: () => {} };
  Object.defineProperty(navigator, 'virtualKeyboard', { value: vk });
  window.__setKb = (h) => { vk.boundingRect = { height: h }; (l.geometrychange || []).forEach((f) => f()); };
});
await p.goto('http://127.0.0.1:5173/'); await wait(p, 1200);
await skipOnboarding(p); await loadDemo(p); await wait(p, 3000);
await p.locator('.tabbar').getByRole('button', { name: 'Food', exact: true }).click(); await wait(p, 1000);
await p.getByRole('button', { name: 'Add to Dinner' }).first().click(); await wait(p, 1300);
await p.getByRole('button', { name: 'Quick add' }).first().click(); await wait(p, 1300);
await p.screenshot({ path: `${out}/1-quick-add.png` });
const info = () => p.evaluate(() => {
  const s = [...document.querySelectorAll('.sheet')].pop(), body = s.querySelector('.sheet-pane > .sheet-body'), foot = s.querySelector('.sheet-pane > .sheet-foot');
  const r = (e) => e && e.getBoundingClientRect();
  return { sheet: r(s).height | 0, bodyBottom: r(body).bottom | 0, footTop: r(foot).top | 0, footBottom: r(foot).bottom | 0, scroll: [body.scrollTop | 0, body.scrollHeight - body.clientHeight] };
});
console.log('rest', await info());
await p.evaluate(() => window.__setKb(360)); await wait(p, 200);
await p.locator(".sheet input").nth(1).focus(); await wait(p, 1200);
await p.evaluate(() => { const s = [...document.querySelectorAll(".sheet")].pop(); s.querySelector(".sheet-body").scrollTo(0, 0); }); await wait(p, 600);
await p.screenshot({ path: `${out}/2-keyboard.png` });
console.log('keyboard', await info());
await p.evaluate(() => { const s = [...document.querySelectorAll('.sheet')].pop(); s.querySelector('.sheet-body').scrollTo(0, 99999); }); await wait(p, 600);
await p.screenshot({ path: `${out}/3-keyboard-scrolled.png` });
console.log('scrolled', await info());
await p.evaluate(() => window.__setKb(0)); await p.evaluate(() => document.activeElement.blur()); await wait(p, 900);
await p.keyboard.press('Escape'); await wait(p, 700); await p.keyboard.press('Escape'); await wait(p, 900);
// a tall form: Personal food (create food) via the Train tab's routine editor instead, which is reachable without a search
await p.locator('.tabbar').getByRole('button', { name: 'Train', exact: true }).click(); await wait(p, 1000);
await p.getByRole('button', { name: /^Push 5/ }).first().click(); await wait(p, 1400);
await p.screenshot({ path: `${out}/4-routine.png` });
await p.evaluate(() => { const s = [...document.querySelectorAll('.sheet')].pop(); s.querySelector('.sheet-body').scrollTo(0, 400); }); await wait(p, 600);
await p.screenshot({ path: `${out}/5-routine-scrolled.png` });
await p.keyboard.press('Escape'); await wait(p, 900);
// the Coach: its message box is a sheet bottom too, and a long answer scrolls under it
await p.locator('.tabbar').getByRole('button', { name: 'Today', exact: true }).click(); await wait(p, 900);
const coach = p.getByRole('button', { name: /Coach/ }).first();
if (await coach.isVisible().catch(() => false)) { await coach.click(); await wait(p, 1500); await p.screenshot({ path: `${out}/6-coach.png` }); }
console.log('errors', errors.length);
await b.close();
