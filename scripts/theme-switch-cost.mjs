// What a theme switch costs the page's main thread: every task from the switch until the circle reveal starts, at a 4× slower
// CPU (a phone-like lab), for the first switch to each theme and a repeat. Run on two builds in one go to compare:
//   URLS="http://127.0.0.1:5176/ http://127.0.0.1:5174/" AVEN_GPU=1 node scripts/theme-switch-cost.mjs
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
const urls = (process.env.URLS || 'http://127.0.0.1:5173/').split(/\s+/).filter(Boolean);
const RATE = Number(process.env.RATE || 4), RUNS = Number(process.env.RUNS || 2);
const out = {};
for (let run = 0; run < RUNS; run++) for (const url of urls) {
  const { b, p } = await launch({ theme: 'dark', size: { width: 384, height: 832 }, dsf: 3.75 });
  await p.addInitScript(() => {
    window.__sw = [];
    const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', () => { performance.mark('aven-switch'); window.__sw.push({ t: performance.now() }); });
    const o = Document.prototype.startViewTransition;
    Document.prototype.startViewTransition = function (cb) {
      const last = window.__sw[window.__sw.length - 1], t = o.call(this, () => { if (last) last.cb0 = performance.now(); cb(); if (last) last.cb1 = performance.now(); });
      t.ready.then(() => { performance.mark('aven-ready'); if (last) last.ready = performance.now(); }, () => {});
      return t;
    };
  });
  await p.goto(url); await wait(p, 1500); await skipOnboarding(p); await loadDemo(p); await wait(p, 8000);
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: RATE });
  await wait(p, 8000); // (idle work done at the slower speed too)
  const res = [];
  for (const [name, scheme] of [['first light', 'light'], ['first dark', 'dark'], ['again light', 'light'], ['again dark', 'dark']]) {
    await wait(p, 4500); // (the idle work after the last switch, out of the way)
    await b.startTracing(p, { categories: ['toplevel', 'devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink.user_timing'] });
    await p.emulateMedia({ colorScheme: scheme });
    await wait(p, 2000);
    const buf = await b.stopTracing();
    const sw = await p.evaluate(() => window.__sw[window.__sw.length - 1]);
    const ev = JSON.parse(buf.toString()).traceEvents;
    const main = ev.find((e) => e.ph === 'M' && e.name === 'thread_name' && e.args?.name === 'CrRendererMain' && ev.some((x) => x.pid === e.pid && x.name === 'TracingStartedInBrowser' || x.pid === e.pid && x.name === 'UpdateLayoutTree'));
    const tasks = ev.filter((e) => e.ph === 'X' && e.name === 'ThreadControllerImpl::RunTask' && main && e.pid === main.pid && e.tid === main.tid);
    // trace clock → page clock: the MediaQuery change handler runs inside a task; line them up by the first long task's
    // start is not reliable, so use performance.now() marks via the 'TimeStamp'-free route: the page's timeOrigin
    const t0 = Math.min(...tasks.map((e) => e.ts));
    const sorted = tasks.map((e) => ({ s: (e.ts - t0) / 1000, d: e.dur / 1000 })).sort((a, b) => a.s - b.s);
    // the window that matters: from the switch (the colour scheme's change event) until the circle reveal starts; every
    // task that overlaps it counts whole
    const mk = (n) => ev.find((e) => e.name === n && e.cat?.includes('user_timing'));
    const ms = mk('aven-switch'), mr = mk('aven-ready');
    const span = sw && sw.ready ? sw.ready - sw.t : NaN;
    const a = ms ? (ms.ts - t0) / 1000 : NaN, z = mr ? (mr.ts - t0) / 1000 : a + span;
    const first = { s: a };
    const win = sorted.filter((x) => x.s + x.d >= a && x.s <= z);
    // what the longest tasks were busy with (DETAIL=1)
    let detail;
    if (process.env.DETAIL) {
      const top = tasks.filter((e) => e.dur > 8000 && first && (e.ts - t0) / 1000 >= first.s - 1 && (e.ts - t0) / 1000 <= first.s + span + 2).sort((a, b) => b.dur - a.dur).slice(0, 3);
      detail = top.map((T) => {
        const by = {};
        for (const e of ev) if (e.ph === 'X' && e.pid === T.pid && e.tid === T.tid && e !== T && e.ts >= T.ts && e.ts + e.dur <= T.ts + T.dur && e.dur > 300) {
          const k = e.name + (e.args?.data?.functionName ? ':' + e.args.data.functionName : '') + (e.args?.data?.url ? '@' + String(e.args.data.url).split('/').pop() : '');
          by[k] = (by[k] || 0) + e.dur / 1000;
        }
        for (const e of ev) if (e.cat?.includes('user_timing') && e.name.startsWith('g-') && e.ph === 'b' && e.ts >= T.ts && e.ts <= T.ts + T.dur) {
          const end = ev.find((x) => x.ph === 'e' && x.name === e.name && x.id2?.local === e.id2?.local && x.id === e.id && x.ts >= e.ts);
          if (end) by['~' + e.name] = (by['~' + e.name] || 0) + (end.ts - e.ts) / 1000;
        }
        return { ms: Math.round(T.dur / 1000), in: Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => `${k} ${v.toFixed(1)}`) };
      });
    }
    res.push({ name, detail, toReady: Math.round(span), cb: sw && sw.cb1 ? +(sw.cb1 - sw.cb0).toFixed(1) : null,
      busy: Math.round(win.reduce((a, x) => a + x.d, 0)), longest: +(Math.max(0, ...win.map((x) => x.d))).toFixed(1),
      over8: win.filter((x) => x.d > 8).map((x) => Math.round(x.d)) });
  }
  (out[url] ??= []).push(res);
  console.log(url, 'run', run + 1, JSON.stringify(res));
  await b.close();
}
