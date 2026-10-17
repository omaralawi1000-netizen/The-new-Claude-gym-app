// Close/reopen isolation: late audio callbacks and old message copies must not affect the next Coach/orb session.
import { launch, wait } from './lib.mjs';
import assert from 'node:assert/strict';
const { b, ctx, p, errors } = await launch({ size: { width: 384, height: 832 }, dsf: 3.75 });
try {
  await ctx.addInitScript(() => {
    localStorage.setItem('aven.v1', JSON.stringify({ v: 1, settings: { onboarded: true, language: 'en', theme: 'dark', motion: 'full' } }));
    localStorage.setItem('aven.keys', JSON.stringify({ groq: 'gsk_SYNTHETIC_REOPEN' }));
  });
  await p.goto('http://127.0.0.1:5173/'); await wait(p, 900);
  const owner = await p.evaluate(async () => {
    const { mic } = await import('/src/lib/mic.ts');
    const media = navigator.mediaDevices, native = media.getUserMedia;
    const audio = window.AudioContext, webkit = window.webkitAudioContext;
    let rejectOld, calls = 0;
    window.AudioContext = window.webkitAudioContext = undefined;
    media.getUserMedia = () => ++calls === 1 ? new Promise((resolve, reject) => { rejectOld = reject; }) : Promise.resolve({ getAudioTracks: () => [{ readyState: 'live', addEventListener() {}, stop() {} }], getTracks: () => [] });
    try {
      const old = mic.acquire('voice');
      while (!rejectOld) await new Promise((resolve) => setTimeout(resolve, 0));
      mic.release('voice'); await mic.acquire('voice');
      rejectOld(new Error('Cancelled earlier permission request')); await old;
      return mic.ownedBy;
    } finally { mic.release(); media.getUserMedia = native; window.AudioContext = audio; window.webkitAudioContext = webkit; }
  });
  assert.equal(owner, 'voice', 'an earlier permission failure must not clear the new microphone owner');
  const audio = await p.evaluate(async () => {
    const { mic } = await import('/src/lib/mic.ts');
    const native = window.MediaRecorder, recordings = [];
    window.MediaRecorder = class {
      static isTypeSupported() { return true; }
      state = 'inactive'; mimeType = 'audio/webm';
      constructor() { recordings.push(this); }
      start() { this.state = 'recording'; }
      stop() { this.state = 'inactive'; }
    };
    try {
      mic.owner = 'voice'; mic.stream = new MediaStream(); mic.startRecording('voice');
      recordings[0].ondataavailable({ data: new Blob(['old-start']) });
      const first = mic.stopRecording(); mic.release('voice');
      mic.owner = 'voice'; mic.stream = new MediaStream(); mic.startRecording('voice');
      recordings[0].ondataavailable({ data: new Blob(['-old-end']) }); recordings[0].onstop();
      const old = await (await first).text();
      recordings[1].ondataavailable({ data: new Blob(['new']) });
      const second = mic.stopRecording(); recordings[1].onstop();
      return { old, next: await (await second).text() };
    } finally { mic.release('voice'); window.MediaRecorder = native; }
  });
  assert.deepEqual(audio, { old: 'old-start-old-end', next: 'new' }, 'late recorder chunks stay in their original session');
  const close = async (label) => { await p.getByRole('dialog', { name: label, exact: true }).getByRole('button', { name: 'Close', exact: true }).click(); };
  for (const name of ['Coach', 'Dictate', 'Coach', 'Dictate']) {
    await p.getByRole('button', { name, exact: true }).first().click();
    const label = name === 'Coach' ? 'Coach' : 'Dictation';
    await p.waitForFunction((label) => { const el = document.querySelector(`[role=dialog][aria-label="${label}"]`); return el && el.getBoundingClientRect().top < 100; }, label);
    await close(label); await p.waitForFunction(() => !document.querySelector('[role=dialog]'));
  }
  await p.evaluate(async () => {
    const { mic } = await import('/src/lib/mic.ts'); const { useVoice } = await import('/src/state/voice.ts');
    window.__testMic = mic;
    window.__micTrace = [];
    const release = mic.release.bind(mic);
    mic.release = (owner) => { window.__micTrace.push({ owner, phase: useVoice.getState().phase, stack: new Error().stack.split('\n').slice(1, 5) }); return release(owner); };
    useVoice.subscribe((s) => window.__micTrace.push({ phase: s.phase, active: mic.active }));
  });
  await p.getByRole('button', { name: 'Dictate', exact: true }).click();
  await p.waitForFunction(() => window.__testMic.active);
  await p.evaluate(async () => {
    const { useUI } = await import('/src/state/ui.ts');
    await new Promise((resolve) => { window.addEventListener('popstate', resolve, { once: true }); useUI.getState().pop(); });
    useUI.getState().push('voice'); // the previous screen is still finishing its exit
  });
  await wait(p, 1400);
  const reopened = await p.evaluate(async () => ({ active: (await import('/src/lib/mic.ts')).mic.active, trace: window.__micTrace }));
  if (!reopened.active) console.log(JSON.stringify(reopened));
  assert(reopened.active, 'the reopened orb keeps its microphone after the previous screen unmounts');
  await close('Dictation'); await p.waitForFunction(() => !document.querySelector('[role=dialog]'));
  await p.getByRole('button', { name: 'Coach', exact: true }).click();
  await p.getByLabel('Message the Coach').fill('200 g skyr'); await p.getByRole('button', { name: 'Send', exact: true }).click();
  await p.locator('.coach-fly').waitFor(); await close('Coach'); await wait(p, 160);
  assert.equal(await p.locator('.coach-fly, .fly-send').count(), 0, 'closing Coach removes its floating message and button copies');
  await p.waitForFunction(() => !document.querySelector('[role=dialog]'));
  await p.evaluate(() => {
    const original = Element.prototype.getAnimations;
    window.__orbFaults = 0;
    Element.prototype.getAnimations = function (...args) {
      if (window.__orbFault && this.matches('.stage-content')) { window.__orbFault = false; window.__orbFaults++; throw new DOMException('Injected interrupted animation read', 'InvalidStateError'); }
      return original.apply(this, args);
    };
  });
  await p.getByRole('button', { name: 'Coach', exact: true }).evaluate((el) => el.addEventListener('click', () => { window.__orbFault = true; }, { once: true }));
  await p.getByRole('button', { name: 'Coach', exact: true }).click();
  await p.waitForFunction(() => document.querySelector('[role=dialog][aria-label="Coach"]')?.getBoundingClientRect().top < 100);
  assert.equal(await p.evaluate(() => window.__orbFaults), 1, 'the interrupted orb read was exercised');
  await close('Coach'); await p.waitForFunction(() => !document.querySelector('[role=dialog]'));
  assert.deepEqual(errors, []); console.log('COACH/ORB REOPEN PASS: repeated opens, recording isolation, fast reopen, interrupted send and frame recovery');
} finally { await b.close(); }
