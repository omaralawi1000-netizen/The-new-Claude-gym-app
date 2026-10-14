/**
 * Aven Beta: the test copy of the app (CLAUDE.md → "Aven Beta"). It is served from the same website as the real app, so the
 * browser would hand both the same storage. This gives the beta its own: every storage key and every IndexedDB name the beta
 * touches gets "beta:" in front, so the real app's workouts, food and keys can never be read or changed by it.
 *
 * `betaBoot` has to run before ANY app code (the store reads its data the moment its module loads, and the bundler may load
 * that module before this file). So the beta build pastes the function into index.html as the first script (vite.config.ts);
 * the import in main.tsx is only a fallback and does nothing when it already ran. The function is therefore self-contained:
 * it may not use anything from outside itself.
 */
declare const __AVEN_BETA__: boolean | undefined;
export const IS_BETA = typeof __AVEN_BETA__ !== 'undefined' && !!__AVEN_BETA__;

export const PREFIX = 'beta:';
/** The note Settings leaves ("copy my real data in at the next start"). */
export const PENDING = 'copy.pending';

/** Beta Settings → "Copy my real Aven data in": only leaves a note and reloads; the copy itself is made at the next start,
 *  before the app reads anything (so the beta's own last save can't land on top of it). */
export function requestCopyFromReal() {
  try { localStorage.setItem(PENDING, '1'); } catch { return false; }
  return true;
}

export function betaBoot(win: any, PREFIX: string, PENDING: string): void {
  if (win.__avenBeta) return;
  win.__avenBeta = true;
  const native: Storage = win.localStorage;

  /** `native` seen through the prefix: the app calls it localStorage and never knows. */
  const mine = (): string[] => {
    const out: string[] = [];
    for (let i = 0; i < native.length; i++) { const k = native.key(i); if (k && k.startsWith(PREFIX)) out.push(k.slice(PREFIX.length)); }
    return out;
  };
  const methods: Record<string, unknown> = {
    getItem: (k: string) => native.getItem(PREFIX + k),
    setItem: (k: string, v: string) => native.setItem(PREFIX + k, String(v)),
    removeItem: (k: string) => native.removeItem(PREFIX + k),
    clear: () => mine().forEach((k) => native.removeItem(PREFIX + k)),
    key: (i: number) => mine()[i] ?? null,
  };
  const proxy = new Proxy({} as Storage, {
    get(_, p) {
      if (typeof p === 'symbol') return undefined;
      if (p === 'length') return mine().length;
      if (p in methods) return methods[p];
      return native.getItem(PREFIX + p) ?? undefined;
    },
    set(_, p, v) { if (typeof p === 'string') native.setItem(PREFIX + p, String(v)); return true; },
    deleteProperty(_, p) { if (typeof p === 'string') native.removeItem(PREFIX + p); return true; },
    has(_, p) { return typeof p === 'string' && (p in methods || p === 'length' || native.getItem(PREFIX + p) !== null); },
    ownKeys() { return mine(); },
    getOwnPropertyDescriptor(_, p) {
      if (typeof p !== 'string') return undefined;
      const v = native.getItem(PREFIX + p);
      return v === null ? undefined : { value: v, writable: true, enumerable: true, configurable: true };
    },
  });
  Object.defineProperty(win, 'localStorage', { configurable: true, get: () => proxy });

  // IndexedDB (progress photos): the same prefix on every database name. `openReal` is the untouched one, for the photo copy.
  let openReal: ((name: string) => IDBOpenDBRequest) | null = null;
  try {
    const idb = win.indexedDB, proto = Object.getPrototypeOf(idb);
    const open = proto.open, del = proto.deleteDatabase, dbs = proto.databases;
    openReal = (n) => open.call(idb, n);
    proto.open = function (this: IDBFactory, name: string, ...r: unknown[]) { return open.call(this, PREFIX + name, ...r); };
    proto.deleteDatabase = function (this: IDBFactory, name: string) { return del.call(this, PREFIX + name); };
    if (dbs) proto.databases = async function (this: IDBFactory) {
      return (await dbs.call(this)).filter((d: IDBDatabaseInfo) => d.name?.startsWith(PREFIX)).map((d: IDBDatabaseInfo) => ({ ...d, name: d.name!.slice(PREFIX.length) }));
    };
  } catch { /* no IndexedDB: photos already cope with that */ }

  // "Copy my real Aven data in" was asked for: real → beta, one way. Only reads the real keys, only writes beta: keys.
  // Left out: sign-in tokens and the Android app's own bookkeeping. The API keys ARE copied (they stay on this phone).
  try {
    if (!native.getItem(PREFIX + PENDING)) return;
    const skip = (k: string) => k.startsWith('aven.drive') || k.startsWith('aven.androidApp') || k.includes('.corrupt.');
    const real: string[] = [], old: string[] = [];
    for (let i = 0; i < native.length; i++) {
      const k = native.key(i);
      if (!k) continue;
      if (k.startsWith(PREFIX)) old.push(k); else if (k.startsWith('aven') && !skip(k)) real.push(k);
    }
    old.forEach((k) => native.removeItem(k)); // the beta's own data (and the note with it)
    real.forEach((k) => { const v = native.getItem(k); if (v !== null) native.setItem(PREFIX + k, v); });
    copyPhotos();
  } catch { /* a failed copy leaves the beta as it was */ }

  /** The progress photos, same idea: the real database is read, the beta's is written. Photos load later than the first screen. */
  function copyPhotos() {
    if (!openReal) return;
    const r = openReal('aven-photos');
    r.onupgradeneeded = () => { r.transaction?.abort(); }; // there was no real photo database: nothing to copy
    r.onsuccess = () => {
      const src = r.result;
      if (!src.objectStoreNames.contains('photos')) { src.close(); return; }
      const items: [IDBValidKey, unknown][] = [];
      const c = src.transaction('photos').objectStore('photos').openCursor();
      c.onsuccess = () => {
        const cur = c.result;
        if (cur) { items.push([cur.key, cur.value]); cur.continue(); return; }
        src.close();
        const w = win.indexedDB.open('aven-photos', 1); // goes through the prefix
        w.onupgradeneeded = () => { w.result.createObjectStore('photos'); };
        w.onsuccess = () => {
          const t = w.result.transaction('photos', 'readwrite'), s = t.objectStore('photos');
          s.clear(); items.forEach(([k, v]) => s.put(v, k));
          t.oncomplete = () => w.result.close();
        };
      };
    };
  }
}

if (IS_BETA && typeof window !== 'undefined') betaBoot(window, PREFIX, PENDING);
