// Talking live with the orb (lib/live.ts, Omar 25 Oct): the Gemini Live connection is faked at the WebSocket, so this proves
// the wiring — the coach's instructions, the live rules and Aven's functions go up (everything the Coach does, look-ups,
// Google Search), Danish and English only; "log 200 g skyr" becomes Aven's own food log with its card; a look-up answers
// from the data; the connection is renewed quietly (the conversation carried over); the turn's cost counts in the month;
// talking shows only the answer now with your words below (like Gemini); typing shows the whole conversation.
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import assert from 'node:assert/strict';
const { b, p, errors } = await launch({});
const setups = [];
const sent = { audio: 0, toolResponses: [] };
const silence = Buffer.alloc(4800).toString('base64'); // 0.1 s at 24 kHz
const usage = { promptTokenCount: 20000, responseTokenCount: 400, promptTokensDetails: [{ modality: 'TEXT', tokenCount: 18000 }, { modality: 'AUDIO', tokenCount: 2000 }], responseTokensDetails: [{ modality: 'AUDIO', tokenCount: 400 }] };
let step = 0;
await p.routeWebSocket(/BidiGenerateContent/, (ws) => {
  let idx = -1, mine = 0; // this connection's place, and its microphone chunks
  const say = (o) => ws.send(JSON.stringify(o));
  const answer = (text) => {
    say({ serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: silence } }] }, outputTranscription: { text } } });
    setTimeout(() => { say({ usageMetadata: usage }); say({ serverContent: { turnComplete: true, interactionStatus: 'IDLE' } }); }, 300);
  };
  ws.onMessage((raw) => {
    const m = JSON.parse(typeof raw === 'string' ? raw : Buffer.from(raw).toString());
    if (m.setup) { idx = setups.length; setups.push(m.setup); say({ setupComplete: {} }); say({ sessionResumptionUpdate: { resumable: true, newHandle: `h${setups.length}` } }); return; }
    if (m.toolResponse) {
      sent.toolResponses.push(m.toolResponse);
      if (step === 1) answer('Logget: 200 g skyr.');
      if (step === 2) answer('Du mangler omkring 60 gram.');
      return;
    }
    if (!m.realtimeInput?.audio) return;
    sent.audio++;
    if (idx !== setups.length - 1) return; // (only the newest connection plays the script)
    mine++;
    if (mine === 3 && step === 0) {
      step = 1;
      say({ serverContent: { inputTranscription: { text: 'log 200 g skyr' } } });
      say({ toolCall: { functionCalls: [{ id: 'c1', name: 'aven', args: { actions: [{ type: 'log_food', foods: [{ name: 'skyr', amount: 200, unit: 'g' }] }] } }] } });
    }
    if (mine === 90 && step === 1) { step = 1.5; say({ goAway: { timeLeft: '1s' } }); } // the server asks for a new connection
    if (step === 1.5 && setups.some((x) => x.sessionResumption?.handle)) {
      step = 2;
      say({ serverContent: { inputTranscription: { text: 'hvor meget protein mangler jeg' } } });
      say({ toolCall: { functionCalls: [{ id: 'c2', name: 'look_up', args: { lookups: [{ kind: 'nutrition', from: null, to: null }] } }] } });
    }
  });
});
await p.goto('http://127.0.0.1:5173/'); await wait(p, 900); await skipOnboarding(p); await loadDemo(p);
await p.evaluate(() => { localStorage.setItem('aven.keys', JSON.stringify({ gemini: 'AIzaTESTKEY' })); localStorage.setItem('aven.ai', JSON.stringify({ liveOrb: true })); localStorage.removeItem('aven.solSpend'); });
await p.reload(); await wait(p, 1500);
const before = await p.evaluate(() => JSON.parse(localStorage.getItem('aven.v1') || '{}').entries?.length ?? 0);
await p.getByRole('button', { name: 'Dictate' }).first().click(); await wait(p, 5000);

const s0 = setups[0];
assert(s0, 'connected and sent the setup');
assert.match(s0.model, /gemini-3\.8-live-extended-thinking/, 'the extended-thinking live model');
const sys = JSON.stringify(s0.systemInstruction ?? s0);
assert(sys.includes('LIVE VOICE') && sys.includes('DATA (computed'), 'the coach’s own instructions, their data and the live rules');
const tools = JSON.stringify(s0.tools ?? '');
assert(tools.includes('"aven"') && tools.includes('log_sets') && tools.includes('set_setting'), 'everything the Coach does, as one function');
assert(tools.includes('look_up') && tools.includes('googleSearch'), 'look-ups and Google Search');
assert.deepEqual(s0.inputAudioTranscription?.languageCodes, ['da-DK', 'en-US'], 'Danish and English only');
assert(s0.contextWindowCompression && s0.sessionResumption, 'no time limit; renewable');
assert(sent.audio >= 3, `the microphone streams (${sent.audio} chunks)`);
assert.match(JSON.stringify(sent.toolResponses[0] ?? ''), /Logged|skyr/i, 'it was told what was logged');
await p.screenshot({ path: 'shots/live-1-logged.png' });
assert(await p.getByText('Logget: 200 g skyr.').isVisible(), 'the spoken answer shows as text');
assert(await p.getByText(/Logged/).first().isVisible(), 'Aven’s own food card');
assert(await p.getByText('log 200 g skyr').isVisible(), 'what you said shows under it');
const after = await p.evaluate(() => JSON.parse(localStorage.getItem('aven.v1') || '{}').entries?.length ?? 0);
assert.equal(after, before + 1, 'one food entry was logged');
const thread = await p.evaluate(() => localStorage.getItem('aven.coach') || '');
assert(thread.includes('log 200 g skyr') && thread.includes('Logget: 200 g skyr.'), 'the Coach sees what was said live');
const spent = await p.evaluate(() => JSON.parse(localStorage.getItem('aven.solSpend') || '{}').usd ?? 0);
assert(spent > 0.01 && spent < 0.05, `the turn’s cost counts in the month (${spent} USD)`);

// the server asks for a new connection: a quiet reconnect, the conversation carried over, then a look-up
for (let i = 0; i < 40 && !(await p.getByText('Du mangler omkring 60 gram.').isVisible()); i++) await wait(p, 500);
// (the dev server starts the screen twice on purpose: a first connection is opened and dropped; the real app opens one)
const renewed = setups.filter((x) => x.sessionResumption?.handle);
assert.equal(renewed.length, 1, 'reconnected once');
assert.equal(renewed[0].sessionResumption.handle, `h${setups.indexOf(renewed[0])}`, 'the conversation carried over');
assert.match(JSON.stringify(sent.toolResponses[1] ?? ''), /protein|kcal|Food/i, 'the look-up answered from the data');
assert(await p.getByText('Du mangler omkring 60 gram.').isVisible(), 'the second answer shows');
assert(!(await p.getByText('Logget: 200 g skyr.').isVisible()), 'talking: only the answer now (calm, like Gemini)');
assert(await p.getByText('hvor meget protein mangler jeg').isVisible(), 'your latest words stay below');
assert(await p.getByRole('button', { name: 'Mute' }).isVisible() && await p.getByRole('button', { name: 'Camera on' }).isVisible(), 'mute and camera');
await p.screenshot({ path: 'shots/live-2-talking.png' });
await p.getByRole('button', { name: 'Mute' }).click(); await wait(p, 300);
assert(await p.getByText('Muted').isVisible(), 'muted says so');
// typing: the whole conversation
await p.getByRole('button', { name: 'Type instead' }).click(); await wait(p, 1200);
await p.screenshot({ path: 'shots/live-3-typing.png' });
assert(await p.getByText('Logget: 200 g skyr.').isVisible() && await p.getByText('Du mangler omkring 60 gram.').isVisible(), 'typing: the whole conversation');
const real = errors.filter((e) => !/Failed to load resource|429|WebSocket/.test(e));
assert.deepEqual(real, [], 'no page errors');
console.log('LIVE OK', JSON.stringify({ audio: sent.audio, connections: setups.length, usd: spent }));
await b.close();
