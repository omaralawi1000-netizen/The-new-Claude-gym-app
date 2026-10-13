// The soft-focus word coming-in frozen at 20 moments (0-760 ms), to compare two builds pixel for pixel.
// usage: node scripts/word-ramp.mjs <url> <out.png> [light]   (e.g. the live build on one port, the new one on another)
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
const [url, out, theme = 'dark'] = process.argv.slice(2);
const { b, p } = await launch({ theme, size: { width: 384, height: 832 } });
await p.goto(url); await wait(p, 1500); await skipOnboarding(p); await loadDemo(p); await wait(p, 800);
await p.evaluate(() => { localStorage.setItem('aven.keys', JSON.stringify({ gemini: 'AIzaTESTKEY' })); localStorage.setItem('aven.coach', JSON.stringify([{ id: 'a', role: 'user', text: 'Hi', at: Date.now() - 6e4 }, { id: 'b', role: 'model', text: 'Hello.', at: Date.now() - 6e4 }])); localStorage.setItem('aven.coachNote', '1'); });
await p.reload(); await wait(p, 2000);
await p.getByRole('button', { name: 'Coach', exact: true }).first().tap(); await wait(p, 2500);
await p.evaluate(() => {
  const grid = document.createElement('div'); grid.id = '__g';
  grid.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:var(--bg);display:grid;grid-template-columns:1fr;align-content:start;gap:0 8px;padding:8px';
  const word = (w) => `<span class="w soft soft-in" data-soft="${w}" style="animation-delay: min(0ms, var(--word-stagger-cap, 520ms))"><span class="soft-s">${w}</span></span>`;
  for (let k = 0; k < 20; k++) { const c = document.createElement('div'); c.className = 'reply calm coach-reply'; c.style.cssText = 'height:36px;position:relative;padding-left:34px'; c.innerHTML = `<i style="position:absolute;left:0;top:10px;font:11px monospace;color:var(--tx3)">${k * 40}</i>${word('Chest')} ${word('and')} <b>${word('Biceps')}</b>`; grid.appendChild(c); }
  (document.querySelector('.app') || document.body).appendChild(grid);
});
await wait(p, 100);
await p.evaluate(() => { [...document.querySelectorAll('#__g > div')].forEach((c, k) => c.getAnimations({ subtree: true }).forEach((a) => { a.pause(); a.currentTime = k * 40; })); });
await wait(p, 200);
await p.locator('#__g').screenshot({ path: out, clip: undefined });
await b.close();
