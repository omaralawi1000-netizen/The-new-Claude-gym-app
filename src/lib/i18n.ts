import { useSyncExternalStore } from 'react';
import { useStore } from '../state/store';
import type { Lang } from './types';
import { solLabel } from './openai';

/**
 * The Danish strings (~90 KB) are a file of their own, so the app doesn't have to load them to open in English. In Danish
 * they are loaded before the first screen is drawn (main.tsx); switched to Danish later, they arrive a moment after and
 * every screen re-renders with them.
 */
let da: Record<string, string> | null = null;
let daLoad: Promise<void> | null = null;
const daListeners = new Set<() => void>();
export function loadDanish(): Promise<void> {
  return (daLoad ??= import('./da').then((m) => { da = m.da; daListeners.forEach((f) => f()); }));
}
const onDanish = (f: () => void) => { daListeners.add(f); return () => { daListeners.delete(f); }; };
const danishReady = () => da !== null;
useStore.subscribe((s, prev) => { if (s.settings.language === 'da' && prev.settings.language !== 'da') void loadDanish(); });

/**
 * English strings are the keys. Missing Danish entries fall back to English (checked by scripts/i18n-check.mjs).
 * A key may end in "@context" where one English word needs two Danish ones ("Back@muscle" = Ryg, "Back" = Tilbage);
 * English shows it without the suffix.
 */
export type TFn = (key: string, vars?: Record<string, string | number>) => string;

export function makeT(lang: Lang): TFn {
  return (key, vars) => {
    let s = (lang === 'da' ? da?.[key] : undefined) ?? key.replace(/@[a-z]+$/, '');
    if (vars) for (const k of Object.keys(vars)) s = s.split(`{${k}}`).join(String(vars[k]));
    // the OpenAI brain is called by the model actually in use (a newer one is picked up by itself, lib/openai.ts)
    if (s.includes('GPT-6.1 Sol')) { const m = solLabel(); if (m) s = s.split('GPT-6.1 Sol').join(m); }
    return s;
  };
}

export function useLang(): Lang {
  return useStore((s) => s.settings.language);
}
export function useT(): TFn {
  const lang = useLang();
  useSyncExternalStore(onDanish, danishReady, danishReady); // re-rendered once the Danish strings have arrived
  return makeT(lang);
}
export const tNow: TFn = (k, v) => makeT(useStore.getState().settings.language)(k, v);
