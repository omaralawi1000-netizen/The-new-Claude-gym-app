// What a tab switch costs while the glows are around: every main-thread task from the tap until the screen has settled, the
// gaps between frames, and when the switch's own animations end, at a 4× slower CPU (a phone-like lab). Run on two builds in one
// go to compare:  URLS="http://127.0.0.1:5176/ http://127.0.0.1:5174/" AVEN_GPU=1 node scripts/tab-switch-trace.mjs
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
const urls = (process.env.URLS || 'http://127.0.0.1:5173/').split(/\s+/).filter(Boolean);
const RATE = Number(process.env.RATE || 4), RUNS = Number(process.env.RUNS || 2);
const SEQ = (process.env.SEQ || 'Food,Today,Food,Today').split(',');
for (let run = 0; run < RUNS; run++) for (const url of urls) {
  const { b, p } = await launch({ theme: 'dark', size: { width: 384, height: 832 }, dsf: Number(process.env.DSF || 3.75) });
  if (process.env.CSS) await p.addInitScript((css) => addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); }), process.env.CSS);
  await p.goto(url); await wait(p, 1500); await skipOnboarding(p); await loadDemo(p); await wait(p, 8000);
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: RATE });
  await wait(p, 6000);
  const res = [];
  for (const name of SEQ) {
    await wait(p, 2500);
    // frame gaps (rAF), from the tap on
    await p.evaluate(() => { window.__f = []; let last = performance.now(); const tick = (t) => { window.__f.push(t - last); last = t; if (window.__f.length < 400) window.__raf = requestAnimationFrame(tick); }; window.__raf = requestAnimationFrame(tick); });
    await b.startTracing(p, { categories: ['toplevel', 'devtools.timeline', 'blink.user_timing'] });
    const g0 = await p.evaluate(() => JSON.stringify(window.__glowStats ?? null));
    const t = await p.evaluate(() => performance.now());
    if (!process.env.IDLE) await p.locator('.tabbar').getByRole('button', { name, exact: true }).click(); else await wait(p, 1200);
    // when the switch's own (finite) animations are all done
    const settled = await p.evaluate(async (t0) => {
      for (let i = 0; i < 300; i++) {
        const live = document.getAnimations().filter((a) => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime ?? Infinity) && (a.effect?.getComputedTiming().iterations ?? 1) !== Infinity);
        if (!live.length) return performance.now() - t0;
        await new Promise((r) => setTimeout(r, 16));
      }
      return NaN;
    }, t);
    await wait(p, 300);
    const buf = await b.stopTracing();
    const g1 = await p.evaluate(() => JSON.stringify(window.__glowStats ?? null));
    const gaps = await p.evaluate(() => { cancelAnimationFrame(window.__raf); return window.__f.slice(1); });
    const ev = JSON.parse(buf.toString()).traceEvents;
    const main = ev.find((e) => e.ph === 'M' && e.name === 'thread_name' && e.args?.name === 'CrRendererMain' && ev.some((x) => x.pid === e.pid && x.name === 'UpdateLayoutTree'));
    const tasks = ev.filter((e) => e.ph === 'X' && e.name === 'ThreadControllerImpl::RunTask' && main && e.pid === main.pid && e.tid === main.tid).map((e) => e.dur / 1000);
    const med = [...gaps].sort((a, c) => a - c)[gaps.length >> 1] || 0;
    res.push({ name, settledMs: Math.round(settled), busy: Math.round(tasks.reduce((a, x) => a + x, 0)), longest: +Math.max(0, ...tasks).toFixed(1),
      over8: tasks.filter((x) => x > 8).map((x) => Math.round(x)), frame: +med.toFixed(1), late: gaps.filter((g) => g > med * 1.5).length, worstGap: Math.round(Math.max(0, ...gaps)), ...(g0 !== 'null' ? { glow: g0 === g1 ? 'no glow work' : `${g0} → ${g1}` } : {}) });
  }
  console.log(url, 'run', run + 1, JSON.stringify(res));
  await b.close();
}
