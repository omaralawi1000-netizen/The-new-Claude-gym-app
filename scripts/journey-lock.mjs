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
await p.getByRole('button', { name: 'Complete set' }).nth(1).click(); await wait(p, 900);
const rest = () => p.evaluate(() => JSON.parse(localStorage.getItem('aven.v1')).active?.rest ?? null);
const cut = async (keep) => { await wait(p, 800); const k = Math.max(0, Math.floor(((await rest()).endsAt - Date.now() - keep) / 15000)); for (let i = 0; i < k; i++) { if (!(await p.getByRole('button', { name: '15 seconds less' }).isVisible())) await p.locator('.wk-bar-main').click(); await p.getByRole('button', { name: '15 seconds less' }).click(); await wait(p, 120); } };
await cut(12000);
if (0) { if (!(await p.getByRole('button', { name: '15 seconds less' }).isVisible())) await p.locator('.wk-bar-main').click(); await p.getByRole('button', { name: '15 seconds less' }).click(); n++; await wait(p, 120); }
await wait(p, 700); // saved
const due = (await rest()).endsAt;
const notes = (pg) => pg.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications({ tag: 'aven-rest' })).map((x) => ({ title: x.title, body: x.body, data: x.data, silent: x.silent })));
const setHidden = (pg, h) => pg.evaluate((h) => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => h }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') }); document.dispatchEvent(new Event('visibilitychange')); }, h);
await p.evaluate(() => { const o = ServiceWorker.prototype.postMessage; ServiceWorker.prototype.postMessage = function (m) { console.error('POST ' + JSON.stringify(m)); return o.call(this, m); }; });
// 1) leave the app
await setHidden(p, true); await wait(p, 800);
const n1 = await notes(p); console.log('while resting', JSON.stringify(n1));
assert(n1.length === 1 && /^Rest over at \d\d:\d\d$/.test(n1[0].title) && /^Next: Barbell Bench Press · /.test(n1[0].body) && n1[0].data.kind === 'resting' && n1[0].silent, 'quiet lock-screen notification');
// 2) the app goes away entirely: only the service worker is left to keep time
await p.close();
const sw = ctx.serviceWorkers()[0];
await new Promise((r) => setTimeout(r, due - Date.now() + 2500));
const n2 = await sw.evaluate(async () => (await self.registration.getNotifications({ tag: 'aven-rest' })).map((x) => ({ title: x.title, body: x.body, data: x.data, silent: x.silent })));
console.log('after', JSON.stringify(n2));
assert(n2.length === 1 && n2[0].title === 'Rest over' && /^Barbell Bench Press · /.test(n2[0].body) && n2[0].data.kind === 'over' && n2[0].data.by === 'sw', 'the service worker turned it into the alert');
console.log('ALERT LATE ms', n2[0].data.firedAt - n2[0].data.due, 'due ok', n2[0].data.due === due);
// 3) open the app again: cleared, lateness remembered, shown in Settings
p = await ctx.newPage(); watch(p); await p.goto(URL0); await wait(p, 2000);
assert.equal((await notes(p)).length, 0, 'cleared when the app is open again');
const late = await p.evaluate(() => JSON.parse(localStorage.getItem('aven.restLate')));
console.log('saved late', late); assert(late && late.by === 'sw');
// 4) page back-up timer: hidden, service worker message lost → page still alerts
await p.getByRole('button', { name: 'Resume workout' }).click().catch(() => {}); await wait(p, 1500);
await p.getByRole('button', { name: 'Complete set' }).nth(2).click(); await wait(p, 900);
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
// 5) tap the alert → the workout opens (click handled in the SW: message to the page)
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
