// Films the Coach's cards (phase 2 motion) frame by frame: a card arriving, Apply sealing it, Undo drawing its strike.
// Every animation is frozen the moment it starts and stepped 1000/30 ms at a time, so the film shows the motion as designed,
// with no jank in it. It also checks the seamless settle: the frame 1 ms before the end and the finished card must be the
// same picture (largest channel difference ≤ 3/255). Gemini is stubbed (no key needed).
//   AVEN_GPU=1 node scripts/film-cards.mjs [theme]   → shots/film-cards/<clip>/NNN.png and <clip>.mp4
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const theme = process.argv[2] || 'dark';
const OUT = `shots/film-cards-${theme}`;
const { b, p } = await launch({ theme, size: { width: 384, height: 832 } });
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const json = (o) => ({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(o) });
await p.route('https://generativelanguage.googleapis.com/**', async (r) => {
  const req = r.request(); const url = req.url();
  if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
  if (url.includes('/models?')) return r.fulfill(json({ models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite'].map((n) => ({ name: `models/${n}`, supportedGenerationMethods: ['generateContent'] })) }));
  const body = JSON.parse(req.postData() || '{}');
  const last = [...(body.contents ?? [])].reverse().find((c) => c.role === 'user')?.parts?.map((x) => x.text ?? '').join('') ?? '';
  const a = /week/i.test(last)
    ? { reply: 'Here is your week. Tap Apply when it looks right.', actions: [{ type: 'set_split', days: [{ weekday: 1, routine: 'Push' }, { weekday: 3, routine: 'Pull' }, { weekday: 5, routine: 'Legs' }, { weekday: 2, routine: null, wrestling: true }, { weekday: 4, routine: null, wrestling: true }] }] }
    : { reply: 'Tomorrow, from the lifts you do most.', actions: [{ type: 'plan_day', day: 'tomorrow', focus: ['chest', 'triceps'], light: ['shoulders'] }] };
  const txt = JSON.stringify(a);
  if (url.includes('streamGenerateContent')) return r.fulfill({ status: 200, headers: { ...cors, 'content-type': 'text/event-stream' }, body: `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: txt }] } }] })}\n\n` });
  return r.fulfill(json({ candidates: [{ content: { parts: [{ text: txt }] } }] }));
});
await p.goto('http://127.0.0.1:5173/'); await wait(p, 900); await skipOnboarding(p); await loadDemo(p);
await p.evaluate(() => localStorage.setItem('aven.keys', JSON.stringify({ gemini: 'AIzaTESTKEY' })));
await p.reload(); await wait(p, 1400);
await p.getByLabel('Coach').click(); await wait(p, 1200);

// freeze every animation the moment `sel` appears (before it is painted), so the film starts at its first frame
const arm = (sel) => p.evaluate((sel) => {
  window.__frozen = null;
  const mo = new MutationObserver(() => {
    const el = document.querySelector(sel);
    if (!el) return;
    mo.disconnect();
    window.__el = el;
    // only what starts now: an entrance that already finished (and holds its end) is not part of this move
    const anims = document.getAnimations().filter((a) => { const t = a.effect?.target; return t && (el.contains(t) || t === el) && a.playState !== 'finished' && a.effect.getComputedTiming().iterations !== Infinity; }); // (loops are not part of a move)
    window.__names = anims.map((a) => `${a.animationName ?? 'waapi'}@${a.effect.target.className?.baseVal ?? a.effect.target.className}`.slice(0, 60));
    anims.forEach((a) => a.pause());
    window.__frozen = anims.length;
    window.__anims = anims;
  });
  mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
}, sel);
const film = async (name, sel, totalMs) => {
  console.log("filming", name, new Date().toISOString().slice(11, 19));
  await p.waitForFunction(() => window.__frozen !== null, null, { timeout: 15000 });
  const dir = `${OUT}/${name}`; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const box = await p.evaluate(() => { const r = window.__el.getBoundingClientRect(); return { x: 0, y: Math.max(0, r.top - 70), width: innerWidth, height: Math.min(innerHeight - Math.max(0, r.top - 70), r.height + 140) }; }, sel);
  const step = 1000 / 30;
  let n = 0;
  for (let ms = 0; ms <= totalMs; ms += step) {
    await p.evaluate((ms) => window.__anims.forEach((a) => { a.currentTime = ms; }), ms);
    await p.waitForTimeout(30);
    await p.screenshot({ path: `${dir}/${String(n++).padStart(3, '0')}.png`, clip: box });
  }
  // seamless settle: 1 ms before every animation ends vs all of them finished — the card alone (the answer above it keeps
  // writing itself in, it isn't frozen)
  // (the answer above writes itself in at its own pace and pushes the card down: let it finish first)
  await p.waitForFunction(() => !document.querySelector('.coach-reply:not(.still)') || [...document.querySelectorAll('.coach-answer .reply-foot')].every((f) => !f.classList.contains('held')), null, { timeout: 8000 }).catch(() => {});
  await p.waitForTimeout(600);
  const card = await p.evaluate(() => { const r = window.__el.getBoundingClientRect(); return { x: Math.max(0, r.left - 4), y: Math.max(0, r.top - 4), width: Math.min(innerWidth, r.width + 8), height: r.height + 8 }; }, sel);
  await p.evaluate(() => window.__anims.forEach((a) => { const end = a.effect.getComputedTiming().endTime; a.currentTime = Math.max(0, end - 1); }));
  await p.waitForTimeout(40);
  const before = (await p.screenshot({ clip: card })).toString('base64');
  await p.evaluate(() => window.__anims.forEach((a) => a.finish()));
  await p.waitForTimeout(80);
  const after = (await p.screenshot({ clip: card })).toString('base64');
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

const ask = async (text) => { await p.getByLabel('Message the Coach').fill(text); await p.getByRole('button', { name: 'Send', exact: true }).click(); };
// 1. a planned day arrives, waits (one sheen), is applied (seal), then undone (strike)
await arm('.action-card.fresh'); await ask('chest and triceps with some shoulder tomorrow'); await film('1-arrive', '.action-card.fresh', 2500);
await wait(p, 300);
await arm('.action-card.sealing'); await p.getByRole('button', { name: 'Apply', exact: true }).last().click(); await film('2-apply', '.action-card.sealing', 1300);
await wait(p, 300);
await arm('.action-card.undoing'); await p.getByRole('button', { name: 'Undo' }).last().click(); await film('3-undo', '.action-card.undoing', 900);
await wait(p, 300);
// 2. the week: the strip arrives, then Apply settles the changed days left to right
await arm('.action-card.fresh:has(.ac-week)'); await ask('set my week'); await film('4-week', '.action-card.fresh:has(.ac-week)', 2500);
await wait(p, 300);
await arm('.action-card.sealing'); await p.getByRole('button', { name: 'Apply', exact: true }).last().click(); await film('5-week-apply', '.action-card.sealing', 1300);
await b.close();
