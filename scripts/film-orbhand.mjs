// A film of the orb in your hand (for judging the motion): pull it up out of the dock, hold it on its screen and let go
// (the bounce), talk live (it floats over the horizon), then swipe it down and away.
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
const { b, p, ctx } = await launch({ record: true });
await p.routeWebSocket(/BidiGenerateContent/, (ws) => ws.onMessage((raw) => { const m = JSON.parse(String(raw)); if (m.setup) ws.send(JSON.stringify({ setupComplete: {} })); }));
await p.goto('http://127.0.0.1:5173/'); await wait(p, 900); await skipOnboarding(p); await loadDemo(p);
await p.evaluate(() => { localStorage.setItem('aven.keys', JSON.stringify({ gemini: 'AIzaTESTKEY' })); localStorage.setItem('aven.ai', JSON.stringify({ liveOrb: true })); });
await p.reload(); await wait(p, 2000);
const centre = async (l) => { const r = await l.boundingBox(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
const drag = async (c, dx, dy, n, hold = 0) => { await p.mouse.move(c.x, c.y); await p.mouse.down(); for (let i = 1; i <= n; i++) { await p.mouse.move(c.x + dx * i / n, c.y + dy * i / n); await wait(p, 16); } await wait(p, hold); await p.mouse.up(); };
await drag(await centre(p.getByRole('button', { name: 'Dictate' }).first()), 0, -60, 20, 400); await wait(p, 1500); // a short pull: back with a bounce
await drag(await centre(p.getByRole('button', { name: 'Dictate' }).first()), 0, -160, 25); await wait(p, 4500);     // opens; the horizon
await drag(await centre(p.locator('.voice-orb')), 30, 110, 20, 300); await wait(p, 1500);                            // held, let go: bounce
await drag(await centre(p.locator('.voice-orb')), 0, 300, 18); await wait(p, 1800);                                  // swiped away
await ctx.close(); await b.close();
console.log('filmed');
