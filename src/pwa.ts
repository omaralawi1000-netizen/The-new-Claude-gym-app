import { useUI } from './state/ui';
import { useStore, flushSave } from './state/store';

/**
 * Service worker registration with a manual update flow.
 * A new build NEVER replaces the running app on its own: while a workout is active (or anything is mid-edit)
 * the update stays parked; the user taps "Update" when it is safe. State is flushed to storage first.
 */
export function registerSW() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  navigator.serviceWorker.register('/sw.js').then((reg) => {
    const announce = () => { (window as any).__avenApplyUpdate = () => { flushSave(); reg.waiting?.postMessage({ type: 'SKIP_WAITING' }); }; useUI.setState({ updateReady: true } as any); };
    if (reg.waiting && navigator.serviceWorker.controller) announce();
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) announce(); });
    });
  }).catch(() => { /* offline support is optional */ });
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloading) return; if (useStore.getState().active) return; reloading = true; flushSave(); location.reload(); });
}
