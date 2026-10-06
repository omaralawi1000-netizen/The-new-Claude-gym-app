/**
 * Which brain answers. With an OpenAI key (and Sol switched on) GPT-6.1 Sol goes first; if it can't answer — offline, out of
 * credit, busy, a bad answer — Gemini takes over when there is a Gemini key, and the caller is told so. Without an OpenAI
 * key this is just Gemini, exactly as before.
 */
import { AiError, aiEstimateFood, aiEstimatePhoto, type Brain } from './gemini';
import { solEstimateFood, solEstimatePhoto } from './openai';
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

export async function estimateFood(description: string, brain: Brain, lang: string): Promise<FoodEstimate> {
  return (await solThenGemini(brain, (s) => solEstimateFood(description, { ...s, signal: brain.signal }, lang), () => aiEstimateFood(description, brain, lang))).value;
}

export async function estimatePhoto(image: { mime: string; data: string }, brain: Brain, lang: string, hint = '') {
  return (await solThenGemini(brain, (s) => solEstimatePhoto(image, { ...s, signal: brain.signal }, lang, hint), () => aiEstimatePhoto(image, brain, lang, hint))).value;
}
