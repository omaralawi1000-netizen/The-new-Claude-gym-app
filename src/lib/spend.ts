/**
 * What GPT-6.1 Sol has cost this month — an ESTIMATE from the token counts OpenAI sends back with every answer, at its list
 * price, in kroner. Kept on this device only. With a monthly limit set, Sol rests once it is reached and Gemini answers
 * until the month turns (the hard limit belongs on platform.openai.com; this one is a guard rail inside the app).
 */
const KEY = 'aven.solSpend';
/** USD per million tokens: fresh input, cached input, output (reasoning included). GPT-6.1 Sol list price, Oct 2026. */
export const SOL_PRICE = { input: 2, cached: 0.1, output: 10 };
/** GPT-6 Luna, the quick model (list price, Oct 2026). Unknown models are priced as Sol (never under-counted). */
export const LUNA_PRICE = { input: 0.1, cached: 0.01, output: 0.5 };
const priceOf = (model = '') => (/luna/i.test(model) ? LUNA_PRICE : SOL_PRICE);
/** Kroner per US dollar (approximate, Oct 2026). */
export const USD_TO_DKK = 6.5;

interface Month { month: string; usd: number; calls: number }
const monthKey = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
function read(): Month {
  try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v && v.month === monthKey()) return { month: v.month, usd: Number(v.usd) || 0, calls: Number(v.calls) || 0 }; } catch { /* ignore */ }
  return { month: monthKey(), usd: 0, calls: 0 };
}
const subs = new Set<() => void>();
export const subscribeSpend = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

/** The cost of one answer from OpenAI's `usage` block, in USD. */
export function usageCost(u: any, model?: string): number {
  if (!u || typeof u !== 'object') return 0;
  const input = Number(u.input_tokens) || 0, cached = Math.min(input, Number(u.input_tokens_details?.cached_tokens) || 0), output = Number(u.output_tokens) || 0;
  const p = priceOf(model);
  return ((input - cached) * p.input + cached * p.cached + output * p.output) / 1e6;
}
export function recordUsage(u: any, model?: string) {
  const cost = usageCost(u, model);
  if (!cost) return;
  const m = read();
  const next = { month: m.month, usd: m.usd + cost, calls: m.calls + 1 };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  subs.forEach((f) => f());
}
/** A web search's own price (OpenAI charges per search, on top of the tokens). */
export const WEB_SEARCH_USD = 0.01;
export function recordFee(usd: number) {
  if (!(usd > 0)) return;
  const m = read();
  try { localStorage.setItem(KEY, JSON.stringify({ month: m.month, usd: m.usd + usd, calls: m.calls })); } catch { /* ignore */ }
  subs.forEach((f) => f());
}
/** This month so far, in kroner (estimate). A string snapshot for useSyncExternalStore: "kr|calls". */
export const spendSnapshot = () => { const m = read(); return `${(m.usd * USD_TO_DKK).toFixed(2)}|${m.calls}`; };
export const spentKr = () => read().usd * USD_TO_DKK;
/** Over this month's limit (0 = no limit). */
export const overLimit = (limitKr: number) => limitKr > 0 && spentKr() >= limitKr;
