/**
 * The app counting its own AI trouble, so a problem shows up without anyone testing for it: an answer that couldn't be
 * read, part of an answer dropped, Sol falling back to Gemini, a web search that failed, the AI not answering at all.
 * Kept on this phone only (`aven.trouble`, the last 30 days, no message text, no keys); nothing is ever sent anywhere.
 * Settings → About shows this week's count and copies the details for whoever is fixing the app.
 */
export type TroubleKind = 'invalid' | 'dropped' | 'fellBack' | 'webFailed' | 'failed';
interface Ev { k: TroubleKind; at: number; d?: string }

const KEY = 'aven.trouble';
const DAYS = 30;
const MAX = 200;

function read(): Ev[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}

/** Notes one moment of trouble (`d`: a few words of detail, never what was said). */
export function noteTrouble(k: TroubleKind, d?: string, at = Date.now()) {
  const list = read().filter((e) => at - e.at < DAYS * 86_400_000);
  list.push({ k, at, ...(d ? { d: d.slice(0, 320) } : {}) });
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX))); } catch { /* full: it counts a little less */ }
}

/** Trouble in the last 7 days. */
export function troubleThisWeek(now = Date.now()): number {
  return read().filter((e) => now - e.at < 7 * 86_400_000).length;
}

const LABEL: Record<TroubleKind, string> = {
  invalid: 'answer could not be read', dropped: 'part of an answer dropped', fellBack: 'GPT-6.1 Sol fell back to Gemini',
  webFailed: 'web search failed', failed: 'AI did not answer',
};

/** The details to copy: counts this week by kind, and the last few moments. */
export function troubleReport(now = Date.now()): string {
  const week = read().filter((e) => now - e.at < 7 * 86_400_000);
  const by = new Map<TroubleKind, number>();
  for (const e of week) by.set(e.k, (by.get(e.k) ?? 0) + 1);
  const counts = [...by].map(([k, n]) => `${LABEL[k]}: ${n}`).join('; ') || 'none';
  const last = read().slice(-5).reverse().map((e) => `- ${new Date(e.at).toISOString()} ${LABEL[e.k]}${e.d ? ` (${e.d})` : ''}`).join('\n');
  return `AI trouble this week: ${counts}\nLast:\n${last || '- none'}`;
}
