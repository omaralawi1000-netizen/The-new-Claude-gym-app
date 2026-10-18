// Coach 2.0, phase 5b, part D, in the real app: Aven opened by the Android app with the watch's numbers in its address
// ("#hc=…", as android/…/HealthSync.java writes them). The workouts appear as activities (once, said in a quiet toast), the
// steps on the week line, Settings → Watch says it is connected, the Coach's DATA sees the cardio (and is told not to eat
// the calories back), and the food target is untouched. A made-up "#hc=" without the app does nothing.
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import assert from 'node:assert/strict';
const { b, ctx, p, errors } = await launch({ theme: process.argv[2] || 'dark' });
// (opened by the Android app: Chrome says so in the referrer; and the phone is an Android one)
await ctx.addInitScript(() => {
  Object.defineProperty(Document.prototype, 'referrer', { get: () => (window.__notApp ? '' : 'android-app://app.aven.android/'), configurable: true });
  Object.defineProperty(Navigator.prototype, 'userAgent', { get: () => 'Mozilla/5.0 (Linux; Android 16; SM-S948B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36', configurable: true });
});
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const json = (o) => ({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(o) });
const seen = [];
await p.route('https://generativelanguage.googleapis.com/**', async (r) => {
  const req = r.request(); const url = req.url();
  if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
  if (url.includes('/models?')) return r.fulfill(json({ models: [{ name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }] }));
  const body = JSON.parse(req.postData() || '{}');
  const system = body.systemInstruction?.parts?.[0]?.text ?? '';
  seen.push(system);
  const txt = JSON.stringify(/insight/i.test(system) ? { insights: [] } : { reply: 'Nice cardio this week.', actions: [] });
  if (url.includes('streamGenerateContent')) return r.fulfill({ status: 200, headers: { ...cors, 'content-type': 'text/event-stream' }, body: `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: txt }] } }] })}\n\n` });
  return r.fulfill(json({ candidates: [{ content: { parts: [{ text: txt }] } }] }));
});
const live = () => p.evaluate(async () => { const { useStore } = await import('/src/state/store.ts'); const s = useStore.getState(); return { activities: s.activities, steps: s.steps, goals: s.settings.goals }; });
const hash = () => p.evaluate(() => {
  const H = 3600000, now = Date.now(), day = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const o = { v: 1, avail: true, on: true, granted: true, at: now,
    days: [[day(now - 48 * H), 12850], [day(now - 24 * H), 11320], [day(now), 9450]],
    ex: [
      { id: 'hc-stairs', t: 'stair_machine', s: now - 26 * H, e: now - 26 * H + 42 * 60000, hr: 156, hx: 181, kc: 540, src: 'com.sec.android.app.shealth' },
      { id: 'hc-tread', t: 'treadmill', s: now - 5 * H, e: now - 5 * H + 35 * 60000, hr: 149, hx: 172, kc: 410, m: 5600, src: 'com.sec.android.app.shealth' },
      { id: 'hc-lift', t: 'strength', s: now - 4 * H, e: now - 3 * H, hr: 118 },
    ] };
  return btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
});

await p.goto('http://127.0.0.1:5173/'); await wait(p, 900); await skipOnboarding(p); await loadDemo(p);
await p.evaluate(() => localStorage.setItem('aven.keys', JSON.stringify({ gemini: 'AIzaTESTKEY' })));
await p.reload(); await wait(p, 1600);
const before = await live();

// ── opened by the app with the watch's numbers ──
const h = await hash();
await p.goto(`http://127.0.0.1:5173/#hc=${h}`); await wait(p, 1800);
assert.equal(await p.evaluate(() => location.hash), '', 'out of the address');
const a = await live();
const watch = a.activities.filter((x) => x.source === 'watch');
assert.deepEqual(watch.map((x) => x.kind).sort(), ['run', 'stairs'], 'the cardio, not the lifting');
assert(watch.every((x) => x.avgHr && x.intensity), 'with heart rate and how hard');
assert.equal(a.steps.length, 3, 'the steps per day');
assert.deepEqual(a.goals, before.goals, 'the food target is untouched');
assert(await p.getByText('2 workouts from your watch').isVisible(), 'said once, quietly');
await p.screenshot({ path: 'shots/health-1-today.png' });
await wait(p, 5500); // (the toast has gone)
const wk = p.getByText(/steps a day/).first();
await wk.scrollIntoViewIfNeeded(); await wait(p, 700);
assert(/\d+ cardio · [\d,.]+ steps a day/.test(await wk.innerText()), 'the week line has the cardio and the steps');
await p.screenshot({ path: 'shots/health-1b-week.png' });
// the same again (the app opens Aven every time): nothing doubles, nothing said
await p.evaluate((x) => { location.hash = `hc=${x}`; }, h); await wait(p, 900);
assert.equal((await live()).activities.length, a.activities.length, 'never twice');

// ── Train: the history rows ──
await p.locator('.tabbar').getByRole('button', { name: 'Train', exact: true }).click(); await wait(p, 1200);
await p.getByRole('button', { name: 'History', exact: true }).first().click().catch(() => p.getByText('History', { exact: true }).first().click()); await wait(p, 900);
const row = p.getByText('Stair climber').first();
await row.scrollIntoViewIfNeeded(); await wait(p, 500);
assert(await row.isVisible(), 'the watch’s name for it');
assert(/156 bpm/.test(await p.locator('.li', { hasText: 'Stair climber' }).first().innerText()), 'with its heart rate');
await p.screenshot({ path: 'shots/health-2-train.png' });

// ── Settings → Watch ──
await p.locator('.tabbar').getByRole('button', { name: 'Today', exact: true }).click(); await wait(p, 1200);
await p.getByLabel('Settings').click(); await wait(p, 700);
assert(await p.getByText(/Connected · synced/).isVisible(), 'Settings says it is connected');
await p.getByRole('button', { name: /^Watch/ }).click(); await wait(p, 900);
assert(await p.getByRole('button', { name: 'Sync now' }).isVisible());
assert(await p.getByText('steps a day', { exact: true }).last().isVisible());
await p.screenshot({ path: 'shots/health-3-settings.png' });
await p.keyboard.press('Escape'); await wait(p, 900);

// ── the Coach sees it ──
await p.getByLabel('Coach').click(); await wait(p, 900);
await p.getByLabel('Message the Coach').fill('how was my cardio?'); await p.getByRole('button', { name: 'Send', exact: true }).click(); await wait(p, 2500);
const sys = seen.filter((x) => /WATCH CARDIO/.test(x)).at(-1) ?? '';
assert(/Stair climber 42 min, avg 156 bpm/.test(sys), 'the Coach DATA lists the cardio');
assert(/never tell them to eat them back/.test(sys), 'and is told not to eat the calories back');
assert(/Steps: about \d+ a day/.test(sys), 'and the steps');
await p.getByRole('dialog', { name: 'Coach', exact: true }).getByRole('button', { name: 'Close', exact: true }).click(); await wait(p, 1000);

// ── a made-up link (not the app) does nothing ──
const n = (await live()).activities.length;
await p.evaluate(() => { window.__notApp = true; });
const fake = await p.evaluate(() => btoa(JSON.stringify({ v: 1, avail: true, on: true, granted: true, at: Date.now(), ex: [{ id: 'fake', t: 'run', s: Date.now() - 3600000, e: Date.now() - 1800000 }] })).replace(/=+$/, ''));
await p.evaluate((x) => { location.hash = `hc=${x}`; }, fake); await wait(p, 900);
assert.equal((await live()).activities.length, n, 'a link not opened by the app is ignored');

console.log('errors', errors.length);
assert.equal(errors.filter((e) => !/Failed to load resource/.test(e)).length, 0, errors.join('\n'));
console.log('HEALTH OK');
await b.close();
