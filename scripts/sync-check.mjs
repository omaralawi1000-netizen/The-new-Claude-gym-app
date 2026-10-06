// Read-aloud sync, measured: a stand-in voice with known word times plays through the real tts.ts (audio clock, latency
// handling, estimate and Whisper refinement), and each word's light-up time is compared with when that word really starts.
// Headless audio has no real speaker, so this checks the timing maths and wiring — not a phone's actual output delay.
import { launch } from './lib.mjs';
import assert from 'node:assert/strict';
const { b, p } = await launch({});
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const text = 'Good work today. You pushed eighty kilos for eight reps, which beats last week, so next time try eighty two and a half. Rest well tonight.';
const words = text.split(' ');
const syl = (w) => Math.max(1, (w.toLowerCase().match(/[aeiouy]+/g) || []).length);
// true timing: each word lasts by its syllables (not its letters), joined with 30 ms dips (too short to be a breath);
// a 300 ms breath after a full stop, 180 ms after a comma
const rate = 24000, truth = []; const samples = [];
const add = (sec, on) => { const n = Math.round(sec * rate); for (let i = 0; i < n; i++) samples.push(on ? Math.round(Math.sin(samples.length / 6) * 9000) : 0); };
add(0.12, false);
for (const w of words) { truth.push(samples.length / rate); add(0.09 + 0.16 * syl(w), true); add(/[.!?]$/.test(w) ? 0.3 : /,$/.test(w) ? 0.18 : 0.03, false); }
const wav = () => { const d = Buffer.alloc(samples.length * 2); samples.forEach((v, i) => d.writeInt16LE(v, i * 2)); const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + d.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(d.length, 40); return Buffer.concat([h, d]).toString('base64'); };
await p.route('https://generativelanguage.googleapis.com/**', (r) => r.request().method() === 'OPTIONS' ? r.fulfill({ status: 204, headers: cors })
  : r.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/wav', data: wav() } }] } }] }) }));
// Whisper: the true word starts (relative to the trimmed clip: tts keeps 30 ms before the first sound), a little jitter
await p.route('https://api.groq.com/**', (r) => r.request().method() === 'OPTIONS' ? r.fulfill({ status: 204, headers: cors })
  : r.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ words: words.map((w, i) => ({ word: w, start: +(truth[i] - 0.12 + 0.03 + (i % 3 - 1) * 0.02).toFixed(3) })) }) }));
await p.goto('http://127.0.0.1:5173/'); await p.waitForTimeout(800);
async function measure(groqKey) {
  return p.evaluate(async ([text, groqKey]) => {
    const tts = await import('/src/lib/tts.ts');
    const lit = []; let t0 = null;
    const off = tts.subscribeSpeech(() => { const s = tts.speechState(); if (s.word >= 0 && !lit[s.word]) { const now = performance.now(); t0 ??= now; lit[s.word] = now; } });
    const o = { key: 'x', models: ['m'], voice: 'Kore', groqKey };
    await tts.play(groqKey ? 'a' : 'b', text, o);
    // wait for the end; refinement may land after play() resolves
    await new Promise((res) => { const iv = setInterval(() => { if (tts.speechState().id === null) { clearInterval(iv); res(); } }, 50); });
    off();
    return lit.map((x) => (x - t0) / 1000);
  }, [text, groqKey]);
}
const report = (name, lit) => {
  const rel = truth.map((t) => t - truth[0]);
  const err = lit.map((t, i) => (t == null ? null : t - rel[i]));
  const abs = err.filter((e) => e != null).map(Math.abs);
  const wrong = lit.filter((t, i) => t != null && (i + 1 < rel.length ? t >= rel[i + 1] : false) || (t != null && i > 0 && t < rel[i - 1] + (rel[i] - rel[i - 1]) * 0.5 - 0.05)).length;
  console.log(name, 'words lit', abs.length, '/', words.length, ' mean |err|', (abs.reduce((a, b) => a + b, 0) / abs.length * 1000).toFixed(0), 'ms  max', (Math.max(...abs) * 1000).toFixed(0), 'ms  off-by-a-word', wrong);
  return { max: Math.max(...abs), wrong };
};
const est = report('estimate only   ', await measure(undefined));
// a fresh text key so the clip is fetched again; first play refines in the background, the second uses exact times
await p.evaluate(() => {});
const r1 = report('whisper 1st play', await measure('gsk_x'));
const r2 = report('whisper replay  ', await measure('gsk_x'));
assert(r2.wrong === 0 && r2.max < 0.09, 'with Whisper times every word lights on its own start');
assert(est.wrong <= 2, 'the estimate alone is at most rarely a word off');
await b.close();
