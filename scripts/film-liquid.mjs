// Films the Food diary's first-food moment: the day's one empty card splitting into the four meal cards (and back when the
// last food is removed). Steady camera (film-steady.mjs). usage:
//   AVEN_GPU=1 AVEN_PALETTE=golden TAG=after node scripts/film-liquid.mjs [--light] [split] [merge]   (URL= another build)
// → shots/film/<TAG>-<palette>-split/ and -merge/
import { wait, skipOnboarding, loadDemo, applySettings } from './lib.mjs';
import { steady } from './film-steady.mjs';
const theme = process.argv.includes('--light') ? 'light' : 'dark';
const want = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const pal = process.env.AVEN_PALETTE || 'golden';
const s = await steady({ theme });
const { p } = s;
if (process.env.FILMDEBUG) { p.on('console', (m) => console.log('console', m.type(), m.text().slice(0, 200))); p.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 200))); }
await p.goto(process.env.URL || 'http://127.0.0.1:4173/'); await wait(p, 1500); await skipOnboarding(p); await loadDemo(p); await s.advance(60);
// an empty food day: no entries today, in the palette to film
await p.evaluate((pal) => {
  const orig = Storage.prototype.setItem; const raw = JSON.parse(localStorage.getItem('aven.v1'));
  raw.entries = raw.entries.filter((e) => e.date !== '2026-09-30'); raw.settings.palette = pal;
  orig.call(localStorage, 'aven.v1', JSON.stringify(raw));
  Storage.prototype.setItem = function (k, v) { if (String(k).startsWith('aven.v1')) return; return orig.call(this, k, v); };
}, pal);
await p.reload(); await s.advance(150);
await p.getByRole('button', { name: 'Food', exact: true }).first().click(); await s.advance(150);
await p.evaluate(() => { const sc = document.querySelector('.meals-empty').closest('.screen'); sc.scrollTop += document.querySelector('.meals-empty').getBoundingClientRect().top - 150; });
await s.advance(30);
await p.screenshot({ path: `shots/liquid-empty-${pal}.png` });
await p.getByLabel('Add to Lunch').first().click(); await s.advance(110);
await p.getByRole('dialog').last().getByLabel('Add').first().click().catch(() => {}); await s.advance(40);
await p.screenshot({ path: `shots/liquid-sheet-${pal}.png` });
const tag = `${process.env.TAG || 'x'}-${pal}`;
if (!want.length || want.includes('split')) await s.film(`${tag}-split`, async () => { await p.getByRole('button', { name: /^Done/ }).first().click(); }, Number(process.env.FRAMES || 100));
else { await p.getByRole('button', { name: /^Done/ }).first().click(); await s.advance(150); }
await s.advance(60);
if (!want.length || want.includes('merge')) {
  // Clear meal takes the one food out again: the meals flow back into one card
  await p.getByLabel('Meal options').first().click(); await s.advance(100);
  await s.film(`${tag}-merge`, async () => { await p.getByText('Clear meal', { exact: true }).first().click(); }, Number(process.env.FRAMES_MERGE || 130));
}
await s.close();
