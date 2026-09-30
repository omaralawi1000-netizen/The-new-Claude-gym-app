import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { wait } from './lib.mjs';
const base = 'http://127.0.0.1:5173/';

// ── 1. microphone ownership, real levels, release, denial ──
{
  const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const ctx = await b.newContext({ permissions: ['microphone'] });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await p.goto(base); await wait(p, 800);
  const r = await p.evaluate(async () => {
    const { mic } = await import('/src/lib/mic.ts');
    const out = {};
    out.before = mic.active;
    out.a = await mic.acquire('composer-A');
    out.active = mic.active;
    out.busy = await mic.acquire('composer-B');       // second owner must be refused
    await new Promise((r) => setTimeout(r, 600));
    const lv = []; for (let i = 0; i < 10; i++) { lv.push(mic.level()); await new Promise((r) => setTimeout(r, 40)); }
    out.levelIsNumber = lv.every((x) => typeof x === 'number' && x >= 0 && x <= 1);
    out.bands = mic.bands().length;
    const tracks = (mic).stream?.getAudioTracks?.() ?? [];
    out.tracksBefore = tracks.map((t) => t.readyState);
    mic.release('someone-else');                       // a non-owner cannot release
    out.stillActive = mic.active;
    mic.release('composer-A');
    out.tracksAfter = tracks.map((t) => t.readyState);
    out.afterRelease = mic.active; out.owner = mic.ownedBy; out.levelAfter = mic.level();
    out.reacquire = await mic.acquire('composer-B');
    mic.release('composer-B');
    return out;
  });
  console.log('mic', JSON.stringify(r));
  assert.equal(r.before, false); assert.deepEqual(r.a, { ok: true }); assert.equal(r.active, true);
  assert.deepEqual(r.busy, { ok: false, reason: 'busy' }); assert.equal(r.levelIsNumber, true); assert.equal(r.bands, 16);
  assert.deepEqual(r.tracksBefore, ['live']); assert.equal(r.stillActive, true);
  assert.deepEqual(r.tracksAfter, ['ended']); assert.equal(r.afterRelease, false); assert.equal(r.owner, null); assert.equal(r.levelAfter, 0);
  assert.deepEqual(r.reacquire, { ok: true });
  await b.close();
}
{ // denied permission (no fake-UI auto-allow, permission not granted)
  const b = await chromium.launch();
  const p = await (await b.newContext({ permissions: [] })).newPage();
  await p.goto(base); await wait(p, 800);
  const r = await p.evaluate(async () => { const { mic } = await import('/src/lib/mic.ts'); const a = await mic.acquire('x'); return { a, owner: mic.ownedBy, active: mic.active }; });
  console.log('mic denied', JSON.stringify(r));
  assert.equal(r.a.ok, false); assert.equal(r.owner, null); assert.equal(r.active, false);
  await b.close();
}

// ── 2. rapid taps: duplicate-save prevention ──
{
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(base); await wait(p, 800);
  await p.getByText('Skip all').click(); await wait(p, 500);
  await p.locator('.tabbar').getByText('Food', { exact: true }).click(); await wait(p, 600);
  await p.getByRole('button', { name: 'Add food' }).first().click(); await wait(p, 500);
  await p.getByPlaceholder('Search foods and brands').fill('banana'); await wait(p, 600);
  await p.getByText('Banana', { exact: true }).first().click(); await wait(p, 900);
  const save = p.locator('.sheet-foot .btn.primary');
  await save.evaluate((b) => { b.click(); b.click(); b.click(); }); // three taps in the same tick
  await wait(p, 1200);
  const entries = await p.evaluate(() => JSON.parse(localStorage.getItem('aven.v1')).entries.length);
  console.log('entries after triple tap', entries); assert.equal(entries, 1);
  // quick-add "+" hammered 5x on a search row = 5 distinct intentional entries (each tap is an intent), but each has its own id
  // rapid open/close of the dictation composer must not leave the microphone held
  for (let i = 0; i < 4; i++) { await p.getByRole('button', { name: 'Dictate' }).first().click({ force: true }).catch(() => {}); await wait(p, 120); await p.keyboard.press('Escape'); await wait(p, 120); }
  await wait(p, 800);
  const held = await p.evaluate(async () => { const { mic } = await import('/src/lib/mic.ts'); return { active: mic.active, owner: mic.ownedBy }; });
  console.log('mic after rapid open/close', held); assert.equal(held.active, false); assert.equal(held.owner, null);
  assert.equal(errs.length, 0, errs.join(' | '));
  await b.close();
}
console.log('ROBUST OK');
