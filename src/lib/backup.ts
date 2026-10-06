import { useStore, flushSave } from '../state/store';
import { DATA_VERSION, defaultData, normaliseData } from '../state/defaults';
import type { AppData } from './types';

/** Every field of the app's data, taken from the data shape itself, so a field added later is never left out of backups
 * (the hand-written list missed the Coach's memory and your per-exercise weight jumps). */
const FIELDS = Object.keys(defaultData('en')) as (keyof AppData)[];
export function snapshotData(): AppData {
  const st = useStore.getState() as any;
  const out: any = {};
  for (const k of FIELDS) out[k] = st[k];
  out.v = DATA_VERSION;
  return out as AppData;
}

/** Everything Aven keeps, as one backup object (photos are added separately by the file export). Keys never go in. */
export function buildBackup(): { app: 'aven'; v: number; exportedAt: string; data: AppData; photos?: Record<string, string> } {
  flushSave();
  return { app: 'aven', v: DATA_VERSION, exportedAt: new Date().toISOString(), data: snapshotData() };
}

/** A backup file's text → data ready to restore. Throws 'format' or 'newer'. */
export function parseBackup(text: string, lang: string): { data: AppData; photos?: Record<string, string> } {
  const j = JSON.parse(text);
  if (j?.app !== 'aven' || !j.data) throw new Error('format');
  if (typeof j.v !== 'number' || j.v > DATA_VERSION) throw new Error('newer');
  return { data: normaliseData(j.data, lang as any), photos: j.photos };
}
