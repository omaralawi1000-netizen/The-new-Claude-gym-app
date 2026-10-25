// Talking live with the orb (lib/live.ts, Omar 25 Oct): the Gemini Live connection is faked at the WebSocket, so this proves
// the wiring — the coach's instructions and the live rules go up, the microphone streams, "log 200 g skyr" becomes Aven's
// own food log with its card, the spoken answer shows as text, and the exchange lands in the Coach's conversation.
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import assert from 'node:assert/strict';
const { b, p, errors } = await launch({});
const sent = { setup: null, audio: 0, toolResponse: null };
const silence = Buffer.alloc(4800).toString('base64'); // 0.1 s at 24 kHz
await p.routeWebSocket(/BidiGenerateContent/, (ws) => {
  let asked = false;
  ws.onMessage((raw) => {
    const m = JSON.parse(typeof raw === 'string' ? raw : Buffer.from(raw).toString());
    if (m.setup) { sent.setup = m.setup; ws.send(JSON.stringify({ setupComplete: {} })); return; }
    if (m.realtimeInput?.audio) {
      sent.audio++;
      if (sent.audio === 3 && !asked) {
        asked = true;
        ws.send(JSON.stringify({ serverContent: { inputTranscription: { text: 'log 200 g skyr' } } }));
        ws.send(JSON.stringify({ toolCall: { functionCalls: [{ id: 'c1', name: 'log_food', args: { foods: [{ name: 'skyr', amount: 200, unit: 'g' }] } }] } }));
      }
      return;
    }
    if (m.toolResponse) {
      sent.toolResponse = m.toolResponse;
      ws.send(JSON.stringify({ serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: silence } }] }, outputTranscription: { text: 'Logget: 200 g skyr.' } } }));
      setTimeout(() => ws.send(JSON.stringify({ serverContent: { turnComplete: true, interactionStatus: 'IDLE' } })), 300);
    }
  });
});
await p.goto('http://127.0.0.1:5173/'); await wait(p, 900); await skipOnboarding(p); await loadDemo(p);
await p.evaluate(() => { localStorage.setItem('aven.keys', JSON.stringify({ gemini: 'AIzaTESTKEY' })); localStorage.setItem('aven.ai', JSON.stringify({ liveOrb: true })); });
await p.reload(); await wait(p, 1500);
const before = await p.evaluate(() => JSON.parse(localStorage.getItem('aven.v1') || '{}').entries?.length ?? 0);
await p.getByRole('button', { name: 'Dictate' }).first().click(); await wait(p, 5000);

assert(sent.setup, 'connected and sent the setup');
assert.match(sent.setup.model, /gemini-3\.8-live-extended-thinking/, 'the extended-thinking live model');
const sys = JSON.stringify(sent.setup.systemInstruction ?? sent.setup);
assert(sys.includes('LIVE VOICE') && sys.includes('DATA (computed'), 'the coach’s own instructions, their data and the live rules');
assert(JSON.stringify(sent.setup.tools ?? '').includes('log_food'), 'log_food offered as a function');
assert(sent.audio >= 3, `the microphone streams (${sent.audio} chunks)`);
assert(sent.toolResponse, 'the log was answered back to the model');
assert.match(JSON.stringify(sent.toolResponse), /Logged|skyr/i, 'it was told what was logged');
await p.screenshot({ path: 'shots/live-1-logged.png' });
assert(await p.getByText('Logget: 200 g skyr.').isVisible(), 'the spoken answer shows as text');
assert(await p.getByText(/Logged/).first().isVisible(), 'Aven’s own food card');
const after = await p.evaluate(() => JSON.parse(localStorage.getItem('aven.v1') || '{}').entries?.length ?? 0);
assert.equal(after, before + 1, 'one food entry was logged');
// the exchange is in the shared conversation
const thread = await p.evaluate(() => localStorage.getItem('aven.coach') || '');
assert(thread.includes('log 200 g skyr') && thread.includes('Logget: 200 g skyr.'), 'the Coach sees what was said live');
// Stop ends the conversation
await wait(p, 1500); await p.screenshot({ path: 'shots/live-2-settled.png' });
await p.getByRole('button', { name: 'Stop', exact: true }).click(); await wait(p, 800);
assert(await p.getByRole('button', { name: /Say more|Speak/ }).first().isVisible(), 'Stop ends the live conversation');
const real = errors.filter((e) => !/Failed to load resource|429|WebSocket/.test(e));
assert.deepEqual(real, [], 'no page errors');
console.log('LIVE OK', JSON.stringify({ audio: sent.audio }));
await b.close();
