// Shoots a tab screen's colour field (and optionally the orb screen) at the phone's own pixel size, for banding checks.
// usage: AVEN_GPU=1 AVEN_PALETTE=forest AVEN_BG=classic [TAB=Train] [VOICE=1] [BARE=1] [URL=…] node scripts/banding-fields.mjs out-dir tag
//   CSS='…' adds a style; SIM=1 draws the pictures as the phone drew the CSS (no dither); BARE=1 hides the page's content (cards, dock) so only the field shows; VOICE=1 / COACH=1 / SHEET=1 open the orb screen, the Coach or a sheet first
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import fs from 'node:fs';
const [out = 'shots/banding', tag = 'now'] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
const { b, p } = await launch({ theme: process.env.THEME || 'dark', size: { width: 384, height: 832 }, dsf: 3.75 });
// SIM=1: the pictures drawn without their dither, rounded as the phone rounded the CSS (a before shot, as the phone saw it)
if (process.env.SIM) await p.addInitScript(() => { window.__glowSim = true; });
await p.goto(process.env.URL || 'http://127.0.0.1:5173/'); await wait(p, 1500);
await skipOnboarding(p); await loadDemo(p); await wait(p, 1000);
if (process.env.TAB) { await p.locator('.tabbar').getByRole('button', { name: process.env.TAB, exact: true }).click(); await wait(p, 1500); }
if (process.env.VOICE) { await p.locator('.tabbar .sphere-slot').first().click(); await wait(p, 2500); }
if (process.env.COACH) { await p.getByRole('button', { name: 'Coach', exact: true }).first().click(); await wait(p, 2500); }
if (process.env.SHEET) { await p.locator('.tabbar').getByRole('button', { name: 'Food', exact: true }).click(); await wait(p, 1400); await p.getByRole('button', { name: 'Add to Dinner' }).first().click(); await wait(p, 2000); }
// THEMEFLIP=1: to light and back first (the pictures must come back exactly as they were)
if (process.env.THEMEFLIP) { await p.emulateMedia({ colorScheme: 'light' }); await wait(p, 2500); await p.emulateMedia({ colorScheme: 'dark' }); await wait(p, 2500); }
// the pictures are painted once the page is idle
await p.waitForFunction(() => !document.querySelector('.fields > [data-k]:not([data-dith])'), null, { timeout: Number(process.env.WAIT || 9000) }).catch(() => {});
if (process.env.VOICE) await p.waitForFunction(() => document.querySelector('.voice-glow[data-dith-self]'), null, { timeout: 9000 }).catch(() => {});
// …and the dithered pictures, not the quick ones drawn at once (canvas[data-q])
await p.waitForFunction(() => !document.querySelector('canvas[data-q]'), null, { timeout: 12000 }).catch(() => console.log('(still quick)'));
await wait(p, 1200);
if (process.env.CSS) await p.addStyleTag({ content: process.env.CSS });
if (process.env.NOSPHERE) await p.addStyleTag({ content: '.sphere-stage { visibility: hidden !important; }' });
if (process.env.BARE) await p.addStyleTag({ content: '.stage-content, .voice > :not(.scrim) { visibility: hidden !important; }' });
// settle anything still fading (a field's cross-fade, the orb screen's frost)
await p.evaluate(() => { for (const a of document.getAnimations()) if (a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime)) a.finish(); });
// Classic's slow sway held at one place, so shots of two builds line up
await p.evaluate(() => { for (const a of document.getAnimations()) if (a.animationName === 'sway') { a.pause(); a.currentTime = 0; } });
await wait(p, 500);
console.log('state:', await p.evaluate(() => JSON.stringify({
  fields: [...document.querySelectorAll('.fields > [data-k]')].map((e) => `${e.dataset.k}:${e.dataset.hue}${e.hasAttribute('data-dith') ? ' dith' : ''}${e.hasAttribute('data-still') ? ' still' : ''}${e.hasAttribute('data-top') ? ' top' : ''}`),
  self: document.querySelectorAll('[data-dith-self]').length,
  top: getComputedStyle(document.querySelector(".fields-top")).backgroundImage.slice(0, 40),
})));
// MIDTHEME=1: the frame half-way through a switch to light (animations slowed tenfold, so the circle is mid-way)
if (process.env.MIDTHEME) {
  const cdp = await p.context().newCDPSession(p); await cdp.send('Animation.enable'); await cdp.send('Animation.setPlaybackRate', { playbackRate: 0.1 });
  await p.evaluate(() => { window.__t0 = performance.now(); });
  await p.emulateMedia({ colorScheme: 'light' }); await wait(p, Number(process.env.MIDTHEME) > 1 ? Number(process.env.MIDTHEME) : 3000);
}
const name = `${process.env.AVEN_PALETTE || 'ember'}-${process.env.AVEN_BG || 'classic'}${process.env.THEME === 'light' ? '-light' : ''}${process.env.VOICE ? '-voice' : ''}${process.env.COACH ? '-coach' : ''}${process.env.SHEET ? '-sheet' : ''}${process.env.TAB ? '-' + process.env.TAB.toLowerCase() : ''}${process.env.MIDTHEME ? '-midtheme' : ''}`;
await p.screenshot({ path: `${out}/${name}-${tag}.png`, timeout: 60000 });
// the same moment with the CSS gradients back, for a like-for-like comparison of the means
if (process.env.ALSO_CSS) {
  await p.evaluate(() => document.querySelectorAll('[data-dith], [data-dith-self], [data-still]').forEach((e) => { e.removeAttribute('data-dith'); e.removeAttribute('data-dith-self'); e.removeAttribute('data-still'); })); await wait(p, 800);
  await p.screenshot({ path: `${out}/${name}-css.png`, timeout: 60000 });
}
console.log('shot', name, tag);
await b.close();
