// The workout bar and the end of a rest: "Next" with the set's target, the bar filling while you rest, −15/+15/Skip on a tap,
// three ticks in the last three seconds, then the firm buzz and a green "Go" that stays until the next set is ticked — also
// while the workout is minimised (the pill says it). Vibration is recorded through a stub; sound can't be heard here.
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import assert from 'node:assert/strict';
const { b, p, errors } = await launch({});
await p.addInitScript(() => { window.__vib = []; navigator.vibrate = (x) => { window.__vib.push(x); return true; }; });
await p.goto('http://127.0.0.1:5173/'); await wait(p, 1200); await skipOnboarding(p); await loadDemo(p); await wait(p, 1200);
await p.getByRole('button', { name: /Start workout/ }).first().click(); await wait(p, 2500);
const bar = p.locator('.wk-bar');
const text = async () => (await bar.innerText()).replace(/\n/g, ' | ');
assert(await p.locator('.wk-bar.next').isVisible(), 'the bar shows what is next');
assert(/^Next · Set 1 · .*kg × \d+ \| \S/.test(await text()), `next set with its target: ${await text()}`);
assert(await p.locator('.wk-bar [data-orb-slot="workout"]').count() === 1, 'the orb lives in the bar');
await p.getByRole('button', { name: 'Complete set' }).first().click(); await wait(p, 900);
assert(await p.locator('.wk-bar.rest').isVisible(), 'resting');
await p.screenshot({ path: 'shots/rest-1-bar.png' });
await p.locator('.wk-bar-main').click(); await wait(p, 500);
assert(await p.getByRole('button', { name: 'Skip' }).isVisible(), 'tap → −15 / +15 / Skip');
const left = () => p.evaluate(() => { const x = localStorage.getItem('aven.v1.active'); const a = x ? JSON.parse(x).active : JSON.parse(localStorage.getItem('aven.v1')).active; return a?.rest ? a.rest.endsAt - Date.now() : null; });
const before = await left();
await p.getByRole('button', { name: '15 seconds less' }).click(); await wait(p, 200);
assert(Math.abs(before - 15000 - (await left())) < 1500, '−15 takes 15 s off');
let n = 0;
while ((await left()) > 20000 && n < 40) { if (!(await p.getByRole('button', { name: '15 seconds less' }).isVisible())) await p.locator('.wk-bar-main').click(); await p.getByRole('button', { name: '15 seconds less' }).click(); n++; await wait(p, 120); }
await p.evaluate(() => { window.__vib = []; });
await wait(p, (await left()) + 1500);
const vib = await p.evaluate(() => window.__vib);
// exactly the cue: nothing else buzzes at that moment (the orb used to "land" again when the bar re-rendered)
assert.deepEqual(vib, [24, 24, 24, [180, 90, 180, 90, 320]], `3-2-1 ticks, then the buzz, nothing else: ${JSON.stringify(vib)}`);
assert(await p.locator('.wk-bar.go').isVisible(), 'rest over: the bar is green');
assert(/^Rest over · Set 2 \| Go · /.test(await text()), `says what to do: ${await text()}`);
await p.screenshot({ path: 'shots/rest-2-go.png' });
await wait(p, 7000);
assert(await p.locator('.wk-bar.go').isVisible(), 'and stays green (no auto-clear)');
await p.getByRole('button', { name: 'Minimise workout' }).click(); await wait(p, 1200);
await p.locator('.tabbar').getByRole('button', { name: 'Food', exact: true }).click(); await wait(p, 900);
assert(/Rest over · Go/.test(await p.locator('button[aria-label="Resume workout"]').innerText()), 'the pill says it too');
await p.locator('button[aria-label="Resume workout"]').click(); await wait(p, 1500);
await p.getByRole('button', { name: 'Complete set' }).first().click(); await wait(p, 900);
assert(await p.locator('.wk-bar.rest').isVisible(), 'the next set starts the next rest');
// the next-set tap scrolls to that set and lets it glow
await p.locator('.wk-bar-main').click(); await wait(p, 300); await p.getByRole('button', { name: 'Skip' }).click(); await wait(p, 600);
assert(await p.locator('.wk-bar.next').isVisible(), 'skip → next');
await p.locator('.wk-bar-main').click(); await wait(p, 900);
assert(await p.locator('.wk-flash').count() === 1, 'jumped to the next set');
console.log('errors', errors.length);
assert.equal(errors.filter((e) => !/Failed to load resource/.test(e)).length, 0);
console.log('REST OK');
await b.close();
