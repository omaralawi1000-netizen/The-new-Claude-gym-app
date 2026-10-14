// Tries CSS variants on one open sheet and measures how much banding is left (stepped rings that a smooth glow should not
// have). usage: AVEN_GPU=1 node scripts/banding-probe.mjs [settings|coach] out-dir
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import fs from 'node:fs';
const [which = 'coach', out = 'shots/probe'] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
const { b, p } = await launch({ size: { width: 384, height: 832 }, dsf: 3.75 });
await p.goto(process.env.URL || 'http://127.0.0.1:4173/'); await wait(p, 1500);
await skipOnboarding(p); await loadDemo(p); await wait(p, 800);
await p.getByLabel('Settings').first().click(); await wait(p, 900);
await p.locator('.sheet').getByText('Appearance', { exact: true }).first().click(); await wait(p, 1200);
await p.locator('.pal-card').filter({ hasText: /^aurora/i }).first().click(); await wait(p, 600);
await p.locator('.sheet [aria-label=Back]').first().click(); await wait(p, 1200);
if (which === 'coach') { await p.keyboard.press('Escape'); await wait(p, 1400); await p.getByLabel('Coach').first().click(); await wait(p, 1800); }
await p.evaluate(() => { for (const a of document.getAnimations()) { const t = a.effect?.target; if (t && t.closest?.('.aurora, .aurora-lite')) { a.pause(); a.currentTime = 9000; } } });
const variants = JSON.parse(fs.readFileSync(process.env.VARIANTS, 'utf8'));
await p.evaluate(() => { const s = document.createElement('style'); s.id = 'probe'; document.head.append(s); });
for (const [name, v] of Object.entries(variants)) {
  const { css = '', a = 0 } = typeof v === 'string' ? { css: v } : v;
  // the same tile as src/lib/grain.ts installDither, at the strength asked for
  await p.evaluate(async ([c, a]) => {
    if (!a) { document.getElementById('probe').textContent = c; return; }
    const n = 128, cv = document.createElement('canvas'); cv.width = cv.height = n;
    const x = cv.getContext('2d'), d = x.createImageData(n, n);
    for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() + Math.random() - 1; d.data[i] = d.data[i + 1] = d.data[i + 2] = v > 0 ? 255 : 0; d.data[i + 3] = Math.round(Math.abs(v) * a); }
    x.putImageData(d, 0, 0);
    const b = await new Promise((r) => cv.toBlob(r));
    document.documentElement.style.setProperty('--dither', `url(${URL.createObjectURL(b)}) 0 0 / ${n / devicePixelRatio}px ${n / devicePixelRatio}px`);
    document.getElementById('probe').textContent = c;
  }, [css, a]);
  await wait(p, 900);
  await p.screenshot({ path: `${out}/${which}-${name}.png`, timeout: 60000 });
  console.log('shot', name);
}
await b.close();
