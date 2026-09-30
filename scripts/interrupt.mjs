import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import assert from 'node:assert/strict';
for (const reduced of [false, true]) {
  const { b, ctx, p, errors } = await launch({ reduced });
  await p.goto('http://127.0.0.1:5173/'); await wait(p, 900);
  assert.equal(await p.evaluate(() => document.documentElement.dataset.motion), reduced ? 'reduce' : 'system');
  await skipOnboarding(p); await loadDemo(p);
  await p.getByRole('button', { name: /Start workout/ }).click(); await wait(p, 1100);
  const dialogs = () => p.getByRole('dialog', { name: 'Active workout' }).count();
  // 1. hammer minimise / resume (pill) 6 times with short gaps
  for (let i = 0; i < 6; i++) {
    await p.getByRole('button', { name: 'Minimise workout' }).click({ force: true, timeout: 3000 }).catch(() => {});
    await wait(p, 90 + i * 40);
    await p.locator('button.glass[aria-label="Resume workout"]').click({ force: true, timeout: 3000 }).catch(() => {});
    await wait(p, 90 + i * 40);
  }
  await wait(p, 1200);
  console.log(`[reduced=${reduced}] dialogs after hammering:`, await dialogs());
  assert((await dialogs()) <= 1, 'never more than one workout dialog');
  // 2. interrupted drag-to-minimise: drag halfway down, then back up, then release → must stay open
  if (await dialogs() === 0) { await p.locator('button.glass[aria-label="Resume workout"]').click(); await wait(p, 900); }
  const hdr = await p.getByRole('dialog', { name: 'Active workout' }).locator('.display-lg').first().boundingBox();
  await p.mouse.move(hdr.x + 40, hdr.y + 10); await p.mouse.down();
  await p.mouse.move(hdr.x + 40, hdr.y + 160, { steps: 8 }); await wait(p, 120);
  await p.mouse.move(hdr.x + 40, hdr.y + 10, { steps: 8 }); await p.mouse.up(); await wait(p, 900);
  assert.equal(await dialogs(), 1, 'reversed drag keeps workout open');
  // 3. full drag down → minimised (pill visible)
  await p.mouse.move(hdr.x + 40, hdr.y + 10); await p.mouse.down(); await p.mouse.move(hdr.x + 40, hdr.y + 420, { steps: 12 }); await p.mouse.up(); await wait(p, 1100);
  assert.equal(await dialogs(), 0, 'flick down minimises');
  assert(await p.locator('button.glass[aria-label="Resume workout"]').isVisible(), 'pill is visible');
  await p.screenshot({ path: `shots/int-${reduced ? 'reduced' : 'full'}.png` });
  // 4. open+close dictation & sheets rapidly
  for (let i = 0; i < 5; i++) { await p.getByLabel('Dictate').click({ force: true, timeout: 2000 }).catch(() => {}); await wait(p, 60); await p.keyboard.press('Escape'); await wait(p, 60); }
  await wait(p, 900);
  const left = await p.evaluate(() => ({ overlays: document.querySelectorAll('[role=dialog]').length, path: location.pathname }));
  console.log(`[reduced=${reduced}] leftover dialogs`, left);
  assert.equal(left.path, '/');
  const mic = await p.evaluate(async () => (await import('/src/lib/mic.ts')).mic.active); assert.equal(mic, false);
  assert.equal(errors.length, 0, errors.join(' | '));
  await ctx.close(); await b.close();
}
console.log('INTERRUPT OK');
