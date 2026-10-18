// Coach 2.0, phase 5b, part C, in the real app (Gemini STUBBED). A failed answer shows Try again, which asks once more
// from the same bubble (the question is never sent twice); a long wait says "Still thinking…"; words typed while it
// answers wait in the field and go by themselves when the answer is done; with no answer the note is never the answer.
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import assert from 'node:assert/strict';
const { b, p, errors } = await launch({ theme: process.argv[2] || 'dark' });
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const json = (o) => ({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(o) });
let fail = 0, slowMs = 0;
const asked = [];
await p.route('https://generativelanguage.googleapis.com/**', async (r) => {
  const req = r.request(); const url = req.url();
  if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
  if (url.includes('/models?')) return r.fulfill(json({ models: ['gemini-2.5-flash'].map((n) => ({ name: `models/${n}`, supportedGenerationMethods: ['generateContent'] })) }));
  const body = JSON.parse(req.postData() || '{}');
  if (body.generationConfig?.responseModalities?.includes('AUDIO')) return r.fulfill(json({ candidates: [] }));
  const system = body.systemInstruction?.parts?.[0]?.text ?? '';
  if (/insight/i.test(system)) return r.fulfill(json({ candidates: [{ content: { parts: [{ text: '{"insights":[]}' }] } }] }));
  const contents = body.contents ?? [];
  const last = [...contents].reverse().find((c) => c.role === 'user')?.parts?.map((x) => x.text ?? '').join('') ?? '';
  asked.push({ last, users: contents.filter((c) => c.role === 'user').map((c) => c.parts.map((x) => x.text ?? '').join('')).join(' || ') });
  if (fail > 0) { fail--; return r.fulfill({ status: 500, headers: { ...cors, 'content-type': 'application/json' }, body: '{"error":{"code":500,"message":"boom"}}' }); }
  if (slowMs) await new Promise((ok) => setTimeout(ok, slowMs));
  const a = { reply: /week/i.test(last) ? 'Your week looks solid: three workouts.' : /protein/i.test(last) ? 'About 140 g so far.' : 'OK.', actions: [] };
  const txt = JSON.stringify(a);
  if (url.includes('streamGenerateContent')) return r.fulfill({ status: 200, headers: { ...cors, 'content-type': 'text/event-stream' }, body: `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: txt }] } }] })}\n\n` }).catch(() => {});
  return r.fulfill(json({ candidates: [{ content: { parts: [{ text: txt }] } }] })).catch(() => {});
});

await p.goto('http://127.0.0.1:5173/'); await wait(p, 900); await skipOnboarding(p); await loadDemo(p);
await p.evaluate(() => localStorage.setItem('aven.keys', JSON.stringify({ gemini: 'AIzaTESTKEY' })));
await p.reload(); await wait(p, 1600);
await p.getByLabel('Coach').click(); await wait(p, 1000);
const field = p.getByLabel('Message the Coach');
const send = () => p.getByRole('button', { name: 'Send', exact: true }).click();

// ── a failed answer: Try again from the same bubble ──
fail = 3; // (every model the app tries fails)
await field.fill('how was my week?'); await send(); await wait(p, 3500);
const err = p.locator('.coach-err').last();
assert(await err.isVisible(), 'the error row');
await p.screenshot({ path: 'shots/coach5-1-error.png' });
fail = 0; asked.length = 0;
await err.getByRole('button', { name: 'Try again' }).click(); await wait(p, 3000);
assert(await p.getByText('Your week looks solid').isVisible(), 'Try again answers');
assert.equal(await p.locator('.said', { hasText: 'how was my week?' }).count(), 1, 'from the same bubble (not sent again as a new one)');
assert.equal(await p.locator('.coach-err').count(), 0, 'the error row is gone');
assert(!/how was my week\?.*how was my week\?/.test(asked.at(-1).users), 'the model got the question once');

// ── typed while it answers: waits, then goes by itself ──
slowMs = 15000;
await field.fill('and my protein?'); await send(); await wait(p, 600);
await field.fill('thanks!');
assert.equal(await p.getByRole('button', { name: 'Send', exact: true }).count(), 1, 'with words in the field it is Send, not Stop');
await send(); await wait(p, 300);
assert.equal(await field.inputValue(), 'thanks!', 'the words wait in the field');
await wait(p, 8000);
await p.locator('.coach-look', { hasText: 'Still thinking…' }).waitFor({ state: 'visible', timeout: 3000 }); // a long wait is said
await p.screenshot({ path: 'shots/coach5-2-thinking.png' });
slowMs = 0;
await wait(p, 9000);
assert(await p.getByText('About 140 g so far.').isVisible(), 'the answer');
await wait(p, 3000);
assert.equal(await p.locator('.said', { hasText: 'thanks!' }).count(), 1, 'then the waiting words were sent');
assert.equal(await field.inputValue(), '');

console.log('errors', errors.length);
assert.equal(errors.filter((e) => !/Failed to load resource/.test(e)).length, 0, errors.join('\n'));
console.log('COACH 5 OK');
await b.close();
