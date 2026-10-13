// Glass audit: on each screen, lists (1) blurred elements whose blur can't see the page (an ancestor with opacity, a filter,
// a mask, a kept opacity animation or its own blur closes the world it sees), and (2) floating rounded surfaces that are
// see-through but have no blur of their own or under them.
// usage: node scripts/glass-audit.mjs [--light]   (URL defaults to the dev server)
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
const theme = process.argv.includes('--light') ? 'light' : 'dark';
const { b, p } = await launch({ theme, size: { width: 384, height: 832 } });
await p.goto(process.env.URL || 'http://127.0.0.1:5173/'); await wait(p, 1500);
await skipOnboarding(p); await loadDemo(p); await wait(p, 1500);
const audit = (where) => p.evaluate((where) => {
  const nm = (e) => e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 3).join('.') : '') + ` "${(e.textContent || '').trim().slice(0, 22)}"`;
  const vis = (e) => { const r = e.getBoundingClientRect(); if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) return false; for (let x = e; x; x = x.parentElement) { const c = getComputedStyle(x); if (c.display === 'none' || c.visibility === 'hidden' || +c.opacity === 0) return false; } return true; };
  const opAnim = (x) => x.getAnimations().some((a) => a.playState !== 'idle' && (a.effect?.getKeyframes?.() || []).some((k) => 'opacity' in k));
  const closer = (x) => { const c = getComputedStyle(x); if (+c.opacity < 1) return 'opacity'; if (c.filter !== 'none') return 'filter'; if (c.maskImage && c.maskImage !== 'none') return 'mask'; if (c.backdropFilter && c.backdropFilter !== 'none') return 'backdrop'; if (c.mixBlendMode !== 'normal') return 'blend'; if (opAnim(x)) return 'opacity-anim'; return null; };
  const out = [];
  const all = [...document.querySelectorAll('body *')].filter(vis);
  for (const e of all) {
    const c = getComputedStyle(e);
    if (c.backdropFilter && c.backdropFilter !== 'none') {
      for (let x = e.parentElement; x && x !== document.body; x = x.parentElement) { const why = closer(x); if (why) { out.push(`BLIND  ${nm(e)}  ← ${why} on ${nm(x)}`); break; } }
    }
  }
  // see-through rounded floating things with no blur anywhere under them
  for (const e of all) {
    const c = getComputedStyle(e);
    if (parseFloat(c.borderTopLeftRadius) < 10) continue;
    const bg = c.backgroundColor; const m = bg.match(/rgba?\(([^)]+)\)/); if (!m) continue;
    const a = m[1].split(',').map(Number)[3]; if (a === undefined || a === 0 || a >= 0.9) continue;
    const r = e.getBoundingClientRect(); if (r.width < 60) continue;
    let blurred = false; for (let x = e; x; x = x.parentElement) { const cs = getComputedStyle(x); if (cs.backdropFilter !== 'none' || getComputedStyle(x, '::before').backdropFilter !== 'none') { blurred = true; break; } }
    if (!blurred) out.push(`NOBLUR ${nm(e)} bg=${bg}`);
  }
  return [where, ...[...new Set(out)].slice(0, 30)].join('\n  ');
}, where);
const tab = (t) => p.locator('.tabbar').getByRole('button', { name: t, exact: true }).click();
console.log(await audit('today'));
await tab('Food'); await wait(p, 1200); console.log(await audit('food'));
await tab('Train'); await wait(p, 1200); console.log(await audit('train'));
await tab('Progress').catch(() => {}); await wait(p, 1200); console.log(await audit('progress'));
await tab('Today'); await wait(p, 1000);
await p.getByRole('button', { name: /Start workout/ }).first().click(); await wait(p, 2200); console.log(await audit('workout'));
await p.getByRole('dialog', { name: 'Active workout' }).getByRole('button', { name: 'Complete set' }).first().click(); await wait(p, 1500); console.log(await audit('workout rest'));
await p.getByRole('dialog', { name: 'Active workout' }).getByRole('button', { name: /Add exercise/ }).last().click(); await wait(p, 1500); console.log(await audit('picker'));
await p.locator('.sheet .picker-create').last().click(); await wait(p, 1500); console.log(await audit('new exercise'));
await b.close();
