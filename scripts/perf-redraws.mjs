// Idle redraw counter: how many times the screen is redrawn (DrawFrame) and how many main-thread frames / commits happen
// in 3 s of standing still. The headless browser runs at 60 Hz, so 180 = redrawing every frame. Run against a production
// build (`npx vite build && npx vite preview --port 5174 --host 127.0.0.1`):
//   EXPS='{"now":""}' node scripts/perf-redraws.mjs            (TAB=Train picks a tab, URL= another server)
// Each EXPS entry is a CSS experiment injected before counting, e.g. '{"now":"","no-glow":".pin-mark::after{animation:none}"}'.
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
const exps = JSON.parse(process.env.EXPS || '{"now":""}');
const { b, ctx, p } = await launch();
const cdp = await ctx.newCDPSession(p);
await p.goto(process.env.URL || 'http://127.0.0.1:5174/'); await wait(p, 1200); await skipOnboarding(p); await loadDemo(p); await wait(p, 2000);
if (process.env.TAB) { await p.locator('.tabbar').getByRole('button', { name: process.env.TAB, exact: true }).click(); await wait(p, 1500); }
for (const [name, css] of Object.entries(exps)) {
  await p.evaluate((css) => { let s = document.getElementById('__exp'); if (!s) { s = document.createElement('style'); s.id = '__exp'; document.head.append(s); } s.textContent = css; }, css);
  await wait(p, 800);
  const events = []; cdp.removeAllListeners('Tracing.dataCollected'); cdp.on('Tracing.dataCollected', (d) => events.push(...d.value));
  const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
  await cdp.send('Tracing.start', { categories: 'disabled-by-default-devtools.timeline.frame,devtools.timeline,viz,cc', transferMode: 'ReportEvents' });
  await wait(p, 3000);
  await cdp.send('Tracing.end'); await done;
  const count = (n) => events.filter((e) => e.name === n && (e.ph === 'X' || e.ph === 'B' || e.ph === 'I' || e.ph === 'i' || e.ph === 'n' || e.ph === 'b')).length;
  const names = ['DrawFrame', 'Display::DrawAndSwap', 'SkiaOutputSurfaceImpl::SwapBuffers', 'BeginMainThreadFrame', 'Commit', 'PipelineReporter'];
  console.log(name.padEnd(10), names.map((n) => `${n.split('::').pop()} ${count(n)}`).join('  '));
}
await b.close();
