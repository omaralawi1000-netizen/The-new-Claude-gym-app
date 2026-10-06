import { chromium } from 'playwright';
export async function launch({ theme = 'dark', record = false, reduced = false, size = { width: 390, height: 844 } } = {}) {
  // AVEN_GPU=1: draw through an emulated GPU, so backdrop blur (the glass) looks as on a phone; the default software path
  // leaves what is behind a sheet sharp, which reads as see-through text that the phone never shows
  const gpu = process.env.AVEN_GPU ? ['--enable-gpu', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [];
  const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', ...gpu] });
  const ctx = await b.newContext({ viewport: size, deviceScaleFactor: 2, colorScheme: theme, reducedMotion: reduced ? 'reduce' : 'no-preference', isMobile: true, hasTouch: true, permissions: ['microphone'], ...(record ? { recordVideo: { dir: 'videos', size } } : {}) });
  // Journeys must not depend on the weekday (the demo plan trains Mon/Wed/Fri): shift Date to the Wednesday evening these journeys were written on (Pull day); timers stay real.
  const target = new Date(process.env.AVEN_TODAY || '2026-09-30T22:00:00+02:00').getTime();
  await ctx.addInitScript(([t]) => {
    const real = Date, off = t - real.now();
    const Shifted = class extends real { constructor(...a) { if (a.length) super(...a); else super(real.now() + off); } static now() { return real.now() + off; } };
    // eslint-disable-next-line no-global-assign
    Date = Shifted;
  }, [target]);
  const p = await ctx.newPage();
  // Tab screens stay mounted while hidden (display: none), so "the first match" must mean the first visible one
  const L = Object.getPrototypeOf(p.locator('body'));
  if (!L.__visibleFirst) { const first = L.first; L.first = function () { return /type=file/.test(String(this)) ? first.call(this) : first.call(this.filter({ visible: true })); }; L.__visibleFirst = true; }
  const errors = [];
  p.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text()); console.log('[console.error]', m.text().slice(0, 400)); } });
  p.on('pageerror', (e) => { errors.push(e.message); console.log('[pageerror]', e.message, (e.stack || '').split('\n').slice(0, 3).join(' | ')); });
  return { b, ctx, p, errors };
}
export const wait = (p, ms = 500) => p.waitForTimeout(ms);
export async function skipOnboarding(p) { await p.getByText('Skip all').click(); await p.waitForTimeout(600); }
export async function loadDemo(p) {
  await p.getByLabel('Settings').click(); await p.waitForTimeout(500);
  await p.getByText('Data & backup').click(); await p.waitForTimeout(400);
  await p.getByText('Load demo data').click(); await p.waitForTimeout(400);
  await p.keyboard.press('Escape'); await p.waitForTimeout(500);
}

/** On the orb screen: switch to typing (if it is listening) and send a sentence. */
export async function sayTyped(p, text) {
  const box = p.getByLabel('Type what you ate or did');
  if (!(await box.isVisible().catch(() => false))) { await p.getByRole('button', { name: 'Type instead' }).click(); await p.waitForTimeout(300); }
  await box.fill(text);
  await p.getByRole('dialog', { name: 'Dictation' }).getByRole('button', { name: 'Send', exact: true }).click();
}
