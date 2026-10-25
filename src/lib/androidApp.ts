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
const ERR = 'aven.androidApp.err';
const fail = (where: string, e: unknown) => { try { localStorage.setItem(ERR, `${where}: ${(e as any)?.message ?? e}`); } catch { /* ignore */ } };

/** Opened inside the Android app right now (Chrome says so in the referrer when the app opens the site). */
export const inAndroidApp = () => { try { return document.referrer.startsWith('android-app://app.aven.android'); } catch { return false; } };

/** Remembered on this phone once the site has been opened in the app (the web app shares the same storage). */
export function noteAndroidApp() {
  try { if (inAndroidApp()) localStorage.setItem(SEEN, String(Date.now())); } catch { /* ignore */ }
}

const hasAndroidApp = () => {
  try { return location.origin === SITE && 'serviceWorker' in navigator && !!localStorage.getItem(SEEN); } catch { return false; }
};

/** The Android app is on this phone: opened in it now, or seen opening the site before. (Inside the app the "came from
 *  the app" mark can be gone, after Aven reloaded itself for an update: Omar's watch button did nothing, 18 Oct.) */
export const appOnPhone = () => inAndroidApp() || hasAndroidApp();

let reg: Promise<ServiceWorkerRegistration | null> | null = null;
/** The rest worker, registered once, ready before you ever leave mid-rest (null: no app, or it couldn't be). */
export function androidRest(): Promise<ServiceWorkerRegistration | null> {
  if (!hasAndroidApp()) return Promise.resolve(null);
  reg ??= navigator.serviceWorker.register(`${SCOPE}sw.js`, { scope: SCOPE }).then(async (r) => {
    // checked for a newer worker every time Aven opens: the browser does that by itself only about once a day, and an old
    // one on Omar's phone kept closing the watch's Done ✓ path (18 Oct). It takes over at once (skipWaiting in it)
    r.update().catch(() => {});
    for (let i = 0; i < 50 && !r.active; i++) await new Promise((ok) => setTimeout(ok, 100));
    if (!r.active) fail('worker', 'not active after 5 s');
    return r.active ? r : null;
  }).catch((e) => { fail('register', e); return null; });
  return reg;
}

export interface AppRest {
  key: string; startedAt: number; endsAt: number; title: string; body: string;
  exercise: string; line: string; overTitle: string; overBody: string; more: string; skip: string; icon: string; badge: string;
  sound: boolean; // Settings › Sound: the app plays the rest-over clicks itself
  /** the rest-over alert's button ("Done ✓ 80 kg × 8": the set that's next, ticked as planned, from the lock screen or the
   *  watch) and what the alert says once it is ("Set 2 ✓ · 80 kg × 8") */
  done?: string; doneNote?: string;
  /** what the watch says once it's ticked ("Rest 2:45"), the rest after this set, and the sets after it */
  doneSay?: string; next?: number; queue?: { x: string; l: string; o: string; b: string; d: string; y: string; z: string; n: number }[];
}

/** The rest, for the app's countdown. False when the app can't be reached this way (the website's own one is used then). */
export async function showAppRest(r: AppRest): Promise<boolean> {
  const sw = await androidRest();
  if (!sw) return false;
  const words = { v: 1, i: r.key.split(':')[0], s: r.startedAt, x: r.exercise, l: r.line, o: r.overTitle, b: r.overBody, p: r.more, k: r.skip, q: r.sound ? 1 : 0, ...(r.done ? { d: r.done, y: r.doneNote ?? '', z: r.doneSay ?? '', n: r.next ?? 0, w: r.queue ?? [] } : {}) };
  const tag = `aven-rest|${JSON.stringify(words)}`;
  try {
    for (const n of await sw.getNotifications()) if (n.tag !== tag) n.close(); // an earlier rest's, or its alert
    await sw.showNotification(r.title, {
      body: r.body, tag, silent: true, timestamp: r.endsAt, icon: r.icon, badge: r.badge,
      actions: [{ action: 'more', title: r.more }, { action: 'skip', title: r.skip }],
      data: { kind: 'aven-native', key: r.key, endsAt: r.endsAt },
    } as NotificationOptions);
    try { localStorage.removeItem(ERR); } catch { /* ignore */ }
    return true;
  } catch (e) { fail('show', e); return false; }
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

/**
 * What Settings shows in the app so one screenshot says which link is broken: the browser running the app, the phone,
 * the permission, whether the site knows it's inside the app, the rest worker, and the last error on the way.
 */
export async function restCheck() {
  const nav = navigator as any;
  const ua = nav.userAgentData;
  let model = '', android = '';
  try { const v = await ua?.getHighEntropyValues?.(['model', 'platformVersion']); model = v?.model ?? ''; android = v?.platformVersion ? String(v.platformVersion).split('.')[0] : ''; } catch { /* ignore */ }
  const brand = (ua?.brands as { brand: string; version: string }[] | undefined)?.find((b) => !/Not.?A.?Brand|Chromium/i.test(b.brand));
  const browser = /SamsungBrowser\/(\d+)/.exec(navigator.userAgent)?.[0].replace('/', ' ') ?? (brand ? `${brand.brand} ${brand.version}` : /Chrome\/(\d+)/.exec(navigator.userAgent)?.[0].replace('/', ' ') ?? '?');
  let worker = 'no';
  try {
    const r = await navigator.serviceWorker?.getRegistration(SCOPE);
    worker = r && !r.scope.endsWith(SCOPE) ? 'no' : r?.active ? 'yes' : r ? 'waiting' : 'no';
  } catch { worker = 'error'; }
  let err = '', seen = false;
  try { err = localStorage.getItem(ERR) ?? ''; seen = !!localStorage.getItem(SEEN); } catch { /* ignore */ }
  return {
    browser, model, android,
    permission: typeof Notification === 'undefined' ? 'none' : Notification.permission,
    inApp: inAndroidApp(), seen, worker, err,
  };
}
