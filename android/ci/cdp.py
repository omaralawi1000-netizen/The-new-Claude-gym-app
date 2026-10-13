"""Talks to Chrome on the CI emulator through its debugging port (adb forward tcp:9222 localabstract:chrome_devtools_remote).

  set  -> in Chrome's tab on Aven's site: saves a marker in the site's storage, then closes the tab
  get  -> in the Aven app (same Chrome underneath): reads the marker back; prints CARRY-OVER OK if it's there
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
    ws = websocket.create_connection(page['webSocketDebuggerUrl'], suppress_origin=True, timeout=20)
    ws.send(json.dumps({'id': 1, 'method': 'Runtime.evaluate', 'params': {'expression': expr, 'returnByValue': True}}))
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


mode = sys.argv[1]
page = wait_page()
if mode == 'set':
    print('set:', run(page, f"localStorage.setItem('{MARK}', 'saved in Chrome ' + new Date().toISOString()); localStorage.getItem('{MARK}')"))
    urllib.request.urlopen('http://127.0.0.1:9222/json/close/' + page['id'])
else:
    got = run(page, "JSON.stringify({mark: localStorage.getItem('%s'), keys: localStorage.length, "
                    "standalone: matchMedia('(display-mode: standalone)').matches, url: location.href})" % MARK)
    print('get:', got)
    print('CARRY-OVER OK' if json.loads(got)['mark'] else 'CARRY-OVER MISSING')
