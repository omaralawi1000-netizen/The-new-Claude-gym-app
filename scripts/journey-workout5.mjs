// Coach 2.0, phase 5, part 1, in the real app (no AI needed: it is all the app's own numbers). Each lift says only what its
// rows don't: a stalled lift with one change ("Use it" puts it in the sets, Undo takes it back), last time's note, a record
// within reach. The Today card says only what is about the whole workout (here a health note) and folds away on the first
// tick; in Focus the first page carries that line instead. The finish screen shows Next time; there is no check-in.
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import assert from 'node:assert/strict';
const { b, p, errors } = await launch({});
const data = () => p.evaluate(() => JSON.parse(localStorage.getItem('aven.v1') || '{}'));

await p.goto('http://127.0.0.1:5173/'); await wait(p, 900); await skipOnboarding(p); await loadDemo(p);
// a health note that isn't about one lift, and the Pull day's second lift stuck at 60 × 8 for four sessions (the last with a note)
const stuck = await p.evaluate(async () => {
  const { useStore } = await import('/src/state/store.ts');
  const st = useStore.getState();
  st.addMemory({ text: 'Lower back is tight this week', kind: 'health' });
  const r = st.routines.find((x) => x.name === 'Pull');
  const exId = r.items[1].exerciseId;
  // (after the demo's own last workout, so nothing comes between them: 46, 40, 34 and 28 hours ago)
  const key = (h) => { const x = new Date(Date.now() - h * 3600000); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  [46, 40, 34, 28].forEach((h, i) => {
    const at = Date.now() - h * 3600000;
    st.restoreSession({ id: `stuck${i}`, name: 'Extra', date: key(h), startedAt: at, endedAt: at + 1800000, pausedMs: 0, status: 'done',
      exercises: [{ id: `se-stuck${i}`, exerciseId: exId, ...(i === 3 ? { note: 'Pause at the bottom' } : {}), sets: [{ id: `s${i}a`, type: 'working', weightKg: 60, reps: 8, done: true, completedAt: at }, { id: `s${i}b`, type: 'working', weightKg: 60, reps: 7, done: true, completedAt: at }] }] });
  });
  localStorage.removeItem('aven.briefHidden');
  return exId;
});
await p.reload(); await wait(p, 1400);

// ── List view: the Today card, and each lift's own line ──
await p.getByRole('button', { name: /Start workout/ }).click(); await wait(p, 1400);
const brief = p.locator('.wk-brief');
assert(await brief.isVisible(), 'the Today card opens the planned workout');
assert(await brief.getByText('Lower back is tight this week').isVisible(), 'with the health note');
assert.equal(await brief.locator('.wk-brief-line').count(), 1, 'and nothing a lift’s own card already says');
const card = p.locator('.wk-block').nth(1);
assert(await card.getByText(/Stuck at 60 kg × 8 · try 57.5 kg × 12 today/).isVisible(), 'the stalled lift says what to try');
assert(await card.getByText('Last time: Pause at the bottom').isVisible(), 'and last time’s note');
assert.equal(await card.locator('.wk-reason').count(), 0, 'not also the old "stalled" line');
await p.screenshot({ path: 'shots/workout5-1-list.png' });
// (the live state: what is saved to storage can trail by a frame)
const work = () => p.evaluate(async () => { const { useStore } = await import('/src/state/store.ts'); return useStore.getState().active.exercises[1].sets.filter((s) => s.type === 'working'); });
const before = await work();
await card.getByRole('button', { name: 'Use it' }).click(); await wait(p, 700);
assert((await work()).every((s) => s.weightKg === 57.5 && s.reps === 12), '"Use it" puts the change in the open sets');
assert.equal(await card.getByRole('button', { name: 'Use it' }).count(), 0, 'once');
await p.getByRole('button', { name: 'Undo' }).last().click(); await wait(p, 700);
assert.deepEqual((await work()).map((s) => [s.weightKg, s.reps]), before.map((s) => [s.weightKg, s.reps]), 'Undo puts the plan back');
// a record within reach somewhere on the day (the demo's lifts move up)
console.log('hints', await p.locator('.wk-hint').allInnerTexts());

// ── Focus view: the first page carries the workout's line ──
const dlg = p.getByRole('dialog', { name: 'Active workout' });
await dlg.getByRole('button', { name: 'Focus view' }).click(); await wait(p, 1100);
const page0 = p.locator('.wk-focus .wk-page.cur');
assert(await page0.getByText('Lower back is tight this week').isVisible(), 'Focus: the health note is on the first page');
await p.screenshot({ path: 'shots/workout5-2-focus.png' });
await dlg.getByRole('button', { name: 'List view' }).click(); await wait(p, 1100);

// ── the first tick folds the Today card away; reopened after a restart it isn't drawn ──
await p.getByRole('button', { name: 'Complete set' }).first().click(); await wait(p, 1000);
assert.equal(await p.locator('.wk-brief-wrap.on').count(), 0, 'it folds away on the first tick');
await p.reload(); await wait(p, 1400);
await p.locator('button[aria-label="Resume workout"]').first().click(); await wait(p, 1100);
assert.equal(await p.locator('.wk-brief').count(), 0, 'after a restart mid-workout, it is not drawn at all');
assert(await p.locator('.wk-block').nth(1).getByText(/Stuck at/).isVisible(), 'the lift’s own line stays where it is needed');

// ── after: Next time, and no check-in ──
await p.getByRole('button', { name: 'Finish', exact: true }).click(); await wait(p, 700);
await p.getByRole('button', { name: /Finish and save/ }).click(); await wait(p, 2600);
assert(await p.locator('.sum-next').isVisible(), 'Next time on the finish screen');
assert.equal(await p.locator('.ci-row').count(), 0, 'no check-in');
await p.screenshot({ path: 'shots/workout5-3-summary.png' });
await p.getByRole('button', { name: 'Done', exact: true }).click(); await wait(p, 900);

console.log('errors', errors.length, stuck);
assert.equal(errors.filter((e) => !/Failed to load resource/.test(e)).length, 0, errors.join('\n'));
console.log('WORKOUT 5 OK');
await b.close();
