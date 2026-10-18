// Coach 2.0, phase 5b, part B, in the real app (Gemini STUBBED: this proves the wiring, not the model's judgement). Sets told
// after the gym become a finished workout (no live one starts), a misheard weight is fixed and said on the card ("heard 18 kg
// → logged 80 kg", with a chip to put it back), and a workout left open for hours asks once whether to finish it.
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import assert from 'node:assert/strict';
const { b, p, errors } = await launch({ theme: process.argv[2] || 'dark' });
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const json = (o) => ({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(o) });
await p.route('https://generativelanguage.googleapis.com/**', async (r) => {
  const req = r.request(); const url = req.url();
  if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
  if (url.includes('/models?')) return r.fulfill(json({ models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite'].map((n) => ({ name: `models/${n}`, supportedGenerationMethods: ['generateContent'] })) }));
  const body = JSON.parse(req.postData() || '{}');
  if (body.generationConfig?.responseModalities?.includes('AUDIO')) return r.fulfill(json({ candidates: [] }));
  const system = body.systemInstruction?.parts?.[0]?.text ?? '';
  const last = [...(body.contents ?? [])].reverse().find((c) => c.role === 'user')?.parts?.map((x) => x.text ?? '').join('') ?? '';
  let a;
  if (/did bench/i.test(last)) a = { reply: '', actions: [{ type: 'log_sets', exercises: [{ exercise: 'bench', sets: [{ kg: 80, reps: 8 }, { kg: 80, reps: 7 }] }] }] };
  else if (/eighteen/i.test(last)) a = { reply: '', actions: [{ type: 'log_current_set', kg: 18, reps: 8, which: 'current' }] };
  else a = /insight/i.test(system) ? { insights: [] } : { reply: 'OK.', actions: [] };
  const txt = JSON.stringify(a);
  if (url.includes('streamGenerateContent')) return r.fulfill({ status: 200, headers: { ...cors, 'content-type': 'text/event-stream' }, body: `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: txt }] } }] })}\n\n` });
  return r.fulfill(json({ candidates: [{ content: { parts: [{ text: txt }] } }] }));
});
const live = () => p.evaluate(async () => { const { useStore } = await import('/src/state/store.ts'); const s = useStore.getState(); return { active: s.active, sessions: s.sessions }; });

await p.goto('http://127.0.0.1:5173/'); await wait(p, 900); await skipOnboarding(p); await loadDemo(p);
await p.evaluate(() => localStorage.setItem('aven.keys', JSON.stringify({ gemini: 'AIzaTESTKEY' })));
await p.reload(); await wait(p, 1600);
const ask = async (text, ms = 3000) => { await p.getByLabel('Message the Coach').fill(text); await p.getByRole('button', { name: 'Send', exact: true }).click(); await wait(p, ms); };

// ── after the gym: a finished workout, no live one ──
const n0 = (await live()).sessions.length;
await p.getByLabel('Coach').click(); await wait(p, 1000);
await ask('I did bench 80 for 8 and 7 today');
assert(await p.getByText('Logged 2 sets').isVisible(), 'the card');
const after = await live();
assert.equal(after.active, null, 'no live workout was started');
assert.equal(after.sessions.length, n0 + 1, 'a finished workout');
assert(after.sessions.at(-1).logged && after.sessions.at(-1).status === 'done');
await p.getByRole('dialog', { name: 'Coach', exact: true }).getByRole('button', { name: 'Close', exact: true }).click(); await wait(p, 1200);

// ── in the gym: "eighteen" heard, 80 logged ──
await p.evaluate(async () => {
  const { useStore, allExercises } = await import('/src/state/store.ts');
  const bench = allExercises(useStore.getState().exercises).find((e) => e.name === 'Barbell Bench Press');
  const t = { weightKg: 80, repMin: 6, repMax: 8 };
  useStore.setState({ active: { id: 'wj', name: 'Push', date: new Date().toISOString().slice(0, 10), startedAt: Date.now() - 600000, pausedMs: 0, status: 'active', exercises: [{ id: 'sej', exerciseId: bench.id, sets: [{ id: 's1', type: 'working', done: false, target: t }, { id: 's2', type: 'working', done: false, target: t }] }] } });
});
await p.getByLabel('Coach').click(); await wait(p, 1000);
await ask('bench eighteen for eight');
const card = p.locator('.action-card').filter({ hasText: 'Set logged' }).last();
assert(await card.getByText('heard 18 kg → logged 80 kg').isVisible(), 'the card says what it fixed');
assert.equal((await live()).active.exercises[0].sets[0].weightKg, 80, '80 logged');
await p.screenshot({ path: 'shots/workout6-1-heard.png' });
await card.getByRole('button', { name: 'Use 18 kg' }).click(); await wait(p, 900);
assert.equal((await live()).active.exercises[0].sets[0].weightKg, 18, 'one tap puts back what was said');
await p.getByRole('dialog', { name: 'Coach', exact: true }).getByRole('button', { name: 'Close', exact: true }).click(); await wait(p, 1200);

// ── a workout left open for hours asks once ──
await p.evaluate(async () => {
  const { useStore } = await import('/src/state/store.ts');
  const a = useStore.getState().active; const at = Date.now() - 8 * 3600000;
  useStore.setState({ active: { ...a, startedAt: at, exercises: a.exercises.map((e) => ({ ...e, sets: e.sets.map((s) => (s.done ? { ...s, completedAt: at + 900000 } : s)) })) } });
  await new Promise((ok) => setTimeout(ok, 400));
});
await p.reload(); await wait(p, 2800);
const toast = p.getByText(/Still training\? Your workout from/);
assert(await toast.isVisible(), 'it asks whether you are still training');
await p.screenshot({ path: 'shots/workout6-2-stale.png' });
await p.getByRole('button', { name: 'Finish', exact: true }).last().click(); await wait(p, 900);
const fin = await live();
assert.equal(fin.active, null, 'Finish saves it');
const s = fin.sessions.at(-1);
assert(s.endedAt - s.startedAt < 2 * 3600000, 'as of its last set, not now');
await p.reload(); await wait(p, 2800);
assert.equal(await p.getByText(/Still training\?/).count(), 0, 'and it is not asked again');

console.log('errors', errors.length);
assert.equal(errors.filter((e) => !/Failed to load resource/.test(e)).length, 0, errors.join('\n'));
console.log('WORKOUT 6 OK');
await b.close();
