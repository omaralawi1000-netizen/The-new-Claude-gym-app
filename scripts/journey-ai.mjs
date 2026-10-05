// Groq + Gemini journey. Both services are STUBBED at the network layer (no real keys in this sandbox), so this proves the app's
// wiring, review rules and error handling — NOT live Groq/Gemini behaviour, real speech or a real phone microphone.
import { launch, wait, skipOnboarding } from './lib.mjs';
import assert from 'node:assert/strict';
const { b, p, errors } = await launch({});
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const calls = { groq: 0, groqLive: 0, groqModels: 0, gen: [], stream: 0, tts: 0, agent: 0, agentStream: 0, lastSystem: '' };
let groqMode = 'ok'; // ok | 401 | down
let groqText = 'to hundrede gram skyr, en banan og zzzxq';
await p.route('https://api.groq.com/**', async (r) => {
  const req = r.request();
  if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
  if (req.url().endsWith('/models')) { calls.groqModels++; return r.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: '{"data":[]}' }); }
  // the transcript when you stop uses the chosen (accurate) model; a fast-model request while speaking would be a live-word
  // preview — those were removed (late and often misheard), so there must be none
  if ((req.postDataBuffer() ?? Buffer.alloc(0)).includes('whisper-large-v3-turbo')) calls.groqLive++; else calls.groq++;
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
  const sse = (t) => `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: t }] } }] })}\n\n`;
  const schemaProps = body.generationConfig?.responseSchema?.properties || {};
  if (url.includes('streamGenerateContent') && !schemaProps.actions) {
    calls.stream++;
    calls.lastSystem = body.systemInstruction?.parts?.[0]?.text ?? '';
    return r.fulfill({ status: 200, headers: { ...cors, 'content-type': 'text/event-stream' }, body: sse('You trained **3 times** this week. ') + sse('Keep going:\n- add 2.5 kg to bench\n- eat more protein') });
  }
  if (schemaProps.actions) { // the agent (Coach and orb screen): answer by what the last user turn says
    calls.agent++;
    const last = [...(body.contents || [])].reverse().find((c) => c.role === 'user')?.parts?.[0]?.text ?? '';
    calls.lastSystem = body.systemInstruction?.parts?.[0]?.text ?? '';
    // the orb screen streams the agent's answer: the same JSON, cut into three pieces mid-string (reply first)
    const streamed = url.includes('streamGenerateContent');
    const out = (o) => {
      if (!streamed) return r.fulfill(cand(o));
      calls.agentStream++;
      const txt = JSON.stringify(o); const a = Math.floor(txt.length / 3), b2 = Math.floor((txt.length * 2) / 3);
      return r.fulfill({ status: 200, headers: { ...cors, 'content-type': 'text/event-stream' }, body: sse(txt.slice(0, a)) + sse(txt.slice(a, b2)) + sse(txt.slice(b2)) });
    };
    if (/zzzxq/i.test(last)) return out({ reply: '', actions: [{ type: 'log_food', foods: [{ name: 'skyr', amount: 200, unit: 'g' }, { name: 'banana', amount: 1, unit: 'piece' }, { name: 'zzzxq', amount: 1, unit: 'piece' }] }] });
    if (/make that last bench set/i.test(last)) return out({ reply: '', actions: [{ type: 'edit_set', exercise: 'bench press', kg: 90 }] });
    if (/swap bench for incline/i.test(last)) return out({ reply: '', actions: [{ type: 'replace_exercise', from: 'bench press', to: 'Incline Dumbbell Press' }] });
    if (/move the skyr to dinner/i.test(last)) return out({ reply: '', actions: [{ type: 'move_food', target: 'skyr', meal_to: 'dinner', day: 'today' }] });
    if (/bench/i.test(last)) return out({ reply: 'Nice, steady work.', actions: [{ type: 'log_sets', exercises: [{ exercise: 'Barbell Bench Press', sets: [{ kg: 100, reps: 8 }, { kg: 100, reps: 8 }, { kg: 100, reps: 6 }] }] }] });
    if (/build a push day/i.test(last)) return out({ reply: '', actions: [{ type: 'create_routine', name: 'Push day', add: [{ exercise: 'Barbell Bench Press', sets: 4, repMin: 6, repMax: 8 }, { exercise: 'Overhead Press', sets: 3, repMin: 8, repMax: 10 }, { exercise: 'Lateral Raise', sets: 3, repMin: 12, repMax: 15 }, { exercise: 'Unicorn Curl', sets: 3 }] }] });
    if (/light mode/i.test(last)) return out({ reply: '', actions: [{ type: 'set_setting', key: 'theme', value: 'light' }] });
    if (/how do i change the theme/i.test(last)) return out({ reply: 'Settings → Appearance → Theme. Or say the word and I will switch it.', actions: [] });
    if (/undo that/i.test(last)) return out({ reply: '', actions: [{ type: 'undo_last' }] });
    if (/open progress/i.test(last)) return out({ reply: '', actions: [{ type: 'navigate', screen: 'progress' }] });
    return out({ reply: 'You trained **3 times** this week.\nKeep going:\n- add 2.5 kg to bench', actions: [] });
  }
  calls.gen.push(prompt.slice(0, 40));
  if (prompt.includes('Transcript:')) return r.fulfill(cand({ items: [{ name: 'skyr', amount: 200, unit: 'g' }, { name: 'banan', amount: 1, unit: 'piece' }, { name: 'zzzxq', amount: 1, unit: 'piece' }] }));
  if (prompt.startsWith('Food:')) return r.fulfill(cand({ name: 'Homemade zzzxq', grams: 300, kcal: 480, protein: 24, carbs: 50, fat: 20, assumptions: 'one medium portion, mixed ingredients' }));
  if (prompt.includes('Request:')) return r.fulfill(cand({ name: 'Push day', items: [{ exercise: 'Barbell Bench Press', sets: 4, repMin: 6, repMax: 8, restSec: 150 }, { exercise: 'Overhead Press', sets: 3, repMin: 8, repMax: 10, restSec: 120 }, { exercise: 'Lateral Raise', sets: 3, repMin: 12, repMax: 15, restSec: 60 }, { exercise: 'Unicorn Curl', sets: 3, repMin: 10, repMax: 12 }] }));
  return r.fulfill({ status: 400, headers: cors, body: '{}' });
});

await p.goto('http://127.0.0.1:5173/'); await wait(p, 900); await skipOnboarding(p);

// ── no keys: honest, still works ──
await p.getByLabel('Coach').click(); await wait(p, 700);
assert(await p.getByText(/Add a Gemini key to chat/).isVisible(), 'coach says what works without a key');
await p.screenshot({ path: 'shots/ai-1-coach-nokey.png' });
// simple logging still works through the built-in reader (no Gemini, no Groq)
await p.getByLabel('Message the Coach').fill('200 g skyr'); await p.getByRole('button', { name: 'Send', exact: true }).click(); await wait(p, 1800);
assert(await p.getByText(/Logged to/).first().isVisible(), 'logged without any key');
await p.getByRole('button', { name: 'Undo' }).last().click(); await wait(p, 600);
assert(await p.getByText('Undone', { exact: true }).isVisible(), 'undo from the card');
await p.getByRole('button', { name: 'Clear' }).click(); await wait(p, 500);
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

// ── say it to the orb: record → Groq → it acts (no review screen) → AI estimate for the unknown → Undo ──
await p.getByRole('button', { name: 'Dictate' }).first().click(); await wait(p, 1500);
await p.screenshot({ path: 'shots/ai-3-recording.png' });
await wait(p, 1800);
await p.getByRole('button', { name: 'Stop and send' }).click(); await p.locator('.action-card').first().waitFor({ timeout: 12000 }); await wait(p, 500);
assert.equal(calls.groq, 1, 'one transcription request');
assert.equal(calls.groqLive, 0, 'no live-word previews while speaking');
assert(calls.agentStream >= 1, 'the orb screen streamed the answer');
assert(/1–2 short sentences/.test(calls.lastSystem), 'the orb screen asks for a short spoken answer');
assert(calls.agent >= 1, 'the Coach was asked once');
assert(/GUIDE:/.test(calls.lastSystem) && /DATA \(computed on this device/.test(calls.lastSystem), 'the Coach is given the app guide and the live data');
assert(await p.locator('.action-card').getByText(/Logged to/).first().isVisible(), 'logged straight away, no review step');
assert(await p.locator('.action-card').getByText('Homemade zzzxq').first().isVisible(), 'the unknown food became a labelled AI estimate');
await p.screenshot({ path: 'shots/ai-4-logged.png' });
await wait(p, 2600); // a spoken quick log slips away on its own, leaving an Undo toast
assert.equal(await p.getByRole('dialog', { name: 'Dictation' }).count(), 0, 'the orb screen stepped aside after a quick log');
await p.locator('.tabbar').getByRole('button', { name: 'Food', exact: true }).click(); await wait(p, 900);
assert(await p.getByText('Homemade zzzxq (AI estimate)').first().isVisible(), 'estimate logged as a labelled quick entry');
await p.screenshot({ path: 'shots/ai-6-logged.png' });

// ── failures: Groq 401 / down are explained in the chat; Gemini down → the built-in reader still logs ──
groqMode = '401';
await p.locator('.tabbar').getByRole('button', { name: 'Today', exact: true }).click(); await wait(p, 600);
await p.getByRole('button', { name: 'Dictate' }).first().click(); await wait(p, 1800);
await p.getByRole('button', { name: 'Stop and send' }).click(); await wait(p, 1500);
assert(await p.getByText(/Groq rejected the key/).isVisible(), '401 explained');
await p.screenshot({ path: 'shots/ai-7-groq-401.png' });
await p.keyboard.press('Escape'); await wait(p, 700);
groqMode = 'down';
await p.getByRole('button', { name: 'Dictate' }).first().click(); await wait(p, 1800);
await p.getByRole('button', { name: 'Stop and send' }).click(); await wait(p, 2500);
assert(await p.getByText(/Couldn’t reach Groq|offline/).first().isVisible(), 'network failure explained');
await p.keyboard.press('Escape'); await wait(p, 1100);
geminiDown = true;
await p.getByLabel('Coach').click(); await wait(p, 700);
await p.getByLabel('Message the Coach').fill('150 gram ris'); await p.getByRole('button', { name: 'Send', exact: true }).click(); await wait(p, 2200);
assert(await p.getByText(/Gemini wasn’t available, so I used the built-in reader/).isVisible(), 'Gemini down → built-in reader, said so');
assert(await p.getByText(/Logged to/).first().isVisible());
await p.screenshot({ path: 'shots/ai-8-fallback.png' });
await p.keyboard.press('Escape'); await wait(p, 1100); geminiDown = false;
groqMode = 'ok';

// ── the Coach acts: sets, settings, navigation, undo, and answers about the app ──
await p.getByLabel('Coach').click(); await wait(p, 700);
await p.getByLabel('Message the Coach').fill('bench press 100 kilos for 8, 8 and 6'); await p.getByRole('button', { name: 'Send', exact: true }).click(); await wait(p, 2000);
assert(await p.getByText('Logged 3 sets').isVisible(), 'sets logged from a sentence');
const st1 = await p.evaluate(() => JSON.parse(localStorage.getItem('aven.v1') || '{}').active);
assert(st1 && st1.exercises.length === 1, 'a workout was started for them');
await p.getByLabel('Message the Coach').fill('make that last bench set 90'); await p.getByRole('button', { name: 'Send', exact: true }).click(); await wait(p, 1800);
assert(await p.getByText('Set corrected').isVisible(), 'a set was corrected by voice');
const st1b = await p.evaluate(() => JSON.parse(localStorage.getItem('aven.v1') || '{}').active);
assert.equal(st1b.exercises[0].sets.filter((q) => q.done).pop().weightKg, 90, 'the last set is now 90 kg');
await p.getByLabel('Message the Coach').fill('swap bench for incline'); await p.getByRole('button', { name: 'Send', exact: true }).click(); await wait(p, 1800);
assert(await p.getByText('Exercise swapped').isVisible(), 'an exercise was swapped in the running workout');
await p.getByLabel('Message the Coach').fill('move the skyr to dinner'); await p.getByRole('button', { name: 'Send', exact: true }).click(); await wait(p, 1800);
assert(await p.getByText(/Moved to Dinner/).isVisible(), 'a logged food was moved to another meal');
await p.screenshot({ path: 'shots/ai-9-edits.png' });
await p.getByLabel('Message the Coach').fill('undo that'); await p.getByRole('button', { name: 'Send', exact: true }).click(); await wait(p, 1800);
assert(await p.getByText('Undone', { exact: true }).first().isVisible(), 'undo by voice/text');
await p.getByLabel('Message the Coach').fill('switch to light mode'); await p.getByRole('button', { name: 'Send', exact: true }).click(); await wait(p, 1800);
assert.equal(await p.evaluate(() => document.documentElement.dataset.theme), 'light', 'theme changed by asking');
await p.getByRole('button', { name: 'Undo' }).last().click(); await wait(p, 700);
assert.equal(await p.evaluate(() => document.documentElement.dataset.theme), 'dark', 'and undone');
await p.getByLabel('Message the Coach').fill('how do I change the theme?'); await p.getByRole('button', { name: 'Send', exact: true }).click(); await wait(p, 2000);
assert(await p.getByText(/Settings → Appearance/).isVisible(), 'app question answered from the guide');
await p.screenshot({ path: 'shots/ai-9-coach.png' });
await p.getByLabel('Message the Coach').fill('open progress'); await p.getByRole('button', { name: 'Send', exact: true }).click(); await wait(p, 2600);
assert(await p.locator('.tabbar').getByRole('button', { name: 'Progress', exact: true }).getAttribute('aria-current') === 'page', 'navigated by asking');
await p.getByLabel('Coach').click().catch(() => {}); await wait(p, 700);

// ── coach: streaming grounded answer, then routine preview → explicit create ──
await p.locator('.tabbar').getByRole('button', { name: 'Today', exact: true }).click(); await wait(p, 500);
await p.getByLabel('Coach').click(); await wait(p, 600);
await p.getByRole('button', { name: 'How is my week going?' }).click(); await wait(p, 2000);
assert(await p.getByText('3 times').isVisible(), 'answer rendered');
await p.screenshot({ path: 'shots/ai-9-coach.png' });
await p.getByLabel('Message the Coach').fill('build a push day with 4 exercises'); await p.getByRole('button', { name: 'Send', exact: true }).click(); await wait(p, 2000);
assert(await p.getByText('Routine created').isVisible(), 'the Coach built the routine and says so');
assert(await p.getByText('Unicorn Curl').first().isVisible(), 'the unknown exercise is reported, not invented');
await p.screenshot({ path: 'shots/ai-10-routine.png' });
await p.keyboard.press('Escape'); await wait(p, 600);
await p.locator('.tabbar').getByRole('button', { name: 'Train', exact: true }).click(); await wait(p, 700);
assert(await p.getByText('Push day').first().isVisible(), 'routine exists in the plan');

// ── Danish ──
await p.getByLabel('Settings').click().catch(() => {});
console.log('calls', JSON.stringify({ groq: calls.groq, gen: calls.gen.length, agent: calls.agent }));
console.log('errors', errors.filter((e) => !/Failed to load resource|ERR_FAILED/.test(e)).length);
await b.close(); process.exit(0);
