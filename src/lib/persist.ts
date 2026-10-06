import { useEffect, useState } from 'react';
import { useStore } from '../state/store';
import { userHasData } from './stats';

/**
 * Everything Aven knows lives in this browser's storage on the phone. Unless the site is marked "persistent", the browser
 * may clear it on its own when the phone runs low on space (Chrome clears the least-used sites first). Asking for
 * persistent storage costs nothing: Chrome answers by itself (an installed app is normally granted) and never shows a
 * prompt. Asked once there is something worth keeping.
 */
export async function keepStorage(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch { return null; }
}

/** true: kept; false: the browser may clear it; null: this browser can't say. */
export function useStorageKept(): boolean | null {
  const [kept, setKept] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    navigator.storage?.persisted?.().then((v) => { if (live) setKept(v); }, () => {});
    return () => { live = false; };
  }, []);
  return kept;
}

/** Mounted once in App: asks for persistent storage as soon as there is real data. */
export function useKeepStorage() {
  const has = useStore((s) => userHasData(s));
  useEffect(() => { if (has) keepStorage(); }, [has]);
}

const LAST = 'aven.lastBackup';
export const markBackup = () => { try { localStorage.setItem(LAST, String(Date.now())); } catch { /* ignore */ } };
export const lastBackup = (): number | null => { try { const v = Number(localStorage.getItem(LAST)); return v > 0 ? v : null; } catch { return null; } };
