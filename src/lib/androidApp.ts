// Aven for Android (android/ in this repo): the same website in Chrome, plus a native rest countdown.
//
// The rest reaches the app through a notification from a second, tiny service worker at /The-new-Claude-gym-app-rest/
// (published on omaralawi1000-netizen.github.io; source in android/site/). Chrome gives a site's notifications to an
// installed web app (the old home-screen icon) before the Android app, but only those from inside the web app's own
// scope, and this one is outside it. So with the app on the phone, the rest always becomes its live countdown, whichever
// icon Aven was opened from. The words for it travel in the notification's tag (the app reads it; it never shows), and
// the end time is the timestamp. Without the app, nothing here is used and the website's own notification shows instead.
const SITE = 'https://omaralawi1000-netizen.github.io';
const SCOPE = '/The-new-Claude-gym-app-rest/';
const SEEN = 'aven.androidApp';

/** Opened inside the Android app right now (Chrome says so in the referrer when the app opens the site). */
export const inAndroidApp = () => { try { return document.referrer.startsWith('android-app://app.aven.android'); } catch { return false; } };

/** Remembered on this phone once the site has been opened in the app (the web app shares the same storage). */
export function noteAndroidApp() {
  try { if (inAndroidApp()) localStorage.setItem(SEEN, String(Date.now())); } catch { /* ignore */ }
}

const hasAndroidApp = () => {
  try { return location.origin === SITE && 'serviceWorker' in navigator && !!localStorage.getItem(SEEN); } catch { return false; }
};

let reg: Promise<ServiceWorkerRegistration | null> | null = null;
/** The rest worker, registered once, ready before you ever leave mid-rest (null: no app, or it couldn't be). */
export function androidRest(): Promise<ServiceWorkerRegistration | null> {
  if (!hasAndroidApp()) return Promise.resolve(null);
  reg ??= navigator.serviceWorker.register(`${SCOPE}sw.js`, { scope: SCOPE }).then(async (r) => {
    for (let i = 0; i < 50 && !r.active; i++) await new Promise((ok) => setTimeout(ok, 100));
    return r.active ? r : null;
  }).catch(() => null);
  return reg;
}

export interface AppRest {
  key: string; startedAt: number; endsAt: number; title: string; body: string;
  exercise: string; line: string; overTitle: string; overBody: string; more: string; skip: string; icon: string; badge: string;
}

/** The rest, for the app's countdown. False when the app can't be reached this way (the website's own one is used then). */
export async function showAppRest(r: AppRest): Promise<boolean> {
  const sw = await androidRest();
  if (!sw) return false;
  const words = { v: 1, s: r.startedAt, x: r.exercise, l: r.line, o: r.overTitle, b: r.overBody, p: r.more, k: r.skip };
  const tag = `aven-rest|${JSON.stringify(words)}`;
  try {
    for (const n of await sw.getNotifications()) if (n.tag !== tag) n.close(); // an earlier rest's, or its alert
    await sw.showNotification(r.title, {
      body: r.body, tag, silent: true, timestamp: r.endsAt, icon: r.icon, badge: r.badge,
      actions: [{ action: 'more', title: r.more }, { action: 'skip', title: r.skip }],
      data: { kind: 'aven-native', key: r.key, endsAt: r.endsAt },
    } as NotificationOptions);
    return true;
  } catch { return false; }
}

/** The page's back-up alert (the app rings on time by itself; this only matters if it somehow didn't). */
export async function overAppRest(r: AppRest) {
  const sw = await androidRest();
  if (!sw) return;
  try {
    await sw.showNotification(r.overTitle, {
      body: r.overBody, tag: 'aven-rest-over', renotify: true, silent: false, requireInteraction: true, icon: r.icon, badge: r.badge,
      vibrate: [400, 120, 400, 120, 700], data: { kind: 'over', key: r.key },
    } as NotificationOptions);
  } catch { /* ignore */ }
}

/** Back in Aven (or the rest is gone): the app's countdown and alert go too. */
export function clearAppRest() {
  if (!hasAndroidApp()) return;
  navigator.serviceWorker.getRegistration(SCOPE).then((sw) => sw?.getNotifications()).then((ns) => ns?.forEach((n) => n.close())).catch(() => {});
}
