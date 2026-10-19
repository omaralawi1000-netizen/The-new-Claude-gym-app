// Probe (r13 B): while the Coach adds the older saved messages above what you see (after opening, and after a scroll comes to
// rest), does what you see stay exactly still? Logs every frame the on-screen top of the newest message and of the
// suggestions, plus scrollTop and when rows were added. A move of a fraction of a pixel per added row is a shimmer.
// usage: URL=http://127.0.0.1:4182/ node scripts/probe-r13-B-rows.mjs
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
const { b, ctx, p } = await launch({ size: { width: 384, height: 832 }, dsf: Number(process.env.DSF || 3.75) });
await p.goto(process.env.URL || 'http://127.0.0.1:4182/'); await wait(p, 1500);
await skipOnboarding(p); await loadDemo(p);
await p.evaluate((n) => {
  localStorage.setItem('aven.keys', JSON.stringify({ gemini: 'AIzaTESTKEY' })); localStorage.setItem('aven.coachNote', '1');
  const old = Date.now() - 3 * 3600_000;
  const pre = Array.from({ length: n }, (_, i) => [{ id: 'p' + i, role: 'user', text: 'Question ' + i + ' about my training and food today', at: old }, { id: 'q' + i, role: 'model', text: 'A longer answer about the training of the day, the food so far and what to eat tonight to close the protein gap. '.repeat(1 + (i % 2)), at: old }]).flat();
  localStorage.setItem('aven.coach', JSON.stringify([...pre, { id: 's1', role: 'user', text: 'Yo', at: old }, { id: 's2', role: 'model', text: 'Yo! What\'s on your mind?', at: old }]));
}, Number(process.env.SEED || 14));
await p.reload(); await wait(p, 2500);
await p.evaluate(() => {
  window.__log = []; const t0 = performance.now();
  const loop = () => {
    const body = document.querySelector('.coach-body'), th = document.querySelector('.coach-thread'), s2 = document.querySelector('[data-mid="s2"]'), sh = document.querySelector('.sheet');
    if (body && s2) window.__log.push({ t: Math.round(performance.now() - t0), top: s2.getBoundingClientRect().top, sheet: sh.getBoundingClientRect().top, st: body.scrollTop, rows: th.children.length, shH: body.scrollHeight, thH: th.getBoundingClientRect().height });
    if (performance.now() - t0 < 6000) requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
});
await p.getByRole('button', { name: 'Coach', exact: true }).first().tap({ force: true });
await wait(p, 6500);
const log = await p.evaluate(() => window.__log);
let prev = null; if (process.env.ALL) for (const r of log) if (r.t > 0) console.log(r.t, (r.top - r.sheet).toFixed(3), r.st, r.shH, r.thH.toFixed(3), r.sheet.toFixed(2));
for (const r of log) {
  if (prev && prev.rows !== r.rows) console.log(`t=${r.t} rows ${prev.rows}->${r.rows}  msg top ${prev.top.toFixed(3)} -> ${r.top.toFixed(3)} (sheet ${prev.sheet.toFixed(2)} -> ${r.sheet.toFixed(2)}; on screen vs sheet ${(r.top - r.sheet - (prev.top - prev.sheet)).toFixed(3)} px)  scrollTop ${prev.st} -> ${r.st}  scrollHeight ${prev.shH}->${r.shH} thread h ${prev.thH.toFixed(3)}->${r.thH.toFixed(3)}`);
  prev = r;
}
const settled = log.filter((r) => r.t > 1500);
const rel = settled.map((r) => r.top - r.sheet);
console.log('after the sheet landed: message top relative to sheet ranges', Math.min(...rel).toFixed(3), '..', Math.max(...rel).toFixed(3), 'over', settled.length, 'frames; distinct', [...new Set(rel.map((x) => x.toFixed(3)))].slice(0, 12).join(' '));
await b.close();
