// @vitest-environment jsdom
// Coach 2.0, phase 4: the web with its sources, recipes the app can stand behind, a routine from a photo as a preview.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const sent: string[] = [];
let script: unknown[] = [];
let search: (q: string) => Promise<unknown> = async () => ({ text: '', sources: [] });
vi.mock('../src/lib/gemini', async (orig) => ({
  ...(await orig<typeof import('../src/lib/gemini')>()),
  aiAgent: vi.fn(async (system: string) => { sent.push(system); return script.shift(); }),
  geminiSearch: vi.fn(async (q: string) => search(q)),
}));

import { decide } from '../src/lib/agentTurn';
import { useStore, allExercises } from '../src/state/store';
import { useAi } from '../src/state/ai';
import { defaultData } from '../src/state/defaults';
import { makeT } from '../src/lib/i18n';

const t = makeT('en') as any;
const ask = (text: string) => decide(text, { lang: 'en', t, pool: allExercises(useStore.getState().exercises), history: [], where: 'Coach', signal: new AbortController().signal, surface: 'coach' });

beforeEach(() => {
  localStorage.clear(); sent.length = 0; script = [];
  localStorage.setItem('aven.keys', JSON.stringify({ gemini: 'AIzaTEST' }));
  const d = defaultData('en'); d.settings.onboarded = true; useStore.getState().replaceAll(d);
  useAi.setState({ hasGemini: true, hasOpenai: false, solFirst: false });
});

describe('the web, with its sources', () => {
  it('a web look-up is searched, sent back to the model, and its pages come with the answer', async () => {
    search = async (q) => ({ text: `For "${q}": 1 scoop whey, 1 egg, 2 tbsp oat flour; microwave 60–90 s.`, sources: [{ title: 'bbcgoodfood.com', url: 'https://www.bbcgoodfood.com/x' }] });
    script = [{ reply: '', actions: [], lookups: [{ kind: 'web', query: 'protein mug cake recipe' }] }, { reply: 'Here is a quick one.', actions: [] }];
    const d = await ask('find me a protein mug cake recipe');
    expect(d.reply).toBe('Here is a quick one.');
    expect(sent[1]).toMatch(/### web \(searched\)\nFor "protein mug cake recipe": 1 scoop whey/);
    expect(sent[1]).toMatch(/Sources: \[1\] bbcgoodfood\.com/);
    expect(d.sources).toEqual([{ title: 'bbcgoodfood.com', url: 'https://www.bbcgoodfood.com/x' }]);
  });

  it('a failed search is said, never made up', async () => {
    search = async () => { throw new Error('down'); };
    script = [{ reply: '', actions: [], lookups: [{ kind: 'web', query: 'creatine timing study' }] }, { reply: 'I could not check that right now.', actions: [] }];
    const d = await ask('is creatine timing important?');
    expect(sent[1]).toMatch(/The web search failed: answer from what you know and say you could not check it\./);
    expect(d.sources).toEqual([]);
  });

  it('reads the pages out of a grounded Gemini answer (https only, no duplicates, at most 6)', async () => {
    const { geminiSearch } = await vi.importActual<typeof import('../src/lib/gemini')>('../src/lib/gemini');
    const chunks = [{ web: { uri: 'https://a.example/1', title: 'a.example' } }, { web: { uri: 'https://a.example/2', title: 'A.example' } }, { web: { uri: 'http://insecure.example', title: 'insecure.example' } }, ...Array.from({ length: 8 }, (_, i) => ({ web: { uri: `https://s${i}.example`, title: `s${i}.example` } }))];
    const orig = globalThis.fetch;
    let body: any = null;
    globalThis.fetch = (async (_u: string, init: any) => { body = JSON.parse(init.body); return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'An answer.' }] }, groundingMetadata: { groundingChunks: chunks } }] }), { status: 200 }); }) as any;
    try {
      const r = await geminiSearch('q', { key: 'k', models: ['gemini-2.5-flash'] }, 'en');
      expect(body.tools).toEqual([{ google_search: {} }]);
      expect(r.text).toBe('An answer.');
      expect(r.sources.map((s) => s.title)).toEqual(['a.example', 's0.example', 's1.example', 's2.example', 's3.example', 's4.example']);
    } finally { globalThis.fetch = orig; }
  });
});
