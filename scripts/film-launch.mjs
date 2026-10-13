// Films opening the app with the steady camera (film-steady.mjs): every frame exactly 1/60 s (or 1/120 s with --fps=120,
// for a half-speed film) of the app's own time, so the motion is shown as designed however slow this machine draws.
// The page is opened fresh, as tapping the icon does, with the data already on the phone. Loading takes no film time here
// (the camera waits for each frame): how long it takes is what scripts/launch.mjs measures.
//   npx vite build && npx vite preview --port 4173 --host 127.0.0.1
//   AVEN_GPU=1 node scripts/film-launch.mjs --name=after-teal [--url=…] [--palette=aurora|ember] [--fps=60|120] [--frames=150]
// → shots/film/<name>/000.jpg … (the first frame is the page's first paint)
import { steady } from './film-steady.mjs';

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const url = arg('url', 'http://127.0.0.1:4173/');
const palette = arg('palette', 'aurora');
const fps = Number(arg('fps', '60'));
const name = arg('name', `launch-${palette}`);
const frames = Number(arg('frames', String(Math.round(fps * 2.5))));

const s = await steady({ theme: 'dark', size: { width: 412, height: 892 }, dsf: Number(process.env.FILM_DSF || 2), fps });
const { p, ctx } = s;
// the palette, written before the app reads its data on every opening
await ctx.addInitScript((pal) => {
  try { const d = JSON.parse(localStorage.getItem('aven.v1') || 'null'); if (d?.settings) { d.settings.palette = pal; d.settings.theme = 'dark'; localStorage.setItem('aven.v1', JSON.stringify(d)); } } catch { /* first opening */ }
}, palette);
await p.goto(url); await p.waitForTimeout(1500);
await p.getByText('Skip all').click(); await p.waitForTimeout(600);
await p.getByLabel('Settings').click(); await p.waitForTimeout(500);
await p.getByText('Data & backup').click(); await p.waitForTimeout(400);
await p.getByText('Load demo data').click(); await p.waitForTimeout(400);
await p.keyboard.press('Escape'); await p.waitForTimeout(800);
// The opening itself loads unfilmed (the camera can't film real loading time), and the film starts at the app's first
// frame on screen: the launch waits for its cue (window.__launchHold), and an app without one has its first screen's
// entrance held still until the cue, so both films start at the same moment as the phone shows it.
await ctx.addInitScript(() => {
  const w = window; w.__launchHold = new Promise((r) => { w.__launchGo = r; });
  // the orb drawn on the page: its worker draws on a clock of its own, which the camera doesn't drive
  try { localStorage.setItem('aven.hrr', '0'); } catch { /* */ }
  // (this runs before the page has an <html> yet, so the hold goes on the moment it appears)
  const hold = () => {
    document.documentElement.classList.add('film-hold');
    const st = document.createElement('style');
    st.textContent = 'html.film-hold .screen > *, html.film-hold .subpage > * { animation-play-state: paused !important; }';
    document.documentElement.appendChild(st);
  };
  if (document.documentElement) hold();
  else new MutationObserver((_, o) => { if (document.documentElement) { o.disconnect(); hold(); } }).observe(document, { childList: true });
});
s.wall(true);
await p.goto(url);
await p.waitForSelector('.tabbar'); await p.waitForTimeout(1500);
await s.film(name, () => p.evaluate(() => { document.documentElement.classList.remove('film-hold'); window.__launchGo(); }), frames);
if (process.env.DEBUG) console.log(await p.evaluate(() => ({ launch: !!document.getElementById("launch"), dl: document.documentElement.dataset.launch, tab: !!document.querySelector(".tabbar"), orbOp: document.querySelector(".sphere-stage")?.style.opacity, t: performance.now() })));
await s.close();
