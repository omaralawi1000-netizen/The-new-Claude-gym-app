// The orb in your hand (Omar, 26 Oct): pulled up out of the dock it comes with your finger and springs back with a bounce,
// or opens when pulled high enough; on its own screen it follows your finger, a short drag springs back, a swipe down puts
// it away; a tap still works; talking live it floats over a horizon that swells with your voice. The orb drawn on the stage
// follows its moved slot. Gemini Live is faked at the WebSocket (see journey-live.mjs).
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import assert from 'node:assert/strict';

const { b, p, errors } = await launch({});
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
  for (let i = 1; i <= 5; i++) { await p.mouse.move(c.x + i * 3, c.y + i * 10); await wait(p, 16); }
  await wait(p, 150);
  const seen = await hand('.voice .orb-hand');
  assert.match(seen, /translate3d/, `it follows the finger (${seen})`);
  await p.screenshot({ path: 'shots/orbhand-1-held.png' });
  await p.mouse.up(); await wait(p, 120);
  // (mid-spring: it overshoots home once, a soft bounce)
  let over = false;
  for (let i = 0; i < 30; i++) { const m = /, (-?[\d.]+)px/.exec(await hand('.voice .orb-hand')); if (m && Number(m[1]) < -0.5) over = true; await wait(p, 16); }
  await wait(p, 1200);
  assert(over, 'it bounces past home once on the way back');
  assert.equal(await hand('.voice .orb-hand'), '', 'and comes to rest at home');
  assert(await voiceOpen(), 'a short drag doesn’t close it');
  assert.equal(await phase(), before, 'a drag isn’t a tap');
  c = await centre(orb);
  await p.mouse.move(c.x, c.y); await p.mouse.down();
  for (let i = 1; i <= 10; i++) { await p.mouse.move(c.x, c.y + i * 20); await wait(p, 16); }
  await p.mouse.up(); await wait(p, 1500);
  assert(!(await voiceOpen()), 'a swipe down puts it away');
}
// 4. talking live: it floats over a horizon that swells with your voice; muted, all of it comes to rest
{
  await p.evaluate(() => { localStorage.setItem('aven.keys', JSON.stringify({ gemini: 'AIzaTESTKEY' })); localStorage.setItem('aven.ai', JSON.stringify({ liveOrb: true })); });
  await p.reload(); await wait(p, 1500);
  await dock.click(); await wait(p, 2500);
  assert(await p.locator('.live-horizon.on').count() === 1, 'the horizon is lit while you talk');
  const lift = await hand('.voice .orb-hand'); const sw = await p.locator('.live-horizon > b').evaluate((el) => el.style.transform);
  assert(/translate3d\(0px, -/.test(lift), `it lifts with your voice (${lift})`);
  assert(/scaleY\(0\.[1-9]|scaleY\(1/.test(sw), `the swell rises (${sw})`);
  await p.screenshot({ path: 'shots/orbhand-2-horizon.png' });
  await p.getByRole('button', { name: 'Mute' }).click(); await wait(p, 3500);
  assert.equal(await hand('.voice .orb-hand'), '', 'muted: it comes to rest');
  assert.equal(await p.locator('.live-horizon > b').evaluate((el) => el.style.transform), '', 'and the swell lies flat');
}
const real = errors.filter((e) => !/Failed to load resource|429|WebSocket/.test(e));
assert.deepEqual(real, [], 'no page errors');
await b.close();
console.log('ORBHAND OK');
