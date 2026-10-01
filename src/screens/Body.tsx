import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { useUI, buzz } from '../state/ui';
import { useT, useLang } from '../lib/i18n';
import { Sheet, SheetHead } from '../ui/Sheet';
import { Icon } from '../ui/Icon';
import { NumInput } from '../ui/kit';
import { useToday } from '../lib/derive';
import { addDays, fmtDate, relativeDay } from '../lib/dates';
import { cmToDisplay, displayToCm, displayToKg, fmtNum, kgToDisplay } from '../lib/units';
import type { MeasureKind } from '../lib/types';
import { deletePhoto, downscale, loadPhoto, savePhoto } from '../lib/photos';
import { uid } from '../lib/nutrition';

export function WeightSheet() {
  const t = useT();
  const lang = useLang();
  const s = useStore();
  const pop = useUI((u) => u.pop);
  const toast = useUI((u) => u.toast);
  const today = useToday();
  const u = s.settings.units.weight;
  const last = [...s.weights].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  const [v, setV] = useState<number | undefined>(undefined);
  const [date, setDate] = useState(today);
  const list = [...s.weights].sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at).slice(0, 12);
  const save = () => {
    if (!v || v <= 0 || v > 500) return;
    const kg = displayToKg(v, u);
    const w = s.addWeight(kg, date);
    buzz(12);
    setV(undefined);
    toast(t('Weight logged'), { tone: 'ok', actionLabel: t('Undo'), onAction: () => s.removeWeight(w.id) });
  };
  return (
    <Sheet onClose={pop} label={t('Bodyweight')} z={100} foot={<button className="btn primary block press" disabled={!v} onClick={save}>{t('Save')}</button>}>
      <SheetHead title={t('Bodyweight')} sub={last ? `${t('Last')}: ${fmtNum(kgToDisplay(last.kg, u), lang, 1)} ${u} · ${fmtDate(last.date, lang, { day: 'numeric', month: 'short' })}` : undefined} onClose={pop} />
      <div className="sheet-body">
        <NumInput big value={v} onChange={setV} unit={u} max={1} placeholder={last ? fmtNum(kgToDisplay(last.kg, u), lang, 1) : '—'} autoFocus onEnter={save} label={t('Weight')} />
        <div className="chips" style={{ marginTop: 12 }}>
          {[0, -1, -2, -3].map((n) => { const d = addDays(today, n); return <button key={n} className={`chip sm press ${date === d ? 'on' : ''}`} onClick={() => setDate(d)}>{relativeDay(d, today, 'en') ? t(relativeDay(d, today, 'en')!) : fmtDate(d, lang, { weekday: 'short', day: 'numeric' })}</button>; })}
        </div>
        {list.length > 0 && <div className="list" style={{ marginTop: 18 }}>{list.map((w) => (
          <div key={w.id} className="li" style={{ minHeight: 48 }}>
            <div className="grow num"><b>{fmtNum(kgToDisplay(w.kg, u), lang, 1)}</b> {u}</div><div className="small t2">{fmtDate(w.date, lang, { weekday: 'short', day: 'numeric', month: 'short' })}</div>
            <button className="icon-btn flat sm" aria-label={t('Delete')} onClick={() => { s.removeWeight(w.id); toast(t('Removed'), { actionLabel: t('Undo'), onAction: () => s.restoreWeight(w) }); }}><Icon name="trash" size={16} /></button>
          </div>))}</div>}
      </div>
    </Sheet>
  );
}

const KINDS: { k: MeasureKind; l: string }[] = [{ k: 'waist', l: 'Waist' }, { k: 'chest', l: 'Chest' }, { k: 'hips', l: 'Hips' }, { k: 'arm', l: 'Arm' }, { k: 'thigh', l: 'Thigh' }, { k: 'neck', l: 'Neck' }];

export function MeasureSheet() {
  const t = useT();
  const lang = useLang();
  const s = useStore();
  const pop = useUI((u) => u.pop);
  const toast = useUI((u) => u.toast);
  const today = useToday();
  const u = s.settings.units.length;
  const [kind, setKind] = useState<MeasureKind>('waist');
  const [v, setV] = useState<number | undefined>();
  const hist = s.measurements.filter((m) => m.kind === kind).sort((a, b) => b.date.localeCompare(a.date));
  const save = () => { if (!v || v <= 0) return; s.addMeasurement({ date: today, kind, cm: displayToCm(v, u) }); buzz(10); setV(undefined); toast(t('Saved'), { tone: 'ok' }); };
  return (
    <Sheet onClose={pop} label={t('Measurements')} z={100} foot={<button className="btn primary block press" disabled={!v} onClick={save}>{t('Save')}</button>}>
      <SheetHead title={t('Measurements')} onClose={pop} />
      <div className="sheet-body">
        <div className="chips" style={{ marginBottom: 14 }}>{KINDS.map((x) => <button key={x.k} className={`chip press ${kind === x.k ? 'on' : ''}`} onClick={() => setKind(x.k)}>{t(x.l)}</button>)}</div>
        <NumInput big value={v} onChange={setV} unit={u} max={1} placeholder={hist[0] ? fmtNum(cmToDisplay(hist[0].cm, u), lang, 1) : '—'} onEnter={save} label={t('Measurement')} />
        {hist.length > 0 && <div className="list" style={{ marginTop: 18 }}>{hist.slice(0, 10).map((m, i) => {
          const prev = hist[i + 1];
          const d = prev ? cmToDisplay(m.cm, u) - cmToDisplay(prev.cm, u) : null;
          return <div key={m.id} className="li" style={{ minHeight: 48 }}><div className="grow num"><b>{fmtNum(cmToDisplay(m.cm, u), lang, 1)}</b> {u}{d !== null && <span className="t3 small"> ({d >= 0 ? '+' : '−'}{fmtNum(Math.abs(d), lang, 1)})</span>}</div><div className="small t2">{fmtDate(m.date, lang, { day: 'numeric', month: 'short' })}</div><button className="icon-btn flat sm" aria-label={t('Delete')} onClick={() => s.removeMeasurement(m.id)}><Icon name="trash" size={16} /></button></div>;
        })}</div>}
      </div>
    </Sheet>
  );
}

function Thumb({ id, onClick }: { id: string; onClick: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { let u: string | null = null; let live = true; loadPhoto(id).then((b) => { if (b && live) { u = URL.createObjectURL(b); setUrl(u); } }).catch(() => {}); return () => { live = false; if (u) URL.revokeObjectURL(u); }; }, [id]);
  return <button className="press" onClick={onClick} style={{ aspectRatio: '3 / 4', borderRadius: 14, overflow: 'hidden', background: 'var(--s2)', boxShadow: 'inset 0 0 0 1px var(--line)' }}>{url && <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}</button>;
}

/** Private progress photos: stored in IndexedDB on this device, never uploaded, removable at any time. */
export function PhotosSheet() {
  const t = useT();
  const lang = useLang();
  const s = useStore();
  const pop = useUI((u) => u.pop);
  const toast = useUI((u) => u.toast);
  const today = useToday();
  const input = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<string | null>(null);
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  useEffect(() => { if (!view) { setViewUrl(null); return; } let u: string | null = null; loadPhoto(view).then((b) => { if (b) { u = URL.createObjectURL(b); setViewUrl(u); } }); return () => { if (u) URL.revokeObjectURL(u); }; }, [view]);
  const add = async (f?: File | null) => {
    if (!f) return;
    try { const id = uid('ph'); await savePhoto(id, await downscale(f)); s.addPhoto({ id, date: today }); toast(t('Photo saved privately on this device'), { tone: 'ok' }); }
    catch { toast(t('Couldn’t save that photo'), { tone: 'bad' }); }
  };
  const del = async (id: string) => { await deletePhoto(id).catch(() => {}); s.removePhoto(id); setView(null); toast(t('Photo deleted')); };
  const photos = [...s.photos].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <Sheet onClose={pop} tall label={t('Progress photos')} z={100} foot={<><input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { add(e.target.files?.[0]); e.target.value = ''; }} /><button className="btn primary block press" onClick={() => input.current?.click()}><Icon name="camera" size={18} /> {t('Add photo')}</button></>}>
      <SheetHead title={t('Progress photos')} onClose={pop} />
      <div className="sheet-body">
        <div className="plinth-2 small" style={{ padding: 12, display: 'flex', gap: 10 }}><Icon name="lock" size={18} style={{ flex: 'none', marginTop: 1 }} /><span>{t('Private by design: photos stay on this device, are shrunk and stripped of location data, and are never uploaded or included in exports unless you choose.')}</span></div>
        {photos.length === 0 ? <div className="empty"><div className="display display-sm">{t('No photos yet')}</div></div> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 14 }}>{photos.map((p) => <div key={p.id}><Thumb id={p.id} onClick={() => setView(p.id)} /><div className="xs t3 num" style={{ marginTop: 4 }}>{fmtDate(p.date, lang, { day: 'numeric', month: 'short' })}</div></div>)}</div>
        )}
        {view && (
          <div role="dialog" aria-label={t('Photo')} style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,.92)', display: 'flex', flexDirection: 'column' }} onClick={() => setView(null)}>
            <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 14 }}>{viewUrl && <img src={viewUrl} alt={t('Progress photo')} style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 14 }} />}</div>
            <div className="row-flex" style={{ gap: 10, padding: '0 18px calc(var(--sab) + 18px)' }}>
              <button className="btn grow press" onClick={(e) => { e.stopPropagation(); setView(null); }}>{t('Close')}</button>
              <button className="btn danger grow press" onClick={(e) => { e.stopPropagation(); del(view); }}><Icon name="trash" size={18} /> {t('Delete')}</button>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
