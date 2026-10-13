"""Talks to Chrome on the CI emulator through its debugging port (adb forward tcp:9222 localabstract:chrome_devtools_remote).

  set  -> in Chrome's tab on Aven's site: saves a marker in the site's storage, then closes the tab
  get  -> in the Aven app (same Chrome underneath): reads the marker back; prints CARRY-OVER OK if it's there
  rest SEC [START_AGO] -> shows a rest notification the way the website does in the Android app (from the rest service
          worker at /The-new-Claude-gym-app-rest/), ending in SEC seconds; Chrome should hand it to the app
  clear -> takes the rest notifications away again, as the website does when you're back in the app
"""
import json
import sys
import time
import urllib.request

import websocket

SITE = 'omaralawi1000-netizen.github.io/The-new-Claude-gym-app'
MARK = 'aven.carryOverCheck'


def pages():
    tabs = json.load(urllib.request.urlopen('http://127.0.0.1:9222/json'))
    print('pages:', [(t.get('type'), t.get('url')) for t in tabs])
    return [t for t in tabs if t.get('type') == 'page' and SITE in t.get('url', '')]


def run(page, expr):
    ws = websocket.create_connection(page['webSocketDebuggerUrl'], suppress_origin=True, timeout=30)
    ws.send(json.dumps({'id': 1, 'method': 'Runtime.evaluate',
                        'params': {'expression': expr, 'returnByValue': True, 'awaitPromise': True}}))
    while True:
        msg = json.loads(ws.recv())
        if msg.get('id') == 1:
            ws.close()
            return msg['result']['result'].get('value')


def wait_page():
    for _ in range(30):
        ps = pages()
        if ps:
            return ps[0]
        time.sleep(2)
    sys.exit('no Aven page found')


REST = """Promise.race([new Promise((ok) => setTimeout(() => ok('timed out at: ' + window.__step), 25000)), (async () => {
  window.__step = 'load';
  for (let i = 0; i < 60 && (document.readyState !== 'complete' || !navigator.serviceWorker); i++) await new Promise((r) => setTimeout(r, 250));
  window.__step = 'register (referrer ' + document.referrer + ', app flag ' + localStorage.getItem('aven.androidApp') + ')';
  const scope = '/The-new-Claude-gym-app-rest/';
  const reg = await navigator.serviceWorker.register(scope + 'sw.js', { scope });
  for (let i = 0; i < 50 && !reg.active; i++) await new Promise((r) => setTimeout(r, 200));
  if (!reg.active) return 'no active rest worker';
  window.__step = 'show (permission ' + Notification.permission + ')';
  const now = Date.now(), endsAt = now + %d * 1000, s = now - %d * 1000;
  const words = { v: 1, s, x: 'Incline Smith Machine Press', l: 'Set 2 of 3 · 60 kg × 8', o: 'Time for set 2',
    b: 'Incline Smith Machine Press · 60 kg × 8', p: '+30 s', k: 'Skip' };
  for (const n of await reg.getNotifications()) n.close();
  await reg.showNotification('Back at ' + new Date(endsAt).toTimeString().slice(0, 5), {
    body: 'Incline Smith Machine Press · set 2 of 3 · 60 kg × 8', tag: 'aven-rest|' + JSON.stringify(words), silent: true,
    timestamp: endsAt, actions: [{ action: 'more', title: '+30 s' }, { action: 'skip', title: 'Skip' }],
    data: { kind: 'aven-native', key: 'ci:' + s, endsAt },
  });
  return 'shown, permission ' + Notification.permission + ', ' + (await reg.getNotifications()).length + ' in Chrome; referrer '
    + document.referrer + ', app flag ' + localStorage.getItem('aven.androidApp');
})().catch((e) => 'error at ' + window.__step + ': ' + e)])"""

CLEAR = """(async () => {
  const reg = await navigator.serviceWorker.getRegistration('/The-new-Claude-gym-app-rest/');
  if (!reg) return 'no rest worker';
  const ns = await reg.getNotifications();
  ns.forEach((n) => n.close());
  return 'closed ' + ns.length;
})()"""

mode = sys.argv[1]
page = wait_page()
if mode == 'rest':
    print('rest:', run(page, REST % (int(sys.argv[2]), int(sys.argv[3]) if len(sys.argv) > 3 else 25)))
    sys.exit(0)
if mode == 'clear':
    print('clear:', run(page, CLEAR))
    sys.exit(0)
if mode == 'set':
    print('set:', run(page, f"localStorage.setItem('{MARK}', 'saved in Chrome ' + new Date().toISOString()); localStorage.getItem('{MARK}')"))
    urllib.request.urlopen('http://127.0.0.1:9222/json/close/' + page['id'])
else:
    got = run(page, "JSON.stringify({mark: localStorage.getItem('%s'), keys: localStorage.length, "
                    "standalone: matchMedia('(display-mode: standalone)').matches, url: location.href})" % MARK)
    print('get:', got)
    print('CARRY-OVER OK' if json.loads(got)['mark'] else 'CARRY-OVER MISSING')
