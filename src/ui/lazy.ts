import { createElement, use, type ComponentType } from 'react';

/**
 * A screen whose code is loaded only when it is first needed (it is a file of its own), so opening the app doesn't have to
 * load and run it. `preload()` fetches it ahead, once the app has settled after opening (see preloadScreens): by the time it
 * is tapped it is already in memory and opens exactly as if it had been part of the app all along (no wait, no blank
 * frame). Until then a tap waits for it under the nearest <Suspense>.
 */
export function deferred<P extends object>(load: () => Promise<ComponentType<P>>): ComponentType<P> & { preload: () => Promise<unknown> } {
  let C: ComponentType<P> | null = null;
  let p: Promise<unknown> | null = null;
  const preload = () => (p ??= load().then((c) => { C = c; }));
  const D = (props: P) => {
    if (!C) use(preload());
    return createElement(C!, props);
  };
  return Object.assign(D, { preload });
}

const later: { preload: () => Promise<unknown> }[] = [];
/** Load every deferred screen while nothing else is happening, a few seconds after the app opened. */
export function preloadLater(...screens: { preload: () => Promise<unknown> }[]) { later.push(...screens); }
export function preloadScreens() {
  if (typeof window === 'undefined') return;
  const idle = (f: () => void) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(f, { timeout: 3000 }) : setTimeout(f, 200));
  // one at a time, each in its own idle moment, so a tap in between is never held up by more than one file's start-up
  const next = () => { const s = later.shift(); if (s) idle(() => { s.preload().catch(() => {}).finally(next); }); };
  setTimeout(next, 2500);
}
