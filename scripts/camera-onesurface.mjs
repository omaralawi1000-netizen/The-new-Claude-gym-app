// Journey: Food photo → the camera pop-up reads the shot itself and turns into the result (one pop-up), Retake, then Log; and an AI error stays on the photo.
// usage: (vite preview on 4173) node scripts/camera-onesurface.mjs
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
const ok = (c, m) => { if (!c) { console.error('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };
const { b, ctx, p } = await launch({ size: { width: 412, height: 892 } }).then((r) => ({ b: r.browser ?? r.b, ctx: r.ctx ?? r.context, p: r.p ?? r.page }));
await ctx.grantPermissions(['camera']);
let mode = 'ok';
await ctx.route('**/generativelanguage.googleapis.com/**', (r) => {
  if (r.request().url().includes('/models?')) return r.fulfill({ json: { models: [] } });
  if (mode === 'bad') return r.fulfill({ status: 400, json: { error: { message: 'bad' } } });
  const txt = JSON.stringify({ items: [{ name: 'Grilled chicken', grams: 140, kcal: 231, protein: 43, carbs: 0, fat: 5 }, { name: 'Rice', grams: 150, kcal: 195, protein: 4, carbs: 42, fat: 0.5 }], assumptions: 'Plate of about 300 g.' });
  return r.fulfill({ json: { candidates: [{ content: { parts: [{ text: txt }] } }] } });
});
await p.goto('http://127.0.0.1:4173/'); await wait(p, 1500);
await skipOnboarding(p); await loadDemo(p);
await p.evaluate(() => localStorage.setItem('aven.keys', JSON.stringify({ gemini: 'AIzaTESTKEY' })));
await p.reload(); await wait(p, 2500);
const tap = async (loc) => { const bb = await loc.boundingBox(); await p.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); };
await p.getByLabel('Photo').first().waitFor({ state: 'visible', timeout: 20000 }); await wait(p, 1500);
await tap(p.getByLabel('Photo').first());
await p.locator('.cam-shutter:not(.wait)').waitFor({ timeout: 20000 }); await wait(p, 500);
await tap(p.locator('.cam-shutter'));
await p.locator('.scan').waitFor({ timeout: 5000 }); ok(true, 'the light wave shows on the shot, in the camera pop-up');
ok(await p.locator('.sheet').count() === 1, 'one pop-up only while it reads');
const t0 = Date.now();
await p.locator('.cam-row').first().waitFor({ timeout: 20000 });
ok(Date.now() - t0 > 3500, `the wait is calm (${Date.now() - t0} ms after the wave began)`);
ok(await p.locator('.sheet').count() === 1, 'one pop-up only at the result');
await wait(p, 1800);
ok(await p.locator('.cam-row').count() === 2, 'two rows');
ok((await p.locator('.cam-bar-res .btn.primary').innerText()).includes('Log 2 items'), 'the Log button is there');
// Retake: the camera comes back
await tap(p.getByLabel('Retake'));
await p.locator('.cam-shutter:not(.wait)').waitFor({ timeout: 20000 }); await wait(p, 1500);
ok(await p.locator('.cam-row').count() === 0, 'Retake clears the result');
ok(await p.locator('.cam-still').evaluate((e) => e.style.opacity === '0'), 'the held photo has given way to the live camera');
// an error stays on the photo
mode = 'bad';
await tap(p.locator('.cam-shutter'));
await p.locator('.cam-err').waitFor({ timeout: 20000 }); ok(true, 'an AI error shows on the photo, in the same pop-up');
await tap(p.getByRole('button', { name: 'Try again' }));
await p.locator('.cam-shutter:not(.wait)').waitFor({ timeout: 20000 }); await wait(p, 1200);
// the good answer again, then Log
mode = 'ok';
await tap(p.locator('.cam-shutter'));
await p.locator('.cam-row').first().waitFor({ timeout: 25000 }); await wait(p, 2000);
await tap(p.locator('.cam-bar-res .btn.primary'));
await wait(p, 1500);
ok(await p.locator('.cam-wrap').count() === 0, 'Log closes the camera');
ok((await p.locator('body').innerText()).includes('Added 2 items'), 'the items are logged (toast with Undo)');
await b.close();
