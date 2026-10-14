// Real-speed film of tab switches with the colour field on, for checking that a switch never blacks out or flickers.
//   URL=http://127.0.0.1:5174/ AVEN_BG=classic AVEN_PALETTE=sunset NAME=new node scripts/film-switch.mjs
// → shots/film/<NAME>-<n>/ (60 frames a second of app time) + a brightness line per frame of the background (luma.json)
import fs from 'node:fs';
import { steady } from './film-steady.mjs';
import { skipOnboarding, loadDemo } from './lib.mjs';
const name = process.env.NAME || 'switch';
const s = await steady({ theme: 'dark', size: { width: 384, height: 832 }, dsf: Number(process.env.FILM_DSF || 2) });

await s.p.goto(process.env.URL || 'http://127.0.0.1:5174/'); await s.p.waitForTimeout(1200); await skipOnboarding(s.p); await loadDemo(s.p); await s.p.waitForTimeout(2500);

if (process.env.CSS) await s.p.addStyleTag({ content: process.env.CSS }); // e.g. hide the screens to see only the colour field
const tab = (t) => s.p.locator('.tabbar').getByRole('button', { name: t, exact: true }).click();
await tab('Train'); await s.advance(150);
const runs = [['Today', 90], ['Train', 90], ['Food', 90], ['Progress', 90]];
for (const [i, [t, n]] of runs.entries()) { await s.film(`${name}-${i}`, () => tab(t), n); await s.advance(60); }
// quick taps: three tabs inside a second
await s.film(`${name}-quick`, async () => { await tab('Today'); await s.p.waitForTimeout(250); await tab('Food'); await s.p.waitForTimeout(250); await tab('Train'); }, 120);
await s.close();
console.log('done', fs.readdirSync('shots/film').filter((d) => d.startsWith(name)).join(' '));
