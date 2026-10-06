import { useEffect, useState } from 'react';
import { useStore } from '../state/store';
import { useUI, buzz } from '../state/ui';
import { useT, useLang } from '../lib/i18n';
import { Icon } from '../ui/Icon';
import { Toggle } from '../ui/kit';
import { fmtDate, fmtTime, dayKey } from '../lib/dates';
import { userHasData } from '../lib/stats';
import type { AppData } from '../lib/types';
import { DRIVE_FILE, backupSoon, backupToDrive, connectDrive, disconnectDrive, driveState, loadGis, restoreFromDrive, setAuto, setClientId, staleDays, useDrive, validClientId } from '../lib/drive';

const ERR: Record<string, string> = {
  noclient: 'Add your Google client ID first.',
  denied: 'Google access wasn’t allowed.',
  closed: 'The Google window was closed before it finished.',
  blocked: 'The browser blocked Google’s window. Try again.',
  signin: 'Google sign-in is needed. Tap Back up now.',
  offline: 'No connection. It will try again later.',
  forbidden: 'Google refused. Check that the Drive API is enabled for your client ID.',
  apioff: 'The Google Drive API is off in your Google Cloud project. Turn it on: APIs & Services → Library → Google Drive API → Enable. Then wait a few minutes.',
  scope: 'Drive access wasn’t ticked. Tap Disconnect, then Connect again and tick “See, edit, create and delete… Google Drive files”.',
  busy: 'Google is busy. Try again in a minute.',
  nofile: 'No Aven backup found in your Drive yet.',
  gis: 'Couldn’t load Google sign-in. Check the connection.',
  drive: 'Google Drive didn’t answer. Try again.',
};

/** Settings → Data & backup → Google Drive. */
export function DriveCard({ onRestore }: { onRestore: (p: { data: AppData; photos?: Record<string, string> }) => void }) {
  const t = useT();
  const lang = useLang();
  const d = useDrive();
  const dayStart = useStore((s) => s.settings.dayStartHour);
  const toast = useUI((u) => u.toast);
  const [id, setId] = useState(d.clientId ?? '');
  const [busy, setBusy] = useState<null | 'connect' | 'backup' | 'restore'>(null);
  useEffect(() => { if (d.clientId) loadGis().catch(() => {}); }, [d.clientId]); // ready before the tap
  const err = d.error ? t(ERR[d.error] ?? ERR.drive) : null;
  const when = d.lastAt ? `${fmtDate(dayKey(d.lastAt, dayStart), lang, { day: 'numeric', month: 'short' })}, ${fmtTime(d.lastAt, lang)}` : null;
  const run = async (kind: 'connect' | 'backup' | 'restore', fn: () => Promise<unknown>) => {
    setBusy(kind); buzz(8);
    try { await fn(); } catch { /* shown below the card */ } finally { setBusy(null); }
  };

  return (
    <div className="plinth" style={{ padding: 16 }}>
      <div className="row-flex" style={{ gap: 8 }}><Icon name="upload" size={18} /><div className="li-title">{t('Google Drive backup')}</div></div>
      {!d.connected ? (
        <>
          <div className="li-sub" style={{ marginTop: 4 }}>{t('Keeps a copy in your own Google Drive, updated after every workout. Aven can only see the file it makes.')}</div>
          <div className="field" style={{ marginTop: 12 }}>
            <label htmlFor="drive-id">{t('Google client ID')}</label>
            <input id="drive-id" className="input" value={id} autoComplete="off" spellCheck={false} placeholder="…apps.googleusercontent.com" onChange={(e) => setId(e.target.value)} onBlur={() => { if (id.trim() !== (d.clientId ?? '')) setClientId(id); }} />
            <div className="xs t3">{t('Free, one-time setup in Google Cloud. The steps are in the README.')}</div>
          </div>
          <button className="btn primary block press" style={{ marginTop: 12 }} disabled={!validClientId(id) || busy !== null}
            onClick={() => { if (id.trim() !== d.clientId) setClientId(id); run('connect', async () => { await connectDrive(); toast(t('Backed up to Google Drive'), { tone: 'ok' }); }); }}>
            {busy === 'connect' ? t('Connecting…') : t('Connect Google Drive')}
          </button>
          {d.clientId && <button className="btn ghost block press" style={{ marginTop: 6 }} disabled={busy !== null} onClick={() => run('restore', async () => onRestore(await restoreFromDrive(lang)))}>{busy === 'restore' ? t('Reading…') : t('Restore from Drive')}</button>}
        </>
      ) : (
        <>
          <div className="li-sub num" style={{ marginTop: 4 }}>{when ? t('“{file}” in your Drive · last {when}', { file: DRIVE_FILE, when }) : t('“{file}” in your Drive', { file: DRIVE_FILE })}</div>
          <div className="row-flex between" style={{ gap: 14, marginTop: 12 }}>
            <div style={{ minWidth: 0 }}><div>{t('Back up after each workout')}</div><div className="xs t3">{t('And now and then while you use the app. Google may flash a window for a moment.')}</div></div>
            <Toggle on={d.auto !== false} onChange={setAuto} label={t('Back up after each workout')} />
          </div>
          <div className="row-flex" style={{ gap: 8, marginTop: 14 }}>
            <button className="btn sm primary grow press" disabled={busy !== null} onClick={() => run('backup', async () => { await backupToDrive(true); toast(t('Backed up to Google Drive'), { tone: 'ok' }); })}>{busy === 'backup' ? t('Backing up…') : t('Back up now')}</button>
            <button className="btn sm grow press" disabled={busy !== null} onClick={() => run('restore', async () => onRestore(await restoreFromDrive(lang)))}>{busy === 'restore' ? t('Reading…') : t('Restore')}</button>
          </div>
          <button className="btn ghost block sm press" style={{ marginTop: 6 }} onClick={() => { disconnectDrive(); toast(t('Drive disconnected. The backup stays in your Drive.')); }}>{t('Disconnect')}</button>
        </>
      )}
      {err && <div className="xs" style={{ marginTop: 10, color: 'var(--bad)' }}>{err}{d.errorDetail && <span className="t3 num"> ({d.errorDetail})</span>}</div>}
    </div>
  );
}

/**
 * Mounted once in App. Gets Google's sign-in ready, sends edits while a Google pass is still valid, and — once per
 * opening — offers a one-tap backup when the last one is three or more days old (a tap is what lets Google renew).
 */
export function useDriveAuto() {
  const t = useT();
  useEffect(() => {
    if (driveState().clientId && driveState().connected) {
      const idle = (window as any).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 2000));
      idle(() => loadGis().catch(() => {}));
    }
    const off = useStore.subscribe(() => backupSoon());
    const nudge = setTimeout(() => {
      const days = staleDays();
      const st = useStore.getState() as any;
      if (days === null || days < 3 || !userHasData(st) || st.demo) return;
      useUI.getState().toast(days >= 99 ? t('Not backed up to Drive yet') : t('Last Drive backup {n} days ago', { n: days }), {
        actionLabel: t('Back up'), duration: 9000,
        onAction: () => backupToDrive(true).then(() => useUI.getState().toast(t('Backed up to Google Drive'), { tone: 'ok' }), () => useUI.getState().toast(t('Drive backup didn’t finish. Try again in Settings.'), { tone: 'bad' })),
      });
    }, 6000);
    return () => { off(); clearTimeout(nudge); };
    // eslint-disable-next-line
  }, []);
}
