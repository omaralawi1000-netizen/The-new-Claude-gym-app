// Opens the weekly review (demo data, Gemini stubbed) and takes stills: arriving, settled, and Coach memory with what it
// has learned and kept. AVEN_GPU=1 node scripts/shot-review.mjs [theme]
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
const theme = process.argv[2] || 'dark';
process.env.AVEN_PALETTE ??= 'aurora';
const { b, p } = await launch({ theme, size: { width: 384, height: 832 } });
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const json = (o) => ({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(o) });
await p.route('https://generativelanguage.googleapis.com/**', async (r) => {
  const req = r.request(); const url = req.url();
  if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
  if (url.includes('/models?')) return r.fulfill(json({ models: ['gemini-2.5-flash'].map((n) => ({ name: `models/${n}`, supportedGenerationMethods: ['generateContent'] })) }));
  const body = JSON.parse(req.postData() || '{}');
  const sys = body.systemInstruction?.parts?.[0]?.text ?? '';
  const prompt = (body.contents ?? []).map((c) => (c.parts ?? []).map((x) => x.text ?? '').join('')).join('\n');
  let a = { insights: [] };
  if (/weekly review/.test(sys)) {
    const ids = [...prompt.matchAll(/^([\w:-]+) — /gm)].map((m) => m[1]);
    a = { verdict: 'Four sessions and two wrestling practices: a strong week. Your pressing is moving, but back work slipped and protein stayed under target on most days.', priorities: ids.slice(0, 2).map((id, i) => ({ id, text: i ? 'Bring back 10 sets of back work' : 'Get protein to 160 g a day' })) };
  }
  const txt = JSON.stringify(a);
  await new Promise((ok) => setTimeout(ok, 1200));
  return r.fulfill(json({ candidates: [{ content: { parts: [{ text: txt }] } }] }));
});
await p.goto('http://127.0.0.1:5173/'); await wait(p, 900); await skipOnboarding(p); await loadDemo(p);
await p.evaluate(() => localStorage.setItem('aven.keys', JSON.stringify({ gemini: 'AIzaTESTKEY' })));
await p.reload(); await wait(p, 1600);
await p.evaluate(async () => { const { useUI } = await import('/src/state/ui.ts'); useUI.getState().push('weekReview', {}); });
const dir = `shots/review-${theme}`; (await import('node:fs')).mkdirSync(dir, { recursive: true });
for (const ms of [500, 900, 1400]) { await wait(p, ms === 500 ? 500 : ms - (ms === 900 ? 500 : 900)); await p.screenshot({ path: `${dir}/a-${ms}.png` }); }
await wait(p, 2600); await p.screenshot({ path: `${dir}/b-settled.png` });
await p.evaluate(() => { let el = document.querySelector('.rv'); while (el && !(el.scrollHeight > el.clientHeight && getComputedStyle(el).overflowY !== 'visible')) el = el.parentElement; el?.scrollBy(0, 800); }); await wait(p, 700); await p.screenshot({ path: `${dir}/c-scrolled.png` });
await b.close();
