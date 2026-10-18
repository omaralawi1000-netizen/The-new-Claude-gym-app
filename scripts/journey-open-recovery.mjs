// A failed Coach/orb download must not take the rest of the app down. A reload can fetch the current build after a deploy.
import { launch, wait, skipOnboarding } from './lib.mjs';
import assert from 'node:assert/strict';
const { b, ctx, p } = await launch({ size: { width: 384, height: 832 } });
const crashes = [];
p.on('pageerror', (e) => crashes.push(e.message));
const blocked = /\/src\/screens\/(Coach|Voice)\.tsx/;
await ctx.route(blocked, (r) => r.abort('failed'));
try {
  await p.goto('http://127.0.0.1:5173/'); await wait(p, 800); await skipOnboarding(p);
  const stored = await p.evaluate(() => localStorage.getItem('aven.v1'));
  assert(stored, 'the profile contains saved app data');
  for (const name of ['Coach', 'Dictate', 'Coach']) {
    await p.getByRole('button', { name, exact: true }).first().click(); await wait(p, 1400);
    assert(await p.locator('#root').innerText(), 'the app stays mounted when a screen download fails');
    await p.getByText('Couldn’t open this screen. Reload Aven and try again.', { exact: true }).first().waitFor();
    assert.equal(await p.getByRole('dialog').count(), 0, 'no invisible failed overlay blocks the app');
    await p.getByLabel('Settings', { exact: true }).click();
    await p.getByRole('dialog', { name: 'Settings' }).waitFor();
    await p.keyboard.press('Escape'); await wait(p, 900);
    assert.equal(await p.evaluate(() => localStorage.getItem('aven.v1')), stored, 'recovery does not replace saved app data');
  }
  assert.deepEqual(crashes, [], 'failed imports are handled without an uncaught error');
  await ctx.unroute(blocked);
  await p.reload(); await wait(p, 1000);
  for (const [name, label] of [['Coach', 'Coach'], ['Dictate', 'Dictation']]) {
    await p.getByRole('button', { name, exact: true }).first().click();
    await p.getByRole('dialog', { name: label }).waitFor();
    await p.keyboard.press('Escape'); await wait(p, 1100);
  }
  assert.deepEqual(crashes, []);
  console.log('screen download recovery passed; Coach and orb open after reload');
} finally { await b.close(); }
