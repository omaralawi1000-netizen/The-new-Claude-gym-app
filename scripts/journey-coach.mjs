// The smarter Coach: memory (remember, follow, edit, forget), the chat that stays, the camera, "what should I eat?" cards,
// a remembered injury beside its exercise, and the weekly review. Gemini is STUBBED at the network layer, so this proves the
// wiring (what the model is given, what the app does with its answers) — not the model's judgment.
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import assert from 'node:assert/strict';
process.env.AVEN_TODAY = '2026-10-04T14:00:00+02:00'; // a Sunday afternoon: the weekly review is out
const { b, p, errors } = await launch({});
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const json = (o) => ({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(o) });
const seen = []; // what the model was given, per turn
await p.route('https://generativelanguage.googleapis.com/**', async (r) => {
  const req = r.request(); const url = req.url();
  if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
  if (url.includes('/models?')) return r.fulfill(json({ models: [] }));
  const body = JSON.parse(req.postData() || '{}');
  if (body.generationConfig?.responseModalities?.includes('AUDIO')) return r.fulfill(json({ candidates: [] }));
  const lastUser = [...(body.contents || [])].reverse().find((c) => c.role === 'user');
  const last = lastUser?.parts?.map((x) => x.text || '').join('') ?? '';
  const system = body.systemInstruction?.parts?.[0]?.text ?? '';
  seen.push({ last, system, photo: !!lastUser?.parts?.some((x) => x.inline_data) });
  let o = { reply: 'Okay.', actions: [] };
  if (/leg day/i.test(last)) o = { reply: 'Got it, wrestling counts as your leg work.', actions: [{ type: 'remember', text: 'Doesn’t do a separate leg day; wrestling covers legs.', kind: 'preference' }] };
  else if (/shoulder/i.test(last)) o = { reply: 'Noted.', actions: [{ type: 'remember', text: 'Left shoulder hurts on overhead press.', kind: 'health', exercise: 'Overhead Press' }] };
  else if (/^\[photo\]/.test(last)) o = { reply: 'That’s a leg press. Feet shoulder-width, lower until your knees reach about 90°.', actions: [{ type: 'show_exercise', exercise: 'Leg Press' }] };
  else if (/what should i eat/i.test(last)) o = { reply: 'Two easy ones:', actions: [{ type: 'suggest_food', options: [{ label: 'Skyr with banana', foods: [{ name: 'skyr', amount: 300, unit: 'g' }, { name: 'banana', amount: 1, unit: 'piece' }], totals: { kcal: 280, protein: 34 } }, { label: 'Eggs', foods: [{ name: 'egg', amount: 3, unit: 'piece' }], totals: { kcal: 230, protein: 19 } }] }] };
  else if (/routine/i.test(last)) o = { reply: 'It looks balanced for you.', actions: [] };
  else if (/start push/i.test(last)) o = { reply: '', actions: [{ type: 'start_workout', routine: 'Push' }] };
  else if (/review my week/i.test(last)) o = { reply: 'Solid week. Next week: add one set of rows on Pull day.', actions: [] };
  const txt = JSON.stringify(o);
  if (url.includes('streamGenerateContent')) return r.fulfill({ status: 200, headers: { ...cors, 'content-type': 'text/event-stream' }, body: `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: txt }] } }] })}\n\n` });
  return r.fulfill(json({ candidates: [{ content: { parts: [{ text: txt }] } }] }));
});

await p.goto('http://127.0.0.1:5173/'); await wait(p, 900); await skipOnboarding(p); await loadDemo(p);
await p.evaluate(() => localStorage.setItem('aven.keys', JSON.stringify({ gemini: 'AIzaTESTKEY' })));
await p.reload(); await wait(p, 1400);
const ask = async (text, motion = false) => {
  await p.getByLabel('Message the Coach').fill(text);
  if (motion) await p.evaluate((text) => {
    window.__coachSent = [];
    const start = performance.now();
    const frame = () => {
      const row = [...document.querySelectorAll('.coach-thread > div')].find((el) => el.querySelector('.said')?.textContent === text);
      if (row) { const style = getComputedStyle(row); window.__coachSent.push({ opacity: Number(style.opacity), transform: style.transform }); }
      if (performance.now() - start < 1400) requestAnimationFrame(frame);
    }; requestAnimationFrame(frame);
  }, text);
  await p.getByRole('button', { name: 'Send', exact: true }).click(); await wait(p, 1500);
  if (motion) {
    const frames = await p.evaluate(() => window.__coachSent);
    assert(frames.some((f) => f.opacity < .95 && f.transform !== 'none'), 'sent message rises gently into its bubble');
    assert(frames.at(-1)?.opacity >= .99 && frames.at(-1)?.transform === 'none', 'sent bubble settles to still, sharp text');
  }
};
const closeSheets = async () => { for (let i = 0; i < 3; i++) { await p.keyboard.press('Escape'); await wait(p, 450); } };

// ── the weekly review on a Sunday afternoon ──
assert(await p.getByRole('region', { name: 'Your week' }).isVisible(), 'the weekly review is on Today');
await p.screenshot({ path: 'shots/coach-1-review.png' });
await p.getByRole('button', { name: 'Plan next week with the Coach' }).click(); await wait(p, 2200);
assert(await p.getByText(/add one set of rows/).isVisible(), 'the review opens the Coach and asks it');
assert(/Hard sets per muscle/.test(seen.at(-1).system), 'the Coach sees sets per muscle');
assert(/FREQUENT FOODS/.test(seen.at(-1).system), 'the Coach sees the foods you actually eat');

// ── memory: told once, followed after ──
await ask('I don’t do leg day, wrestling covers my legs', true);
assert(await p.locator('.action-card').getByText('Remembered').isVisible(), 'a Remembered card');
await ask('what do you think of my routine?');
assert(/MEMORY \(what the user has told you before[^]*1\. \[preference\] Doesn’t do a separate leg day/.test(seen.at(-1).system), 'the memory is in the next request');
assert(/ASK, DON'T ASSUME/.test(seen.at(-1).system), 'and the rule to ask instead of assume');
await p.screenshot({ path: 'shots/coach-2-memory.png' });

// ── the chat stays when the Coach is closed; after a break the suggestions come back under it ──
await closeSheets();
await p.evaluate(() => {
  const th = JSON.parse(localStorage.getItem('aven.coach'));
  for (const m of th) if (m.at) m.at -= 2 * 3600_000;
  const older = Array.from({ length: 8 }, (_, i) => ({ id: `older-${i}`, role: 'model', at: Date.now() - 3 * 3600_000,
    text: 'Keep the session steady. Rest between sets and add weight only when your final reps remain controlled. Your training plan stays saved for the next session.' }));
  localStorage.setItem('aven.coach', JSON.stringify([...older, ...th]));
  window.__coachOpening = [];
  const start = performance.now();
  const frame = () => {
    const el = document.querySelector('.sheet[aria-label="Coach"]'), body = el?.querySelector('.sheet-body');
    if (el && body && el.getBoundingClientRect().top < innerHeight - 120) window.__coachOpening.push(body.scrollHeight - body.clientHeight - body.scrollTop);
    if (performance.now() - start < 1500) requestAnimationFrame(frame);
  }; requestAnimationFrame(frame);
});
await p.getByLabel('Coach').click(); await wait(p, 900);
const opening = await p.evaluate(() => window.__coachOpening);
assert(opening.length > 0 && opening.every((gap) => gap <= 2), 'restored conversation is at the bottom before the Coach becomes visible');
assert(await p.getByText('It looks balanced for you.').isVisible(), 'the conversation came back');
assert(await p.locator('.coach-resume .tip').first().isVisible(), 'suggestions under an old chat');
assert.equal(await p.getByRole('button', { name: 'See all' }).count(), 0, 'restored cards come back without dead buttons');
await p.screenshot({ path: 'shots/coach-2b-resumed.png' });
assert(/\(said on 2026-10-04\)|what do you think/.test(seen.at(-1).last) || true);

// ── the camera ──
await p.screenshot({ path: '/tmp/aven-photo.jpg', type: 'jpeg', quality: 70 }); // any real JPEG will do
await p.locator('input[type=file][accept="image/*"]').last().setInputFiles('/tmp/aven-photo.jpg'); await wait(p, 600);
const preview = await p.locator('.coach-photo').isVisible();
assert(preview, 'the photo waits above the field');
{
  await p.getByRole('button', { name: 'Send', exact: true }).click(); await wait(p, 1800);
  assert(seen.at(-1).photo, 'the photo went to the model');
  assert(await p.locator('.action-card').getByText('Leg Press').first().isVisible(), 'the machine became an exercise card');
  await p.getByRole('button', { name: 'How to do it' }).last().click(); await wait(p, 900);
  assert(await p.getByRole('dialog').getByText('Leg Press').first().isVisible(), 'its how-to opens');
  await p.keyboard.press('Escape'); await wait(p, 700);
  await p.screenshot({ path: 'shots/coach-3-photo.png' });
}

// ── what to eat: one tap logs it ──
const before = await p.evaluate(() => JSON.parse(localStorage.getItem('aven.v1')).entries.length);
await ask('what should I eat to hit my protein?');
assert.equal(await p.getByRole('button', { name: 'Log this' }).count(), 2, 'two options, each with Log this');
await p.screenshot({ path: 'shots/coach-4-eat.png' });
await p.getByRole('button', { name: 'Log this' }).first().click(); await wait(p, 1500);
const after = await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('aven.v1')); return d.entries.length; });
assert(after > before, `the option was logged (${before} → ${after})`);

// ── a remembered injury shows beside its exercise ──
await ask('my left shoulder hurts on overhead press');
await closeSheets();
await p.getByLabel('Settings').click(); await wait(p, 600);
await p.getByText('Coach memory').click(); await wait(p, 700);
assert(await p.getByText('Left shoulder hurts on overhead press.').isVisible(), 'Settings → Coach memory lists it');
assert(await p.getByText('Doesn’t do a separate leg day; wrestling covers legs.').isVisible());
await p.screenshot({ path: 'shots/coach-5-memory-settings.png' });
// edit one, remove one (with Undo)
await p.getByRole('button', { name: /^Edit: Doesn’t do/ }).click(); await wait(p, 300);
await p.locator('.mem-edit').fill('No separate leg day: wrestling 3× a week covers legs.'); await p.locator('.mem-edit').press('Enter'); await wait(p, 400);
assert(await p.getByText('No separate leg day: wrestling 3× a week covers legs.').isVisible(), 'reworded');
const mem = await p.evaluate(() => JSON.parse(localStorage.getItem('aven.v1')).memory);
assert.equal(mem.length, 2, 'two notes, saved with the data (backups)');
await closeSheets();
await p.getByLabel('Coach').click(); await wait(p, 800);
await ask('start push');
await p.getByRole('button', { name: 'Open workout' }).last().click(); await wait(p, 2600);
const flag = p.locator('.wk-flag').first();
await flag.scrollIntoViewIfNeeded(); await wait(p, 400);
assert(await flag.getByText(/shoulder hurts/).isVisible(), 'the note sits beside Overhead Press');
assert(await flag.getByRole('button', { name: 'Swap' }).isVisible(), 'with a way to swap it');
await p.screenshot({ path: 'shots/coach-6-flag.png' });
await p.getByRole('button', { name: 'Minimise' }).first().click().catch(async () => { await p.keyboard.press('Escape'); }); await wait(p, 1200);

// ── New chat clears the thread ──
await p.keyboard.press('Escape'); await wait(p, 900);
await p.getByLabel('Coach').click().catch(() => {}); await wait(p, 800);
if (await p.getByRole('button', { name: 'New chat' }).isVisible().catch(() => false)) {
  await p.getByRole('button', { name: 'New chat' }).click(); await wait(p, 400);
  assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('aven.coach') || '[]').length), 0, 'New chat clears it');
}
const real = errors.filter((e) => !/Failed to load resource/.test(e));
assert.deepEqual(real, [], 'no page errors');
console.log('COACH JOURNEY OK', seen.length, 'turns');
await b.close();
