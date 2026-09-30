import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
p.on('console', (m) => console.log('[c]', m.type(), m.text().slice(0, 300)));
p.on('pageerror', (e) => console.log('[pageerror]', e.message, e.stack?.slice(0,400)));
await p.goto('http://127.0.0.1:5173/');
await p.waitForTimeout(1500);
console.log(await p.evaluate(() => { const e = document.querySelector('.sphere-stage'); const c = e?.querySelector('canvas'); return JSON.stringify({ style: e?.getAttribute('style'), cw: c?.width, ch: c?.height, rect: e?.getBoundingClientRect() }); }));
await b.close();
