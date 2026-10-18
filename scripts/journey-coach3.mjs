// Coach 2.0, phase 3, in the real app (Gemini STUBBED: this proves the wiring, not the model's judgement):
// a temporary thing is remembered with its end date; something said long ago (past the 60 the chat keeps) is found by the
// Coach's look-up; the weekly review opens with the app's numbers and the Coach's verdict, is kept, and shows on Progress.
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import assert from 'node:assert/strict';
const { b, p, errors } = await launch({});
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
  const prompt = (body.contents ?? []).map((c) => (c.parts ?? []).map((x) => x.text ?? '').join('')).join('\n');
  const last = [...(body.contents ?? [])].reverse().find((c) => c.role === 'user')?.parts?.map((x) => x.text ?? '').join('') ?? '';
  seen.push({ system, prompt, last });
  const until = await p.evaluate(() => { const x = new Date(Date.now() + 3 * 86400000); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; });
  let a;
  if (/writing the user's weekly review/.test(system)) {
    const ids = [...prompt.matchAll(/^([\w:-]+) — /gm)].map((m) => m[1]);
    a = { verdict: 'A steady week with your wrestling on top.', priorities: [...ids.slice(0, 1).map((id) => ({ id, text: 'First priority from the app' })), { id: 'made-up', text: 'Run a marathon' }] };
  } else if (/sick/i.test(last)) a = { reply: 'Rest up.', actions: [{ type: 'remember', text: 'Is sick; keep training light.', kind: 'health', until }] };
  else if (/knee/i.test(last)) a = system.includes('LOOKUP RESULTS (you asked') ? { reply: /lunges/.test(system) ? 'In June you said your left knee hurt on lunges.' : 'I found nothing.', actions: [] } : { reply: '', actions: [], lookups: [{ kind: 'conversations', query: 'knee' }] };
  else a = /insight/i.test(system) ? { insights: [] } : { reply: 'OK.', actions: [] };
  const txt = JSON.stringify(a);
  if (url.includes('streamGenerateContent')) return r.fulfill({ status: 200, headers: { ...cors, 'content-type': 'text/event-stream' }, body: `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: txt }] } }] })}\n\n` });
  return r.fulfill(json({ candidates: [{ content: { parts: [{ text: txt }] } }] }));
});
const data = () => p.evaluate(() => JSON.parse(localStorage.getItem('aven.v1') || '{}'));

await p.goto('http://127.0.0.1:5173/'); await wait(p, 900); await skipOnboarding(p); await loadDemo(p);
await p.evaluate(() => localStorage.setItem('aven.keys', JSON.stringify({ gemini: 'AIzaTESTKEY' })));
// a long conversation: the knee came up months ago, 80 messages back (the chat on screen keeps the last 60)
await p.evaluate(() => {
  const t0 = Date.now() - 120 * 86400000;
  const list = [{ id: 'mk0', role: 'user', text: 'My left knee hurts on lunges', at: t0 }, { id: 'mk1', role: 'model', text: 'Swap lunges for split squats for now.', at: t0 + 1000 }];
  for (let i = 2; i < 82; i++) list.push({ id: `mk${i}`, role: i % 2 ? 'model' : 'user', text: `small talk ${i}`, at: t0 + i * 3600000 });
  localStorage.setItem('aven.coach', JSON.stringify(list));
});
await p.reload(); await wait(p, 1600);
const ask = async (text, ms = 2400) => { await p.getByLabel('Message the Coach').fill(text); await p.getByRole('button', { name: 'Send', exact: true }).click(); await wait(p, ms); };

// ── a temporary thing: remembered with its end date ──
await p.getByLabel('Coach').click(); await wait(p, 1000);
await ask('I am sick until thursday');
const mem = (await data()).memory;
assert(mem.some((m) => /sick/i.test(m.text) && /^\d{4}-\d{2}-\d{2}$/.test(m.until)), 'remembered with an end date');
assert(await p.getByText(/^until /).first().isVisible(), 'the card says until when');

// ── long ago, past the chat's 60: the archive holds it and the look-up finds it ──
await ask('what did I say about my knee?', 3000);
assert(await p.getByText('In June you said your left knee hurt on lunges.').isVisible(), 'the old message was found');
const look = seen.filter((x) => /knee/i.test(x.last)).at(-1);
assert(/User: My left knee hurts on lunges/.test(look.system) && /↳ Coach: Swap lunges/.test(look.system), 'with the answer beside it');
await p.screenshot({ path: 'shots/coach3-1-knee.png' });
await p.keyboard.press('Escape'); await wait(p, 900);

// ── the weekly review: numbers by the app, the verdict by the Coach, only the app's candidates kept ──
await p.evaluate(async () => { const { useUI } = await import('/src/state/ui.ts'); useUI.getState().push('weekReview', {}); });
await wait(p, 3500);
assert(await p.getByText('A steady week with your wrestling on top.').isVisible(), 'the verdict');
const reviews = (await data()).reviews;
assert.equal(reviews.length, 1, 'the review is kept');
assert(!reviews[0].priorities.some((x) => x.id === 'made-up'), 'a priority the app did not offer is dropped');
assert(await p.getByText('Sets per muscle').first().isVisible(), 'the muscles');
await p.screenshot({ path: 'shots/coach3-2-review.png' });
const calls = seen.filter((x) => /writing the user's weekly review/.test(x.system)).length;
await p.keyboard.press('Escape'); await wait(p, 900);
await p.evaluate(async () => { const { useUI } = await import('/src/state/ui.ts'); useUI.getState().push('weekReview', {}); });
await wait(p, 1500);
assert.equal(seen.filter((x) => /writing the user's weekly review/.test(x.system)).length, calls, 'reopened: no second AI call');
await p.keyboard.press('Escape'); await wait(p, 900);

// ── Coach memory: the conversation history, searchable ──
await p.getByLabel('Settings').click(); await wait(p, 600);
await p.getByText('Coach memory').first().click(); await wait(p, 800);
await p.getByLabel('Search what you said').fill('knee'); await wait(p, 800);
assert(await p.getByText('My left knee hurts on lunges').first().isVisible(), 'history search finds it');
await p.screenshot({ path: 'shots/coach3-3-memory.png' });

console.log('errors', errors.length);
assert.equal(errors.filter((e) => !/Failed to load resource/.test(e)).length, 0, errors.join('\n'));
console.log('COACH 3 OK');
await b.close();
