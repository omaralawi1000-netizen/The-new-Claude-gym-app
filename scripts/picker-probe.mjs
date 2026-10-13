// The Add exercises sheet: its bottom (Create custom exercise + the Add button), the list length over time, and the switch to
// Create custom exercise and back, filmed frame by frame.
// usage: AVEN_GPU=1 node scripts/picker-probe.mjs [--light] [--film] [out-dir]
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import { filmer } from './film-act.mjs';
import fs from 'node:fs';
const theme = process.argv.includes('--light') ? 'light' : 'dark';
const doFilm = process.argv.includes('--film');
const out = process.argv.filter((a) => !a.startsWith('--')).slice(2)[0] || 'shots/picker'; fs.mkdirSync(out, { recursive: true });
const { b, ctx, p, errors } = await launch({ theme, size: { width: 384, height: 832 } });
const film = await filmer(ctx, p);
await p.goto(process.env.URL || 'http://127.0.0.1:5173/'); await wait(p, 1500);
await skipOnboarding(p); await loadDemo(p); await wait(p, 1500);
await p.getByRole('button', { name: /Start workout/ }).first().click(); await wait(p, 2200);
const dlg = p.getByRole('dialog', { name: 'Active workout' });
await dlg.getByRole('button', { name: /Add exercise/ }).last().click(); await wait(p, 300);
const rows = [];
for (let i = 0; i < 12; i++) { rows.push(await p.evaluate(() => document.querySelectorAll('.sheet .sheet-body > .list > .li').length)); await wait(p, 200); }
console.log('rows over 2.4 s', rows.join(' '));
const info = () => p.evaluate(() => {
  const s = [...document.querySelectorAll('.sheet')].pop(), body = s.querySelector('.sheet-body'), foot = s.querySelector('.sheet-foot');
  const create = s.querySelector('.picker-create');
  const r = (e) => e && e.getBoundingClientRect();
  return { footTop: r(foot)?.top | 0, createTop: r(create)?.top | 0, scroll: [body.scrollTop | 0, body.scrollHeight - body.clientHeight], footH: getComputedStyle(body).getPropertyValue('--foot-h'), padB: getComputedStyle(body).paddingBottom };
});
await p.screenshot({ path: `${out}/${theme}-1-picker.png` });
await p.evaluate(() => { const s = [...document.querySelectorAll('.sheet')].pop(); s.querySelector('.sheet-body').scrollTo(0, 99999); }); await wait(p, 120);
console.log('end', await info());
await p.screenshot({ path: `${out}/${theme}-2-end.png` });
await wait(p, 900);
console.log('end later', await info());
await p.screenshot({ path: `${out}/${theme}-3-end-later.png` });
// scroll so a row sits under the foot, to see whether the foot button frosts it
await p.evaluate(() => { const s = [...document.querySelectorAll('.sheet')].pop(); s.querySelector('.sheet-body').scrollTo(0, 300); }); await wait(p, 600);
await p.screenshot({ path: `${out}/${theme}-4-mid.png` });
const create = () => p.locator('.sheet .picker-create').last();
await p.evaluate(() => { const s = [...document.querySelectorAll('.sheet')].pop(); s.querySelector('.sheet-body').scrollTo(0, 0); }); await wait(p, 400);
if (doFilm) {
  await film(`${theme}-picker-to-create`, () => create().click(), 900, { every: 1, cols: 10 });
  await p.evaluate(() => { const s = [...document.querySelectorAll('.sheet')].pop(); s.querySelector('.sheet-pane .sheet-body').scrollTo(0, 900); }); await wait(p, 300);
  await film(`${theme}-create-to-picker`, () => p.locator('.sheet-head button[aria-label="Back"]').last().click(), 900, { every: 1, cols: 10 });
} else {
  await create().click(); await wait(p, 1200);
  await p.screenshot({ path: `${out}/${theme}-5-create.png` });
  await p.locator('.sheet-head button[aria-label="Back"]').last().click(); await wait(p, 1200);
}
await p.screenshot({ path: `${out}/${theme}-6-back.png` });
console.log('errors', errors.length);
await b.close();
