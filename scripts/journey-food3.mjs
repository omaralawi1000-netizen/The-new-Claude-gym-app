// Coach 2.0, phase 5b, part A, in the real app (Gemini STUBBED: this proves the wiring, not the model's judgement). A food
// that could be two very different things asks "Which one?" once (one tap logs it and it is remembered), "quick entry 300
// calories" logs just the number, and the model is shown your saved foods' names to copy (OWN FOODS).
import { launch, wait, skipOnboarding } from './lib.mjs';
import assert from 'node:assert/strict';
const { b, p, errors } = await launch({ theme: process.argv[2] || 'dark' });
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const json = (o) => ({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(o) });
const seen = [];
await p.route('https://generativelanguage.googleapis.com/**', async (r) => {
  const req = r.request(); const url = req.url();
  if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
  if (url.includes('/models?')) return r.fulfill(json({ models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite'].map((n) => ({ name: `models/${n}`, supportedGenerationMethods: ['generateContent'] })) }));
  const body = JSON.parse(req.postData() || '{}');
  if (body.generationConfig?.responseModalities?.includes('AUDIO')) return r.fulfill(json({ candidates: [] }));
  const system = body.systemInstruction?.parts?.[0]?.text ?? '';
  const last = [...(body.contents ?? [])].reverse().find((c) => c.role === 'user')?.parts?.map((x) => x.text ?? '').join('') ?? '';
  seen.push({ system, last });
  let a;
  if (/chicken/i.test(last)) a = { reply: '', actions: [{ type: 'log_food', foods: [{ name: 'chicken breast', amount: 200, unit: 'g' }], meal: /lunch/i.test(last) ? 'lunch' : null }] };
  else if (/quick entry/i.test(last)) a = { reply: '', actions: [{ type: 'log_quick', totals: { kcal: 300, protein: 20 } }] };
  else if (/power/i.test(last)) a = { reply: '', actions: [{ type: 'log_food', foods: [{ name: 'powerkartofler', amount: 250, unit: 'g' }] }] };
  else a = /insight/i.test(system) ? { insights: [] } : { reply: 'OK.', actions: [] };
  const txt = JSON.stringify(a);
  if (url.includes('streamGenerateContent')) return r.fulfill({ status: 200, headers: { ...cors, 'content-type': 'text/event-stream' }, body: `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: txt }] } }] })}\n\n` });
  return r.fulfill(json({ candidates: [{ content: { parts: [{ text: txt }] } }] }));
});
const live = () => p.evaluate(async () => { const { useStore } = await import('/src/state/store.ts'); const s = useStore.getState(); return { entries: s.entries, choices: s.choices }; });

await p.goto('http://127.0.0.1:5173/'); await wait(p, 900); await skipOnboarding(p);
await p.evaluate(async () => {
  localStorage.setItem('aven.keys', JSON.stringify({ gemini: 'AIzaTESTKEY' }));
  const { useStore } = await import('/src/state/store.ts');
  useStore.getState().saveFood({ id: 'f-pp', name: 'Power Potatoes', source: 'custom', basis: 'g', per100: { kcal: 95, protein: 2, carbs: 18, fat: 2 }, portions: [] });
});
await p.reload(); await wait(p, 1600);
const ask = async (text, ms = 3000) => { await p.getByLabel('Message the Coach').fill(text); await p.getByRole('button', { name: 'Send', exact: true }).click(); await wait(p, ms); };
await p.getByLabel('Coach').click(); await wait(p, 1000);

// ── "Which one?" ──
await ask('200 g chicken breast for lunch');
const card = p.locator('.action-card').filter({ hasText: 'Which one?' }).last();
assert(await card.isVisible(), 'chicken breast with no habit asks which one');
assert.equal((await live()).entries.length, 0, 'and logs nothing yet');
const choices = card.locator('.ac-choice');
assert((await choices.count()) >= 2, 'with its choices');
assert(/kcal/.test(await choices.first().innerText()), 'each with its calories');
await p.screenshot({ path: 'shots/food3-1-which.png' });
await card.locator('.ac-choice', { hasText: /cooked/i }).first().click(); await wait(p, 1400);
const after = await live();
assert.equal(after.entries.length, 1, 'one tap logs it');
assert.equal(after.entries[0].snap.state, 'cooked');
assert.equal(after.entries[0].mealId, 'lunch', 'into the meal said');
assert(await card.getByText('Logged to Lunch').isVisible(), 'and the card says where');
assert(Object.keys(after.choices).includes('chicken breast'), 'and remembers it');
assert(await card.getByText('Remembered for next time').isVisible(), 'the card says so');
assert(await card.getByRole('button', { name: 'Undo' }).isVisible(), 'with Undo');
await p.screenshot({ path: 'shots/food3-2-picked.png' });
await ask('200 g chicken breast again');
assert.equal((await live()).entries.length, 2, 'next time it goes straight in');
assert.equal(await p.locator('.action-card').filter({ hasText: 'Which one?' }).count(), 1, 'without asking again');

// ── your own food, said as one Danish word ──
await ask('250 g powerkartofler');
assert.equal((await live()).entries.at(-1).snap.name, 'Power Potatoes', '"powerkartofler" is your Power Potatoes');
assert(seen.some((x) => /OWN FOODS[^\n]*"Power Potatoes"/.test(x.system)), 'the model sees your saved foods to copy');

// ── quick entry ──
await ask('quick entry 300 calories and 20 g protein');
const q = (await live()).entries.at(-1);
assert(q.quick && q.nutrients.kcal === 300 && q.nutrients.protein === 20, 'a quick entry with just the numbers');
await p.screenshot({ path: 'shots/food3-3-quick.png' });

console.log('errors', errors.length);
assert.equal(errors.filter((e) => !/Failed to load resource/.test(e)).length, 0, errors.join('\n'));
console.log('FOOD 3 OK');
await b.close();
