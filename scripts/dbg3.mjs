import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
const { b, p } = await launch({});
await p.goto('http://127.0.0.1:5173/'); await wait(p, 800); await skipOnboarding(p); await loadDemo(p);
await p.locator('.tabbar').getByText('Train', { exact: true }).click(); await wait(p, 600);
await p.getByRole('tab', { name: 'History' }).click(); await wait(p, 500);
await p.locator('.list .li').first().click(); await wait(p, 1000);
await p.screenshot({ path: 'shots/dbg-session.png' });
console.log(await p.evaluate(() => [...document.querySelectorAll('[role=dialog] button')].slice(0, 8).map((b) => b.getAttribute('aria-label') || b.textContent.trim().slice(0, 20) + ' @' + Math.round(b.getBoundingClientRect().top))));
await b.close();
