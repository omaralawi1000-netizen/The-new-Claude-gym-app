// Hands-free sets, tap and say, in the real app (Whisper STUBBED; the fake microphone is a steady tone, so it "hears" until
// the 8 s cap). Off by default; on in Settings → Training. A tap on empty space listens (a soft ring on the set it will log),
// "8 at 80" ticks it; talk to someone else is ignored; a tap on a button is never a listen.
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import assert from 'node:assert/strict';
const { b, p, errors } = await launch({ theme: process.argv[2] || 'dark' });
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
let said = '8 at 80', calls = 0;
await p.route('https://api.groq.com/**', async (r) => {
  if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
  if (r.request().url().includes('/models')) return r.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ data: [{ id: 'whisper-large-v3' }] }) });
  calls++;
  return r.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ text: said }) });
});
const live = () => p.evaluate(async () => { const { useStore } = await import('/src/state/store.ts'); return useStore.getState().active; });
const doneN = async () => (await live()).exercises.flatMap((e) => e.sets.filter((s) => s.done)).length;

await p.goto('http://127.0.0.1:5173/'); await wait(p, 900); await skipOnboarding(p); await loadDemo(p);
await p.evaluate(() => localStorage.setItem('aven.keys', JSON.stringify({ groq: 'gsk_TEST' })));
await p.reload(); await wait(p, 1500);
await p.evaluate(async () => {
  const { useStore, allExercises } = await import('/src/state/store.ts');
  const st = useStore.getState();
  st.updateSettings({ handsFree: true });
  const bench = allExercises(st.exercises).find((e) => e.name === 'Barbell Bench Press');
  const t = { weightKg: 80, repMin: 6, repMax: 8 };
  useStore.setState({ active: { id: 'whf', name: 'Push', date: new Date().toISOString().slice(0, 10), startedAt: Date.now() - 600000, pausedMs: 0, status: 'active', exercises: [{ id: 'se1', exerciseId: bench.id, sets: [{ id: 's1', type: 'working', done: false, target: t }, { id: 's2', type: 'working', done: false, target: t }, { id: 's3', type: 'working', done: false, target: t }] }] } });
});
await p.locator('button[aria-label="Resume workout"]').first().click(); await wait(p, 1400);
const views = p.locator('.wk-views');
const box = await views.boundingBox();
// an empty spot (found the way the app judges one: not a button, a field or a set row)
const spot = await p.evaluate(async () => {
  const { isEmptyTap } = await import('/src/lib/handsFree.ts');
  const v = document.querySelector('.wk-views').getBoundingClientRect();
  for (let y = v.top + 10; y < v.bottom - 120; y += 6) for (const x of [24, v.width / 2, v.width - 24]) { const el = document.elementFromPoint(x, y); if (el && el.closest('.wk-views') && isEmptyTap(el)) return { x, y }; }
  return null;
});
assert(spot, 'there is empty space to tap');
const tapEmpty = () => p.mouse.click(spot.x, spot.y);

// ── "8 at 80" ──
await tapEmpty(); await wait(p, 600);
assert.equal(await p.locator('[data-set="s1"].hf-listen').count(), 1, 'the set it will log breathes while it listens');
assert(await p.locator('.wk-bar-txt:not(.out) .wk-bar-top', { hasText: 'Listening…' }).isVisible(), 'the bar says it is listening');
await wait(p, 500); await p.screenshot({ path: 'shots/handsfree-1-listening.png' });
await wait(p, 9000);
assert.equal(calls, 1, 'one phrase heard');
assert.equal(await doneN(), 1, '"8 at 80" ticked the set');
assert.equal(await p.locator('.hf-listen').count(), 0, 'the ring goes');
assert.equal(await p.locator('.wk-bar-txt:not(.out) .wk-bar-top', { hasText: 'Listening…' }).count(), 0, 'and the bar says what is next again');
assert(await p.getByText(/80 kg × 8 ✓/).first().isVisible(), 'a quiet toast with Undo');

// ── talk to someone else: ignored ──
said = 'hey can I work in with you';
await tapEmpty(); await wait(p, 9600);
assert.equal(await doneN(), 1, 'not a set: nothing logged');

// ── a tap on a button is never a listen ──
const c0 = calls;
await p.getByRole('button', { name: 'Complete set' }).first().click(); await wait(p, 9000);
assert.equal(calls, c0, 'the Complete button just completes');

console.log('errors', errors.length);
assert.equal(errors.filter((e) => !/Failed to load resource/.test(e)).length, 0, errors.join('\n'));
console.log('HANDS-FREE OK');
await b.close();
