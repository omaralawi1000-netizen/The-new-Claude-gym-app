// A folded recipe method must not keep a closed Coach/orb and its invisible tap-blocking backdrop mounted.
import { launch, wait, sayTyped } from './lib.mjs';
import assert from 'node:assert/strict';
for (const [hrr, reduced] of [['0', false], ['1', false], ['1', true]]) {
  const { b, ctx, p, errors } = await launch({ size: { width: 384, height: 832 }, reduced });
  try {
    await ctx.addInitScript((hrr) => {
      localStorage.setItem('aven.v1', JSON.stringify({ v: 1, settings: { onboarded: true, language: 'en', theme: 'dark' } }));
      localStorage.setItem('aven.hrr', hrr);
      localStorage.setItem('aven.keys', JSON.stringify({ gemini: 'AIza_SYNTHETIC_RECIPE_CLOSE' }));
      localStorage.setItem('aven.coach', JSON.stringify([{ id: 'recipe-turn', role: 'action', results: [{ id: 'saved-recipe', kind: 'recipe', title: 'Test oats', lines: [{ text: 'Oats', sub: '40 g' }], steps: ['Mix with water.', 'Cook and serve.'] }], undone: [], confirmed: [] }]));
      window.SpeechRecognition = window.webkitSpeechRecognition = undefined;
    }, hrr);
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    await ctx.route('https://generativelanguage.googleapis.com/**', async (route) => {
      const req = route.request(), url = req.url();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      const answer = { reply: 'Here are the oats.', actions: [{ type: 'propose_recipe', name: 'Test oats', servings: 1, foods: [{ name: 'havregryn', amount: 40, unit: 'g' }], steps: ['Mix with water.', 'Cook and serve.'] }] };
      const body = JSON.parse(req.postData() || '{}');
      const response = url.includes('/models?') ? { models: [] } : body.generationConfig?.responseModalities?.includes('AUDIO') ? { candidates: [] } : { candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] };
      const stream = url.includes('streamGenerateContent');
      return route.fulfill({ status: 200, headers: { ...cors, 'content-type': stream ? 'text/event-stream' : 'application/json' }, body: stream ? `data: ${JSON.stringify(response)}\n\n` : JSON.stringify(response) });
    });
    p.setDefaultTimeout(10000);
    await p.goto('http://127.0.0.1:5173/'); await wait(p, 1200);
    const close = async (label) => {
      await p.getByRole('dialog', { name: label, exact: true }).getByRole('button', { name: 'Close', exact: true }).tap();
      await wait(p, 1400);
      const left = await p.evaluate(() => ({ dialogs: document.querySelectorAll('[role=dialog]').length, scrims: document.querySelectorAll('.scrim').length, tops: [...document.querySelectorAll('[role=dialog]')].map((el) => Math.round(el.getBoundingClientRect().top)) }));
      assert.deepEqual(left, { dialogs: 0, scrims: 0, tops: [] }, `${label} leaves no invisible overlay: ${JSON.stringify(left)}`);
    };
    for (const mode of ['folded', 'folded', 'open', 'folding']) {
      await p.getByRole('button', { name: 'Coach', exact: true }).tap();
      const method = p.getByRole('button', { name: 'Method (2 steps)', exact: true }).first();
      await method.waitFor(); await wait(p, 600);
      assert.equal(await method.getAttribute('aria-expanded'), 'false');
      if (mode === 'open' || mode === 'folding') {
        await method.tap(); await wait(p, 450);
        if (mode === 'folding') await p.getByRole('button', { name: 'Hide method', exact: true }).first().tap();
      }
      await close('Coach');
    }
    await p.getByRole('button', { name: 'Dictate', exact: true }).tap();
    await sayTyped(p, 'Make test oats');
    await p.getByRole('button', { name: 'Method (2 steps)', exact: true }).waitFor();
    await close('Dictation');
    // The newly generated recipe is also saved in Coach: repeat the exact tap that used to be blocked by the old scrim.
    await p.getByRole('button', { name: 'Coach', exact: true }).tap(); await wait(p, 700); await close('Coach');
    assert.deepEqual(errors, []);
    console.log(`RECIPE CLOSE PASS hrr=${hrr} reduced=${reduced}: folded/open/folding methods, Coach reopen and orb recipe close release all backdrops`);
  } finally { await b.close(); }
}
