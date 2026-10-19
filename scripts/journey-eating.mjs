// Heavy days (review round 1, 19 Oct), in the real app:
//  1. no AI key: 2,000 kcal logged this morning for yesterday is noticed once, with no cut (and no catch-up line on Food);
//  2. with a brain (Gemini STUBBED) that asks for far too much (−600 a day for 6 days): the limits hold (−250 for 4 days),
//     the toast says what really happens, Food shows the line; deleting the big entry takes it away; logged again, not
//     asked again (decided once); a fresh one, Undo takes it back;
//  3. Settings → Targets → Heavy-day notices Off: nothing noticed.
process.env.AVEN_TODAY ||= '2026-10-01T09:00:00+02:00';
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import assert from 'node:assert/strict';
const { b, p, errors } = await launch({ theme: process.argv[2] || 'dark' });
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const json = (o) => ({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(o) });
let verdicts = 0;
await p.route('https://generativelanguage.googleapis.com/**', async (r) => {
  const req = r.request(); const url = req.url();
  if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
  if (url.includes('/models?')) return r.fulfill(json({ models: [{ name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }] }));
  const body = JSON.parse(req.postData() || '{}');
  const system = body.systemInstruction?.parts?.[0]?.text ?? '';
  if (/deciding what to do after a heavy day/.test(system)) { verdicts++; return r.fulfill(json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ plan: 'trim', perDay: 600, days: 6, line: 'Cut 600 a day for 6 days.', why: 'Too much.' }) }] } }] })); }
  return r.fulfill(json({ candidates: [{ content: { parts: [{ text: '{"insights":[]}' }] } }] }));
});

await p.goto('http://127.0.0.1:5173/'); await wait(p, 900); await skipOnboarding(p); await loadDemo(p);
// an adult on a fat-loss goal (the only one a trim is for), the app not new on this phone, no demo
const setup = () => p.evaluate(async () => {
  const { useStore } = await import('/src/state/store.ts');
  const s = useStore.getState();
  s.replaceAll({ ...s, demo: false, settings: { ...s.settings, dayStartHour: 0, goals: { ...s.settings.goals, kcal: 2500 }, profile: { ...s.settings.profile, goal: 'fatloss' }, heavyDays: undefined, heavyOnSince: undefined },
    entries: [], catchUps: [], targets: [], marks: { heavySeen: '2026-09-01' }, memory: [{ id: 'age', text: 'Age: 24 (as of 2026-01-01)', kind: 'other', at: 0 }] });
});
const logBig = () => p.evaluate(async () => {
  const { useStore } = await import('/src/state/store.ts');
  const e = (id, kcal, at) => ({ id, date: '2026-09-30', mealId: 'dinner', at, snap: { name: 'Pizza', basis: 'g', per100: { kcal } }, qty: { amount: 100, unit: 'g' }, base: 100, nutrients: { kcal, protein: 20 } });
  useStore.getState().logEntries([e(`y1${Date.now()}`, 2500, new Date('2026-09-30T13:00:00+02:00').getTime())]);
  useStore.getState().logEntries([e('big', 2000, Date.now())]);
});
const food = async () => { await p.locator('.tabbar').getByRole('button', { name: 'Food', exact: true }).click(); await wait(p, 900); };

// 1. no key: noticed, no cut
await setup(); await logBig(); await wait(p, 2600);
assert(await p.getByText('+2,000 kcal over. Mostly water on the scale — back to normal today, no cut.').isVisible(), 'no key: said straight, no cut');
await food();
assert.equal(await p.getByText(/catch-up ·/).count(), 0, 'no key: no catch-up line');

// 2. a brain that asks for too much
await p.evaluate(() => localStorage.setItem('aven.keys', JSON.stringify({ gemini: 'AIzaTESTKEY' })));
await p.reload(); await wait(p, 1600);
await setup(); await logBig(); await wait(p, 3500);
assert.equal(verdicts, 1, 'decided once');
assert(await p.getByText('+2,000 kcal over. Mostly water on the scale. A small trim: −250 kcal a day for 4 days, protein stays.').isVisible(), 'the limits hold and the toast says so');
await food();
assert(await p.getByText('−250 catch-up · 4 days left').isVisible(), 'the line under kcal left');
await p.screenshot({ path: 'shots/eating-food.png' });
// the big one was a mistake: deleted → gone
await p.evaluate(async () => { const { useStore } = await import('/src/state/store.ts'); useStore.setState((s) => ({ entries: s.entries.filter((e) => e.id !== 'big') })); });
await wait(p, 2600);
assert.equal(await p.getByText(/catch-up ·/).count(), 0, 'deleting the entry takes the catch-up away');
assert(await p.getByText('Your normal calorie target is back').isVisible(), 'and says so');
// logged again: the day was already decided, so no second question and no cut comes back by itself
await logBig(); await wait(p, 3500);
assert.equal(verdicts, 1, 'a day is decided once, even when logged again');
assert.equal(await p.getByText(/catch-up ·/).count(), 0, 'no cut comes back by itself');
// a fresh heavy day: decided; Undo takes it back
await setup(); await logBig(); await wait(p, 3500);
assert.equal(verdicts, 2, 'a new heavy day, decided once');
await p.getByRole('button', { name: 'Undo' }).last().click(); await wait(p, 800);
assert.equal(await p.getByText(/catch-up ·/).count(), 0, 'Undo takes it back');

// 3. notices off
await setup();
await p.evaluate(async () => { const { useStore } = await import('/src/state/store.ts'); useStore.getState().updateSettings({ heavyDays: 'off' }); });
await logBig(); await wait(p, 2600);
assert.equal(verdicts, 2, 'off: nothing asked');
assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('aven.v1')).catchUps.length), 0, 'off: nothing recorded');
assert.equal(errors.length, 0, errors.join('\n'));
console.log('journey-eating OK');
await b.close();
