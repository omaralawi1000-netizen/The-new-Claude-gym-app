// The rest timer while Aven is out of sight (imported by the generated sw.js).
//
// When you leave the app mid-rest (another app, or the screen off), the page hands the rest over here: a quiet notification
// says when it ends ("Rest over at 14:32" — a clock time, so it never needs ticking), and at that moment it turns into the
// alert that buzzes. The service worker isn't slowed down like a hidden page is, so it is the main timer; the page keeps a
// back-up timer of its own. Coming back to the app clears both notifications.
//
// Limits a web app can't get around: Chrome stops a service-worker task after 5 minutes, so a longer rest left in the
// background relies on the page's back-up timer only; and a notification can always be swiped away.
const REST_TAG = 'aven-rest';
const MAX_WAIT = 290000; // just under Chrome's 5-minute limit for one task
let restKey = null; // the rest being timed here
let wakeRest = null; // ends the current wait early (a new rest, or back in the app)

self.addEventListener('message', (e) => {
  const d = e.data;
  if (!d) return;
  if (d.type === 'aven-rest-over') { e.waitUntil(restOver(d.rest, 'page')); return; }
  if (d.type !== 'aven-rest') return;
  if (wakeRest) { wakeRest(); wakeRest = null; }
  if (!d.rest) { restKey = null; e.waitUntil(clearRest()); return; }
  restKey = d.rest.key;
  e.waitUntil(timeRest(d.rest));
});

async function clearRest() {
  const ns = await self.registration.getNotifications({ tag: REST_TAG });
  ns.forEach((n) => n.close());
}

async function timeRest(r) {
  await self.registration.showNotification(r.title, {
    body: r.body, tag: REST_TAG, silent: true, renotify: false, timestamp: r.endsAt, icon: r.icon, badge: r.badge,
    data: { kind: 'resting', key: r.key },
  });
  const left = r.endsAt - Date.now();
  if (left > MAX_WAIT) return; // too long for one task: the page's back-up timer has it
  const stopped = await new Promise((done) => {
    const t = setTimeout(() => done(false), Math.max(0, left));
    wakeRest = () => { clearTimeout(t); done(true); };
  });
  if (stopped || restKey !== r.key) return;
  wakeRest = null;
  await restOver(r, 'sw');
}

/** The alert. Shared with the page's back-up timer (which posts 'aven-rest-over' if it gets there first). */
async function restOver(r, by) {
  const now = await self.registration.getNotifications({ tag: REST_TAG });
  if (now.some((n) => n.data && n.data.kind === 'over' && n.data.key === r.key)) return; // already shown
  // back in the app already: the app does its own buzz and tones
  const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (wins.some((w) => w.visibilityState === 'visible')) { now.forEach((n) => n.close()); return; }
  await self.registration.showNotification(r.overTitle, {
    body: r.overBody, tag: REST_TAG, renotify: true, silent: false, vibrate: [180, 90, 180, 90, 320], icon: r.icon, badge: r.badge,
    data: { kind: 'over', key: r.key, due: r.endsAt, firedAt: Date.now(), by },
  });
}

self.addEventListener('notificationclick', (e) => {
  const n = e.notification;
  if (n.tag !== REST_TAG) return;
  const data = n.data || {};
  n.close();
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const w = wins[0];
    if (w) {
      try { await w.focus(); } catch { /* ignore */ }
      w.postMessage({ type: 'aven-open-workout', late: data.kind === 'over' ? data : null });
    } else if (self.clients.openWindow) {
      await self.clients.openWindow(new URL('./?do=workout', self.registration.scope).href);
    }
  })());
});
