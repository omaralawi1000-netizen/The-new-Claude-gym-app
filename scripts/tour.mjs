import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
const theme = process.argv[2] ?? 'dark';
const { b, p } = await launch({ theme });
await p.goto('http://127.0.0.1:5173/'); await wait(p, 1200);
await skipOnboarding(p);
await p.screenshot({ path: `shots/${theme}-today-empty.png` });
await loadDemo(p); await wait(p, 800);
await p.screenshot({ path: `shots/${theme}-today.png` });
await p.evaluate(() => document.querySelector('.screen').scrollTo(0, 700)); await wait(p, 400);
await p.screenshot({ path: `shots/${theme}-today-2.png` });
for (const [label, name] of [['Train', 'train'], ['Food', 'food'], ['Progress', 'progress']]) {
  await p.locator('.tabbar').getByText(label, { exact: true }).click(); await wait(p, 900);
  await p.screenshot({ path: `shots/${theme}-${name}.png` });
}
await b.close();
