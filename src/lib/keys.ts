/**
 * API keys live ONLY in this browser's localStorage under their own key — never in the app data, exports, backups,
 * logs or the repo. They are typed into Settings → Voice & AI. (Same rule as Setline.)
 */
const KEY = 'aven.keys';
export type KeyName = 'groq' | 'gemini';

function read(): Record<string, string> {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}
export const getKey = (name: KeyName): string => (typeof read()[name] === 'string' ? read()[name] : '');
export function setKey(name: KeyName, value: string) {
  const all = read();
  const v = String(value || '').trim();
  if (v) all[name] = v; else delete all[name];
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* storage unavailable */ }
  listeners.forEach((l) => l());
}
export function clearKeys() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } listeners.forEach((l) => l()); }
export const hasKey = (name: KeyName) => !!getKey(name);
export const mask = (v: string) => (v ? `••••${v.slice(-4)}` : '');

const listeners = new Set<() => void>();
export const onKeysChange = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
