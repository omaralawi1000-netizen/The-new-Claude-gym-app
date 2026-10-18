// Aven's rest notification for the Android app. Published at
// https://omaralawi1000-netizen.github.io/The-new-Claude-gym-app-rest/sw.js (the omaralawi1000-netizen.github.io repo):
// copy this file there when it changes. The source is android/site/ in the Aven repo.
//
// Why a second service worker, at its own address: Chrome gives a site's notifications to an installed web app (the
// old home-screen icon) before it tries the Android app, but only when the notification comes from inside that web
// app's scope (/The-new-Claude-gym-app/). Notifications from this scope go to the Android app, which turns the rest
// into a live countdown (android/app/.../RestNotifications.java). The website (src/lib/androidApp.ts) shows and clears
// them; this worker only answers taps: +30 s and Skip go to the open app, and a tap opens the workout.
// the keys of a Done ✓ kept for the page: whole paths, the same from every worker and page (a bare 'done' is read
// against each one's own address, so the app's rest worker and the page each had their own 'done' and never met)
const PENDING_DONE = '/aven-pending/done', PENDING_LOG = '/aven-pending/log';
const APP = '/The-new-Claude-gym-app/';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('notificationclick', (e) => {
  const n = e.notification;
  const d = n.data || {};
  if (e.action === 'more' || e.action === 'skip') {
    e.waitUntil((async () => {
      // the app's rest-over alert has a Done ✓ that comes as this Skip once the rest is over (it can mean nothing else
      // then). Decided here, at the tap: a page asleep behind the lock screen gets the message late, when a real Skip
      // would look like one too. A Done is kept in the cache as well, with its time, for a page that misses the message.
      const done = e.action === 'skip' && d.endsAt && Date.now() > d.endsAt + 1500;
      const at = Date.now();
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (done) {
        const c = await caches.open('aven-pending');
        await c.put(PENDING_DONE, new Response(JSON.stringify({ key: d.key, at })));
        // (what Aven's Settings › Training shows as "Last Done ✓", so one screenshot says where it stopped)
        await c.put(PENDING_LOG, new Response(JSON.stringify({ key: d.key, at, sw: 'app', wins: wins.length })));
      }
      wins.forEach((w) => w.postMessage({ type: 'aven-rest-action', action: done ? 'done' : e.action, key: d.key, at }));
      if (e.action === 'skip') { n.close(); return; }
      // nobody to tell (the app was closed): move Chrome's copy along too, so it matches the countdown
      if (!wins.length && d.endsAt) {
        const endsAt = d.endsAt + 30000;
        await self.registration.showNotification(n.title, {
          body: n.body, tag: n.tag, silent: true, timestamp: endsAt, icon: n.icon, badge: n.badge,
          actions: (n.actions || []).map((a) => ({ action: a.action, title: a.title })), data: { ...d, endsAt },
        });
      }
    })());
    return;
  }
  n.close();
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const w = wins.find((x) => x.url.includes(APP)) || wins[0];
    if (w) {
      try { await w.focus(); } catch { /* ignore */ }
      w.postMessage({ type: 'aven-open-workout', late: null });
    } else if (self.clients.openWindow) {
      await self.clients.openWindow(APP + '?do=workout');
    }
  })());
});
