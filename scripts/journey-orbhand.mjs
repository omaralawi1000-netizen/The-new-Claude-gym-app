// The orb in your hand (Omar, 26 Oct): pulled up out of the dock it comes with your finger and springs back with a bounce,
// or opens when pulled high enough; on its own screen it follows your finger, a short drag springs back, a swipe down puts
// it away; a tap still works; talking live it becomes Stardust. The orb drawn on the stage
// follows its moved slot. Gemini Live is faked at the WebSocket (see journey-live.mjs).
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// (a silent microphone: the fake one beeps, and a beep is a voice to the orb, which then starts your bubble)
const quiet = join(tmpdir(), 'aven-silence.wav'), n = 32000;
const wav = Buffer.alloc(44 + n * 2); wav.write('RIFF', 0); wav.writeUInt32LE(36 + n * 2, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(n * 2, 40); writeFileSync(quiet, wav);
const { b, p, errors } = await launch({ args: [`--use-file-for-fake-audio-capture=${quiet}`] });
await p.routeWebSocket(/BidiGenerateContent/, (ws) => {
  ws.onMessage((raw) => {
    const m = JSON.parse(typeof raw === 'string' ? raw : Buffer.from(raw).toString());
    if (m.setup) ws.send(JSON.stringify({ setupComplete: {} }));
  });
});
await p.goto('http://127.0.0.1:5173/'); await wait(p, 900); await skipOnboarding(p); await loadDemo(p);
const voiceOpen = () => p.getByRole('dialog', { name: 'Dictation' }).isVisible();
const dock = p.getByRole('button', { name: 'Dictate' }).first();
const hand = (sel) => p.locator(sel).evaluate((el) => el.style.transform);
const centre = async (l) => { const r = await l.boundingBox(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
const stageY = () => p.locator('.sphere-stage').evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).f);

// 1. the dock: a short pull follows the finger and drops back; the orb drawn follows too
{
  const c = await centre(dock);
  await p.mouse.move(c.x, c.y); await p.mouse.down();
  const y0 = await stageY();
  for (let i = 1; i <= 6; i++) { await p.mouse.move(c.x, c.y - i * 4); await wait(p, 16); }
  await wait(p, 120);
  const t = await hand('.tabbar .orb-hand');
  assert.match(t, /translate3d\(.*-\d+/, `the dock orb comes up with the finger (${t})`);
  const y1 = await stageY();
  assert(y1 < y0 - 8, `the orb drawn rides up with it (${y0} → ${y1})`);
  await p.mouse.up(); await wait(p, 1600);
  for (let i = 0; i < 30 && (await hand('.tabbar .orb-hand')) !== ''; i++) await wait(p, 200); // (a slow test machine)
  assert(!(await voiceOpen()), 'a short pull doesn’t open it');
  assert.equal(await hand('.tabbar .orb-hand'), '', 'it springs back home');
}
// 2. pulled high enough, it opens
{
  const c = await centre(dock);
  await p.mouse.move(c.x, c.y); await p.mouse.down();
  for (let i = 1; i <= 10; i++) { await p.mouse.move(c.x, c.y - i * 14); await wait(p, 16); }
  await p.mouse.up(); await wait(p, 1500);
  assert(await voiceOpen(), 'a pull up opens the orb');
}
// 3. on its screen: a short drag springs back (and isn't taken as a tap), a swipe down puts it away
{
  const orb = p.locator('.voice-orb');
  const phase = () => p.evaluate(async () => (await import('/src/state/voice.ts')).useVoice.getState().phase);
  await wait(p, 1500); const before = await phase();
  let c = await centre(orb);
  await p.mouse.move(c.x, c.y); await p.mouse.down();
  for (let i = 1; i <= 8; i++) { await p.mouse.move(c.x + i * 2, c.y + i * 6); await wait(p, 30); }
  await wait(p, 150);
  const seen = await hand('.voice .orb-hand');
  assert.match(seen, /translate3d/, `it follows the finger (${seen})`);
  await p.screenshot({ path: 'shots/orbhand-1-held.png' });
  // (mid-spring: it overshoots home once, a soft bounce; watched inside the page, every frame)
  await p.evaluate(() => { const el = document.querySelector('.voice .orb-hand'); window.__minY = 0; const t0 = performance.now();
    const f = () => { const m = /, (-?[\d.]+)px/.exec(el.style.transform); if (m) window.__minY = Math.min(window.__minY, Number(m[1])); if (performance.now() - t0 < 8000) requestAnimationFrame(f); }; requestAnimationFrame(f); });
  await p.mouse.up(); await wait(p, 2600);
  // (a slow test machine draws few frames: give the spring time to settle, up to 6 s more)
  for (let i = 0; i < 30 && (await hand('.voice .orb-hand')) !== ''; i++) await wait(p, 200);
  const over = await p.evaluate(() => window.__minY);
  assert(over < -0.2, `it bounces past home once on the way back (${over})`); // (a slow test machine, a few frames a second, overshoots less)
  assert.equal(await hand('.voice .orb-hand'), '', 'and comes to rest at home');
  assert(await voiceOpen(), 'a short drag doesn’t close it');
  assert.equal(await phase(), before, 'a drag isn’t a tap');
  c = await centre(orb);
  await p.mouse.move(c.x, c.y); await p.mouse.down();
  for (let i = 1; i <= 10; i++) { await p.mouse.move(c.x, c.y + i * 20); await wait(p, 16); }
  await p.mouse.up(); await wait(p, 1500);
  assert(!(await voiceOpen()), 'a swipe down puts it away');
}
// 4. talking live: Stardust takes the orb's place (ui/stardust): its dust canvas is there, the usual orb fades out where it
// landed, the greeting's crisp words are waiting under it; leaving, the usual orb comes back to fly home
{
  await p.evaluate(() => { localStorage.setItem('aven.keys', JSON.stringify({ gemini: 'AIzaTESTKEY' })); localStorage.setItem('aven.ai', JSON.stringify({ liveOrb: true })); });
  await p.reload(); await wait(p, 1500);
  await dock.click(); await wait(p, 3000);
  assert.equal(await p.locator('.voice canvas').count(), 1, 'the dust is drawn');
  assert.equal(await p.locator('.sphere-stage canvas').evaluate((el) => el.style.opacity), '0.002', 'the usual orb has stepped aside');
  assert.equal(await p.locator('.dust-greet').count(), 1, 'its greeting has its place');
  assert.equal(await hand('.voice .orb-hand'), '', 'the orb rests in its place');
  await p.screenshot({ path: 'shots/orbhand-2-stardust.png' });
  await p.getByRole('button', { name: 'End', exact: true }).click(); await wait(p, 900);
  assert.equal(await p.locator('.sphere-stage canvas').evaluate((el) => el.style.opacity), '1', 'leaving: the usual orb is back to fly home');
}
const real = errors.filter((e) => !/Failed to load resource|429|WebSocket/.test(e));
assert.deepEqual(real, [], 'no page errors');
await b.close();
console.log('ORBHAND OK');
