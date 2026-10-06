// GPT-6.1 Sol journey. OpenAI and Gemini are STUBBED at the network layer (no real keys here), so this proves the wiring —
// key handling, which brain answers, how hard it is asked to think, streaming, the Gemini fallback — NOT live model quality.
import { launch, wait, skipOnboarding } from './lib.mjs';
import assert from 'node:assert/strict';
const { b, p, errors } = await launch({});
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const json = (o, status = 200) => ({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(o) });
const calls = { models: 0, responses: [], gemini: 0 };
let solMode = 'ok'; // ok | broke (out of credit)
await p.route('https://api.openai.com/**', async (r) => {
  const req = r.request(); const url = req.url();
  if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
  if (url.includes('/models/')) { calls.models++; return r.fulfill(json({ id: 'gpt-6.1-sol', object: 'model' })); }
  const body = JSON.parse(req.postData() || '{}');
  calls.responses.push({ effort: body.reasoning?.effort, stream: body.stream, store: body.store, model: body.model, auth: req.headers().authorization, strict: body.text?.format?.strict, last: [...body.input].reverse().find((m) => m.role === 'user')?.content });
  if (solMode === 'broke') return r.fulfill(json({ error: { code: 'insufficient_quota', message: 'You exceeded your current quota' } }, 429));
  const last = String(calls.responses.at(-1).last);
  const answer = /bench/i.test(last)
    ? { reply: 'Nice, logged.', actions: [{ type: 'log_sets', exercises: [{ exercise: 'Barbell Bench Press', sets: [{ kg: 100, reps: 8, durationSec: null, distanceKm: null }] }] }] }
    : { reply: 'Sol here: you trained **3 times** this week.', actions: [] };
  const txt = JSON.stringify(answer);
  if (!body.stream) return r.fulfill(json({ status: 'completed', output: [{ type: 'reasoning', summary: [] }, { type: 'message', content: [{ type: 'output_text', text: txt }] }] }));
  const ev = (o) => `event: ${o.type}\ndata: ${JSON.stringify(o)}\n\n`;
  const cut = [txt.slice(0, 20), txt.slice(20, 45), txt.slice(45)];
  return r.fulfill({ status: 200, headers: { ...cors, 'content-type': 'text/event-stream' }, body: ev({ type: 'response.created' }) + cut.map((d) => ev({ type: 'response.output_text.delta', delta: d })).join('') + ev({ type: 'response.completed' }) });
});
await p.route('https://generativelanguage.googleapis.com/**', async (r) => {
  const req = r.request(); const url = req.url();
  if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
  if (url.includes('/models?')) return r.fulfill(json({ models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-flash-preview-tts'].map((n) => ({ name: `models/${n}`, supportedGenerationMethods: ['generateContent'] })) }));
  const body = JSON.parse(req.postData() || '{}');
  if (body.generationConfig?.responseModalities?.includes('AUDIO')) return r.fulfill(json({ candidates: [] }));
  calls.gemini++;
  const txt = JSON.stringify({ reply: 'Gemini here: all good.', actions: [] });
  if (url.includes('streamGenerateContent')) return r.fulfill({ status: 200, headers: { ...cors, 'content-type': 'text/event-stream' }, body: `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: txt }] } }] })}\n\n` });
  return r.fulfill(json({ candidates: [{ content: { parts: [{ text: txt }] } }] }));
});

await p.goto('http://127.0.0.1:5173/'); await wait(p, 900); await skipOnboarding(p);
// ── keys in Settings: Gemini (free fallback) and OpenAI (Sol) ──
await p.getByLabel('Settings').click(); await wait(p, 500);
await p.getByText('Voice & AI').click(); await wait(p, 600);
await p.getByLabel('Gemini key — understands you').fill('AIzaTESTKEY_5678'); await p.getByRole('button', { name: 'Save and test' }).nth(1).click(); await wait(p, 800);
await p.getByLabel('OpenAI key — GPT-6.1 Sol (paid)').fill('sk-proj-TESTKEY_9999'); await p.getByRole('button', { name: 'Save and test' }).nth(2).click(); await wait(p, 800);
assert(await p.getByText('OpenAI key works. GPT-6.1 Sol now answers the orb and the Coach.').isVisible(), 'openai key tested');
assert.equal(calls.models, 1);
assert(await p.getByText('Thinking — orb').isVisible() && await p.getByText('Thinking — Coach').isVisible(), 'brain and thinking controls appear with a key');
await p.screenshot({ path: 'shots/sol-1-settings.png' });
const store = await p.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])));
for (const [k, v] of Object.entries(store)) if (k !== 'aven.keys') assert(!/sk-proj-TESTKEY/.test(v), `key leaked into ${k}`);
assert(/sk-proj-TESTKEY/.test(store['aven.keys']), 'the key lives only under aven.keys');
await p.keyboard.press('Escape'); await wait(p, 500); await p.keyboard.press('Escape'); await wait(p, 600);

// ── the Coach: Sol on High, streamed ──
await p.getByLabel('Coach').click(); await wait(p, 700);
assert(await p.getByText(/Messages go to OpenAI/).isVisible(), 'the Coach says where messages go');
await p.getByLabel('Message the Coach').fill('why am I stuck? plan my next week'); await p.getByRole('button', { name: 'Send', exact: true }).click(); await wait(p, 1800);
assert(await p.getByText(/Sol here/).isVisible(), 'Sol answered in the Coach');
let c = calls.responses.at(-1);
assert.deepEqual([c.model, c.effort, c.stream, c.store, c.strict, c.auth], ['gpt-6.1-sol', 'high', true, false, true, 'Bearer sk-proj-TESTKEY_9999'], 'a planning question: Sol thinks as hard as the Coach setting allows, streamed, not stored');
await p.getByLabel('Message the Coach').fill('bench 100 for 8'); await p.getByRole('button', { name: 'Send', exact: true }).click(); await wait(p, 2000);
assert(await p.getByText('Logged 1 set').isVisible() || await p.getByText(/Logged/).first().isVisible(), 'Sol’s actions are carried out');
await p.screenshot({ path: 'shots/sol-2-coach.png' });

// ── out of credit: Gemini answers, and says why ──
solMode = 'broke'; const g0 = calls.gemini;
await p.getByLabel('Message the Coach').fill('how is my week going?'); await p.getByRole('button', { name: 'Send', exact: true }).click(); await wait(p, 2200);
assert(calls.gemini > g0, 'Gemini took over');
assert(await p.getByText(/Gemini here/).isVisible(), 'the Gemini answer is shown');
assert(await p.getByText(/out of credit, so Gemini answered/).isVisible(), 'the switch is explained');
await p.screenshot({ path: 'shots/sol-3-fallback.png' });
solMode = 'ok';
await p.keyboard.press('Escape'); await wait(p, 900);

// ── the orb: Sol on Medium ──
await p.getByRole('button', { name: 'Dictate' }).first().click(); await wait(p, 1200);
if (await p.getByRole('button', { name: 'Type instead' }).isVisible().catch(() => false)) { await p.getByRole('button', { name: 'Type instead' }).click(); await wait(p, 300); }
await p.getByLabel('Type what you ate or did').fill('how is my week going?');
await p.getByRole('dialog', { name: 'Dictation' }).getByRole('button', { name: 'Send', exact: true }).click(); await wait(p, 2200);
c = calls.responses.at(-1);
assert.equal(c.effort, 'low', 'a quick question answers fast (low effort), whatever the setting');
assert(await p.getByText(/Sol here/).first().isVisible(), 'Sol answered on the orb screen');
await p.screenshot({ path: 'shots/sol-4-orb.png' });

// ── switch back to Gemini: Sol is not asked ──
await p.getByRole('dialog', { name: 'Dictation' }).getByRole('button', { name: 'Close' }).click(); await wait(p, 1000); // typing box has focus, so Escape stays with it
await p.getByLabel('Settings').click(); await wait(p, 500); await p.getByText('Voice & AI').click(); await wait(p, 600);
await p.getByRole('tab', { name: 'Gemini', exact: true }).click(); await wait(p, 300);
await p.keyboard.press('Escape'); await wait(p, 500); await p.keyboard.press('Escape'); await wait(p, 600);
const n = calls.responses.length;
await p.getByLabel('Coach').click(); await wait(p, 700);
await p.getByLabel('Message the Coach').fill('how is my week going?'); await p.getByRole('button', { name: 'Send', exact: true }).click(); await wait(p, 1800);
assert.equal(calls.responses.length, n, 'with Brain = Gemini, OpenAI is not called');
assert(await p.getByText(/Gemini here/).last().isVisible());

const real = errors.filter((e) => !/Failed to load resource|429/.test(e));
assert.deepEqual(real, [], 'no page errors');
console.log('SOL JOURNEY OK', calls.responses.map((x) => x.effort).join(','));
await b.close();
