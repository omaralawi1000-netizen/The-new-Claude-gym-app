// Hands-free Done ✓ (needs the built app: npm run build && npx vite preview --port 8788 --host 127.0.0.1). The rest ends
// with Aven closed: the alert "Time for set 2" carries Done ✓ with the set (phone, lock screen, watch); tapping it with Aven
// closed keeps it in the service worker's cache, and opening Aven ticks exactly that set, once. With Aven open, the tap
// reaches the page at once.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const wait = (p, ms) => p.waitForTimeout(ms);
const URL0 = 'http://127.0.0.1:8788/';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--headless=new'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'allow', isMobile: true, hasTouch: true });
await ctx.grantPermissions(['notifications'], { origin: URL0 });
const errors = [];
const posts = [];
const watch = (p) => { p.on('pageerror', (e) => { errors.push(e.message); console.log('[pageerror]', e.message); }); p.on('console', (m) => { if (m.type() === 'error') { if (m.text().startsWith('POST ')) { posts.push(JSON.parse(m.text().slice(5))); return; } errors.push(m.text()); console.log('[err]', m.text()); } }); };
let p = await ctx.newPage(); watch(p);
await p.goto(URL0); await wait(p, 1500);
await p.getByText('Skip all').click(); await wait(p, 600);
await p.evaluate(() => navigator.serviceWorker.ready); await p.reload(); await wait(p, 1500);
await p.getByLabel('Settings').click(); await wait(p, 500);
await p.getByText('Data & backup').click(); await wait(p, 400);
await p.getByText('Load demo data').click(); await wait(p, 400);
await p.keyboard.press('Escape'); await wait(p, 800);
await p.locator('.tabbar').getByRole('button', { name: 'Train', exact: true }).click(); await wait(p, 900);
await p.getByRole('button', { name: 'Start', exact: true }).filter({ visible: true }).first().click(); await wait(p, 2500);
// the demo's warm-up has nothing typed in: give it reps and tick it, then set 1, so "what's next" is set 2 with weight × reps
await p.getByLabel('Reps').first().fill('8'); await wait(p, 300);
await p.getByRole('button', { name: 'Complete set' }).first().click(); await wait(p, 900);
await p.getByRole('button', { name: 'Complete set' }).first().click(); await wait(p, 900); // set 1: the rest starts
const rest = () => p.evaluate(() => JSON.parse(localStorage.getItem('aven.v1')).active?.rest ?? null);
const cut = async (keep) => { await wait(p, 800); const k = Math.max(0, Math.floor(((await rest()).endsAt - Date.now() - keep) / 15000)); for (let i = 0; i < k; i++) { if (!(await p.getByRole('button', { name: '15 seconds less' }).isVisible())) await p.locator('.wk-bar-main').click(); await p.getByRole('button', { name: '15 seconds less' }).click(); await wait(p, 120); } };
await cut(12000);
if (0) { if (!(await p.getByRole('button', { name: '15 seconds less' }).isVisible())) await p.locator('.wk-bar-main').click(); await p.getByRole('button', { name: '15 seconds less' }).click(); n++; await wait(p, 120); }
await wait(p, 700); // saved
const due = (await rest()).endsAt;
const doneSets = () => p.evaluate(() => JSON.parse(localStorage.getItem('aven.v1')).active?.exercises.flatMap((e) => e.sets.filter((s) => s.done).map((s) => s.id)) ?? []);
const before = (await doneSets()).length;
// leave, then the app goes away entirely
const setHidden = (pg, h) => pg.evaluate((h) => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => h }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') }); document.dispatchEvent(new Event('visibilitychange')); }, h);
await setHidden(p, true); await wait(p, 800);
await p.close();
const sw = ctx.serviceWorkers()[0];
await new Promise((r) => setTimeout(r, due - Date.now() + 2500));
const alert = await sw.evaluate(async () => (await self.registration.getNotifications({ tag: 'aven-rest-over' })).map((x) => ({ title: x.title, actions: x.actions.map((y) => y.title) })));
console.log('alert', JSON.stringify(alert));
assert(alert.length === 1 && /^Done ✓ [\d.]+ kg × \d+$/.test(alert[0].actions[0] ?? ''), 'the alert has Done ✓ with the set');
// Done ✓ tapped with Aven closed
await sw.evaluate(async () => {
  const [n] = await self.registration.getNotifications({ tag: 'aven-rest-over' });
  const jobs = []; self.__avenRestClick({ notification: n, action: 'done', waitUntil: (x) => jobs.push(x) });
  await Promise.all(jobs);
});
assert.equal((await sw.evaluate(async () => (await self.registration.getNotifications({ tag: 'aven-rest-over' })).length)), 0, 'the alert goes');
// open Aven: the set is ticked, once
p = await ctx.newPage(); watch(p); await p.goto(URL0); await wait(p, 2500);
const after = await doneSets();
assert.equal(after.length, before + 1, 'opening Aven ticks the set Done ✓ named');
await p.reload(); await wait(p, 2000);
assert.equal((await doneSets()).length, before + 1, 'and only once');
console.log('errors', errors.length);
assert.equal(errors.filter((e) => !/Failed to load resource/.test(e)).length, 0, errors.join('\n'));
console.log('DONE OK');
await b.close();
