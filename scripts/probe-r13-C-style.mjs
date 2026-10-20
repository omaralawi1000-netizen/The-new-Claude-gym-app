// r13 audit (C): what one write costs the Coach in style recalculation, measured in the page (no throttle, 40 runs each,
// median ms of the forced style + layout), before and after a candidate CSS fix (rules removed from the live sheet via CSSOM).
// Writes tried: the sheet's inline transform (what Motion writes every frame of open/close/keyboard), --kb-room on the
// sheet, --grow-pad and --kb-now on the list, --foot-h on the sheet host, the typing bar's hidden measure.
// usage: URL=http://127.0.0.1:4183/ node scripts/probe-r13-C-style.mjs
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
process.env.AVEN_PALETTE ||= 'golden';
const { b, p } = await launch({ size: { width: 384, height: 832 }, dsf: 3.75 });
await p.goto(process.env.URL || 'http://127.0.0.1:4183/'); await wait(p, 1500);
await skipOnboarding(p); await loadDemo(p);
await p.evaluate((N) => { localStorage.setItem('aven.keys', JSON.stringify({ gemini: 'AIzaTESTKEY' })); localStorage.setItem('aven.coachNote', '1'); const old = Date.now() - 3 * 3600_000;
  localStorage.setItem('aven.coach', JSON.stringify(Array.from({ length: N }, (_, i) => [{ id: 'p' + i, role: 'user', text: 'Question ' + i + ' about my training and food today', at: old }, { id: 'q' + i, role: 'model', text: 'A longer answer about the training of the day, the food so far and **what to eat tonight** to close the protein gap.\n\n- Eat 40 g protein\n- Drink water', at: old }]).flat())); }, Number(process.env.N || 30));
await p.reload(); await wait(p, 2500);
await p.getByRole('button', { name: 'Coach', exact: true }).first().tap(); await wait(p, 9000); // (all older rows built)
const run = () => p.evaluate(() => {
  const q = (s) => document.querySelector(s);
  const sheet = [...document.querySelectorAll('.sheet')].pop(), body = q('.coach-body'), host = body.closest('.sheet-pane, .sheet-page') || sheet, m = q('.cf-measure');
  const probe = [...document.querySelectorAll('.coach-thread .said')][2]; // a row deep in the list
  const med = (f) => { const xs = []; for (let i = 0; i < 40; i++) { const t = performance.now(); f(i); probe.getBoundingClientRect(); getComputedStyle(probe).color; xs.push(performance.now() - t); } xs.sort((a, b) => a - b); return +xs[20].toFixed(2); };
  med(() => {}); // warm
  const tf = sheet.style.transform;
  const out = {
    nothing: med(() => {}),
    'sheet inline transform': med((i) => { sheet.style.transform = `translate3d(0, ${i % 2}px, 0)`; }),
    '--kb-room on sheet': med((i) => { sheet.style.setProperty('--kb-room', `${300 + (i % 2)}px`); }),
    '--grow-pad on list': med((i) => { body.style.setProperty('--grow-pad', `${i % 2}px`); }),
    '--kb-now on list': med((i) => { body.style.setProperty('--kb-now', `${i % 2}px`); }),
    '--foot-h on host': med((i) => { host.style.setProperty('--foot-h', `${90 + (i % 2)}px`); }),
    'bar measure (typing)': med((i) => { m.textContent = 'How is my week going so far' + 'x'.repeat(i % 3) + '​'; m.offsetHeight; }),
  };
  sheet.style.transform = tf; sheet.style.removeProperty('--kb-room'); body.style.removeProperty('--kb-now');
  out.elements = document.querySelectorAll('*').length; out.withStyleAttr = document.querySelectorAll('[style]').length;
  return out;
});
const before = await run();
// the candidate fix: the two rules whose left part is [style*=…] (styles.css ~2709 and ~2722), taken out of the live sheet
const removed = await p.evaluate(() => { let n = 0; for (const s of document.styleSheets) { let rules; try { rules = s.cssRules; } catch { continue; } for (let i = rules.length - 1; i >= 0; i--) { const t = rules[i].selectorText || ''; if (/\[style\*=[^\]]*\][^,{]*\s*>\s*span\[style/.test(t) || /button\.press\[style\*=/.test(t)) { s.deleteRule(i); n++; } } } return n; });
const after = await run();
// …and the :has() rules (styles.css ~772-780, 871-874, 1242-1243, 1551, 2744): their job would move to a class set once
const hasGone = await p.evaluate(() => { let n = 0; const walk = (list) => { for (let i = list.length - 1; i >= 0; i--) { const r = list[i]; if (r.cssRules && !r.selectorText) walk(r.cssRules); else if (/:has\(/.test(r.selectorText || '')) { (r.parentRule || r.parentStyleSheet).deleteRule(i); n++; } } }; for (const s of document.styleSheets) { try { walk(s.cssRules); } catch {} } return n; });
const after2 = await run();
// …and the three custom properties written on a container registered as not inherited (so a write restyles only that box;
// --kb-room/--foot-h would then be written on the list itself, their only reader, instead of on the sheet)
await p.addStyleTag({ content: ['--grow-pad', '--kb-room', '--foot-h'].map((n) => `@property ${n} { syntax: '<length>'; inherits: false; initial-value: 0px; }`).join('\n') });
const after3 = await run();
// a typed key, the whole of it: the field's value, React's input event, the bar's measure (as fit() does), in one forced frame
console.log('rules removed', removed, ':has rules removed', hasGone);
console.log('write'.padEnd(26), 'before ms', 'no [style*=]', 'and no :has', 'and vars not inherited');
for (const k of Object.keys(before)) console.log(k.padEnd(26), String(before[k]).padEnd(9), String(after[k]).padEnd(12), String(after2[k]).padEnd(12), after3[k]);
await b.close();
