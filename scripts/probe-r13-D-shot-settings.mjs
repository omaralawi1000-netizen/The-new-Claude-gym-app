// Probe (r13 D): screenshot of the Coach with Settings opened as its page (orb tap without a Groq key): is the orb left
// floating over Settings? usage: node scripts/probe-r13-D-shot-settings.mjs out.png
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
process.env.AVEN_PALETTE ??= 'golden';
const { b, p } = await launch({ size: { width: 384, height: 832 }, dsf: 2 });
await p.goto(process.env.URL || 'http://127.0.0.1:5184/'); await wait(p, 1500); await skipOnboarding(p); await loadDemo(p);
await p.evaluate(() => { localStorage.setItem('aven.keys', JSON.stringify({ gemini: 'AIzaTESTKEY' })); localStorage.setItem('aven.coachNote', '1'); });
await p.reload(); await wait(p, 2500);
await p.getByRole('button', { name: 'Coach', exact: true }).first().tap(); await wait(p, 1800);
await p.getByRole('dialog', { name: 'Coach' }).getByRole('button', { name: 'Speak' }).tap(); await wait(p, 2000);
const info = await p.evaluate(() => { const o = document.querySelector('.sphere-stage'); const r = o.getBoundingClientRect(); return { op: getComputedStyle(o).opacity, z: getComputedStyle(o).zIndex, r: [r.left, r.top, r.width, r.height], hit: document.elementFromPoint(20, 780)?.className }; });
console.log(JSON.stringify(info));
await p.screenshot({ path: process.argv[2] || '/tmp/claude-0/recD/settings.png' });
await b.close();
