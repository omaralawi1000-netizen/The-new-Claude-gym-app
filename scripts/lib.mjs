import { chromium } from 'playwright';
export async function launch({ theme = 'dark', record = false, reduced = false, size = { width: 390, height: 844 } } = {}) {
  const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const ctx = await b.newContext({ viewport: size, deviceScaleFactor: 2, colorScheme: theme, reducedMotion: reduced ? 'reduce' : 'no-preference', isMobile: true, hasTouch: true, permissions: ['microphone'], ...(record ? { recordVideo: { dir: 'videos', size } } : {}) });
  const p = await ctx.newPage();
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
