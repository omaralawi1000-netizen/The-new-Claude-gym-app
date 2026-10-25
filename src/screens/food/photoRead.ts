import { useAi, solOn } from '../../state/ai';
import { useStore } from '../../state/store';
import { useUI, haptic } from '../../state/ui';
import { getKey } from '../../lib/keys';
import { blobToBase64 } from '../../lib/photos';
import { FALLBACK_MODELS } from '../../lib/gemini';
import { estimatePhoto } from '../../lib/brain';
import { overLimit } from '../../lib/spend';
import type { FoodEstimate } from '../../lib/aiValidate';
import { quickEntry } from '../../lib/nutrition';
import { mealName } from '../../lib/derive';
import type { Meal } from '../../lib/types';

export interface ReadItem extends FoodEstimate { on: boolean; k: number }
export const PORTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];
/** The wait is never shorter than this, even when the answer is back at once: the plate is "read" calmly, then the result settles in. */
export const MIN_READ_MS = 4800;

/** A photo → the AI's per-item estimate (GPT-6.1 Sol when it is on, Gemini otherwise or if Sol can't answer). Errors are thrown straight away;
 *  an answer is held back until MIN_READ_MS has passed. */
export async function readPhoto(blob: Blob, lang: 'en' | 'da', hint: string, signal: AbortSignal): Promise<{ items: ReadItem[]; assume: string }> {
  const t0 = performance.now();
  const a = useAi.getState(), m = a.models;
  const brain = { key: a.hasGemini ? getKey('gemini') : '', models: [...new Set([m.fast || FALLBACK_MODELS.fast, m.brain || FALLBACK_MODELS.brain].filter(Boolean))], signal, sol: solOn(a) && !overLimit(a.solLimitKr) ? { key: getKey('openai'), effort: a.effortOrb } : undefined };
  const r = await estimatePhoto({ mime: 'image/jpeg', data: await blobToBase64(blob) }, brain, lang, hint.trim());
  await new Promise<void>((res) => { // (frames and performance.now, not a timer, so it follows the same clock as the animation)
    let raf = 0; const tick = () => (signal.aborted || performance.now() - t0 >= MIN_READ_MS ? res() : (raf = requestAnimationFrame(tick)));
    signal.addEventListener('abort', () => { cancelAnimationFrame(raf); res(); }, { once: true }); tick();
  });
  return { items: r.items.map((x) => ({ ...x, on: true, k: 1 })), assume: r.assumptions };
}

/** Logs the ticked items as clearly labelled AI estimates, closes every pop-up and offers Undo. */
export function logReadItems(items: ReadItem[], assume: string, date: string, meal: Meal, lang: 'en' | 'da', t: (k: string, v?: any) => string) {
  const chosen = items.filter((x) => x.on);
  if (!chosen.length) return;
  const entries = chosen.map((x) => {
    const q = quickEntry(`${x.name} (${t('AI estimate')})`, { kcal: x.kcal * x.k, protein: x.protein * x.k, carbs: x.carbs * x.k, fat: x.fat * x.k }, date, meal.id);
    return { ...q, estimated: true, note: [x.grams ? `~${Math.round(x.grams * x.k)} g` : '', assume].filter(Boolean).join(' · ') || undefined };
  });
  const added = useStore.getState().logEntries(entries);
  haptic('saved');
  useUI.getState().closeAll();
  useUI.getState().toast(t(added.length === 1 ? 'Added 1 item to {meal}' : 'Added {n} items to {meal}', { n: added.length, meal: mealName(meal, lang) }), { tone: 'ok', actionLabel: t('Undo'), onAction: () => added.forEach((e) => useStore.getState().removeEntry(e.id)) });
}
