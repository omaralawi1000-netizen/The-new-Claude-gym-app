// Talking to the Coach like a person (19 Oct), in the real app (Gemini STUBBED): "I also did calves, put it after leg
// press" goes into today's finished workout (no second one); "I forgot to log the pizza last night" lands in yesterday's
// dinner; an open "something with 700 kcal" gets a question back; the Coach's DATA carries BODY & RECOVERY from the watch.
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import assert from 'node:assert/strict';
const { b, p, errors } = await launch({ theme: process.argv[2] || 'dark' });
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const json = (o) => ({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(o) });
const systems = [];
const answer = (last) => {
  if (/calves/i.test(last)) return { reply: 'Added.', actions: [{ type: 'log_sets', exercises: [{ exercise: 'Standing Calf Raise', sets: [{ kg: 107, reps: 8 }, { kg: 107, reps: 8 }, { kg: 107, reps: 8 }] }], after: 'Leg Press' }] };
  if (/pizza/i.test(last)) return { reply: 'Logged it for last night.', actions: [{ type: 'log_food', foods: [{ name: 'pizza', amount: 1, unit: 'piece' }], meal: 'dinner', day: 'yesterday' }] };
  if (/700/i.test(last)) return { reply: 'Sweet or savoury?', actions: [] };
  return { reply: 'OK.', actions: [] };
};
await p.route('https://generativelanguage.googleapis.com/**', async (r) => {
  const req = r.request(); const url = req.url();
  if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
  if (url.includes('/models?')) return r.fulfill(json({ models: [{ name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }] }));
  const body = JSON.parse(req.postData() || '{}');
  if (body.generationConfig?.responseModalities?.includes('AUDIO')) return r.fulfill(json({ candidates: [] }));
  const system = body.systemInstruction?.parts?.[0]?.text ?? '';
  if (/insight/i.test(system)) return r.fulfill(json({ candidates: [{ content: { parts: [{ text: '{"insights":[]}' }] } }] }));
  systems.push(system);
  const last = [...(body.contents ?? [])].reverse().find((c) => c.role === 'user')?.parts?.map((x) => x.text ?? '').join('') ?? '';
  const txt = JSON.stringify(answer(last));
  if (url.includes('streamGenerateContent')) return r.fulfill({ status: 200, headers: { ...cors, 'content-type': 'text/event-stream' }, body: `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: txt }] } }] })}\n\n` }).catch(() => {});
  return r.fulfill(json({ candidates: [{ content: { parts: [{ text: txt }] } }] })).catch(() => {});
});

await p.goto('http://127.0.0.1:5173/'); await wait(p, 900); await skipOnboarding(p); await loadDemo(p);
// today's finished "Legs & shoulders" (leg press, lateral raise), and a week of watch data with a short last night
await p.evaluate(() => localStorage.setItem('aven.keys', JSON.stringify({ gemini: 'AIzaTESTKEY' })));
await p.reload(); await wait(p, 1600);
await p.evaluate(async () => {
  const { useStore } = await import('/src/state/store.ts');
  const st = useStore.getState();
  const day = (n) => { const x = new Date(); x.setDate(x.getDate() - n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  const t0 = Date.now() - 3 * 3600000;
  st.restoreSession({ id: 'legs-today', name: 'Legs & shoulders', date: day(0), startedAt: t0, endedAt: t0 + 5400000, pausedMs: 0, status: 'done',
    exercises: ['leg-press', 'lateral-raise'].map((e, i) => ({ id: `se-${e}`, exerciseId: e, sets: [{ id: `x${i}`, type: 'working', weightKg: 100, reps: 10, done: true, completedAt: t0 + i * 600000 }] })) });
  const health = Array.from({ length: 20 }, (_, i) => ({ date: day(i + 1), sleepMin: 450, restHr: 50, hrv: 60 })).concat([{ date: day(0), sleepMin: 250, restHr: 58, hrv: 61 }]);
  st.mergeHealth({ activities: st.activities, steps: st.steps ?? [], health });
});
await wait(p, 600);
const sessions = () => p.evaluate(() => JSON.parse(localStorage.getItem('aven.v1')).sessions);
const before = (await sessions()).length;
await p.getByLabel('Coach').first().click(); await wait(p, 1100);
const ask = async (q, ms = 3200) => { await p.getByLabel('Message the Coach').fill(q); await p.getByRole('button', { name: 'Send', exact: true }).click(); await wait(p, ms); };

// ── "I also did calves, put it after leg press" ──
await ask('I also did calves, 107 for 8, three sets. Put it after leg press');
const s1 = await sessions();
assert.equal(s1.length, before, 'no second workout');
const legs = s1.find((s) => s.id === 'legs-today');
assert.deepEqual(legs.exercises.map((e) => e.exerciseId).slice(0, 3), ['leg-press', legs.exercises[1].exerciseId, 'lateral-raise']);
assert(/calf/.test(legs.exercises[1].exerciseId), 'the calves right after leg press');
assert(await p.locator('.action-card', { hasText: 'Legs & shoulders' }).last().isVisible(), 'the card names the workout');
await p.screenshot({ path: 'shots/coach7-1-calves.png' });

// ── "I forgot to log the pizza last night" ──
await ask('I forgot to log the pizza last night');
const yest = await p.evaluate(() => { const x = new Date(); x.setDate(x.getDate() - 1); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; });
const e = await p.evaluate((y) => JSON.parse(localStorage.getItem('aven.v1')).entries.filter((x) => x.date === y && /pizza/i.test(x.snap.name)), yest);
assert(e.length >= 1, 'pizza is in yesterday');
assert.equal(e[0].mealId, 'dinner', 'at dinner');

// ── an open request gets a question back ──
await ask('I have 700 kcal left, give me something');
assert(/Sweet or savoury/.test(await p.locator('.coach-reply').last().textContent()), 'asks one question');

// ── the Coach saw the watch's recovery ──
const sys = systems.at(-1);
assert(/BODY & RECOVERY/.test(sys), 'BODY & RECOVERY in DATA');
assert(/Clearly off today against their own usual: slept 4h10 last night; resting heart rate 58, 8 over usual/.test(sys), 'and what is off today');
await p.screenshot({ path: 'shots/coach7-2-done.png' });

console.log('errors', errors.length);
assert.equal(errors.filter((x) => !/Failed to load resource/.test(x)).length, 0, errors.join('\n'));
console.log('COACH 7 OK');
await b.close();
