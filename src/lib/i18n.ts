import { useStore } from '../state/store';
import type { Lang } from './types';
import { da } from './da';

/** English strings are the keys. Missing Danish entries fall back to English (checked by scripts/i18n-check.mjs). */
export type TFn = (key: string, vars?: Record<string, string | number>) => string;

export function makeT(lang: Lang): TFn {
  return (key, vars) => {
    let s = (lang === 'da' ? da[key] : undefined) ?? key;
    if (vars) for (const k of Object.keys(vars)) s = s.split(`{${k}}`).join(String(vars[k]));
    return s;
  };
}

export function useLang(): Lang {
  return useStore((s) => s.settings.language);
}
export function useT(): TFn {
  const lang = useLang();
  return makeT(lang);
}
export const tNow: TFn = (k, v) => makeT(useStore.getState().settings.language)(k, v);
