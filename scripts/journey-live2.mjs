// The live orb under stress (25 Oct): a long conversation (it follows the newest, nothing overlaps), Danish and the light
// theme, "Tap to interrupt" while it speaks, and the two ways it must step aside for the normal orb: no connection, and
// the month's AI limit reached. Gemini Live is faked at the WebSocket (see journey-live.mjs).
import { launch, wait, skipOnboarding, loadDemo, applySettings } from './lib.mjs';
import assert from 'node:assert/strict';

const voice = (sec) => Buffer.alloc(48000 * sec).toString('base64'); // sec seconds at 24 kHz (silence that still "plays")
async function open({ theme = 'dark', lang = 'en', ws, ai = {} }) {
  const { b, p, errors } = await launch({ theme });
  await p.routeWebSocket(/BidiGenerateContent/, ws);
  await p.goto('http://127.0.0.1:5173/'); await wait(p, 900); await skipOnboarding(p); await loadDemo(p);
  await p.evaluate((ai) => {
    localStorage.setItem('aven.keys', JSON.stringify({ gemini: 'AIzaTESTKEY' }));
    localStorage.setItem('aven.ai', JSON.stringify({ liveOrb: true, ...ai }));
  }, ai);
  if (lang !== 'en') await applySettings(p, { language: lang }); else { await p.reload(); await wait(p, 1500); }
  await p.getByRole('button', { name: lang === 'da' ? 'Indtal' : 'Dictate' }).first().click();
  return { b, p, errors };
}
const real = (errors) => errors.filter((e) => !/Failed to load resource|429|WebSocket/.test(e));

// 1. a long conversation, Danish, light: eight exchanges, the newest in view, the orb small, the type box at the bottom
{
  const lines = Array.from({ length: 8 }, (_, i) => [`spørgsmål nummer ${i + 1} om min træning`, `Svar nummer ${i + 1}: ${'det går fint, bliv ved. '.repeat(1 + (i % 3))}`]);
  let n = 0, mine = 0, idx = -1, setups = 0;
  const { b, p, errors } = await open({ theme: 'light', lang: 'da', ws: (ws) => {
    const say = (o) => ws.send(JSON.stringify(o));
    ws.onMessage((raw) => {
      const m = JSON.parse(typeof raw === 'string' ? raw : Buffer.from(raw).toString());
      if (m.setup) { idx = setups++; say({ setupComplete: {} }); return; }
      if (!m.realtimeInput?.audio || idx !== setups - 1) return;
      mine++;
      if (mine % 12 === 0 && n < lines.length) {
        const [q, a] = lines[n++];
        say({ serverContent: { inputTranscription: { text: q } } });
        say({ serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: voice(0.1) } }] }, outputTranscription: { text: a } } });
        setTimeout(() => say({ serverContent: { turnComplete: true, interactionStatus: 'IDLE' } }), 200);
      }
    });
  } });
  for (let i = 0; i < 60 && !(await p.getByText(/^Svar nummer 8/).isVisible().catch(() => false)); i++) await wait(p, 500);
  await wait(p, 1500);
  await p.screenshot({ path: 'shots/live-5-long-da-light.png' });
  const box = await p.getByText(/^Svar nummer 8/).boundingBox();
  const input = await p.getByLabel('Skriv en besked').boundingBox();
  assert(box && input && box.y + box.height <= input.y, 'the newest answer is in view, above the type box');
  assert(await p.getByPlaceholder('Spørg Aven').isVisible(), 'Danish');
  assert.deepEqual(real(errors), [], 'no page errors (long conversation)');
  await b.close();
  console.log('long conversation OK');
}

// 2. Tap to interrupt: shown while its voice plays, and tapping it stops the voice
{
  let mine = 0, idx = -1, setups = 0, said = false;
  const { b, p, errors } = await open({ ws: (ws) => {
    const say = (o) => ws.send(JSON.stringify(o));
    ws.onMessage((raw) => {
      const m = JSON.parse(typeof raw === 'string' ? raw : Buffer.from(raw).toString());
      if (m.setup) { idx = setups++; say({ setupComplete: {} }); return; }
      if (!m.realtimeInput?.audio || idx !== setups - 1) return;
      if (++mine === 5 && !said) {
        said = true;
        say({ serverContent: { inputTranscription: { text: 'tell me a long story' } } });
        say({ serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: voice(6) } }] }, outputTranscription: { text: 'Once upon a time…' } } });
      }
    });
  } });
  await wait(p, 3200);
  const chip = p.getByRole('button', { name: 'Tap to interrupt' });
  assert.equal(await chip.evaluate((el) => getComputedStyle(el).opacity), '1', 'Tap to interrupt shows while it speaks');
  await p.screenshot({ path: 'shots/live-6-speaking.png' });
  await chip.click(); await wait(p, 700);
  assert.equal(await p.locator('.interrupt').evaluate((el) => el.classList.contains('off')), true, 'tapping it stops the voice');
  assert.deepEqual(real(errors), [], 'no page errors (interrupt)');
  await b.close();
  console.log('interrupt OK');
}

// 3. no connection: the normal orb answers, and says why
{
  const { b, p } = await open({ ws: (ws) => { ws.close({ code: 1011, reason: 'down' }); } });
  for (let i = 0; i < 30 && !(await p.getByText('Live couldn’t connect, so the normal orb answers.').isVisible()); i++) await wait(p, 500);
  await p.screenshot({ path: 'shots/live-7-noconnect.png' });
  assert(await p.getByText('Live couldn’t connect, so the normal orb answers.').isVisible(), 'falls back to the normal orb, and says so');
  assert(!(await p.getByLabel('Type a message').isVisible()), 'no live controls');
  await b.close();
  console.log('no connection OK');
}

// 4. the month's limit reached: no live connection at all
{
  let connected = false;
  const { b, p } = await open({ ai: { solLimitKr: 1 }, ws: () => { connected = true; } });
  await p.evaluate(() => { const m = new Date(); localStorage.setItem('aven.solSpend', JSON.stringify({ month: `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`, usd: 5, calls: 1 })); });
  await p.reload(); await wait(p, 1500); connected = false;
  await p.getByRole('button', { name: 'Dictate' }).first().click(); await wait(p, 3000);
  assert(!connected, 'over the limit: Live isn’t used');
  await b.close();
  console.log('limit OK');
}
// 5. leaving Aven while talking live: the microphone goes off at once; back soon, it carries on; away 30 s, it has ended
{
  let audio = 0, ended = 0;
  const { b, p, errors } = await open({ ws: (ws) => {
    ws.onMessage((raw) => {
      const m = JSON.parse(typeof raw === 'string' ? raw : Buffer.from(raw).toString());
      if (m.setup) { ws.send(JSON.stringify({ setupComplete: {} })); return; }
      if (m.realtimeInput?.audio) audio++;
      if (m.realtimeInput?.audioStreamEnd) ended++;
    });
  } });
  await wait(p, 3000);
  const hide = (h) => p.evaluate((h) => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => h }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') }); document.dispatchEvent(new Event('visibilitychange')); }, h);
  await hide(true); await wait(p, 600);
  const a0 = audio; await wait(p, 1500);
  assert(ended >= 1 && audio - a0 <= 1, `leaving: the microphone goes off at once (${audio - a0} chunks after)`);
  await hide(false); await wait(p, 1500);
  assert(audio - a0 > 5, 'back within 30 s: it carries on');
  await hide(true); await wait(p, 31500);
  await hide(false); await wait(p, 1200);
  assert(!(await p.getByLabel('Type a message').isVisible()), 'away 30 s: the conversation has ended and the orb closed');
  assert.deepEqual(real(errors), [], 'no page errors (leaving)');
  await b.close();
  console.log('leaving OK');
}
console.log('LIVE2 OK');
