// Films phase 3's motion frame by frame (animations frozen the moment they start, stepped 1000/30 ms) and checks the seamless
// settle (1 ms before the end vs finished, ≤ 3/255): the weekly review arriving, and a memory reworded in the Coach.
// Gemini is stubbed.   AVEN_GPU=1 node scripts/film-review.mjs [theme]   → shots/film-review-<theme>/<clip>.mp4
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const theme = process.argv[2] || 'dark';
process.env.AVEN_PALETTE ??= 'aurora'; // Omar's look
const OUT = `shots/film-review-${theme}`;
const { b, p } = await launch({ theme, size: { width: 384, height: 832 } });
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const json = (o) => ({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(o) });
await p.route('https://generativelanguage.googleapis.com/**', async (r) => {
  const req = r.request(); const url = req.url();
  if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
  if (url.includes('/models?')) return r.fulfill(json({ models: ['gemini-2.5-flash'].map((n) => ({ name: `models/${n}`, supportedGenerationMethods: ['generateContent'] })) }));
  const body = JSON.parse(req.postData() || '{}');
  const last = [...(body.contents ?? [])].reverse().find((c) => c.role === 'user')?.parts?.map((x) => x.text ?? '').join('') ?? '';
  const a = /tuesday/i.test(last)
    ? { reply: 'Got it, I have updated that.', actions: [{ type: 'remember', text: 'Trains Tuesday and Thursday now; wrestling Monday and Wednesday.', kind: 'schedule', memory: '1' }] }
    : { insights: [] };
  const txt = JSON.stringify(a);
  if (url.includes('streamGenerateContent')) return r.fulfill({ status: 200, headers: { ...cors, 'content-type': 'text/event-stream' }, body: `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: txt }] } }] })}\n\n` });
  return r.fulfill(json({ candidates: [{ content: { parts: [{ text: txt }] } }] }));
});
await p.goto('http://127.0.0.1:5173/'); await wait(p, 900); await skipOnboarding(p); await loadDemo(p);
await p.evaluate(() => localStorage.setItem('aven.keys', JSON.stringify({ gemini: 'AIzaTESTKEY' })));
await p.reload(); await wait(p, 1600);

// freeze every animation the moment `sel` appears (before it is painted), so the film starts at its first frame
const arm = (sel) => p.evaluate((sel) => {
  window.__frozen = null;
  const before = new Set(document.querySelectorAll(sel)); // (a card that already matched, e.g. applied earlier, is not this move)
  const mo = new MutationObserver(() => {
    const el = [...document.querySelectorAll(sel)].find((x) => !before.has(x));
    if (!el) return;
    mo.disconnect();
    window.__el = el;
    // only what starts now: an entrance that already finished (and holds its end) is not part of this move
    const anims = document.getAnimations().filter((a) => { const t = a.effect?.target; return t && (el.contains(t) || t === el) && a.playState !== 'finished' && a.effect.getComputedTiming().iterations !== Infinity && (!a.timeline || a.timeline === document.timeline); }); // (loops, and scroll-driven effects, are not part of a move)
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
  const box = await p.evaluate(() => ({ x: 0, y: 0, width: innerWidth, height: innerHeight })); // the whole screen: the card moves as the chat follows it
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

const want = (name) => !process.env.CLIPS || process.env.CLIPS.split(',').some((c) => name.startsWith(c));
const shoot = async (name, sel, ms) => { if (want(name)) return film(name, sel, ms); await p.waitForFunction(() => window.__frozen !== null, null, { timeout: 15000 }); await p.evaluate(() => window.__anims.forEach((a) => a.play())); await wait(p, 1500); };

// 1. the weekly review arriving (its verdict already written, as on a reopen in a new visit)
await p.evaluate(async () => {
  const [{ useStore }, { reviewEndFor }, { storedReview }] = await Promise.all([import('/src/state/store.ts'), import('/src/screens/WeekReview.tsx'), import('/src/lib/weekReview.ts')]);
  const st = useStore.getState();
  const { dayKey } = await import('/src/lib/dates.ts');
  const end = reviewEndFor(dayKey(Date.now(), st.settings.dayStartHour), st.settings.weekStart);
  st.saveReview(storedReview(end, 'Three sessions and two wrestling practices: a strong week. Your pressing is moving, but protein stayed under target on most days.', [{ id: 'protein', text: 'Get protein to 160 g a day' }, { id: 'muscle:back', text: 'Bring back 10 sets of back work' }]));
});
await arm('.rv');
await p.evaluate(async () => { const { useUI } = await import('/src/state/ui.ts'); useUI.getState().push('weekReview', {}); });
await shoot('1-review', '.rv', 3600);
await p.keyboard.press('Escape'); await wait(p, 900);

// 2. a memory reworded in the Coach: the old wording is struck through as the new one rises in
await p.evaluate(async () => { const { useStore } = await import('/src/state/store.ts'); const st = useStore.getState(); st.memory.forEach((m) => st.removeMemory(m.id)); st.addMemory({ text: 'Trains Monday, Wednesday and Friday.', kind: 'schedule' }); });
await p.getByLabel('Coach').click(); await wait(p, 1200);
await arm('.action-card.fresh');
await p.getByLabel('Message the Coach').fill('I train tuesday and thursday now, wrestling monday and wednesday');
await p.getByRole('button', { name: 'Send', exact: true }).click();
await shoot('2-memory', '.action-card.fresh', 1800);
await b.close();
