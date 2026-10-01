// Regenerates docs/screens/*.png — representative screens, dark + light, EN + DA. Needs dev server :5173 (+ mock lookup :8787).
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import { mkdirSync } from 'node:fs';
mkdirSync('docs/screens', { recursive: true });
const out = (n) => `docs/screens/${n}.png`;
async function run(theme) {
  const { b, p, errors } = await launch({ theme });
  const sfx = theme === 'dark' ? '' : '-light';
  await p.goto('http://127.0.0.1:5173/'); await wait(p, 1200);
  if (theme === 'dark') await p.screenshot({ path: out('01-onboarding') });
  await skipOnboarding(p); await loadDemo(p); await wait(p, 4200); // let toasts clear
  await p.screenshot({ path: out(`02-today${sfx}`) });
  await p.evaluate(() => document.querySelector('.screen').scrollTo(0, 820)); await wait(p, 500);
  if (theme === 'dark') await p.screenshot({ path: out('03-today-scrolled') });
  await p.evaluate(() => document.querySelector('.screen').scrollTo(0, 0));
  // workout
  await p.getByRole('button', { name: /Start workout/ }).click(); await wait(p, 1300);
  await p.getByRole('button', { name: 'Complete set' }).first().click(); await wait(p, 900);
  await p.screenshot({ path: out(`04-workout${sfx}`) });
  if (theme === 'dark') {
    await p.getByRole('button', { name: 'Complete set' }).nth(1).click(); await wait(p, 300);
    await p.getByRole('button', { name: 'Finish', exact: true }).click(); await wait(p, 600);
    await p.getByRole('button', { name: /Finish and save/ }).click(); await wait(p, 1500);
    await p.screenshot({ path: out('05-workout-summary') });
    await p.getByRole('button', { name: 'Done', exact: true }).click(); await wait(p, 900);
  } else { await p.getByRole('button', { name: 'Minimise workout' }).click(); await wait(p, 900); }
  // food
  await p.locator('.tabbar').getByRole('button', { name: 'Food', exact: true }).click(); await wait(p, 600);
  await p.getByRole('button', { name: 'Previous day' }).click(); await wait(p, 900);
  await p.screenshot({ path: out(`06-food-diary${sfx}`) });
  await p.getByRole('button', { name: /Add to Dinner/ }).click(); await wait(p, 600);
  await p.getByPlaceholder('Search foods and brands').fill('chicken'); await wait(p, 900);
  if (theme === 'dark') await p.screenshot({ path: out('07-food-search') });
  await p.getByText('Chicken breast, cooked', { exact: true }).first().click(); await wait(p, 1100);
  const amt = p.getByRole('textbox', { name: 'Amount' });
  await p.getByRole('button', { name: /^g$/ }).click(); await amt.fill('180'); await wait(p, 700);
  await p.screenshot({ path: out(`08-food-detail${sfx}`) });
  await p.keyboard.press('Escape'); await wait(p, 600); await p.keyboard.press('Escape'); await wait(p, 600);
  if (theme === 'dark') {
    // dictation → review
    await p.getByRole('button', { name: 'Dictate' }).first().click(); await wait(p, 1300);
    await p.evaluate(async () => { const { mic } = await import('/src/lib/mic.ts'); const { useVoice } = await import('/src/state/voice.ts'); await mic.acquire('voice'); useVoice.getState().go('listening'); });
    await wait(p, 1800); await p.screenshot({ path: out('09-voice-listening') });
    await p.evaluate(async () => { const { mic } = await import('/src/lib/mic.ts'); mic.release('voice'); });
    await p.getByRole('button', { name: /Type instead/ }).click().catch(() => {});
    await p.getByLabel('Type what you ate or did').fill('200 grams of skyr, one banana and 60 grams of oats');
    await p.getByRole('button', { name: 'Review' }).click(); await wait(p, 1900);
    await p.screenshot({ path: out('10-voice-review') });
    await p.getByText('Skyr, plain').last().click(); await wait(p, 400); await p.getByText('Oats, rolled, dry').last().click(); await wait(p, 600);
    await p.screenshot({ path: out('11-voice-resolved') });
    await p.keyboard.press('Escape'); await wait(p, 700);
    // train + exercise
    await p.locator('.tabbar').getByRole('button', { name: 'Train', exact: true }).click(); await wait(p, 700);
    await p.screenshot({ path: out('12-train-plan') });
    await p.getByRole('tab', { name: 'Library' }).click(); await wait(p, 500);
    await p.getByText('Barbell Bench Press').first().click(); await wait(p, 1000);
    await p.screenshot({ path: out('13-exercise') });
    await p.keyboard.press('Escape'); await wait(p, 600);
    await p.locator('.tabbar').getByRole('button', { name: 'Progress', exact: true }).click(); await wait(p, 1200);
    await p.evaluate(() => document.querySelector('.screen').scrollTo(0, 820)); await wait(p, 900);
    await p.screenshot({ path: out('14-progress') });
    await p.getByLabel('Settings').click().catch(async () => { await p.locator('.tabbar').getByRole('button', { name: 'Today', exact: true }).click(); await wait(p, 500); await p.getByLabel('Settings').click(); });
    await wait(p, 800); await p.screenshot({ path: out('15-settings') });
  }
  console.log(theme, 'errors', errors.length, errors.slice(0, 2));
  await b.close();
}
await run('dark'); await run('light');
// Danish
{
  const { b, p } = await launch({ theme: 'dark' });
  await p.addInitScript(() => { if (!localStorage.getItem('aven.v1')) localStorage.setItem('aven.v1', JSON.stringify({ v: 1, settings: { language: 'da', onboarded: true, name: 'Omar', goals: { kcal: 2600, protein: 170, waterMl: 3000 } } })); });
  await p.goto('http://127.0.0.1:5173/'); await wait(p, 1200);
  await p.getByLabel('Indstillinger').click(); await wait(p, 600); await p.getByText('Data og backup').click(); await wait(p, 400); await p.getByText('Indlæs demodata').click(); await wait(p, 400); await p.keyboard.press('Escape'); await wait(p, 4200);
  await p.screenshot({ path: out('16-today-da') });
  await p.locator('.tabbar').getByRole('button', { name: 'Mad', exact: true }).click(); await wait(p, 600); await p.getByRole('button', { name: 'Forrige dag' }).click(); await wait(p, 900);
  await p.screenshot({ path: out('17-food-da') });
  await b.close();
}
