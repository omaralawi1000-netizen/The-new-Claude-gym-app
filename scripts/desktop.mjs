import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark' })).newPage();
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto('http://127.0.0.1:5173/'); await p.waitForTimeout(1000);
await p.getByText('Skip all').click(); await p.waitForTimeout(700);
await p.getByRole('button', { name: /^Add to / }).first().click().catch(() => {});
await p.screenshot({ path: 'shots/desktop.png' });
await b.close();
