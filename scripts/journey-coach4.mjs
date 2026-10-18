// Coach 2.0, phase 4, in the real app (Gemini STUBBED, its Google Search grounding included: this proves the wiring, not
// the model's judgement): a recipe request searches the web, the answer shows its sources as links, the recipe card has the
// app's own macros, its method folds open, Save recipe keeps it, Log a portion logs one serving; a program becomes a preview.
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import assert from 'node:assert/strict';
const { b, p, errors } = await launch({});
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const json = (o) => ({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(o) });
const seen = [];
let rejectSchema = false; // (like a model that finds the agent's schema too complex: 400 → the app's plain JSON mode)
await p.route('https://generativelanguage.googleapis.com/**', async (r) => {
  const req = r.request(); const url = req.url();
  if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
  if (url.includes('/models?')) return r.fulfill(json({ models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite'].map((n) => ({ name: `models/${n}`, supportedGenerationMethods: ['generateContent'] })) }));
  const body = JSON.parse(req.postData() || '{}');
  if (body.generationConfig?.responseModalities?.includes('AUDIO')) return r.fulfill(json({ candidates: [] }));
  const system = body.systemInstruction?.parts?.[0]?.text ?? '';
  const last = [...(body.contents ?? [])].reverse().find((c) => c.role === 'user')?.parts?.map((x) => x.text ?? '').join('') ?? '';
  seen.push({ system, last, tools: body.tools, plain: !body.generationConfig?.responseSchema });
  if (rejectSchema && body.generationConfig?.responseSchema && !body.tools) return r.fulfill({ status: 400, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ error: { code: 400, message: 'schema too complex' } }) });
  // the grounded search itself
  if (body.tools?.some((t) => t.google_search)) return r.fulfill(json({ candidates: [{ content: { parts: [{ text: 'A protein mug cake: whey, an egg, oat flour, baking powder; microwave about 90 seconds.' }] }, groundingMetadata: { groundingChunks: [{ web: { uri: 'https://www.bbcgoodfood.com/recipes/protein-mug-cake', title: 'bbcgoodfood.com' } }, { web: { uri: 'https://www.healthline.com/nutrition/protein', title: 'healthline.com' } }] } }] }));
  let a;
  if (/i want cake/i.test(last)) a = { reply: 'Here is a quick, high-protein mug cake:', actions: [{ type: 'propose_recipe', name: 'Chocolate mug cake', servings: 1, ingredients: ['100 g skyr', '1 egg', '30 g havregryn'], method: '1. Mix. 2. Microwave 90 s.' }] };
  else if (/mug cake/i.test(last)) a = system.includes('LOOKUP RESULTS (you asked')
    ? { reply: 'Here is a quick one from what you usually have.', actions: [{ type: 'propose_recipe', name: 'Protein mug cake', servings: 1, foods: [{ name: 'skyr', amount: 100, unit: 'g' }, { name: 'egg', amount: 1, unit: 'piece' }, { name: 'havregryn', amount: 30, unit: 'g' }], steps: ['Mix everything in a big mug.', 'Microwave about 90 seconds.', 'Let it rest a minute.'] }] }
    : { reply: '', actions: [], lookups: [{ kind: 'web', query: 'protein mug cake recipe' }] };
  else if (/program/i.test(last)) a = { reply: 'Here it is as a routine.', actions: [{ type: 'create_routine', name: 'Upper from photo', add: [{ exercise: 'Barbell Bench Press', sets: 4, repMin: 6, repMax: 8 }, { exercise: 'Barbell Row', sets: 4, repMin: 8, repMax: 10 }] }] };
  else a = /insight/i.test(system) ? { insights: [] } : { reply: 'OK.', actions: [] };
  const txt = JSON.stringify(a);
  if (url.includes('streamGenerateContent')) return r.fulfill({ status: 200, headers: { ...cors, 'content-type': 'text/event-stream' }, body: `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: txt }] } }] })}\n\n` });
  return r.fulfill(json({ candidates: [{ content: { parts: [{ text: txt }] } }] }));
});
const data = () => p.evaluate(() => JSON.parse(localStorage.getItem('aven.v1') || '{}'));

await p.goto('http://127.0.0.1:5173/'); await wait(p, 900); await skipOnboarding(p); await loadDemo(p);
await p.evaluate(() => localStorage.setItem('aven.keys', JSON.stringify({ gemini: 'AIzaTESTKEY' })));
await p.reload(); await wait(p, 1600);
const ask = async (text, ms = 3200) => { await p.getByLabel('Message the Coach').fill(text); await p.getByRole('button', { name: 'Send', exact: true }).click(); await wait(p, ms); };

await p.getByLabel('Coach').click(); await wait(p, 1000);
const r0 = (await data()).recipes?.length ?? 0;
await ask('find me a protein mug cake I can make', 4200);
assert(seen.some((x) => x.tools?.some((t) => t.google_search)), 'the web was searched (grounded)');
assert(seen.some((x) => /### web \(searched\)\nA protein mug cake/.test(x.system)), 'and the result went back to the model');
const chip = p.locator('.src-chip').first();
assert(await chip.isVisible(), 'the sources are shown under the answer');
assert.equal(await chip.getAttribute('href'), 'https://www.bbcgoodfood.com/recipes/protein-mug-cake');
const card = p.locator('.action-card').filter({ hasText: 'Protein mug cake' }).last();
assert(await card.isVisible(), 'the recipe card');
assert(/per serving \d+ kcal/.test(await card.innerText()), 'with the app’s own macros');
await card.getByRole('button', { name: /Method \(3 steps\)/ }).click(); await wait(p, 700);
assert(await p.getByText('Microwave about 90 seconds.').isVisible(), 'the method folds open');
await p.screenshot({ path: 'shots/coach4-1-recipe.png' });
assert.equal((await data()).recipes?.length ?? 0, r0, 'nothing saved before Apply');
await card.getByRole('button', { name: 'Save recipe' }).click(); await wait(p, 900);
assert.equal((await data()).recipes.length, r0 + 1, 'Save recipe keeps it');
const e0 = (await data()).entries.length;
await card.getByRole('button', { name: 'Log a portion' }).click(); await wait(p, 700);
assert.equal((await data()).entries.length, e0 + 1, 'Log a portion logs one serving');
await p.screenshot({ path: 'shots/coach4-2-saved.png' });

// a model that turned the full schema down (plain JSON mode, as Omar's may have): text ingredients still make the card
rejectSchema = true;
await ask('I want cake', 4000);
assert(seen.some((x) => x.plain && /an array of objects is written exactly with the keys shown/.test(x.system)), 'it answered in plain JSON mode, with the nested format written out');
const cake = p.locator('.action-card').filter({ hasText: 'Chocolate mug cake' }).last();
assert(await cake.isVisible(), 'the recipe card still appears');
assert(/per serving \d+ kcal/.test(await cake.innerText()), 'with the app’s macros');
await p.screenshot({ path: 'shots/coach4-3-plain.png' });
rejectSchema = false;

// a program (from a photo, or said): a preview first
const n0 = (await data()).routines.length;
await ask('make this program a routine');
assert.equal((await data()).routines.length, n0, 'nothing saved before Apply');
await p.locator('.action-card').filter({ hasText: 'Upper from photo' }).last().getByRole('button', { name: 'Apply', exact: true }).click(); await wait(p, 800);
assert.equal((await data()).routines.length, n0 + 1, 'Apply saves the routine');

console.log('errors', errors.length);
assert.equal(errors.filter((e) => !/Failed to load resource/.test(e)).length, 0, errors.join('\n'));
console.log('COACH 4 OK');
await b.close();
