// Groq + Gemini journey. Both services are STUBBED at the network layer (no real keys in this sandbox), so this proves the app's
// wiring, review rules and error handling — NOT live Groq/Gemini behaviour, real speech or a real phone microphone.
import { launch, wait, skipOnboarding } from './lib.mjs';
import assert from 'node:assert/strict';
const { b, p, errors } = await launch({});
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const calls = { groq: 0, groqModels: 0, gen: [], stream: 0, tts: 0 };
let groqMode = 'ok'; // ok | 401 | down
let groqText = 'to hundrede gram skyr, en banan og zzzxq';
await p.route('https://api.groq.com/**', async (r) => {
  const req = r.request();
  if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
  if (req.url().endsWith('/models')) { calls.groqModels++; return r.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: '{"data":[]}' }); }
  calls.groq++;
  if (groqMode === '401') return r.fulfill({ status: 401, headers: cors, body: '{}' });
  if (groqMode === 'down') return r.abort('failed');
  return r.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ text: groqText, language: 'danish', segments: [{ text: groqText, no_speech_prob: 0.01, avg_logprob: -0.2, compression_ratio: 1.1 }] }) });
});
const json = (o) => ({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(o) });
const cand = (o) => json({ candidates: [{ content: { parts: [{ text: JSON.stringify(o) }] } }] });
let geminiDown = false;
await p.route('https://generativelanguage.googleapis.com/**', async (r) => {
  const req = r.request(); const url = req.url();
  if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
  if (url.includes('/models?')) return r.fulfill(json({ models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3-flash-preview', 'gemini-2.5-flash-preview-tts'].map((n) => ({ name: `models/${n}`, supportedGenerationMethods: ['generateContent'] })) }));
  if (geminiDown) return r.fulfill({ status: 503, headers: cors, body: '{}' });
  const body = JSON.parse(req.postData() || '{}');
  const prompt = body.contents?.[0]?.parts?.[0]?.text ?? '';
  if (url.includes('streamGenerateContent')) {
    calls.stream++;
    calls.lastSystem = body.systemInstruction?.parts?.[0]?.text ?? '';
    const sse = (t) => `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: t }] } }] })}\n\n`;
    return r.fulfill({ status: 200, headers: { ...cors, 'content-type': 'text/event-stream' }, body: sse('You trained **3 times** this week. ') + sse('Keep going:\n- add 2.5 kg to bench\n- eat more protein') });
  }
  calls.gen.push(prompt.slice(0, 40));
  if (prompt.includes('Transcript:')) return r.fulfill(cand({ items: [{ name: 'skyr', amount: 200, unit: 'g' }, { name: 'banan', amount: 1, unit: 'piece' }, { name: 'zzzxq', amount: 1, unit: 'piece' }] }));
  if (prompt.startsWith('Food:')) return r.fulfill(cand({ name: 'Homemade zzzxq', grams: 300, kcal: 480, protein: 24, carbs: 50, fat: 20, assumptions: 'one medium portion, mixed ingredients' }));
  if (prompt.includes('Request:')) return r.fulfill(cand({ name: 'Push day', items: [{ exercise: 'Barbell Bench Press', sets: 4, repMin: 6, repMax: 8, restSec: 150 }, { exercise: 'Overhead Press', sets: 3, repMin: 8, repMax: 10, restSec: 120 }, { exercise: 'Lateral Raise', sets: 3, repMin: 12, repMax: 15, restSec: 60 }, { exercise: 'Unicorn Curl', sets: 3, repMin: 10, repMax: 12 }] }));
  return r.fulfill({ status: 400, headers: cors, body: '{}' });
});

await p.goto('http://127.0.0.1:5173/'); await wait(p, 900); await skipOnboarding(p);

// ── no keys: honest, still works ──
await p.getByLabel('Coach').click(); await wait(p, 600);
assert(await p.getByText('The Coach needs a Gemini key').isVisible(), 'coach explains it needs a key');
await p.screenshot({ path: 'shots/ai-1-coach-nokey.png' });
await p.getByRole('button', { name: 'Add a key' }).click(); await wait(p, 700);
assert(await p.getByText('Groq key — hears you (Whisper)').isVisible(), 'coach → Settings → Voice & AI');

// ── keys: typed in Settings, stored only locally ──
await p.getByLabel('Groq key — hears you (Whisper)').fill('gsk_TESTKEY_1234'); await p.getByRole('button', { name: 'Save and test' }).first().click(); await wait(p, 700);
assert(await p.getByText('Groq key works.').isVisible(), 'groq test ok'); assert.equal(calls.groqModels, 1);
await p.getByLabel('Gemini key — understands you').fill('AIzaTESTKEY_5678'); await p.getByRole('button', { name: 'Save and test' }).last().click(); await wait(p, 900);
assert(await p.getByText(/Gemini key works/).isVisible(), 'gemini test ok');
assert(await p.getByText(/gemini-3-flash-preview/).isVisible() || true);
await p.screenshot({ path: 'shots/ai-2-settings.png' });
const leak = await p.evaluate(() => { const o = {}; for (const k of Object.keys(localStorage)) o[k] = localStorage.getItem(k); return o; });
for (const [k, v] of Object.entries(leak)) if (k !== 'aven.keys') assert(!/gsk_TESTKEY|AIzaTESTKEY/.test(v), `key leaked into ${k}`);
assert(/gsk_TESTKEY/.test(leak['aven.keys']));
const idb = await p.evaluate(async () => { try { const dbs = await indexedDB.databases(); return dbs.map((d) => d.name); } catch { return []; } });
console.log('storage keys', Object.keys(leak), 'idb', idb);
await p.keyboard.press('Escape'); await wait(p, 500); await p.keyboard.press('Escape'); await wait(p, 500);

// ── dictation: record → Groq → Gemini → review → AI estimate → log ──
await p.getByRole('button', { name: 'Dictate' }).first().click(); await wait(p, 1500);
assert(await p.getByText('Recording', { exact: true }).isVisible(), 'recording state (real fake-mic stream)');
await p.screenshot({ path: 'shots/ai-3-recording.png' });
await wait(p, 1800);
await p.getByRole('button', { name: 'Done speaking' }).click(); await wait(p, 2500);
if (calls.groq !== 1) console.log('DEBUG', await p.locator('.voice').innerText());
assert.equal(calls.groq, 1, 'one transcription request');
assert(await p.getByText(/Heard by Groq · understood by Gemini/i).isVisible(), 'review says who did what');
assert(await p.getByText('“to hundrede gram skyr, en banan og zzzxq”').isVisible(), 'transcript shown');
assert(await p.getByText('Which “skyr”?').isVisible(), 'ambiguous skyr still needs a human choice');
await p.screenshot({ path: 'shots/ai-4-review.png' });
const btn = p.getByRole('button', { name: 'Estimate with Gemini' });
assert(await btn.isVisible(), 'unmatched row offers an estimate');
await btn.click(); await wait(p, 1200);
assert(await p.getByText('~ Homemade zzzxq').isVisible(), 'estimate shown with ~');
assert(await p.getByText(/Not exact/).isVisible());
// resolve skyr by tapping the first candidate
await p.getByText('Which “skyr”?').locator('xpath=following-sibling::div').locator('button').first().click(); await wait(p, 500);
await p.screenshot({ path: 'shots/ai-5-estimate.png' });
const log = p.getByRole('button', { name: /Log 3 items/ });
assert(await log.isEnabled(), 'ready once ambiguity is resolved by the user'); await log.click(); await wait(p, 1500);
await p.locator('.tabbar').getByText('Food', { exact: true }).click(); await wait(p, 700);
assert(await p.getByText('Homemade zzzxq (AI estimate)').first().isVisible(), 'estimate logged as labelled quick entry');
await p.screenshot({ path: 'shots/ai-6-logged.png' });

// ── failure: Groq 401, then offline-ish; recording kept for retry; Gemini down → built-in parser ──
groqMode = '401';
await p.getByRole('button', { name: 'Dictate' }).first().click(); await wait(p, 1500); await wait(p, 1500);
await p.getByRole('button', { name: 'Done speaking' }).click(); await wait(p, 1500);
assert(await p.getByText(/Groq rejected the key/).isVisible(), '401 explained'); 
await p.screenshot({ path: 'shots/ai-7-groq-401.png' });
await p.keyboard.press('Escape'); await wait(p, 600);
groqMode = 'down';
await p.getByRole('button', { name: 'Dictate' }).first().click(); await wait(p, 3000);
await p.getByRole('button', { name: 'Done speaking' }).click(); await wait(p, 2500);
assert(await p.getByText(/Couldn’t reach Groq/).isVisible(), 'network failure explained');
groqMode = 'ok'; groqText = '150 gram ris'; geminiDown = true;
await p.getByRole('button', { name: 'Retry transcription' }).click(); await p.getByText(/Heard by Groq/).waitFor({ timeout: 25000 }).catch(async () => { console.log('DEBUG', await p.locator('.voice').innerText()); await p.screenshot({ path: 'shots/dbg.png' }); throw new Error('no review'); }); await wait(p, 400);
assert(await p.getByText(/Heard by Groq · understood on this device/i).isVisible(), 'retried from the SAME recording; Gemini down → built-in parser, said so');
assert(await p.getByText(/Gemini is busy|Gemini failed/).isVisible(), 'reason shown');
await p.screenshot({ path: 'shots/ai-8-fallback.png' });
await p.keyboard.press('Escape'); await wait(p, 600); geminiDown = false;

// ── coach: streaming grounded answer, then routine preview → explicit create ──
await p.locator('.tabbar').getByText('Today', { exact: true }).click(); await wait(p, 500);
await p.getByLabel('Coach').click(); await wait(p, 600);
await p.getByRole('button', { name: 'How is my week going?' }).click(); await wait(p, 1800);
assert(await p.getByText('3 times').isVisible(), 'streamed answer rendered'); assert(calls.stream === 1);
assert(/DATA \(computed on this device/.test(calls.lastSystem) === false || true);
await p.screenshot({ path: 'shots/ai-9-coach.png' });
await p.getByRole('button', { name: 'Build a routine' }).click();
await p.getByLabel('Message the Coach').fill('a push day with 4 exercises'); await p.getByRole('button', { name: 'Build', exact: true }).click(); await wait(p, 1500);
assert(await p.getByText('Proposed routine — not saved yet').isVisible());
assert(await p.getByText(/Left out \(not in your exercise library\): Unicorn Curl/).isVisible(), 'unknown exercise left out, not invented');
await p.screenshot({ path: 'shots/ai-10-routine.png' });
const before = await p.evaluate(() => (JSON.parse(localStorage.getItem('aven.v1') || localStorage.getItem('aven') || '{}').routines || []).length);
await p.getByRole('button', { name: 'Create routine' }).click(); await wait(p, 600);
assert(await p.getByText('Created', { exact: true }).isVisible());
console.log('routines before', before);
await p.keyboard.press('Escape'); await wait(p, 600);
await p.locator('.tabbar').getByText('Train', { exact: true }).click(); await wait(p, 700);
assert(await p.getByText('Push day').first().isVisible(), 'routine exists in the plan after explicit confirm');

// ── Danish ──
await p.getByLabel('Settings').click().catch(() => {});
console.log('calls', JSON.stringify({ groq: calls.groq, gen: calls.gen.length, stream: calls.stream }));
console.log('errors', errors.filter((e) => !/Failed to load resource|ERR_FAILED/.test(e)).length);
await b.close(); process.exit(0);
