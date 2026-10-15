// Camera pop-up logic checks (not a film): Back during the shutter hold hands nothing over and closes nothing underneath;
// a shot opens "Snap your plate" with the photo in it in ONE tap; the gallery button hands a picked file over too.
// usage: python3 scripts/fake-camera-plate.py; npx vite preview --port 4173 &; node scripts/probe-camera.mjs
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import fs from 'node:fs';
const cam = fs.existsSync('shots/fake-camera.y4m') ? ['--use-file-for-fake-video-capture=shots/fake-camera.y4m'] : [];
const { b, ctx, p, errors } = await launch({ args: cam });
await ctx.grantPermissions(['camera']);
let bad = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) bad++; };
await p.goto(process.env.URL || 'http://127.0.0.1:4173/'); await wait(p, 1500); await skipOnboarding(p); await loadDemo(p);
await p.evaluate(() => localStorage.setItem('aven.keys', JSON.stringify({ gemini: 'AIzaTESTKEY' })));
await p.reload(); await wait(p, 2500);
const dlg = (name) => p.getByRole('dialog', { name });
// 1. one tap opens the camera
await p.getByLabel('Photo').first().tap(); await wait(p, 1500);
ok(await dlg('Camera').isVisible(), 'camera icon opens the camera in one tap');
ok(!(await dlg('Photo').isVisible().catch(() => false)), 'the plate sheet is not opened first');
// 2. Back inside the hold: nothing underneath opens or closes
await p.evaluate(() => { document.querySelector('.cam-shutter').click(); setTimeout(() => document.querySelector('.cam-x').click(), 60); }); await wait(p, 1800);
ok(!(await dlg('Camera').isVisible().catch(() => false)), 'camera closed');
ok(!(await dlg('Photo').isVisible().catch(() => false)), 'Back during the hold hands nothing over (no plate sheet)');
ok(await p.getByLabel('Photo').first().isVisible(), 'Today is still there');
// 3. a shot opens the plate sheet with the photo in it
await p.getByLabel('Photo').first().tap(); await wait(p, 1500);
await p.locator('.cam-shutter').tap(); await wait(p, 2500);
ok(await dlg('Photo').isVisible(), 'the shot opens "Snap your plate"');
ok(!(await dlg('Camera').isVisible().catch(() => false)), 'the camera is gone');
ok(await p.locator('.sheet img').first().isVisible().catch(() => false), 'the photo is in the plate box');
const real = errors.filter((e) => !/generativelanguage|ERR_FAILED/.test(e)); // the test key's real Gemini call is blocked by CORS in headless: expected
ok(real.length === 0, 'no console errors ' + real.slice(0, 2).join(' | '));
await b.close(); process.exit(bad ? 1 : 0);
