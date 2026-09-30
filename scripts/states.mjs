// Captures each sphere state. "listening" uses the REAL analyser on Chromium's fake audio device (a periodic beep),
// so the displacement you see is driven by actual samples. Other states are set directly to show their look.
import { launch, wait, skipOnboarding } from './lib.mjs';
const { b, p } = await launch({});
await p.goto('http://127.0.0.1:5173/'); await wait(p, 900); await skipOnboarding(p);
await p.locator('.tabbar').getByText('Food', { exact: true }).click(); await wait(p, 500);
await p.getByRole('button', { name: 'Dictate' }).first().click(); await wait(p, 1200);
const set = (phase) => p.evaluate(async (ph) => { const { useVoice } = await import('/src/state/voice.ts'); useVoice.getState().go(ph); }, phase);
const acquire = () => p.evaluate(async () => { const { mic } = await import('/src/lib/mic.ts'); const r = await mic.acquire('voice'); return [r, mic.active]; });
console.log('mic', await acquire());
await set('listening');
const levels = [];
for (let i = 0; i < 12; i++) { levels.push(await p.evaluate(async () => { const { mic } = await import('/src/lib/mic.ts'); return Math.round(mic.level() * 100) / 100; })); await wait(p, 150); }
console.log('live levels', levels.join(' '));
await p.screenshot({ path: 'shots/sp-listening.png' });
await wait(p, 900); await p.screenshot({ path: 'shots/sp-listening-2.png' });
for (const ph of ['processing', 'review', 'confirmed', 'error']) { await set(ph); await wait(p, ph === 'confirmed' ? 350 : 900); await p.screenshot({ path: `shots/sp-${ph}.png` }); }
await b.close();
