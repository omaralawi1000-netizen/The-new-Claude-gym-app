import { useUI } from './state/ui';
import { useStore, flushSave } from './state/store';

/**
 * Service worker registration with a manual update flow.
 * A new build NEVER replaces the running app on its own: while a workout is active (or anything is mid-edit)
 * the update stays parked; the user taps "Update" when it is safe. State is flushed to storage first.
 * The one exception is the moment the app opens: an update that is ready within the first seconds is put in straight
 * away (nothing is being edited yet, and a live workout is saved and comes back as it was). Without it, an update that
 * landed while a workout was running never showed its banner, and "close and reopen" kept the old version.
 * "Opens" also means coming back from the recent apps: the installed app is often only resumed, which never asks for a
 * new version, so a resume asks for one and opens the same short window. The window only counts while nothing has been
 * touched since (and no sheet is open): an update that lands after the first tap waits for the banner instead of
 * reloading under the finger.
 */
const OPEN_WINDOW_MS = 10_000;
const CHECK_GAP_MS = 60_000;
export function registerSW() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  let atOpen = false;
  let openedAt = 0, touched = false, checkedAt = 0;
  const touch = () => { touched = true; };
  window.addEventListener('pointerdown', touch, { capture: true, passive: true });
  window.addEventListener('keydown', touch, { capture: true });
  const inOpenWindow = () => !touched && performance.now() - openedAt < OPEN_WINDOW_MS && useUI.getState().overlays.length === 0;
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).then((reg) => {
    const apply = () => { flushSave(); reg.waiting?.postMessage({ type: 'SKIP_WAITING' }); };
    const announce = () => {
      if (inOpenWindow()) { atOpen = true; apply(); return; }
      (window as any).__avenApplyUpdate = apply; useUI.setState({ updateReady: true } as any);
    };
    if (reg.waiting && navigator.serviceWorker.controller) announce();
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) announce(); });
    });
    // back from the recent apps: a fresh open window, and ask for a new version (at most once a minute)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      openedAt = performance.now(); touched = false;
      if (reg.waiting && navigator.serviceWorker.controller) { announce(); return; }
      if (openedAt - checkedAt < CHECK_GAP_MS) return;
      checkedAt = openedAt; reg.update().catch(() => { /* offline */ });
    });
  }).catch(() => { /* offline support is optional */ });
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloading) return; if (useStore.getState().active && !atOpen) return; reloading = true; flushSave(); location.reload(); });
}
