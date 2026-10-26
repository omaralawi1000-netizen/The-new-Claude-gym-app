// Only you, live (Omar, 26 Oct: "it hears itself… I want it to only hear me", "the text isn't live when I speak"): the
// microphone gate (lib/micGate.ts) sends silence until there is a voice, then the sound itself; the moment you are heard your
// bubble is there with three dots that move with your voice, and your words come into it as they are understood. The fake
// microphone beeps (a sound well above the quiet room), which stands in for your voice; Gemini Live is faked at the WebSocket.
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import assert from 'node:assert/strict';
const { b, p, errors } = await launch({});
const got = { zero: 0, sound: 0 };
let setup = null, ws0 = null;
await p.routeWebSocket(/BidiGenerateContent/, (ws) => {
  ws0 = ws;
  ws.onMessage((raw) => {
    const m = JSON.parse(typeof raw === 'string' ? raw : Buffer.from(raw).toString());
    if (m.setup) { setup = m.setup; ws.send(JSON.stringify({ setupComplete: {} })); return; }
    const a = m.realtimeInput?.audio?.data; if (!a) return;
    const pcm = Buffer.from(a, 'base64'); let loud = false; for (let i = 0; i < pcm.length; i += 2) if (Math.abs(pcm.readInt16LE(i)) > 300) { loud = true; break; }
    got[loud ? 'sound' : 'zero']++;
  });
});
await p.goto('http://127.0.0.1:5173/'); await wait(p, 900); await skipOnboarding(p); await loadDemo(p);
await p.evaluate(() => { localStorage.setItem('aven.keys', JSON.stringify({ gemini: 'AIzaTESTKEY' })); localStorage.setItem('aven.ai', JSON.stringify({ liveOrb: true })); });
await p.reload(); await wait(p, 1500);
await p.getByRole('button', { name: 'Dictate' }).first().click(); await wait(p, 5000);
assert.equal(setup?.realtimeInputConfig?.automaticActivityDetection?.startOfSpeechSensitivity, 'START_SENSITIVITY_LOW', 'only a clear voice starts a turn');
assert(got.sound > 0, `a voice goes up as it is (${JSON.stringify(got)})`);
assert.equal(await p.locator('.voice .said .said-ear').count(), 1, 'your bubble is there with its listening dots, before any words');
await p.screenshot({ path: 'shots/hear-1-dots.png' });
ws0.send(JSON.stringify({ serverContent: { inputTranscription: { text: 'what did I eat' } } }));
// (they come in one by one at a calm pace; a slow test machine needs a moment)
for (let i = 0; i < 30 && !/eat/.test(await p.locator('.voice .said').first().innerText()); i++) await wait(p, 200);
assert.match(await p.locator('.voice .said').first().innerText(), /what did I eat/, 'your words come into the same bubble');
await p.screenshot({ path: 'shots/hear-2-words.png' });
const real = errors.filter((e) => !/Failed to load resource|429|WebSocket/.test(e));
assert.deepEqual(real, [], 'no page errors');
await b.close();
console.log('HEAR OK', JSON.stringify(got));
