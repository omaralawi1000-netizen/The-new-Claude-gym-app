// Needs the built app: npm run build && npx vite preview --port 8788 --host 127.0.0.1 (the service worker only runs in a build).
// Uses Chromium's new headless mode: the old headless shell always says notifications are blocked.
// Lock-screen rest: leave the app mid-rest → quiet "Rest over at hh:mm"; the service worker turns it into the alert even with the
// app gone; back in the app → cleared, lateness kept; tapping opens the workout. Headless can't hide a page, so "leaving" is
// simulated (visibility flipped, then the page closed so only the service worker is left).
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
const notes = (pg) => pg.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).filter((x) => x.tag.startsWith('aven-rest')).map((x) => ({ title: x.title, body: x.body, data: x.data, silent: x.silent, tag: x.tag, actions: x.actions.map((y) => y.title) })));
const setHidden = (pg, h) => pg.evaluate((h) => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => h }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') }); document.dispatchEvent(new Event('visibilitychange')); }, h);
await p.evaluate(() => { const o = ServiceWorker.prototype.postMessage; ServiceWorker.prototype.postMessage = function (m) { console.error('POST ' + JSON.stringify(m)); return o.call(this, m); }; });
// 1) leave the app
await setHidden(p, true); await wait(p, 800);
const n1 = await notes(p); console.log('while resting', JSON.stringify(n1));
assert(n1.length === 1 && /^Back at \d\d:\d\d$/.test(n1[0].title) && /^Barbell Bench Press · set 2 of 3 · [\d.]+ kg × \d+$/.test(n1[0].body) && n1[0].data.kind === 'resting' && n1[0].silent, 'quiet lock-screen notification');
assert.deepEqual(n1[0].actions, ['+30 s', 'Skip rest'], 'two buttons');
// 2) the app goes away entirely: only the service worker is left to keep time
await p.close();
const sw = ctx.serviceWorkers()[0];
await new Promise((r) => setTimeout(r, due - Date.now() + 2500));
const n2 = await sw.evaluate(async () => (await self.registration.getNotifications()).map((x) => ({ title: x.title, body: x.body, data: x.data, silent: x.silent, tag: x.tag })));
console.log('after', JSON.stringify(n2));
assert(n2.length === 1 && n2[0].title === 'Time for set 2' && /^Barbell Bench Press · [\d.]+ kg × \d+$/.test(n2[0].body) && n2[0].tag === 'aven-rest-over' && !n2[0].silent && n2[0].data.by === 'sw', 'the quiet one made way for a ringing alert');
console.log('ALERT LATE ms', n2[0].data.firedAt - n2[0].data.due, 'due ok', n2[0].data.due === due);
// 3) open the app again: cleared, lateness remembered, shown in Settings
p = await ctx.newPage(); watch(p); await p.goto(URL0); await wait(p, 2000);
assert.equal((await notes(p)).length, 0, 'cleared when the app is open again');
const late = await p.evaluate(() => JSON.parse(localStorage.getItem('aven.restLate')));
console.log('saved late', late); assert(late && late.by === 'sw');
// 4) the buttons on the lock screen: +30 s moves "Back at" and the app's own timer; Skip rest ends both
await p.getByRole('button', { name: 'Resume workout' }).click().catch(() => {}); await wait(p, 1500);
await p.getByRole('button', { name: 'Complete set' }).first().click(); await wait(p, 1500);
const before = (await rest()).endsAt;
await setHidden(p, true); await wait(p, 800);
// the phone switches to dark mode while Aven is in the background: Chrome calls the page visible, but without focus.
// The notification must stay; it goes only once you're really back (the focus comes)
const setFocus = (pg, f) => pg.evaluate((f) => { document.hasFocus = () => f; if (f) window.dispatchEvent(new Event('focus')); }, f);
await setFocus(p, false); await setHidden(p, false); await wait(p, 800);
assert.equal((await notes(p)).length, 1, 'dark-mode switch in the background: the notification stays');
await setFocus(p, true); await wait(p, 800);
assert.equal((await notes(p)).length, 0, 'really back (focus): cleared');
await setHidden(p, true); await wait(p, 800);
const tap = (action) => ctx.serviceWorkers()[0].evaluate(async (action) => {
  const [n] = await self.registration.getNotifications({ tag: 'aven-rest' });
  const jobs = []; self.__avenRestClick({ notification: n, action, waitUntil: (x) => jobs.push(x) });
  await new Promise((r) => setTimeout(r, 600)); // the +30 s job keeps timing the new rest; don't wait for it
}, action);
const t1 = (await notes(p))[0].title;
await tap('more'); await wait(p, 1200);
const after = await notes(p);
console.log('+30 s', t1, '→', after[0].title, after[0].body);
assert.equal(after.length, 1); assert.equal(after[0].data.key.split(':')[1], String(before + 30000), 'notification moved 30 s');
assert.equal((await rest()).endsAt, before + 30000, 'the app moved 30 s too');
await tap('skip'); await wait(p, 1200);
assert.equal((await notes(p)).length, 0, 'skip: notification gone');
assert.equal(await rest(), null, 'skip: rest ended in the app');
await setHidden(p, false); await wait(p, 800);
// 5) page back-up timer: hidden, service worker message lost → page still alerts
await p.getByRole('button', { name: 'Complete set' }).first().click(); await wait(p, 900);
await cut(9000);
if (0) { if (!(await p.getByRole('button', { name: '15 seconds less' }).isVisible())) await p.locator('.wk-bar-main').click(); await p.getByRole('button', { name: '15 seconds less' }).click(); n++; await wait(p, 120); }
await wait(p, 700);
const due2 = (await rest()).endsAt;
await p.evaluate(() => { const o = ServiceWorker.prototype.postMessage; ServiceWorker.prototype.postMessage = function (m) { console.error('POST ' + JSON.stringify(m)); return o.call(this, m); }; });
posts.length = 0;
await setHidden(p, true); await wait(p, 500);
// kill the service worker's timer (as if Chrome stopped it): a clear message, then hidden again isn't sent → only the page timer is left
await p.evaluate(async () => (await navigator.serviceWorker.ready).active.postMessage({ type: 'aven-rest', rest: null })); await wait(p, 500);
assert.equal((await notes(p)).length, 0, 'sw timer stopped for the test');
await wait(p, due2 - Date.now() + 1500);
// (headless can't really hide the page, so the service worker sees it on screen and rightly skips the alert; check the hand-off)
console.log('backup posts', posts.map((m) => m.type));
assert(posts.some((m) => m.type === 'aven-rest-over' && m.rest.endsAt === due2), 'the page back-up timer asks for the alert');
// 6) tap the alert → the workout opens (click handled in the SW: message to the page)
await setHidden(p, false); await wait(p, 800);
assert.equal((await notes(p)).length, 0, 'back in the app: cleared');
// Settings line
await p.keyboard.press('Escape'); await wait(p, 600);
await p.evaluate(() => { localStorage.setItem('aven.restLate', JSON.stringify({ ms: 14200, by: 'sw', at: Date.now() })); });
await p.getByLabel('Settings').click(); await wait(p, 600);
await p.getByText('Training', { exact: true }).first().click(); await wait(p, 700);
assert(await p.getByText('Rest timer on lock screen').first().isVisible());
assert(await p.getByText('Last alert came 14 s late.').isVisible());
await p.screenshot({ path: 'shots/lock-settings.png' });
// tapping a notification (the service worker tells the app): the workout comes to the front
await p.keyboard.press('Escape'); await wait(p, 500); await p.keyboard.press('Escape'); await wait(p, 800);
assert(!(await p.getByRole('button', { name: 'Minimise workout' }).isVisible().catch(() => false)), 'workout not on screen before the tap');
await ctx.serviceWorkers()[0].evaluate(async () => (await self.clients.matchAll({ type: 'window' })).forEach((c) => c.postMessage({ type: 'aven-open-workout', late: null })));
await wait(p, 1500);
assert(await p.getByRole('button', { name: 'Minimise workout' }).isVisible(), 'tap opens the workout');
console.log('errors', errors.length);
assert.equal(errors.filter((e) => !/Failed to load resource/.test(e)).length, 0);
console.log('LOCK OK');
await b.close();
