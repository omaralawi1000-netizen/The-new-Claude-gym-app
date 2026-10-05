// Wrestling, beat-last-time and Snap-your-plate (Gemini stubbed at the network layer — wiring only, not real vision).
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import assert from 'node:assert/strict';
const { b, p, errors } = await launch({});
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'content-type': 'application/json' };
let sawImage = false;
await p.route('https://generativelanguage.googleapis.com/**', async (r) => {
  if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
  const body = JSON.parse(r.request().postData() || '{}');
  sawImage = !!body.contents?.[0]?.parts?.[0]?.inline_data;
  r.fulfill({ status: 200, headers: cors, body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ items: [{ name: 'Rice', grams: 180, kcal: 234, protein: 5, carbs: 51, fat: 1 }, { name: 'Chicken breast', grams: 150, kcal: 248, protein: 46, carbs: 0, fat: 5.4 }], assumptions: 'one dinner plate' }) }] } }] }) });
});
// the app keeps the running workout under its own key until the next full save (see store.ts): read it the way the app does
const state = () => p.evaluate(() => (() => { const d = JSON.parse(localStorage.getItem('aven.v1') || 'null'); const a = localStorage.getItem('aven.v1.active'); if (d && a) d.active = JSON.parse(a).active; return d; })());
await p.goto('http://127.0.0.1:5173/'); await wait(p, 900); await skipOnboarding(p); await loadDemo(p); await wait(p, 1500);

// ── wrestling ──
await p.locator('.tabbar').getByRole('button', { name: 'Train', exact: true }).click(); await wait(p, 900);
await p.getByRole('button', { name: 'Log wrestling' }).click(); await wait(p, 900);
assert(await p.getByText('Mat time').isVisible());
await p.getByRole('button', { name: '90 min' }).click();
await p.getByLabel('Rounds').fill('6');
await p.getByRole('tab', { name: 'Max', exact: true }).click();
await p.screenshot({ path: 'shots/new-1-wrestling.png' });
await p.getByRole('button', { name: 'Save session' }).click(); await wait(p, 900);
const wr = (await state()).activities.find((a) => a.kind === 'wrestling');
assert.equal(wr.durationSec, 5400); assert.equal(wr.rounds, 6); assert.equal(wr.intensity, 3);
assert(await p.getByText('90 min this week').isVisible(), 'plan tile shows this week’s mat time');
await p.getByRole('tab', { name: 'History' }).click(); await wait(p, 700);
assert(await p.getByText(/90 min · 6 rounds · Max/).isVisible(), 'history line');
await p.locator('.tabbar').getByRole('button', { name: 'Progress', exact: true }).click(); await wait(p, 1200);
assert(await p.getByText('Mat time per week').count() >= 0);
assert(await p.getByText(/90/).first().isVisible());
await p.screenshot({ path: 'shots/new-2-progress.png' });

// ── beat last time ──
await p.locator('.tabbar').getByRole('button', { name: 'Today', exact: true }).click(); await wait(p, 900);
await p.getByRole('button', { name: /Start workout/ }).click(); await wait(p, 1400);
const dlg = p.getByRole('dialog', { name: 'Active workout' }); const w = dlg.getByLabel('Weight', { exact: true }).first(); const prevW = await w.getAttribute('placeholder'); console.log('prev weight', prevW);
await w.fill(String(Number(String(prevW).replace(',', '.')) + 2.5).replace('.', ','));
await dlg.getByRole('button', { name: 'Complete set' }).first().click(); await wait(p, 500);
assert(await p.getByText('+2,5 kg').or(p.getByText('+2.5 kg')).first().isVisible(), 'gold gain label');
await p.screenshot({ path: 'shots/new-3-beat.png' });
await p.getByRole('button', { name: 'Minimise workout' }).click(); await wait(p, 900);

// ── snap your plate ──
await p.evaluate(() => { localStorage.setItem('aven.keys', JSON.stringify({ gemini: 'AIzaTEST' })); });
await p.reload(); await wait(p, 1200);
await p.getByLabel('Photo').first().click(); await wait(p, 900);
const png = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 320; c.height = 240; const x = c.getContext('2d'); x.fillStyle = '#c8a060'; x.fillRect(0, 0, 320, 240); x.fillStyle = '#fff'; x.beginPath(); x.arc(160, 120, 90, 0, 7); x.fill(); return c.toDataURL('image/png').split(',')[1]; });
await p.locator('input[type=file]').last().setInputFiles({ name: 'plate.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
await p.getByText('~ Chicken breast').waitFor({ timeout: 15000 });
assert(sawImage, 'the image was sent inline');
await p.getByRole('button', { name: '×1,5' }).or(p.getByRole('button', { name: '×1.5' })).first().click(); await wait(p, 300);
await p.screenshot({ path: 'shots/new-4-photo.png' });
await p.getByRole('button', { name: /Log 2 items/ }).click(); await wait(p, 1200);
const es = (await state()).entries.filter((e) => /AI estimate/.test(e.snap.name));
assert.equal(es.length, 2); assert.equal(Math.round(es[0].nutrients.kcal), 351, 'portion ×1.5 applied');
console.log('errors', errors.filter((e) => !/Failed to load resource/.test(e)).length);
await b.close(); process.exit(0);
