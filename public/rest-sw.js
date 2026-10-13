// The rest timer while Aven is out of sight (imported by the generated sw.js).
//
// When you leave the app mid-rest (another app, or the screen off), the page hands the rest over here. A quiet notification
// says when you're back ("Back at 14:32", a clock time, so it never needs ticking) and what's next, with +30 s and Skip rest
// buttons. When the time comes, a separate alert rings ("Time for set 2"): a new notification rather than an update of the
// quiet one, because phones often stay silent when a notification is only updated. The service worker isn't slowed down
// like a hidden page is, so it is the main timer; the page keeps a back-up timer. Coming back to the app clears both.
//
// Limits a web app can't get around: Chrome stops a service-worker task after 5 minutes, so a longer rest left in the
// background relies on the page's back-up timer only; the sound and vibration are the phone's own settings for Aven's
// notifications; and a notification can always be swiped away.
const REST_TAG = 'aven-rest'; // the quiet one, while resting
const OVER_TAG = 'aven-rest-over'; // the alert when it ends
const MAX_WAIT = 290000; // just under Chrome's 5-minute limit for one task
let rest = null; // the rest being timed here
let wakeRest = null; // ends the current wait early (a new rest, a button, or back in the app)

self.addEventListener('message', (e) => {
  const d = e.data;
  if (!d) return;
  if (d.type === 'aven-rest-over') { e.waitUntil(restOver(d.rest, 'page')); return; }
  if (d.type !== 'aven-rest') return;
  if (d.rest && rest && d.rest.key === rest.key && wakeRest) return; // already timing exactly this one
  e.waitUntil(startRest(d.rest));
});

async function startRest(r) {
  if (wakeRest) { wakeRest(); wakeRest = null; }
  rest = r;
  if (!r) { await clearRest(); return; }
  await timeRest(r);
}

async function clearRest() {
  const ns = await self.registration.getNotifications();
  ns.filter((n) => n.tag === REST_TAG || n.tag === OVER_TAG).forEach((n) => n.close());
}

async function timeRest(r) {
  const old = await self.registration.getNotifications({ tag: OVER_TAG });
  old.forEach((n) => n.close());
  await self.registration.showNotification(r.title, {
    body: r.body, tag: REST_TAG, silent: true, renotify: false, icon: r.icon, badge: r.badge,
    actions: [{ action: 'more', title: r.more }, { action: 'skip', title: r.skip }],
    data: { kind: 'resting', key: r.key },
  });
  const left = r.endsAt - Date.now();
  if (left > MAX_WAIT) return; // too long for one task: the page's back-up timer has it
  const stopped = await new Promise((done) => {
    const t = setTimeout(() => done(false), Math.max(0, left));
    wakeRest = () => { clearTimeout(t); done(true); };
  });
  if (stopped || !rest || rest.key !== r.key) return;
  wakeRest = null;
  await restOver(r, 'sw');
}

/** The alert. Shared with the page's back-up timer (which posts 'aven-rest-over' if it gets there first). */
async function restOver(r, by) {
  const over = await self.registration.getNotifications({ tag: OVER_TAG });
  if (over.some((n) => n.data && n.data.key === r.key)) return; // already rang
  const quiet = await self.registration.getNotifications({ tag: REST_TAG });
  if (quiet.length && !quiet.some((n) => n.data && n.data.key === r.key)) return; // a newer rest (+30 s) took over
  quiet.forEach((n) => n.close());
  // back in the app already: the app does its own buzz and chime
  const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (wins.some((w) => w.visibilityState === 'visible')) return;
  await self.registration.showNotification(r.overTitle, {
    body: r.overBody, tag: OVER_TAG, renotify: true, silent: false, requireInteraction: true, icon: r.icon, badge: r.badge,
    vibrate: [400, 120, 400, 120, 700],
    data: { kind: 'over', key: r.key, due: r.endsAt, firedAt: Date.now(), by },
  });
}

/** "Back at 14:32" for a new end time, in the app's language. */
function backAt(r, endsAt) {
  let time;
  try { time = new Intl.DateTimeFormat(r.locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(endsAt)); }
  catch { time = new Date(endsAt).toTimeString().slice(0, 5); }
  return r.titleTpl.split('{time}').join(time);
}

function restClick(e) {
  const n = e.notification;
  if (n.tag !== REST_TAG && n.tag !== OVER_TAG) return;
  const data = n.data || {};
  // the buttons: change the rest right here (so the lock screen is right at once), then tell the app
  if (e.action === 'more' || e.action === 'skip') {
    e.waitUntil((async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      wins.forEach((w) => w.postMessage({ type: 'aven-rest-action', action: e.action, key: data.key }));
      const r = rest && rest.key === data.key ? rest : null;
      if (e.action === 'skip') await startRest(null);
      else if (r) {
        const endsAt = r.endsAt + 30000;
        await startRest({ ...r, endsAt, key: `${r.id}:${endsAt}`, title: backAt(r, endsAt) });
      } // else: this worker was restarted and lost the rest; the app (if it's still running) sends the new one
    })());
    return;
  }
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
}
self.addEventListener('notificationclick', restClick);
self.__avenRestClick = restClick; // for scripts/journey-lock.mjs (a test can't tap a real notification)
