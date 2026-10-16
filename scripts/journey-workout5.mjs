// Coach 2.0, phase 5, part 1, in the real app (no AI needed: it is all the app's own numbers): a tired check-in makes the
// next planned workout open with a briefing (targets, "You look tired today", one set less per lift with Undo); the first
// ticked set folds it away; reopened mid-workout it stays away; the finish screen shows Next time and a one-tap check-in.
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import assert from 'node:assert/strict';
const { b, p, errors } = await launch({});
const data = () => p.evaluate(() => JSON.parse(localStorage.getItem('aven.v1') || '{}'));

await p.goto('http://127.0.0.1:5173/'); await wait(p, 900); await skipOnboarding(p); await loadDemo(p);
// the last workout's check-in said: low energy, poor sleep (and it was yesterday)
await p.evaluate(async () => {
  const { useStore } = await import('/src/state/store.ts');
  const st = useStore.getState();
  const done = st.sessions.filter((s) => s.status === 'done');
  const last = done[done.length - 1];
  const y = new Date(Date.now() - 86400000);
  const date = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
  st.mutateSession(last.id, (x) => ({ ...x, date, checkin: { energy: 1, sleep: 1, at: Date.now() - 86400000 } }));
  localStorage.removeItem('aven.briefHidden');
});
await p.reload(); await wait(p, 1400);

// ── before: the briefing ──
await p.getByRole('button', { name: /Start workout/ }).click(); await wait(p, 1400);
const brief = p.locator('.wk-brief');
assert(await brief.isVisible(), 'the briefing opens the planned workout');
assert(await brief.locator('.wk-brief-row').count() >= 1, 'with today’s targets');
assert(await brief.getByText('You look tired today').isVisible(), 'tired, from the check-in');
assert(await brief.getByText(/Poor sleep · Low energy last time/).isVisible(), 'and why');
await p.screenshot({ path: 'shots/workout5-1-brief.png' });
const sets = async () => (await data()).active.exercises.reduce((n, e) => n + e.sets.length, 0);
const n0 = await sets();
await brief.getByRole('button', { name: 'One set less per lift' }).click(); await wait(p, 700);
const n1 = await sets();
assert(n1 < n0, 'one set less per lift');
assert(await brief.getByText(/sets? taken off/).isVisible(), 'said, with Undo');
await brief.getByRole('button', { name: 'Undo' }).click(); await wait(p, 600);
assert.equal(await sets(), n0, 'Undo puts them back');
await brief.getByRole('button', { name: 'One set less per lift' }).click(); await wait(p, 600);
await p.screenshot({ path: 'shots/workout5-2-lighter.png' });

// ── during: the first tick folds it away ──
await p.getByRole('button', { name: 'Complete set' }).first().click(); await wait(p, 900);
assert(!(await brief.isVisible()) || (await p.locator('.wk-brief-wrap.on').count()) === 0, 'it folds away on the first tick');
assert.equal((await data()).active.exercises[0].sets.filter((s) => s.done).length, 1, 'the set is ticked');
// reopened mid-workout: not back
await p.getByRole('button', { name: 'Minimise workout' }).click(); await wait(p, 900);
await p.locator('button[aria-label="Resume workout"]').first().click(); await wait(p, 1100);
assert.equal(await p.locator('.wk-brief-wrap.on').count(), 0, 'reopened, it stays folded');
await p.reload(); await wait(p, 1400);
await p.locator('button[aria-label="Resume workout"]').first().click(); await wait(p, 1100);
assert.equal(await p.locator('.wk-brief').count(), 0, 'after a restart mid-workout, it is not drawn at all');

// ── after: next time and the check-in ──
await p.getByRole('button', { name: 'Finish', exact: true }).click(); await wait(p, 700);
await p.getByRole('button', { name: /Finish and save/ }).click(); await wait(p, 2600);
assert(await p.locator('.sum-next').isVisible(), 'Next time on the finish screen');
assert(await p.locator('.sum-next-row').count() >= 1, 'with a target');
await p.getByRole('group', { name: 'Energy' }).getByRole('button', { name: 'Great' }).click(); await wait(p, 400);
await p.getByRole('group', { name: 'Sleep last night' }).getByRole('button', { name: 'Good' }).click(); await wait(p, 500);
await p.screenshot({ path: 'shots/workout5-3-summary.png' });
const last = (await data()).sessions.filter((s) => s.status === 'done').at(-1);
assert.equal(last.checkin.energy, 3, 'the check-in is saved on the workout');
assert.equal(last.checkin.sleep, 3);
await p.getByRole('group', { name: 'Energy' }).getByRole('button', { name: 'Great' }).click(); await wait(p, 400);
assert.equal((await data()).sessions.filter((s) => s.status === 'done').at(-1).checkin.energy, undefined, 'a second tap takes it back');
await p.getByRole('button', { name: 'Done', exact: true }).click(); await wait(p, 900);

console.log('errors', errors.length);
assert.equal(errors.filter((e) => !/Failed to load resource/.test(e)).length, 0, errors.join('\n'));
console.log('WORKOUT 5 OK');
await b.close();
