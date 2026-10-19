// Time-lapse of Classic's slow sway (the colour field drifting at rest): one frame every 1/4 s of app time for 40 s, so
// played at 60 fps it runs 15x fast. → shots/film/<NAME>/  (URL=, AVEN_BG=, AVEN_PALETTE= as in film-switch.mjs)
import fs from 'node:fs';
import { steady } from './film-steady.mjs';
import { skipOnboarding, loadDemo } from './lib.mjs';
const name = process.env.NAME || 'sway';
const s = await steady({ theme: 'dark', size: { width: 384, height: 832 }, dsf: 2 });
await s.p.goto(process.env.URL || 'http://127.0.0.1:5174/'); await s.p.waitForTimeout(1200); await skipOnboarding(s.p); await loadDemo(s.p); await s.p.waitForTimeout(2500);
const dir = `shots/film/${name}`; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
for (let i = 0; i < 160; i++) { await s.film(`${name}-tmp`, () => {}, 1); fs.renameSync(`shots/film/${name}-tmp/000.jpg`, `${dir}/${String(i).padStart(3, '0')}.jpg`); await s.advance(14); }
fs.rmSync(`shots/film/${name}-tmp`, { recursive: true, force: true });
await s.close();
