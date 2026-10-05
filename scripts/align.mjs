// Alignment check: every tab and the main sheets, at 360 and 390 px wide, in English and Danish. Flags text that is cut off
// without an ellipsis, and boxes that spill out of their card or off the screen (the routine editor's "10" that showed as "1").
// Intentional cases are skipped: ellipsis truncation, horizontal scrollers (chip rows), hidden or off-screen layers.
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import fs from 'node:fs';
fs.mkdirSync('shots/align', { recursive: true });

const scan = (p) => p.evaluate(() => {
  const vw = innerWidth, vh = innerHeight, out = [];
  const visible = (el) => { const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.top > vh) return false; const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05; };
  const skip = (el) => el.closest('[aria-hidden="true"], .sphere-stage, .wk-off, .chips, .hide-scroll-x, svg, .lens, .toasts, .tab-pane:not([data-active]), .fields, [data-skip-align]')
    // inside a sideways scroller (a chip row): overflow is the point. A vertical scroller (a sheet's body) reads as
    // overflow-x auto too, so only rows that scroll sideways and not up/down count
    || [...ancestors(el)].some((a) => { const cs = getComputedStyle(a); return /(auto|scroll)/.test(cs.overflowX) && !/(auto|scroll)/.test(cs.overflowY); });
  function* ancestors(el) { let a = el.parentElement; while (a && a !== document.body) { yield a; a = a.parentElement; } }
  const name = (el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''} "${(el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 30)}"`;
  // only what you read or tap: decorative layers (a glow that spills past its card on purpose) don't count
  const meaningful = (el) => /^(BUTTON|INPUT|TEXTAREA|SELECT|A)$/.test(el.tagName) || [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('.sr') || !meaningful(el) || !visible(el) || skip(el)) continue;
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    // text cut off with no ellipsis
    if ((cs.overflow === 'hidden' || cs.overflowX === 'hidden') && cs.textOverflow !== 'ellipsis' && el.children.length === 0 && el.textContent.trim() && el.scrollWidth > el.clientWidth + 2) out.push(`clipped: ${name(el)} (${el.scrollWidth}>${el.clientWidth})`);
    // off the screen sideways (fixed decorations aside)
    if (cs.position !== 'fixed' && (r.right > vw + 1 || r.left < -1) && r.width < vw * 1.5) out.push(`off-screen: ${name(el)} [${Math.round(r.left)}..${Math.round(r.right)}]`);
    // out of its card
    const card = el.parentElement?.closest('.plinth, .plinth-2, .glass');
    if (card && card !== el) { const c = card.getBoundingClientRect(); if (r.right > c.right + 1.5 || r.left < c.left - 1.5) out.push(`out of card: ${name(el)} in ${name(card)}`); }
  }
  return [...new Set(out)];
});

const problems = [];
for (const width of [360, 390]) {
  for (const lang of ['en', 'da']) {
    const { b, p, errors } = await launch({ size: { width, height: 800 } });
    await p.goto('http://127.0.0.1:5173/'); await wait(p, 1200); await skipOnboarding(p); await loadDemo(p); await wait(p, 900);
    if (lang === 'da') { await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('aven.v1')); d.settings.language = 'da'; localStorage.setItem('aven.v1', JSON.stringify(d)); }); await p.reload(); await wait(p, 1500); }
    const tab = (i) => p.locator('.tabbar button').nth(i);
    const check = async (where) => {
      await wait(p, 700);
      if (process.env.ALIGN_PROBE && where === 'routine-editor') await p.evaluate(() => { const c = document.querySelector('.sheet .plinth .rt-cell'); if (c) c.insertAdjacentHTML('beforeend', '<div class="num" style="white-space:nowrap">10 10 10 10 10 10 10 10 10 10 10 10 10 10 10 10 10 10 10 10 10 10 10</div>'); });
      const found = await scan(p);
      if (process.env.ALIGN_SHOTS) await p.screenshot({ path: `shots/align/all-${width}-${lang}-${where}.png` });
      if (found.length) { problems.push(...found.map((f) => `${width}px ${lang} ${where}: ${f}`)); await p.screenshot({ path: `shots/align/${width}-${lang}-${where}.png` }); }
    };
    const close = async () => { await p.keyboard.press('Escape'); await wait(p, 650); };
    // tabs (order in the dock: Today, Train, orb, Food, Progress)
    await check('today');
    await tab(1).click(); await check('train-plan');
    await p.locator('.seg button').nth(1).click(); await check('train-library');
    await p.locator('.seg button').nth(2).click(); await check('train-history');
    await p.locator('.li.press').first().click(); await check('session-detail'); await close();
    await p.locator('.seg button').nth(0).click(); await wait(p, 400);
    await p.locator('.plinth button.grow').first().click(); await wait(p, 800);
    await p.locator('.sheet [aria-expanded="false"]').first().click(); await check('routine-editor'); await close();
    await tab(3).click(); await check('food');
    await tab(4).click(); await check('progress');
    await tab(0).click(); await wait(p, 500);
    // settings and its pages
    await p.locator('header .icon-btn').last().click(); await check('settings');
    for (const [i, nm] of [[0, 'targets'], [1, 'training'], [6, 'voice-ai']]) {
      await p.locator('.sheet .li, .sheet button.row-flex').filter({ has: p.locator('svg') }).nth(i).click().catch(() => {});
      await check(`settings-${nm}`); await p.locator('.sheet [aria-label="Back"], .sheet button[aria-label*="ack"]').first().click().catch(async () => { await close(); });
      await wait(p, 500);
    }
    await close(); await close();
    // live workout, resting
    await p.getByRole('button', { name: /Start workout|Start træning/ }).first().click(); await wait(p, 2200);
    await p.locator('button[aria-pressed="false"]').first().click(); await check('workout');
    await b.close();
    if (errors.length) problems.push(`${width}px ${lang}: page errors ${errors.slice(0, 2).join(' | ')}`);
  }
}
if (problems.length) { console.log(problems.join('\n')); console.log(`\n${problems.length} alignment problems (screenshots in shots/align)`); process.exit(1); }
console.log('ALIGN OK');
