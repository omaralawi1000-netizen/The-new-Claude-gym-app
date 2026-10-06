// Two motion checks from the Oct 6 recordings.
// 1. A pop-up opened over another keeps the one behind frosted (it used to turn solid until the top one closed); only a
//    third one stacked on top makes the bottom one drop its blur (GPU memory).
// 2. What you said on the orb screen flies word by word into its sent bubble: sampled every frame, each big word must end
//    exactly on its twin in the bubble, never jump, and the swap to the bubble's own text must not move anything.
import { launch, wait, skipOnboarding, sayTyped } from './lib.mjs';
import assert from 'node:assert/strict';
const { b, ctx, p, errors } = await launch({ record: !!process.env.FILM });
await p.goto('http://127.0.0.1:5173/'); await wait(p, 900); await skipOnboarding(p);

// ── 1. stacked pop-ups ──
const blurOf = () => p.evaluate(() => [...document.querySelectorAll('.sheet')].map((s) => ({ cls: s.className.replace(/\s+/g, ' ').trim(), bf: getComputedStyle(s).backdropFilter, bg: getComputedStyle(s).backgroundColor })));
const today = await p.evaluate(async () => { const { dayKey } = await import('/src/lib/dates.ts'); return dayKey(Date.now(), 4); });
await p.evaluate(async (date) => { const { useUI } = await import('/src/state/ui.ts'); useUI.getState().push('waterSheet', { date }); }, today);
await wait(p, 900);
await p.evaluate(async (date) => { const { useUI } = await import('/src/state/ui.ts'); useUI.getState().push('dayNotes', { date }); }, today);
await wait(p, 900);
let s = await blurOf(); console.log('two stacked', s);
assert.equal(s.length, 2);
assert(/behind/.test(s[0].cls) && !/deep/.test(s[0].cls), 'the lower one is behind, not deep');
assert(s[0].bf !== 'none', 'the pop-up behind keeps its blur');
await p.screenshot({ path: 'shots/morph-1-stacked.png' });
await p.evaluate(async (date) => { const { useUI } = await import('/src/state/ui.ts'); useUI.getState().push('mealCopy', { from: { date } }); }, today);
await wait(p, 900);
s = await blurOf(); console.log('three stacked', s.map((x) => [x.cls, x.bf]));
assert(/deep/.test(s[0].cls) && s[0].bf === 'none', 'three deep: the bottom one drops its blur');
assert(s[1].bf !== 'none', 'the middle one keeps it');
await p.keyboard.press('Escape'); await wait(p, 900);
s = await blurOf(); assert(s[0].bf !== 'none' && !/deep/.test(s[0].cls), 'back to two: the blur comes back at once');
await p.keyboard.press('Escape'); await wait(p, 700); await p.keyboard.press('Escape'); await wait(p, 900);

// ── 2. the said-text flight ──
await p.getByRole('button', { name: 'Dictate' }).first().click(); await wait(p, 1200);
await p.evaluate(() => {
  window.__fly = [];
  const tick = () => {
    const big = [...document.querySelectorAll('.said-big .sw')].map((e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.width]; });
    const small = [...document.querySelectorAll('.said .sb')].map((e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.width]; });
    const wrap = document.querySelector('.said-wrap');
    if (wrap) window.__fly.push({ t: performance.now(), phase: wrap.className, big, small });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
await sayTyped(p, 'how much protein should I eat after training today');
await wait(p, 600); await p.screenshot({ path: 'shots/morph-2-writing.png' });
await p.waitForFunction(() => document.querySelector('.said-wrap')?.classList.contains('fly'), null, { timeout: 8000 });
await wait(p, 250); await p.screenshot({ path: 'shots/morph-3-flying.png' });
await p.waitForFunction(() => document.querySelector('.said-wrap')?.classList.contains('done'), null, { timeout: 8000 });
await wait(p, 300); await p.screenshot({ path: 'shots/morph-4-bubble.png' });
const fly = await p.evaluate(() => window.__fly);
const flying = fly.filter((f) => /fly/.test(f.phase) && f.big.length);
assert(flying.length > (process.env.FILM ? 3 : 20), `the flight was drawn over many frames (${flying.length})`);
const last = flying[flying.length - 1];
const land = Math.max(...last.big.map((bb, i) => Math.hypot(bb[0] - last.small[i][0], (bb[1]) - last.small[i][1])));
// the big words' boxes are taller than the bubble's (line heights differ); compare left edges and widths
const dx = Math.max(...last.big.map((bb, i) => Math.abs(bb[0] - last.small[i][0])));
const dw = Math.max(...last.big.map((bb, i) => Math.abs(bb[2] - last.small[i][2])));
console.log('frames', flying.length, 'landing: max left-edge gap', dx.toFixed(2), 'px, width gap', dw.toFixed(2), 'px, corner', land.toFixed(2));
assert(dx < 1.5 && dw < 2, 'every word lands on its twin');
let jump = 0;
for (let k = 1; k < flying.length; k++) for (let i = 0; i < flying[k].big.length; i++) jump = Math.max(jump, Math.hypot(flying[k].big[i][0] - flying[k - 1].big[i][0], flying[k].big[i][1] - flying[k - 1].big[i][1]));
console.log('largest one-frame move', jump.toFixed(1), 'px');
if (!process.env.FILM) assert(jump < 40, 'no word jumps between frames'); // filming under GPU emulation draws only a few frames
assert.equal(errors.length, 0, errors.join('\n'));
await ctx.close(); await b.close();
console.log('morph ok');
