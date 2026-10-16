// Films phase 5 part 1's motion frame by frame (animations frozen the moment they start, stepped 1000/30 ms) and checks the
// seamless settle (1 ms before the end vs finished, ≤ 3/255): the briefing folding away on the first tick, a check-in chip
// filling in, and the finish screen with Next time and the check-in.   AVEN_GPU=1 node scripts/film-phase5.mjs [theme]
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const theme = process.argv[2] || 'dark';
process.env.AVEN_PALETTE ??= 'aurora'; // Omar's look
const OUT = `shots/film-phase5-${theme}`;
const { b, p } = await launch({ theme, size: { width: 384, height: 832 } });
await p.goto('http://127.0.0.1:5173/'); await wait(p, 900); await skipOnboarding(p); await loadDemo(p);
await p.evaluate(async () => {
  const { useStore } = await import('/src/state/store.ts');
  const st = useStore.getState();
  const done = st.sessions.filter((s) => s.status === 'done');
  const last = done[done.length - 1];
  const y = new Date(Date.now() - 86400000);
  const date = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
  st.mutateSession(last.id, (x) => ({ ...x, date, checkin: { energy: 1, sleep: 1, at: Date.now() - 86400000 } }));
  localStorage.removeItem('aven.briefHidden');
});
await p.reload(); await wait(p, 1600);

// freeze every animation in `sel` the moment it newly matches (before it is painted): an element that appears, or one whose
// class changes into it
const arm = (sel) => p.evaluate((sel) => {
  window.__frozen = null;
  const before = new Set(document.querySelectorAll(sel));
  const mo = new MutationObserver(() => {
    const el = [...document.querySelectorAll(sel)].find((x) => !before.has(x));
    if (!el) return;
    mo.disconnect();
    window.__el = el;
    const anims = document.getAnimations().filter((a) => { const t = a.effect?.target; return t && (el.contains(t) || t === el) && a.playState !== 'finished' && a.effect.getComputedTiming().iterations !== Infinity && (!a.timeline || a.timeline === document.timeline) && a.transitionProperty !== 'transform'; });
    window.__names = anims.map((a) => `${a.animationName ?? a.transitionProperty ?? 'waapi'}@${a.effect.target.className?.baseVal ?? a.effect.target.className}${a.effect.pseudoElement ?? ''}`.slice(0, 70));
    anims.forEach((a) => a.pause());
    window.__frozen = anims.length;
    window.__anims = anims;
  });
  mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
}, sel);
const film = async (name, totalMs, clipSel) => {
  await p.waitForFunction(() => window.__frozen !== null, null, { timeout: 15000 });
  const dir = `${OUT}/${name}`; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const box = { x: 0, y: 0, width: 384, height: 832 };
  const step = 1000 / 30;
  let n = 0;
  for (let ms = 0; ms <= totalMs; ms += step) {
    await p.evaluate((ms) => window.__anims.forEach((a) => { a.currentTime = ms; }), ms);
    await p.waitForTimeout(30);
    await p.screenshot({ path: `${dir}/${String(n++).padStart(3, '0')}.png`, clip: box });
  }
  const card = await p.evaluate((s) => { const el = (s && document.querySelector(s)) || window.__el; const r = el.getBoundingClientRect(); return { x: Math.max(0, r.left - 4), y: Math.max(0, r.top - 4), width: Math.min(innerWidth, r.width + 8), height: Math.max(8, Math.min(innerHeight - Math.max(0, r.top - 4), r.height + 8)) }; }, clipSel);
  await p.evaluate(() => window.__anims.forEach((a) => { const end = a.effect.getComputedTiming().endTime; a.currentTime = Math.max(0, end - 1); }));
  await p.waitForTimeout(40);
  const before = (await p.screenshot({ clip: card })).toString('base64');
  await p.evaluate(() => window.__anims.forEach((a) => a.finish()));
  await p.waitForTimeout(80);
  const after = (await p.screenshot({ clip: card })).toString('base64');
  if (process.env.SETTLE_PNG) { fs.writeFileSync(`${dir}-before.png`, Buffer.from(before, 'base64')); fs.writeFileSync(`${dir}-after.png`, Buffer.from(after, 'base64')); }
  const diff = await p.evaluate(async ([a, b]) => {
    const load = (s) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = `data:image/png;base64,${s}`; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    const c = document.createElement('canvas'); c.width = ia.width; c.height = ia.height; const g = c.getContext('2d');
    g.drawImage(ia, 0, 0); const da = g.getImageData(0, 0, c.width, c.height).data;
    g.clearRect(0, 0, c.width, c.height); g.drawImage(ib, 0, 0); const db = g.getImageData(0, 0, c.width, c.height).data;
    let max = 0; for (let i = 0; i < da.length; i++) max = Math.max(max, Math.abs(da[i] - db[i]));
    return max;
  }, [before, after]);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', `${dir}/%03d.png`, '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', `${OUT}/${name}.mp4`]);
  console.log(`${name}: ${n} frames, ${await p.evaluate(() => window.__frozen)} animations, settle diff ${diff}/255 ${diff <= 3 ? 'OK' : 'NOT SEAMLESS'}`);
  console.log('  ', (await p.evaluate(() => window.__names)).join(' | '));
};

// 1. the briefing at the top of the planned workout, then folding away as the first set is ticked
await p.getByRole('button', { name: /Start workout/ }).click(); await wait(p, 1800);
await p.screenshot({ path: `${OUT}-0-brief.png` }).catch(() => {});
await arm('.wk-brief-wrap:not(.on)');
await p.getByRole('button', { name: 'Complete set' }).first().click();
await film('1-brief-fold', 900, '.wk-block');
await wait(p, 800);

// 2. finish: the summary with Next time, then a check-in chip filling in
await p.getByRole('button', { name: 'Finish', exact: true }).click(); await wait(p, 700);
await arm('.sheet:has(.sum-medal)');
await p.getByRole('button', { name: /Finish and save/ }).click();
await film('2-summary', 3400, '.sum-next');
await wait(p, 600);
await p.locator('.sum-checkin').scrollIntoViewIfNeeded(); await wait(p, 700);
await arm('.ci-chip.on');
await p.getByRole('group', { name: 'Energy' }).getByRole('button', { name: 'Great' }).click();
await film('3-checkin', 600, '.sum-checkin');
await b.close();
