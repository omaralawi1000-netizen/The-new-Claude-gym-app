// Coach 2.0, phase 1, in the real app. Gemini is STUBBED at the network layer (no real key): this proves the wiring —
// look-ups answered on the phone and sent back, "it" pointing at the exact item across the orb and the Coach, a planned day
// from preview to Apply — NOT the live model's judgement.
import { launch, wait, skipOnboarding, loadDemo, sayTyped } from './lib.mjs';
import assert from 'node:assert/strict';
const { b, p, errors } = await launch({});
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const json = (o, status = 200) => ({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(o) });
const seen = [];
await p.route('https://generativelanguage.googleapis.com/**', async (r) => {
  const req = r.request(); const url = req.url();
  if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
  if (url.includes('/models?')) return r.fulfill(json({ models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-flash-preview-tts'].map((n) => ({ name: `models/${n}`, supportedGenerationMethods: ['generateContent'] })) }));
  const body = JSON.parse(req.postData() || '{}');
  if (body.generationConfig?.responseModalities?.includes('AUDIO')) return r.fulfill(json({ candidates: [] }));
  const system = body.systemInstruction?.parts?.[0]?.text ?? '';
  const turns = (body.contents ?? []).map((c) => `${c.role}: ${(c.parts ?? []).map((x) => x.text ?? '').join('')}`);
  const last = [...(body.contents ?? [])].reverse().find((c) => c.role === 'user')?.parts?.map((x) => x.text ?? '').join('') ?? '';
  const looked = system.includes('LOOKUP RESULTS (you asked');
  seen.push({ system, turns, last, looked });
  const refs = [...turns.join('\n').matchAll(/\[ref (e_[\w-]+)\]/g)].map((m) => m[1]);
  let a;
  if (/how has my bench/i.test(last)) a = looked ? { reply: 'Your bench is up since you started.', actions: [] } : { reply: '', actions: [], lookups: [{ kind: 'exercise_history', query: 'bench press' }] };
  else if (/log a banana/i.test(last)) a = { reply: '', actions: [{ type: 'log_food', foods: [{ name: 'banana', amount: 1, unit: 'piece' }], meal: 'snacks', day: 'today' }] };
  else if (/move it to lunch/i.test(last)) a = { reply: 'Moved.', actions: [{ type: 'move_food', ref: refs.at(-1) ?? null, target: 'banana', meal_to: 'lunch' }] };
  else if (/chest and triceps/i.test(last)) a = looked ? { reply: 'Here is tomorrow.', actions: [{ type: 'plan_day', day: 'tomorrow', focus: ['chest', 'triceps'], light: ['shoulders'] }] } : { reply: '', actions: [], lookups: [{ kind: 'exercises', query: 'chest triceps shoulders' }] };
  else a = { reply: 'OK.', actions: [] };
  const txt = JSON.stringify(a);
  if (url.includes('streamGenerateContent')) return r.fulfill({ status: 200, headers: { ...cors, 'content-type': 'text/event-stream' }, body: `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: txt }] } }] })}\n\n` });
  return r.fulfill(json({ candidates: [{ content: { parts: [{ text: txt }] } }] }));
});
const data = () => p.evaluate(() => { const d = JSON.parse(localStorage.getItem('aven.v1') || '{}'); return { entries: d.entries ?? [], schedule: d.schedule, routines: d.routines ?? [] }; });

await p.goto('http://127.0.0.1:5173/'); await wait(p, 900); await skipOnboarding(p); await loadDemo(p); await wait(p, 800);
await p.getByLabel('Settings').click(); await wait(p, 500);
await p.getByText('Voice & AI').click(); await wait(p, 600);
await p.getByLabel('Gemini key — understands you').fill('AIzaTESTKEY_5678'); await p.getByRole('button', { name: 'Save and test' }).nth(1).click(); await wait(p, 800);
await p.keyboard.press('Escape'); await wait(p, 500); await p.keyboard.press('Escape'); await wait(p, 600);

const ask = async (text, ms = 2200) => { await p.getByLabel('Message the Coach').fill(text); await p.getByRole('button', { name: 'Send', exact: true }).click(); await wait(p, ms); };

// ── a look-up: the history of one lift, answered on the phone and sent back ──
await p.getByLabel('Coach').click(); await wait(p, 800);
await ask('how has my bench gone since I started?');
assert(await p.getByText('Your bench is up since you started.').isVisible(), 'the answer after the look-up is shown');
const lk = seen.filter((x) => /how has my bench/i.test(x.last));
assert.equal(lk.length, 2, 'two rounds: look up, then answer');
assert(/### exercise_history \(query "bench press"\)/.test(lk[1].system) && /Best set [\d.]+ kg × \d+/.test(lk[1].system), 'the whole bench history went back to the model');

// ── "log a banana" at the orb, "move it to lunch" in the Coach: one conversation, the exact item ──
await p.keyboard.press('Escape'); await wait(p, 900);
const n0 = (await data()).entries.length;
await p.getByRole('button', { name: 'Dictate' }).first().click(); await wait(p, 1200);
await sayTyped(p, 'log a banana'); await wait(p, 3200);
let d = await data();
assert.equal(d.entries.length, n0 + 1, 'the orb logged it');
const banana = d.entries.at(-1);
assert.equal(banana.mealId, 'snacks');
// a quick log steps the orb screen aside by itself
if (await p.getByRole('dialog', { name: 'Dictation' }).count()) { await p.getByRole('dialog', { name: 'Dictation' }).getByRole('button', { name: 'Close' }).click(); await wait(p, 1200); }
await p.getByLabel('Coach').click(); await wait(p, 900);
assert(await p.getByText('log a banana').first().isVisible(), 'what was said at the orb is in the Coach');
await ask('move it to lunch');
d = await data();
assert.equal(d.entries.find((e) => e.id === banana.id)?.mealId, 'lunch', 'exactly that banana moved to lunch');
assert(seen.at(-1).turns.join('\n').includes(`[ref ${banana.id}]`), 'the model was given the item’s id');
await p.screenshot({ path: 'shots/coach2-1-it.png' });

// ── "chest and triceps with some shoulder tomorrow": a preview from their own exercises, then Apply ──
const r0 = (await data()).routines.length;
await ask('chest and triceps with some shoulder tomorrow', 2600);
assert(await p.getByText(/^Tomorrow: Chest \+ Triceps \+ Shoulders/).isVisible(), 'the preview card');
assert.equal((await data()).routines.length, r0, 'nothing changes before Apply');
await p.screenshot({ path: 'shots/coach2-2-plan.png' });
await p.getByRole('button', { name: 'Apply', exact: true }).click(); await wait(p, 900);
d = await data();
assert.equal(d.routines.length, r0 + 1, 'Apply made the day’s routine');
const tomorrow = await p.evaluate(() => { const x = new Date(Date.now() + 86400000); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; });
assert(d.schedule.overrides.some((o) => o.date === tomorrow && o.routineId === d.routines.at(-1).id), 'and put it on tomorrow');
assert(await p.getByRole('button', { name: 'Undo' }).last().isVisible(), 'it can still be undone');
await p.getByRole('button', { name: 'Undo' }).last().click(); await wait(p, 600);
d = await data();
assert.equal(d.routines.length, r0, 'Undo takes it back');
assert(!d.schedule.overrides.some((o) => o.date === tomorrow && o.routineId), 'and off tomorrow');
await p.screenshot({ path: 'shots/coach2-3-undo.png' });

console.log('errors', errors.length);
assert.equal(errors.filter((e) => !/Failed to load resource/.test(e)).length, 0);
console.log('COACH 2 OK');
await b.close();
