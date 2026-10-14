// App-wide frame report (CPU slowed 4× to stand in for a phone; run against a production build: `npx vite build &&
// npx vite preview --port 5173 --host 127.0.0.1`). For each everyday moment it prints the frames the page drew, how many
// missed the 60 fps deadline (> 20 ms), the worst frame, and the main-thread style / layout / script time.
// ONLY=scroll,tick… runs a subset; CPU=6 changes the slow-down; CSS='…' injects a style (A/B experiments).
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
const { b, ctx, p } = await launch();
const cdp = await ctx.newCDPSession(p);
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const rate = Number(process.env.CPU || 4);
const m = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
const rows = [];
async function measure(name, act, ms = 1400) {
  if (only && !only.some((k) => name.startsWith(k))) { await act(); await wait(p, ms); return; }
  await p.evaluate(() => { window.__f = []; window.__on = true; let last = performance.now(); const loop = (t) => { window.__f.push(t - last); last = t; if (window.__on) requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
  const a = await m();
  await act(); await wait(p, ms);
  const z = await m(); const f = (await p.evaluate(() => { window.__on = false; return window.__f; })).slice(1);
  const d = (k) => Math.round((z[k] - a[k]) * 1000);
  const late = f.filter((x) => x > 20).length; const worst = Math.round(Math.max(0, ...f));
  const sum = f.reduce((s, x) => s + x, 0);
  rows.push(`${name.padEnd(16)} frames ${String(f.length).padStart(3)}  late ${String(late).padStart(3)}  worst ${String(worst).padStart(4)}ms  avg ${(sum / Math.max(1, f.length)).toFixed(1).padStart(5)}  style ${String(d('RecalcStyleDuration')).padStart(4)}  layout ${String(d('LayoutDuration')).padStart(4)}  script ${String(d('ScriptDuration')).padStart(4)}`);
}
const scroll = (y, dist = -1400) => cdp.send('Input.synthesizeScrollGesture', { x: 195, y, yDistance: dist, speed: 1600, gestureSourceType: 'touch', repeatCount: 1 });
const tab = (n) => p.locator('.tabbar').getByRole('button', { name: n, exact: true }).click();

await p.goto(process.env.URL || 'http://127.0.0.1:5173/'); await wait(p, 1200); await skipOnboarding(p); await loadDemo(p); await wait(p, 2000);
if (process.env.CSS) await p.addStyleTag({ content: process.env.CSS });
await wait(p, Number(process.env.WAIT || 0));
await cdp.send('Performance.enable'); await cdp.send('Emulation.setCPUThrottlingRate', { rate });

await measure('idle-today', async () => {}, 2000);
await measure('scroll-today', () => scroll(600), 1600);
await measure('tab-train', () => tab('Train'), 1600);
await measure('scroll-train', () => scroll(600), 1600);
await measure('tab-food', () => tab('Food'), 1600);
await measure('scroll-food', () => scroll(600), 1600);
await measure('tab-progress', () => tab('Progress'), 1600);
await measure('scroll-progress', () => scroll(600), 1600);
await measure('tab-today', () => tab('Today'), 1600);
await measure('sheet-open', () => p.locator('.tabbar').getByRole('button', { name: 'Food', exact: true }).click().then(() => wait(p, 1400)).then(() => p.getByRole('button', { name: 'Add to Dinner' }).first().click()), 1600);
await measure('sheet-scroll', () => scroll(500, -900), 1600);
await measure('sheet-close', () => p.keyboard.press('Escape'), 1400);
await tab('Today'); await wait(p, 1400);
await measure('workout-open', () => p.getByRole('button', { name: /Start workout/ }).first().click(), 2200);
await measure('workout-idle', async () => {}, 2000);
await measure('workout-scroll', () => scroll(500), 1600);
await measure('workout-scrollup', () => scroll(400, 1400), 1600);
await measure('tick-set', () => p.getByRole('button', { name: 'Complete set' }).first().click(), 1600);
await measure('rest-running', async () => {}, 2500);
await measure('tick-set-2', () => p.getByRole('button', { name: 'Complete set' }).first().click(), 1600);
// Focus view: arrive, swipe a page with the finger, scroll inside a page, tick, leave
const fbox = async () => (await p.locator('.wk-pager').boundingBox().catch(() => null)) ?? { x: 0, y: 300, width: 390 };
const swipe = async (dx) => { const bx = await fbox(); const x0 = bx.x + bx.width / 2, y = bx.y + 120; await p.mouse.move(x0, y); await p.mouse.down(); for (let i = 1; i <= 10; i++) { await p.mouse.move(x0 + (dx * i) / 10, y); await wait(p, 16); } await p.mouse.up(); };
await measure('focus-enter', () => p.getByRole('button', { name: 'Focus view' }).click(), 1600);
await measure('focus-swipe', () => swipe(-220), 1600);
await measure('focus-swipe-back', () => swipe(220), 1600);
await measure('focus-scroll', () => scroll(500, -500), 1600);
await measure('focus-tick', () => p.locator('.wk-page.cur').getByRole('button', { name: 'Complete set' }).first().click(), 1600);
await measure('focus-leave', () => p.getByRole('button', { name: 'List view' }).click(), 1600);
await measure('workout-close', () => p.getByRole('button', { name: 'Minimise workout' }).click(), 1600);
await measure('idle-pill', async () => {}, 2000);
console.log(`CPU ${rate}×\n` + rows.join('\n'));
await b.close();
