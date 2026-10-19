// Heavy days (19 Oct), in the real app: the morning after, 2,000 kcal logged for yesterday is noticed once in a toast with
// Undo, and Food's "kcal left" shows the catch-up line; Undo takes it back. No AI key here, so the gentle default decides
// (lib/verdict.ts: fat loss → at most half back, ≤250 a day, ≤4 days).
process.env.AVEN_TODAY ||= '2026-10-01T09:00:00+02:00';
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import assert from 'node:assert/strict';
const { b, p, errors } = await launch({ theme: process.argv[2] || 'dark' });
await p.goto('http://127.0.0.1:5173/'); await wait(p, 900); await skipOnboarding(p); await loadDemo(p);
await p.evaluate(async () => {
  const { useStore } = await import('/src/state/store.ts');
  const s = useStore.getState();
  s.replaceAll({ ...s, settings: { ...s.settings, dayStartHour: 0, goals: { ...s.settings.goals, kcal: 2500 }, profile: { ...s.settings.profile, goal: 'fatloss' } }, entries: [], catchUps: [] });
  const e = (id, kcal, at) => ({ id, date: '2026-09-30', mealId: 'dinner', at, snap: { name: 'Pizza', basis: 'g', per100: { kcal } }, qty: { amount: 100, unit: 'g' }, base: 100, nutrients: { kcal, protein: 20 } });
  useStore.getState().logEntries([e('y1', 2500, new Date('2026-09-30T13:00:00+02:00').getTime())]);
  useStore.getState().logEntries([e('y2', 2000, Date.now())]);
});
await wait(p, 2500);
const toast = p.getByText('+2,000 kcal over. Mostly water on the scale. A small trim: −250 kcal a day for 4 days, protein stays.');
assert(await toast.isVisible(), 'the toast says it straight');
await p.locator('.tabbar').getByRole('button', { name: 'Food', exact: true }).click(); await wait(p, 900);
assert(await p.getByText('−250 catch-up · 4 days left').isVisible(), 'the line under kcal left');
await p.screenshot({ path: 'shots/eating-food.png' });
await p.getByRole('button', { name: 'Undo' }).first().click(); await wait(p, 800);
assert.equal(await p.getByText('−250 catch-up · 4 days left').count(), 0, 'Undo takes it back');
assert.equal(errors.length, 0, errors.join('\n'));
console.log('journey-eating OK');
await b.close();
