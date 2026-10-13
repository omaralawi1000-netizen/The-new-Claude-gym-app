// Tap cost: for a tap, how long the click's own work takes (script) and how long until the next frame is shown (as the
// phone's report measures it). Run against a production build (`npx vite build && npx vite preview --port 5174 --host
// 127.0.0.1`), CPU slowed 4× (CPU=…). The Coach is seeded with a full saved chat (60 messages; SEED=n pairs), as on a
// phone in daily use. Then the orb screen: an answer up, and the tap that starts listening again ("Say more"; headless it
// is "Speak instead", the same grow of the orb).
//   URL=http://127.0.0.1:5174/ node scripts/perf-taps.mjs          PROFILE=1 prints the heaviest functions of each tap
import { launch, wait, skipOnboarding, loadDemo, sayTyped } from './lib.mjs';
const { b, ctx, p } = await launch();
const cdp = await ctx.newCDPSession(p);
const rate = Number(process.env.CPU || 4), runs = Number(process.env.RUNS || 3);
const thread = [];
for (let i = 0; i < Number(process.env.SEED ?? 30); i++) {
  thread.push({ id: `u${i}`, role: 'user', text: `How did my bench go this week? Should I add weight on Friday or stay at ${60 + i} kg?`, at: Date.parse('2026-09-28T10:00:00Z') + i * 6e5 });
  thread.push({ id: `m${i}`, role: 'model', text: `**Bench is moving.** You did 3×8 at ${60 + i} kg on Monday with two reps left in the tank.\n\n- Add **2.5 kg** on Friday and aim for 3×6.\n- Keep the rest at 2–3 minutes.\n- If the last set slows down a lot, stay there next week.\n\nProtein is a bit low today (92 of 150 g): a skyr or a chicken wrap tonight closes most of it.`, at: Date.parse('2026-09-28T10:00:00Z') + i * 6e5 + 5000 });
}
await ctx.addInitScript((t) => { if (!localStorage.getItem('aven.coach')) localStorage.setItem('aven.coach', t); }, JSON.stringify(thread));
await p.goto(process.env.URL || 'http://127.0.0.1:5174/'); await wait(p, 1200); await skipOnboarding(p); await loadDemo(p); await wait(p, 2000);
await p.evaluate(() => {
  window.__ev = [];
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'click' || e.name === 'pointerup') window.__ev.push({ name: e.name, dur: e.duration, proc: e.processingEnd - e.processingStart }); }).observe({ type: 'event', durationThreshold: 16, buffered: false });
});
await cdp.send('Emulation.setCPUThrottlingRate', { rate });
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
async function tap(name, act, back) {
  const out = [];
  for (let r = 0; r < runs; r++) {
    await p.evaluate(() => { window.__ev = []; });
    if (process.env.PROFILE && r === runs - 1) await cdp.send('Profiler.start');
    await act(); await wait(p, 1200);
    if (process.env.PROFILE && r === runs - 1) {
      const { profile } = await cdp.send('Profiler.stop');
      const self = new Map(); const dt = profile.timeDeltas; const byId = new Map(profile.nodes.map((n) => [n.id, n]));
      profile.samples.forEach((id, i) => { const n = byId.get(id); const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber}`; self.set(k, (self.get(k) || 0) + (dt[i] || 0) / 1000); });
      console.log(`-- ${name} self time (ms)\n` + [...self.entries()].filter(([k]) => !/^\(idle|program\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => `${v.toFixed(1).padStart(7)}  ${k}`).join('\n'));
    }
    const ev = await p.evaluate(() => window.__ev);
    const c = ev.find((e) => e.name === 'click') || { dur: 0, proc: 0 };
    out.push(`${Math.round(c.proc)}/${Math.round(c.dur)}`);
    await back(); await wait(p, 1200);
  }
  console.log(`${name.padEnd(12)} click script / tap-to-frame ms: ${out.join('  ')}`);
}
await tap('coach-open', () => p.getByRole('button', { name: 'Coach', exact: true }).first().click(), () => p.keyboard.press('Escape'));
// The orb screen with an answer up, then "Say more" (the orb grows back and starts listening): the frames after the tap
const m = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
await cdp.send('Performance.enable');
for (let r = 0; r < runs; r++) {
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await p.getByRole('button', { name: 'Dictate' }).first().click(); await wait(p, 1200);
  await sayTyped(p, 'one banana'); await wait(p, 3000); if (r === 0) console.log('before tap:', (await p.getByRole('dialog').last().innerText()).replace(/\n/g, ' | ').slice(0, 160));
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  await p.evaluate(() => { window.__ev = []; window.__f = []; window.__on = true; let last = performance.now(); const loop = (t) => { window.__f.push(t - last); last = t; if (window.__on) requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
  const a0 = await m();
  await p.getByRole('button', { name: /^(Say more|Speak instead)$/ }).first().click(); await wait(p, 1200);
  const z = await m(); const f = (await p.evaluate(() => { window.__on = false; return window.__f; })).slice(1);
  const c = (await p.evaluate(() => window.__ev)).find((e) => e.name === 'click') || { dur: 0, proc: 0 };
  const d = (k) => Math.round((z[k] - a0[k]) * 1000);
  console.log(`say-more     click script / tap-to-frame ms: ${Math.round(c.proc)}/${Math.round(c.dur)}  frames ${f.length} late ${f.filter((x) => x > 20).length} worst ${Math.round(Math.max(...f))}  style ${d('RecalcStyleDuration')} layout ${d('LayoutDuration')} script ${d('ScriptDuration')}`);
  if (r === 0) console.log('after tap:', (await p.getByRole('dialog').last().innerText()).replace(/\n/g, ' | ').slice(0, 160));
  await p.keyboard.press('Escape'); await wait(p, 400); await p.keyboard.press('Escape'); await wait(p, 1200);
}
console.log(`CPU ${rate}×`);
await b.close();
