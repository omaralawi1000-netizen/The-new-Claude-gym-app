import { launch, wait, skipOnboarding, loadDemo, sayTyped } from './lib.mjs';
import assert from 'node:assert/strict';
const { b, ctx, p, errors } = await launch({ record: process.argv.includes('--record') });
// the app keeps the running workout under its own key until the next full save (see store.ts): read it the way the app does
const state = () => p.evaluate(() => (() => { const d = JSON.parse(localStorage.getItem('aven.v1') || 'null'); const a = localStorage.getItem('aven.v1.active'); if (d && a) d.active = JSON.parse(a).active; return d; })());
await p.goto('http://127.0.0.1:5173/'); await wait(p, 1000);
await skipOnboarding(p); await loadDemo(p);
const nSessions = (await state()).sessions.length;
// A. delete the latest session → it becomes a "missed" planned workout
await p.locator('.tabbar').getByRole('button', { name: 'Train', exact: true }).click(); await wait(p, 600);
await p.getByRole('tab', { name: 'History' }).click(); await wait(p, 500);
await p.locator('.list .li').first().click(); await wait(p, 800);
await p.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).first().click(); await wait(p, 700);
assert.equal((await state()).sessions.length, nSessions - 1, 'session deleted');
await p.getByRole('button', { name: 'Undo' }).last().click(); await wait(p, 600);
assert.equal((await state()).sessions.length, nSessions, 'undo restores session');
await p.locator('.list .li').first().click(); await wait(p, 800);
await p.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).first().click(); await wait(p, 900);
await p.getByRole('tab', { name: 'Plan' }).click(); await wait(p, 600);
await p.screenshot({ path: 'shots/tr-1-missed.png' });
assert(await p.getByRole('button', { name: 'Reschedule' }).first().isVisible(), 'missed workout banner appears');
const before = (await state()).sessions.length;
await p.getByRole('button', { name: 'Reschedule' }).first().click(); await wait(p, 700);
await p.screenshot({ path: 'shots/tr-2-reschedule.png' });
await p.getByRole('button', { name: 'Do it today' }).click(); await wait(p, 800);
const s2 = await state();
assert.equal(s2.sessions.length, before, 'history untouched by reschedule');
assert(s2.schedule.overrides.some((o) => o.originDate) && s2.schedule.cleared.length > 0, 'override + cleared recorded');
await p.locator('.tabbar').getByRole('button', { name: 'Today', exact: true }).click(); await wait(p, 700);
assert(await p.getByText('Rescheduled').first().isVisible(), 'today shows rescheduled workout');
// B. active workout: add by search, superset, reorder, replace, pause/resume
await p.getByRole('button', { name: /Start (workout|again)/ }).click(); await wait(p, 1100);
await p.getByRole('button', { name: 'Add exercise' }).click(); await wait(p, 600);
await p.getByPlaceholder('Search exercises').fill('bench'); await wait(p, 400);
const pick = p.getByRole('dialog', { name: 'Exercises' });
await pick.getByText('Barbell Bench Press').first().click(); await pick.getByText('Dumbbell Bench Press').first().click();
await p.screenshot({ path: 'shots/tr-3-picker.png' });
await p.getByRole('button', { name: /Add 2 exercises/ }).click(); await wait(p, 900);
const names = async () => p.locator('section .display-sm').allInnerTexts();
console.log('exercises', (await names()).slice(-3));
// superset + move: open menu of the last-but-one
const menus = p.getByRole('button', { name: 'Exercise options' });
const count = await menus.count();
await menus.nth(count - 2).click(); await wait(p, 600);
await p.getByText('Superset with next').click(); await wait(p, 800);
assert(await p.getByText('Superset', { exact: true }).first().isVisible(), 'superset label');
await p.screenshot({ path: 'shots/tr-4-superset.png' });
// replace
await menus.nth(count - 1).click(); await wait(p, 500);
await p.getByText('Replace exercise').click(); await wait(p, 700);
await p.screenshot({ path: 'shots/tr-5-replace.png' });
assert(await p.getByText('Suggested substitutes').isVisible(), 'substitutes suggested');
await p.getByRole('dialog', { name: 'Exercises' }).getByText('Incline Dumbbell Press').first().click(); await wait(p, 900);
assert((await names()).includes('Incline Dumbbell Press'), 'replaced');
// pause / resume: clock stops
const t = async () => p.getByRole('dialog', { name: 'Active workout' }).locator('.wk-clock').first().innerText();
await p.getByRole('button', { name: 'Pause' }).click(); const t1 = await t(); await wait(p, 2200); const t2 = await t();
assert.equal(t1, t2, 'clock frozen while paused'); await p.getByRole('button', { name: 'Resume', exact: true }).click(); await wait(p, 1500);
assert.notEqual(await t(), t2, 'clock runs again');
// C. say the sets to the orb (typed here): logged into the running workout
await p.getByRole('button', { name: 'Dictate sets' }).click(); await wait(p, 1000);
await sayTyped(p, 'squat 100 kilos for 5, 5 and 5 then plank 60 seconds'); await wait(p, 2200);
await p.screenshot({ path: 'shots/tr-6-wreview.png' });
await wait(p, 2500); // the orb screen steps aside by itself after a quick log
assert.equal(await p.getByRole('dialog', { name: 'Dictation' }).count(), 0);
const act = (await state()).active;
const squat = act.exercises.find((e) => e.exerciseId === 'back-squat');
console.log('dictated sets', squat?.sets.map((x) => [x.weightKg, x.reps, x.done]));
assert.deepEqual(squat.sets.filter((x) => x.done).map((x) => [x.weightKg, x.reps]), [[100, 5], [100, 5], [100, 5]]);
const plank = act.exercises.find((e) => e.exerciseId === 'plank'); assert.equal(plank.sets.find((x) => x.done).durationSec, 60);
// D. custom exercise from picker
await p.getByRole('button', { name: 'Add exercise' }).click(); await wait(p, 500);
await p.getByPlaceholder('Search exercises').fill('zercher'); await wait(p, 400);
await p.getByRole('button', { name: 'Create exercise' }).click(); await wait(p, 600);
await p.getByRole('dialog', { name: 'Custom exercise' }).getByRole('button', { name: 'Quads', exact: true }).click();
await p.getByRole('button', { name: 'Save exercise' }).click(); await wait(p, 1000);
await p.getByRole('button', { name: /Add 1 exercise/ }).click(); await wait(p, 900);
await p.screenshot({ path: 'shots/tr-7-custom.png' });
const st = await state(); assert(st.exercises.some((e) => /zercher/i.test(e.name)), 'custom exercise saved');
// E. finish
await p.getByRole('button', { name: 'Finish', exact: true }).click(); await wait(p, 600);
await p.getByRole('button', { name: /Finish and save/ }).click(); await wait(p, 1400);
await p.screenshot({ path: 'shots/tr-8-summary.png' });
const fin = await state(); assert.equal(fin.active, null); assert.equal(fin.sessions.length, before + 1);
console.log('errors', errors.length);
await ctx.close(); await b.close();
