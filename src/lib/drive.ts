/**
 * Backups to your own Google Drive, straight from the phone (no server).
 *
 * Sign-in is Google's own (Google Identity Services, the "token" flow). Aven asks only for `drive.file`: it can see and
 * change the files IT created, nothing else in your Drive. It keeps one file, "Aven backup.json", and overwrites it
 * each time; Drive itself keeps earlier versions of a file for 30 days (File → Manage versions), so a bad backup
 * doesn't wipe a good one.
 *
 * A web app gets an access pass from Google for one hour at a time and no lasting one, so "automatic" means: after every
 * workout (your tap on Done is what lets Google renew the pass — a window may flash for a moment), while the pass is
 * still valid (edits are sent a little after you make them), and a one-tap reminder when the last backup is a few days
 * old. The pass is kept in memory only — never stored, logged or backed up. The client ID is not a secret (Google
 * shows it to anyone using the app); it is typed into Settings like the other keys and kept on the phone.
 */
import { useSyncExternalStore } from 'react';
import { buildBackup, parseBackup } from './backup';
import { useStore } from '../state/store';
import { userHasData } from './stats';
import type { AppData } from './types';

const STORE = 'aven.drive';
const GIS = 'https://accounts.google.com/gsi/client';
const API = 'https://www.googleapis.com';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const DRIVE_FILE = 'Aven backup.json';

export interface DriveState { clientId?: string; fileId?: string; connected?: boolean; auto?: boolean; lastAt?: number; error?: string }

// ── state (on the phone) ────────────────────────────────────
let cache: DriveState | null = null;
const subs = new Set<() => void>();
export function driveState(): DriveState {
  if (!cache) { try { cache = JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch { cache = {}; } }
  return cache!;
}
function patch(p: Partial<DriveState>) {
  cache = { ...driveState(), ...p };
  try { localStorage.setItem(STORE, JSON.stringify(cache)); } catch { /* ignore */ }
  subs.forEach((f) => f());
}
// your own data only: demo data never goes to Drive (it would replace a real backup)
const hasData = () => { const st = useStore.getState() as any; return userHasData(st) && !st.demo; };
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const useDrive = () => useSyncExternalStore(subscribe, driveState, driveState);
export const validClientId = (id: string) => /^[\w-]+\.apps\.googleusercontent\.com$/.test(id.trim());
export function setClientId(id: string) { patch({ clientId: id.trim() || undefined, connected: false, fileId: undefined, error: undefined }); token = null; client = null; }
export const setAuto = (auto: boolean) => patch({ auto });

// ── Google sign-in (in memory only) ─────────────────────────
let token: { value: string; exp: number } | null = null;
let client: any = null;
let pending: { resolve: (t: string) => void; reject: (e: Error) => void } | null = null;
let gisLoad: Promise<void> | null = null;
const g = () => (window as any).google?.accounts?.oauth2;

/** Loads Google's sign-in script (once). Loaded ahead of time when Drive is set up, so a tap can open the sign-in at once
 * (a browser only lets a page open a window right after a tap). */
export function loadGis(): Promise<void> {
  if (g()) return Promise.resolve();
  if (gisLoad) return gisLoad;
  gisLoad = new Promise<void>((res, rej) => {
    const s = document.createElement('script');
    s.src = GIS; s.async = true;
    s.onload = () => res();
    s.onerror = () => { gisLoad = null; rej(new Error('gis')); };
    document.head.appendChild(s);
  });
  return gisLoad;
}
export const tokenValid = () => !!token && token.exp > Date.now() + 60_000;

/** A valid access pass. With `interactive`, may open Google's window (call it from a tap); without, only an existing pass. */
async function getToken(interactive: boolean): Promise<string> {
  if (tokenValid()) return token!.value;
  if (!interactive) throw new Error('signin');
  const { clientId, connected } = driveState();
  if (!clientId) throw new Error('noclient');
  await loadGis();
  if (!client) {
    client = g().initTokenClient({
      client_id: clientId, scope: SCOPE,
      callback: (r: any) => {
        const p = pending; pending = null;
        if (!p) return;
        if (r?.error || !r?.access_token) { p.reject(new Error(r?.error === 'access_denied' ? 'denied' : 'signin')); return; }
        token = { value: r.access_token, exp: Date.now() + (Number(r.expires_in) || 3600) * 1000 };
        p.resolve(token.value);
      },
      error_callback: (e: any) => { const p = pending; pending = null; p?.reject(new Error(e?.type === 'popup_closed' ? 'closed' : e?.type === 'popup_failed_to_open' ? 'blocked' : 'signin')); },
    });
  }
  return new Promise<string>((resolve, reject) => {
    pending?.reject(new Error('signin'));
    pending = { resolve, reject };
    // once you've said yes, Google doesn't ask again: its window opens and closes by itself
    client.requestAccessToken({ prompt: connected ? '' : 'consent' });
  });
}

// ── Drive calls ─────────────────────────────────────────────
async function call(path: string, init: RequestInit, interactive: boolean): Promise<Response> {
  const t = await getToken(interactive);
  const res = await fetch(`${API}${path}`, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${t}` } });
  if (res.status === 401) { token = null; throw new Error('signin'); }
  return res;
}
/** The backup file Aven made before, if it is still there (Drive may hold it from another phone or a reinstall). */
async function findFile(interactive: boolean): Promise<{ id: string; modifiedTime?: string } | null> {
  const q = encodeURIComponent(`name='${DRIVE_FILE}' and trashed=false`);
  const res = await call(`/drive/v3/files?q=${q}&spaces=drive&orderBy=modifiedTime desc&fields=files(id,modifiedTime)&pageSize=1`, { method: 'GET' }, interactive);
  if (!res.ok) throw new Error('drive');
  const j = await res.json();
  return j?.files?.[0] ?? null;
}

/** Signs in (from a tap) and makes the first backup. */
export async function connectDrive(): Promise<void> {
  try {
    await getToken(true);
    patch({ connected: true, auto: driveState().auto ?? true, error: undefined });
    // a new phone connects to restore: its empty app must not overwrite the backup that's waiting in Drive
    if (hasData()) await backupToDrive(true);
  } catch (e: any) { patch({ error: e?.message || 'signin' }); throw e; }
}

let busy: Promise<void> | null = null;
/** Writes the backup file (creating it the first time). `interactive`: may ask Google for a new pass (needs a tap). */
export function backupToDrive(interactive: boolean): Promise<void> {
  if (busy) return busy;
  // never replace a real backup with an empty app (after "Delete everything", or before restoring on a new phone)
  if (!hasData()) return Promise.resolve();
  busy = (async () => {
    try {
      const body = JSON.stringify(buildBackup());
      let id = driveState().fileId || (await findFile(interactive))?.id;
      let res: Response | null = null;
      if (id) {
        res = await call(`/upload/drive/v3/files/${id}?uploadType=media&fields=id`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body }, interactive);
        if (res.status === 404) { id = undefined; res = null; } // deleted in Drive: make it again
      }
      if (!id) {
        const meta = { name: DRIVE_FILE, mimeType: 'application/json' };
        const b = `aven${Math.random().toString(36).slice(2)}`;
        const multipart = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${b}--`;
        res = await call('/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${b}` }, body: multipart }, interactive);
      }
      if (!res || !res.ok) throw new Error(res?.status === 403 ? 'forbidden' : 'drive');
      const j = await res.json().catch(() => ({}));
      patch({ fileId: j.id || id, lastAt: Date.now(), error: undefined, connected: true });
    } catch (e: any) {
      if (e?.message !== 'signin' || interactive) patch({ error: e?.message === 'Failed to fetch' ? 'offline' : e?.message || 'drive' });
      throw e;
    } finally { busy = null; }
  })();
  return busy;
}

/** Reads the backup from Drive (from a tap), ready for the same "Replace my data?" step as a file. */
export async function restoreFromDrive(lang: string): Promise<{ data: AppData; photos?: Record<string, string>; at?: string }> {
  const f = await findFile(true);
  if (!f) throw new Error('nofile');
  const res = await call(`/drive/v3/files/${f.id}?alt=media`, { method: 'GET' }, true);
  if (!res.ok) throw new Error('drive');
  patch({ fileId: f.id, connected: true, error: undefined });
  return { ...parseBackup(await res.text(), lang), at: f.modifiedTime };
}

/** Signs out of Drive in Aven (the backup file stays in your Drive). */
export function disconnectDrive() {
  try { if (token) g()?.revoke?.(token.value, () => {}); } catch { /* ignore */ }
  token = null;
  patch({ connected: false, error: undefined });
}

/** "Delete everything": forget Drive on this phone too (the file in Drive stays). */
export function resetDrive() { token = null; client = null; cache = {}; try { localStorage.removeItem(STORE); } catch { /* ignore */ } subs.forEach((f) => f()); }

// ── automatic ───────────────────────────────────────────────
const on = () => { const d = driveState(); return !!(d.clientId && d.connected && d.auto !== false); };
/** After a workout (call from the tap that closes the summary): back up, renewing the pass if needed. */
export function backupAfterWorkout() { if (on()) backupToDrive(true).catch(() => {}); }
/** While a pass is valid, edits are sent a little after you make them (no window, no tap). */
let soon: ReturnType<typeof setTimeout> | undefined;
export function backupSoon() {
  if (!on() || !tokenValid()) return;
  clearTimeout(soon);
  soon = setTimeout(() => { if (tokenValid()) backupToDrive(false).catch(() => {}); }, 45_000);
}
/** Days since the last Drive backup (null when Drive isn't on). */
export function staleDays(): number | null {
  if (!on()) return null;
  const at = driveState().lastAt;
  return at ? Math.floor((Date.now() - at) / 86_400_000) : 99;
}
