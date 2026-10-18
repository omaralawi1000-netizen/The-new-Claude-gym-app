// Coach 2.0, phase 5 polish, in the real app (Gemini STUBBED): a chart in the chat, a routine rewrite where one change is
// left out, "Undo all" for an answer that made three changes, a copy of a routine, and "Ask the Coach about this" (hold a
// food on the Food tab, a pill rises, the Coach opens about it with its questions; a short tap still opens the food).
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import assert from 'node:assert/strict';
const { b, p, errors } = await launch({ theme: process.argv[2] || 'dark' });
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const json = (o) => ({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(o) });
const asked = [];
const answer = (last) => {
  if (/^\[about:/.test(last)) return { reply: 'That skyr is a great pick: lots of protein for the calories.', actions: [] };
  if (/bench/i.test(last)) return { reply: 'Your bench is climbing steadily.', actions: [{ type: 'show_chart', metric: 'strength', exercise: 'Barbell Bench Press' }] };
  if (/rework/i.test(last)) return { reply: 'Here is a stronger Push.', actions: [{ type: 'edit_routine', routine: 'Push', rename: 'Push A', remove: ['Lateral Raise'], change: [{ exercise: 'Barbell Bench Press', sets: 5 }], add: [{ exercise: 'Dip', sets: 3, repMin: 8, repMax: 12 }] }] };
  if (/three/i.test(last)) return { reply: 'Logged all three.', actions: [{ type: 'log_water', ml: 500 }, { type: 'log_weight', kg: 80.4 }, { type: 'add_note', text: 'Felt strong today', kind: 'training' }] };
  if (/skyr/i.test(last)) return { reply: 'Logged.', actions: [{ type: 'log_food', foods: [{ name: 'skyr', amount: 200, unit: 'g' }], meal: 'breakfast' }] };
  if (/copy/i.test(last)) return { reply: 'Made a copy.', actions: [{ type: 'duplicate_routine', routine: 'Pull', rename: 'Pull (light)' }] };
  return { reply: 'OK.', actions: [] };
};
await p.route('https://generativelanguage.googleapis.com/**', async (r) => {
  const req = r.request(); const url = req.url();
  if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
  if (url.includes('/models?')) return r.fulfill(json({ models: ['gemini-2.5-flash'].map((n) => ({ name: `models/${n}`, supportedGenerationMethods: ['generateContent'] })) }));
  const body = JSON.parse(req.postData() || '{}');
  if (body.generationConfig?.responseModalities?.includes('AUDIO')) return r.fulfill(json({ candidates: [] }));
  const system = body.systemInstruction?.parts?.[0]?.text ?? '';
  if (/insight/i.test(system)) return r.fulfill(json({ candidates: [{ content: { parts: [{ text: '{"insights":[]}' }] } }] }));
  const contents = body.contents ?? [];
  const last = [...contents].reverse().find((c) => c.role === 'user')?.parts?.map((x) => x.text ?? '').join('') ?? '';
  asked.push(last);
  const txt = JSON.stringify(answer(last));
  if (url.includes('streamGenerateContent')) return r.fulfill({ status: 200, headers: { ...cors, 'content-type': 'text/event-stream' }, body: `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: txt }] } }] })}\n\n` }).catch(() => {});
  return r.fulfill(json({ candidates: [{ content: { parts: [{ text: txt }] } }] })).catch(() => {});
});

await p.goto('http://127.0.0.1:5173/'); await wait(p, 900); await skipOnboarding(p); await loadDemo(p);
await p.evaluate(() => localStorage.setItem('aven.keys', JSON.stringify({ gemini: 'AIzaTESTKEY' })));
await p.reload(); await wait(p, 1600);
const openCoach = async () => { await p.getByLabel('Coach').first().click(); await wait(p, 1100); };
const field = () => p.getByLabel('Message the Coach');
const ask = async (q, ms = 3200) => { await field().fill(q); await p.getByRole('button', { name: 'Send', exact: true }).click(); await wait(p, ms); };
await openCoach();

// ── a chart in the chat ──
await ask('how is my bench going?', 1400);
await p.screenshot({ path: 'shots/coach6-1-chart-drawing.png' });
await wait(p, 1800);
const chart = p.locator('.action-card .ac-chart svg').last();
assert(await chart.isVisible(), 'the chart card');
assert(await p.locator('.action-card', { hasText: 'Estimated 1RM' }).last().isVisible(), 'its title');
assert.equal(await p.locator('.action-card .ac-chart path.line-in').count(), 1, 'one line, drawn in');
await p.screenshot({ path: 'shots/coach6-1-chart.png' });

// ── keep only some changes ──
await ask('rework my push day');
const card = p.locator('.action-card', { hasText: 'Change Push?' }).last();
assert.equal(await card.locator('.ac-pick').count(), 4, 'a tick per change');
await card.locator('.ac-pick').nth(1).click(); await wait(p, 600); // leave out "Lateral Raise removed"
assert(await card.getByRole('button', { name: 'Apply 3 of 4' }).isVisible(), 'Apply says how many');
await p.screenshot({ path: 'shots/coach6-2-picks.png' });
await card.getByRole('button', { name: 'Apply 3 of 4' }).click(); await wait(p, 1400);
assert(await card.getByText('3 of 4 changes applied').isVisible(), 'and what it did');
const push = await p.evaluate(() => JSON.parse(localStorage.getItem('aven.v1')).routines.find((r) => r.name === 'Push A'));
assert(push && push.items.some((i) => i.exerciseId === 'lateral-raise'), 'the change left out was not made');
await p.screenshot({ path: 'shots/coach6-3-applied.png' });

// ── Undo all ──
await ask('log these three things');
const all = p.getByRole('button', { name: 'Undo all 3' });
await all.waitFor({ state: 'visible', timeout: 4000 });
await p.screenshot({ path: 'shots/coach6-4-undo-all.png' });
const waterBefore = await p.evaluate(() => JSON.parse(localStorage.getItem('aven.v1')).water?.length ?? 0);
await all.click(); await wait(p, 2600);
assert((await p.locator('.ac-undo-all-wrap').last().evaluate((el) => el.getBoundingClientRect().height)) < 2, 'it folds away when nothing is left');
assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('aven.v1')).water?.length ?? 0), waterBefore - 1, 'the water went');
assert(!(await p.evaluate(() => JSON.parse(localStorage.getItem('aven.v1')).weights.some((w) => w.kg === 80.4))), 'and the weight');

// ── a copy of a routine ──
await ask('make a copy of pull');
assert(await p.locator('.action-card', { hasText: 'Routine duplicated' }).last().isVisible(), 'the copy');
assert(await p.evaluate(() => JSON.parse(localStorage.getItem('aven.v1')).routines.some((r) => r.name === 'Pull (light)')), 'saved');
await ask('log 200 g skyr for breakfast');
await p.getByRole('button', { name: 'Close' }).first().click(); await wait(p, 900);

// ── Ask the Coach about this: hold a food ──
await p.locator('.tabbar').getByRole('button', { name: 'Food', exact: true }).click(); await wait(p, 1200);
const entry = p.locator('.entry').first();
await entry.scrollIntoViewIfNeeded(); await wait(p, 300);
const box = await entry.boundingBox();
const hold = async (x, y, ms = 700) => { await p.mouse.move(x, y); await p.mouse.down(); await wait(p, ms); await p.mouse.up(); };
// a short tap still opens the food
await hold(box.x + box.width / 2, box.y + box.height / 2, 80); await wait(p, 900);
assert(await p.locator('.sheet').count() > 0, 'a tap opens the food as before');
await p.keyboard.press('Escape'); await wait(p, 900);
await hold(box.x + box.width / 2, box.y + box.height / 2); await wait(p, 650);
const pill = p.locator('.ask-pill.on');
assert(await pill.isVisible(), 'holding raises the pill');
assert(await p.locator('.ask-ring.on').isVisible(), 'with a ring around the food');
assert.equal(await p.locator('.sheet').count(), 0, 'and does not open the food');
await p.screenshot({ path: 'shots/coach6-5-hold.png' });
await pill.click(); await wait(p, 1300);
assert(await p.locator('.coach-about').isVisible(), 'the Coach opens about it');
await p.screenshot({ path: 'shots/coach6-6-about.png' });
const tip = p.locator('.tip').filter({ hasText: 'Is this a good choice for my goal?' }).last();
await tip.click(); await wait(p, 3000);
assert(/^\[about: a logged food: .*\[ref /.test(asked.at(-1)), 'the model got what was held');
assert(await p.locator('.said-about').last().isVisible(), 'the message says what it was about');
await p.waitForFunction(() => /great pick/.test([...document.querySelectorAll('.coach-reply')].at(-1)?.textContent ?? ''), null, { timeout: 8000 });
assert(/great pick/.test(await p.locator('.coach-reply').last().textContent()), 'and the answer came');
await p.screenshot({ path: 'shots/coach6-7-answered.png' });
await p.getByRole('button', { name: 'Close' }).first().click(); await wait(p, 900);

// ── hold a chart on Progress ──
await p.locator('.tabbar').getByRole('button', { name: 'Progress', exact: true }).click(); await wait(p, 1400);
const cc = p.locator('[data-ask="chart:bodyweight"]');
await cc.scrollIntoViewIfNeeded(); await wait(p, 400);
const cb = await cc.boundingBox();
await hold(cb.x + 60, cb.y + 40); await wait(p, 600);
assert(await p.locator('.ask-pill.on').isVisible(), 'a chart can be held too');
await p.screenshot({ path: 'shots/coach6-8-hold-chart.png' });
await p.mouse.click(5, 5); await wait(p, 500);
assert.equal(await p.locator('.ask-pill').count(), 0, 'a tap elsewhere puts it away');

console.log('errors', errors.length);
assert.equal(errors.filter((e) => !/Failed to load resource/.test(e)).length, 0, errors.join('\n'));
console.log('COACH 6 OK');
await b.close();
