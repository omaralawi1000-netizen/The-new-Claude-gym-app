import { launch, wait, skipOnboarding } from './lib.mjs';
const { b, p } = await launch({});
await p.goto('http://127.0.0.1:5173/'); await wait(p, 900); await skipOnboarding(p);
const micState = () => p.evaluate(async () => { const { mic } = await import('/src/lib/mic.ts'); return { active: mic.active, owner: mic.ownedBy }; });
for (let n = 1; n <= 6; n++) {
  await p.getByLabel('Dictate').click({ force: true }); await wait(p, n * 70);
  await p.keyboard.press('Escape'); await wait(p, 1200);
  console.log('cycle', n, 'gap', n * 70, await micState(), 'dialogs', await p.locator('[role=dialog]').count());
}
await b.close();
