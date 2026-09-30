import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, colorScheme: 'dark' })).newPage();
await p.goto('http://127.0.0.1:5173/'); await p.waitForTimeout(800);
await p.getByText('Skip all').click(); await p.waitForTimeout(1500);
await p.screenshot({ path: 'shots/desk-zoom.png', clip: { x: 420, y: 700, width: 440, height: 100 } });
console.log(await p.evaluate(() => { const e = document.querySelector('.sphere-stage'); return e.getAttribute('style'); }));
console.log(await p.evaluate(() => JSON.stringify([...document.querySelectorAll('.sphere-slot, .sphere-slot *')].map(e => [e.tagName, e.className, e.getBoundingClientRect().toJSON()]))));
await b.close();
