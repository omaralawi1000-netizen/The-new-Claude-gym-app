/** Progress photos live in IndexedDB on this device only. They are never uploaded. */
const DB = 'aven-photos';
const STORE = 'photos';

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
    t.oncomplete = () => db.close();
  });
}
export const savePhoto = (id: string, blob: Blob) => tx('readwrite', (s) => s.put(blob, id));
export const loadPhoto = (id: string) => tx<Blob | undefined>('readonly', (s) => s.get(id));
export const deletePhoto = (id: string) => tx('readwrite', (s) => s.delete(id));
export const clearPhotos = () => tx('readwrite', (s) => s.clear());

/** Downscale to ≤1280px JPEG before storing (keeps storage small; strips EXIF/GPS because the canvas re-encodes). */
export async function downscale(file: File, max = 1280): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('encode'))), 'image/jpeg', 0.82));
}
