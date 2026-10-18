// A stopped Motion loop must leave a local Coach/orb report that survives a reload, without saving chat or keys.
import { launch, wait } from './lib.mjs';
import assert from 'node:assert/strict';
for (const hrr of ['0', '1']) {
  const { b, ctx, p, errors } = await launch({ size: { width: 384, height: 832 } });
  p.setDefaultTimeout(10000);
  try {
    await ctx.addInitScript((hrr) => {
      localStorage.setItem('aven.v1', JSON.stringify({ v: 1, settings: { onboarded: true, language: 'en', theme: 'dark', motion: 'full' } }));
      localStorage.setItem('aven.hrr', hrr);
      localStorage.setItem('aven.keys', JSON.stringify({ groq: 'gsk_SYNTHETIC_PRIVATE_TRACE' }));
      localStorage.setItem('aven.coach', JSON.stringify([{ id: 'private', role: 'user', text: 'PRIVATE_CHAT_TRACE_MARKER' }]));
    }, hrr);
    await p.goto('http://127.0.0.1:5173/'); await wait(p, 1500);
    await p.getByRole('button', { name: 'Coach', exact: true }).tap(); await wait(p, 1000);
    await p.getByRole('dialog', { name: 'Coach', exact: true }).getByRole('button', { name: 'Close', exact: true }).tap();
    await p.waitForFunction(() => !document.querySelector('[role=dialog]'));
    await p.getByRole('button', { name: 'Coach', exact: true }).tap(); await wait(p, 100);
    await p.evaluate(async () => {
      const url = performance.getEntriesByType('resource').find((e) => /\/motion_react\.js\?/.test(e.name))?.name;
      if (!url) throw new Error('The running Motion module was not found');
      const { frame } = await import(url);
      frame.update(() => { throw new Error('Synthetic Motion freeze'); });
    });
    await wait(p, 2100);
    const report = await p.evaluate(async () => JSON.parse((await import('/src/lib/stutter.ts')).stutterReport()));
    assert(report.coachOrb?.events.some((e) => e.event === 'error' && e.error?.name === 'Error'), 'the opening report captures the error location');
    assert(report.coachOrb.events.some((e) => e.event === 'sample' && e.motionAge > 800 && e.rafAge < 300), 'the report distinguishes stopped Motion frames from a stopped browser');
    const saved = JSON.stringify(report.coachOrb);
    assert(!saved.includes('PRIVATE_CHAT_TRACE_MARKER') && !saved.includes('gsk_SYNTHETIC_PRIVATE_TRACE'), 'no chat or keys in the report');
    await p.reload(); await wait(p, 1200);
    const restored = await p.evaluate(async () => JSON.parse((await import('/src/lib/stutter.ts')).stutterReport()).coachOrb);
    assert.deepEqual(restored, report.coachOrb, 'the failed opening remains available after reloading');
    await p.getByLabel('Settings', { exact: true }).tap(); await wait(p, 700);
    await p.getByText('About Aven', { exact: true }).tap(); await wait(p, 700);
    await p.evaluate(() => { navigator.clipboard.writeText = async (text) => { window.__copiedTrace = text; }; });
    await p.getByRole('button', { name: 'Copy report', exact: true }).tap();
    const copied = await p.evaluate(() => JSON.parse(window.__copiedTrace));
    assert.deepEqual(copied.coachOrb, restored);
    await p.keyboard.press('Escape'); await wait(p, 1000);
    await p.evaluate(async (hrr) => { (await import('/src/ui/motion.ts')).setHighRefresh(hrr === '0'); }, hrr);
    await p.getByRole('button', { name: 'Coach', exact: true }).tap(); await wait(p, 300);
    const toggled = await p.evaluate(async () => JSON.parse((await import('/src/lib/stutter.ts')).stutterReport()).coachOrb);
    assert.equal(toggled.highRefresh, hrr === '0');
    assert.equal(toggled.events.filter((e) => e.event === 'open').at(-1).highRefresh, hrr === '0', 'each opening records its actual refresh setting');
    assert.deepEqual(errors, ['Synthetic Motion freeze'], 'only the deliberate fault is reported');
    console.log(`COACH/ORB TRACE PASS hrr=${hrr}: stopped frame loop identified, private data excluded, report copied after reload`);
  } finally { await b.close(); }
}
