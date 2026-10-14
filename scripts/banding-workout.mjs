// Shoots the live workout window (Focus view, like Omar's screenshot) at the phone's own pixel size, for banding checks.
// usage: AVEN_GPU=1 AVEN_PALETTE=champagne [URL=…] [CSS=file.css] node scripts/banding-workout.mjs out-dir tag
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import fs from 'node:fs';
const [out = 'shots/banding', tag = 'now'] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
const { b, p } = await launch({ theme: process.env.THEME || 'dark', size: { width: 384, height: 832 }, dsf: 3.75 });
await p.goto(process.env.URL || 'http://127.0.0.1:5173/'); await wait(p, 1500);
await skipOnboarding(p); await loadDemo(p); await wait(p, 1000);
await p.getByRole('button', { name: /Start workout/ }).first().tap(); await wait(p, 2200);
await p.getByRole('button', { name: 'Focus view' }).tap(); await wait(p, 3000);
if (process.env.CSS) { await p.addStyleTag({ content: fs.readFileSync(process.env.CSS, 'utf8') }); await wait(p, 900); }
// the breathing light held at one moment, so shots of two builds compare like for like
await p.evaluate(() => { for (const a of document.getAnimations()) { const t = a.effect?.target; if (t?.closest?.('.wk-breath')) { if (a instanceof CSSTransition) a.finish(); else { a.pause(); a.currentTime = 2750; } } } });
await wait(p, 300);
console.log('dither on:', await p.evaluate(() => [...document.querySelectorAll('[data-dith]')].map((e) => e.className).join(' | ') || 'none'));
const pal = (process.env.AVEN_PALETTE || "ember") + (process.env.THEME === "light" ? "-light" : "");
await p.screenshot({ path: `${out}/${pal}-workout-${tag}.png`, timeout: 60000 });
// the same moment with the CSS gradients back (what the phone showed before), for a like-for-like comparison
if (process.env.ALSO_CSS) {
  await p.evaluate(() => document.querySelectorAll('[data-dith]').forEach((e) => e.removeAttribute('data-dith'))); await wait(p, 600);
  await p.screenshot({ path: `${out}/${pal}-workout-css.png`, timeout: 60000 });
}
if (process.env.LIST) { await p.getByRole('button', { name: 'List view' }).tap(); await wait(p, 1800); await p.screenshot({ path: `${out}/${pal}-workoutlist-${tag}.png`, timeout: 60000 }); }
console.log('shot', pal, tag);
await b.close();
