/**
 * Which brain answers. With an OpenAI key (and Sol switched on) GPT-6.1 Sol goes first; if it can't answer — offline, out of
 * credit, busy, a bad answer — Gemini takes over when there is a Gemini key, and the caller is told so. Without an OpenAI
 * key this is just Gemini, exactly as before.
 */
import { AiError, aiEstimateFood, aiEstimatePhoto, geminiJson, type Brain } from './gemini';
import { quickFor, solEstimateFood, solEstimatePhoto, solJson } from './openai';
import { useAi } from '../state/ai';
import type { FoodEstimate } from './aiValidate';

/** Sol first, Gemini second. `fellBack` is the Sol error that made Gemini answer (null when Sol answered). */
export async function solThenGemini<T>(brain: Brain, sol: (s: NonNullable<Brain['sol']>) => Promise<T>, gemini: () => Promise<T>): Promise<{ value: T; fellBack: AiError | null }> {
  if (!brain.sol) return { value: await gemini(), fellBack: null };
  try { return { value: await sol(brain.sol), fellBack: null }; } catch (e) {
    const err = e instanceof AiError ? e : new AiError('failed');
    if (err.code === 'aborted' || !brain.key) throw err;
    return { value: await gemini(), fellBack: err };
  }
}

/** A food's numbers from a description: the quick model, thinking little (it knows foods well; the exam, 19 Oct). */
export async function estimateFood(description: string, brain: Brain, lang: string): Promise<FoodEstimate> {
  return (await solThenGemini(brain, (s) => {
    const quick = quickFor();
    return solEstimateFood(description, { ...s, signal: brain.signal, effort: 'low', model: quick }, lang)
      .catch((e) => { if (quick && e?.code === 'nomodel') { useAi.getState().patch({ noQuick: true }); return solEstimateFood(description, { ...s, signal: brain.signal }, lang); } throw e; });
  }, () => aiEstimateFood(description, brain, lang))).value;
}

export async function estimatePhoto(image: { mime: string; data: string }, brain: Brain, lang: string, hint = '') {
  return (await solThenGemini(brain, (s) => solEstimatePhoto(image, { ...s, signal: brain.signal }, lang, hint), () => aiEstimatePhoto(image, brain, lang, hint))).value;
}

/** A judgement call in JSON from the main brain (Sol first, Gemini after): `schema` is Gemini-style (OBJECT/STRING…). */
export async function thinkJson(brain: Brain, o: { system: string; prompt: string; schema: Record<string, unknown>; name: string }): Promise<any> {
  return (await solThenGemini(brain, (s) => solJson({ ...s, signal: brain.signal }, o), () => geminiJson(brain, { system: o.system, prompt: o.prompt, schema: o.schema }))).value;
}
