import { useUI } from './state/ui';
import { useStore, flushSave } from './state/store';

/**
 * Service worker registration with a manual update flow.
 * A new build NEVER replaces the running app on its own: while a workout is active (or anything is mid-edit)
 * the update stays parked; the user taps "Update" when it is safe. State is flushed to storage first.
 * The one exception is the moment the app opens: an update that is ready within the first seconds is put in straight
 * away (nothing is being edited yet, and a live workout is saved and comes back as it was). Without it, an update that
 * landed while a workout was running never showed its banner, and "close and reopen" kept the old version.
 */
const OPEN_WINDOW_MS = 10_000;
export function registerSW() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  let atOpen = false;
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).then((reg) => {
    const apply = () => { flushSave(); reg.waiting?.postMessage({ type: 'SKIP_WAITING' }); };
    const announce = () => {
      if (performance.now() < OPEN_WINDOW_MS) { atOpen = true; apply(); return; }
      (window as any).__avenApplyUpdate = apply; useUI.setState({ updateReady: true } as any);
    };
    if (reg.waiting && navigator.serviceWorker.controller) announce();
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) announce(); });
    });
  }).catch(() => { /* offline support is optional */ });
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloading) return; if (useStore.getState().active && !atOpen) return; reloading = true; flushSave(); location.reload(); });
}
