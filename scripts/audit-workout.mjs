// Workout sheet audit: drives every action of the live workout on a phone-size screen at 4x CPU with real touches, and per
// action lists what popped in or out, jumped, changed a number without rolling (pop probe), and which on-screen GPU layers
// were dropped (the phone's one-frame flicker, see flicker-layers.mjs). Optional films of chosen actions.
// usage: node scripts/audit-workout.mjs [--light] [--film name,name] [--only text]  (URL defaults to the preview build)
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import { PROBE } from './pop-probe.mjs';
import { filmer } from './film-act.mjs';
import fs from 'node:fs';
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const theme = process.argv.includes('--light') ? 'light' : 'dark';
const filmOnly = (arg('--film') || '').split(',').filter(Boolean);
const only = arg('--only');
const { b, ctx, p, errors } = await launch({ theme, size: { width: 384, height: 832 } });
await ctx.addInitScript(PROBE);
p.setDefaultTimeout(4000);
const cdp = await ctx.newCDPSession(p);
const film = await filmer(ctx, p);
const URL = process.env.URL || 'http://127.0.0.1:4173/';
const tab = (t) => p.locator('.tabbar').getByRole('button', { name: t, exact: true }).tap();
const dlg = () => p.getByRole('dialog', { name: 'Active workout' });

// ── layer drops ──
await p.goto(URL); await wait(p, 1500);
await skipOnboarding(p); await loadDemo(p); await wait(p, 1200);
await cdp.send('DOM.enable'); await cdp.send('LayerTree.enable');
let cur = []; const events = [];
cdp.on('LayerTree.layerTreeDidChange', (e) => { if (e.layers) { events.push({ t: Date.now(), layers: e.layers }); cur = e.layers; } });
async function drops(startLayers, t0) {
  const seen = new Map();
  for (const l of startLayers) if (l.backendNodeId) seen.set(l.layerId, { l, t: 0 });
  const endIds = new Set(cur.map((l) => l.layerId));
  const out = []; let prev = new Set(startLayers.map((l) => l.layerId));
  for (const ev of events) {
    const now = new Set(ev.layers.map((l) => l.layerId));
    for (const l of ev.layers) if (l.backendNodeId && !seen.has(l.layerId)) seen.set(l.layerId, { l, t: ev.t - t0 });
    for (const id of prev) if (!now.has(id) && seen.has(id)) out.push({ ...seen.get(id), gone: ev.t - t0 });
    prev = now;
  }
  const shown = [];
  for (const d of out) {
    if (endIds.has(d.l.layerId)) continue;
    try {
      const r = await cdp.send('DOM.pushNodesByBackendIdsToFrontend', { backendNodeIds: [d.l.backendNodeId] });
      const id = r.nodeIds[0]; if (!id) continue;
      const res = await cdp.send('DOM.resolveNode', { nodeId: id });
      const v = await cdp.send('Runtime.callFunctionOn', { objectId: res.object.objectId, returnByValue: true, functionDeclaration: 'function(){ if (!this.isConnected) return null; const el = this.nodeType === 1 ? this : this.parentElement; for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.visibility === "hidden" || cs.display === "none" || +cs.opacity === 0) return null; } const r = el.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight || !r.width) return null; const nm = (e) => e ? (e.className && typeof e.className === "string" ? e.tagName.toLowerCase() + "." + e.className.trim().split(/\\s+/).slice(0,2).join(".") : e.tagName.toLowerCase()) : ""; return nm(el) + " <" + nm(el.parentElement) + " " + (el.textContent||"").trim().slice(0,24) }' });
      if (v.result.value) shown.push(`${d.gone}ms ${v.result.value}`);
    } catch { /* gone */ }
  }
  return shown;
}

await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
const report = [];
const fails = [];
async function act(label, fn, settle = 1400) {
  if (only && !label.includes(only)) { try { await fn(); } catch (e) { fails.push(`${label}: ${String(e.message).split('\n')[0]}`); } await wait(p, settle); return; }
  await p.evaluate((l) => { window.__act = l; window.__pops.length = 0; }, label);
  await cdp.send('DOM.getDocument', { depth: -1 });
  events.length = 0; const start = cur; const t0 = Date.now();
  const run = async () => { try { await fn(); } catch (e) { fails.push(`${label}: ${String(e.message).split('\n')[0]}`); } };
  const key = label.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  if (filmOnly.some((f) => key.includes(f))) await film(`${theme}-${key}`, run, settle);
  else { await run(); await wait(p, settle); }
  const pops = await p.evaluate(() => window.__pops.slice());
  const d = await drops(start, t0);
  report.push({ label, pops, drops: d });
  const lines = [...pops.map((x) => `  ${x.kind.padEnd(7)} ${x.size ?? x.by ?? ''} ${x.what}${x.kind === 'number' ? ` [${x.was} → ${x.now}]` : ''}`), ...d.map((x) => `  drop    ${x}`)];
  console.log(`## ${label}${lines.length ? '' : '  (clean)'}`); for (const l of lines.slice(0, 14)) console.log(l); if (lines.length > 14) console.log(`  … ${lines.length - 14} more`);
}
const shot = (n) => p.screenshot({ path: `shots/aw-${theme}-${n}.png`, timeout: 20000 }).catch(() => {});
fs.mkdirSync('shots', { recursive: true });

// open from Today's hero
await act('open: start from Today', () => p.getByRole('button', { name: /Start workout/ }).first().tap(), 2600);
await shot('1-open');
await act('list: tick set 1', () => dlg().getByRole('button', { name: 'Complete set' }).first().tap(), 1600);
await shot('2-rest');
await act('list: tap rest bar (panel)', () => p.locator('.wk-bar-main').tap(), 1200);
await act('list: +15', () => p.getByRole('button', { name: '15 seconds more' }).tap(), 1000);
await act('list: skip rest', () => p.getByRole('button', { name: 'Skip', exact: true }).tap(), 1400);
await act('list: tick set 2', () => dlg().getByRole('button', { name: 'Complete set' }).first().tap(), 1600);
await act('list: untick set 2', () => dlg().getByRole('button', { name: 'Mark set not done' }).nth(1).tap(), 1400);
await act('list: fast taps tick x3', async () => { const c = dlg().getByRole('button', { name: 'Complete set' }); await c.first().tap(); await c.first().tap(); await c.first().tap(); }, 1800);
await shot('3-after-fast');
await act('list: add set', () => dlg().locator('.wk-list button').filter({ hasText: /^\s*Set\s*$/ }).first().tap(), 1300);
await act('list: add warm-up', () => dlg().locator('.wk-list button').filter({ hasText: /Warm-up/ }).first().tap(), 1300);
await act('list: set options', () => dlg().getByRole('button', { name: 'Set options' }).first().tap(), 1000);
await act('list: delete set', () => dlg().getByRole('button', { name: 'Delete' }).first().tap(), 1600);
await act('list: undo delete set', () => p.getByRole('button', { name: 'Undo' }).last().tap(), 1600);
await act('list: focus weight field', () => dlg().getByLabel('Weight').nth(3).tap(), 1400);
await act('list: type weight', () => p.keyboard.type('72.5'), 600);
await act('list: blur field', () => p.locator('.wk-title').tap(), 1200);
await act('list: rename cancel', () => p.keyboard.press('Escape'), 800);
await act('list: exercise menu', () => dlg().getByRole('button', { name: 'Exercise options' }).first().tap(), 1300);
await shot('4-menu');
await act('list: move down', () => p.getByRole('button', { name: 'Move down' }).last().tap(), 1600);
await act('list: menu again', () => dlg().getByRole('button', { name: 'Exercise options' }).nth(1).tap(), 1300);
await act('list: move up', () => p.getByRole('button', { name: 'Move up' }).last().tap(), 1600);
await act('list: menu 3', () => dlg().getByRole('button', { name: 'Exercise options' }).nth(1).tap(), 1300);
await act('list: remove exercise', () => p.getByRole('button', { name: 'Remove exercise' }).last().tap(), 1800);
await act('list: undo remove', () => p.getByRole('button', { name: 'Undo' }).last().tap(), 1800);
await act('list: open picker', () => dlg().getByRole('button', { name: /Add exercise/ }).last().tap(), 1800);
await shot('5-picker');
await act('picker: search curl', () => p.locator('.sheet input').first().fill('curl'), 1500);
await act('picker: choose', () => p.locator('.sheet .li, .sheet [role=button]').filter({ hasText: /Curl/ }).first().tap(), 1300);
await act('picker: confirm', async () => { const c = p.getByRole('button', { name: /^Add( \d+)?( exercises?)?$|^Add exercise/ }).last(); if (await c.isVisible().catch(() => false)) await c.tap(); }, 2200);
await act('picker: leftover sheet?', async () => { if (await p.locator('.sheet').count()) await p.keyboard.press('Escape'); }, 900);
await shot('6-added');
await act('list: scroll to end', () => dlg().locator('.wk-list').evaluate((e) => e.scrollTo({ top: 99999, behavior: 'smooth' })), 1400);
await act('list: scroll to top', () => dlg().locator('.wk-list').evaluate((e) => e.scrollTo({ top: 0, behavior: 'smooth' })), 1400);

// focus view
await act('focus: switch to focus', () => p.getByRole('button', { name: 'Focus view' }).tap(), 1800);
await shot('7-focus');
await act('focus: tick set', () => p.locator('.wk-page.cur').getByRole('button', { name: 'Complete set' }).first().tap(), 1600);
await act('focus: swipe next', async () => { const bx = await p.locator('.wk-pager').boundingBox(); await swipe(bx.x + bx.width * 0.85, bx.x + bx.width * 0.1, bx.y + bx.height * 0.4); }, 1600);
await act('focus: swipe back', async () => { const bx = await p.locator('.wk-pager').boundingBox(); await swipe(bx.x + bx.width * 0.1, bx.x + bx.width * 0.85, bx.y + bx.height * 0.4); }, 1600);
await act('focus: tick rest of page', async () => { for (let i = 0; i < 6; i++) { const c = p.locator('.wk-page.cur').getByRole('button', { name: 'Complete set' }); if (!(await c.count())) break; await c.first().tap(); await wait(p, 350); } }, 2600);
await shot('8-focus-advanced');
await act('focus: dot tap', () => p.locator('.wk-dot').nth(0).tap(), 1600);
await act('focus: menu', () => p.locator('.wk-page.cur').getByRole('button', { name: 'Exercise options' }).tap(), 1200);
await act('focus: remove exercise', () => p.getByRole('button', { name: 'Remove exercise' }).last().tap(), 1800);
await act('focus: undo remove', () => p.getByRole('button', { name: 'Undo' }).last().tap(), 1800);
await act('focus: bar jump', () => p.locator('.wk-bar-main').tap(), 1600);
await act('focus: back to list', () => p.getByRole('button', { name: 'List view' }).tap(), 1800);

// minimise / resume from tabs
await act('min: minimise', () => p.getByRole('button', { name: 'Minimise workout' }).tap(), 1600);
await shot('9-min');
await act('min: tab Train', () => tab('Train'), 1400);
await act('min: resume from Train', () => p.getByLabel('Resume workout').first().tap(), 2000);
await act('min: swipe down close', async () => { await swipeV(200, 140, 700); }, 1600);
await act('min: tab Food', () => tab('Food'), 1400);
await act('min: resume from Food', () => p.getByLabel('Resume workout').first().tap(), 2000);
await act('min: open/close fast x3', async () => { for (let i = 0; i < 3; i++) { await p.getByRole('button', { name: 'Minimise workout' }).tap(); await wait(p, 250); await p.getByLabel('Resume workout').first().tap(); await wait(p, 250); } }, 2200);
await shot('10-after-fast-open');
await act('bg: hide/show page', async () => { await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }); await wait(p, 800); await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }); }, 1400);
await act('reload mid-workout', async () => { await p.reload(); await wait(p, 1500); }, 1000);
await act('reload: resume', () => p.getByLabel('Resume workout').first().tap(), 2200);
await shot('11-after-reload');

// finish
await act('finish: open confirm', () => p.getByRole('button', { name: 'Finish', exact: true }).tap(), 1500);
await shot('12-confirm');
await act('finish: keep training', () => p.getByRole('button', { name: 'Keep training' }).tap(), 1400);
await act('finish: open confirm 2', () => p.getByRole('button', { name: 'Finish', exact: true }).tap(), 1500);
await act('finish: save', () => p.getByRole('button', { name: /Finish and save/ }).tap(), 4200);
await shot('13-summary');
await act('summary: done', () => p.getByRole('button', { name: 'Done', exact: true }).tap(), 2000);
await shot('14-after');

async function swipe(x0, x1, y) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] });
  for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + ((x1 - x0) * i) / 10, y }] }); await wait(p, 16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
async function swipeV(x, y0, y1) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
  for (let i = 1; i <= 12; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + ((y1 - y0) * i) / 12 }] }); await wait(p, 16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
fs.writeFileSync(`shots/audit-workout-${theme}.json`, JSON.stringify({ report, fails, errors }, null, 1));
console.log('\nFAILED STEPS', fails); console.log('ERRORS', errors.length);
await b.close();
