import { useEffect, useRef, useState } from 'react';
import { useStore, foodPool } from '../../state/store';
import { useUI } from '../../state/ui';
import { useT } from '../../lib/i18n';
import { lookupBarcode } from '../../lib/foodApi';
import { Sheet, SheetHead } from '../../ui/Sheet';
import { Icon } from '../../ui/Icon';

type Cam = 'idle' | 'starting' | 'live' | 'denied' | 'unsupported' | 'error';

/**
 * Barcode scanning is only offered where the browser has BarcodeDetector (Chrome/Android, some desktop).
 * Everywhere else — and always as a fallback — the number can be typed.
 */
export function Scanner({ props }: { props: { date: string; mealId: string } }) {
  const t = useT();
  const s = useStore();
  const pool = foodPool(s.foods, s.recipes);
  const pop = useUI((u) => u.pop);
  const swap = useUI((u) => u.swap);
  const video = useRef<HTMLVideoElement>(null);
  const [cam, setCam] = useState<Cam>('idle');
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ kind: 'info' | 'bad'; text: string; create?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const last = useRef({ code: '', at: 0 });
  const supported = typeof window !== 'undefined' && 'BarcodeDetector' in window;

  const handle = async (raw: string) => {
    const c = raw.replace(/\D/g, '');
    if (c.length < 6 || busy) return;
    if (last.current.code === c && Date.now() - last.current.at < 4000) return;
    last.current = { code: c, at: Date.now() };
    setBusy(true); setMsg(null);
    const local = pool.find((f) => f.barcode === c);
    if (local) { swap(1, 'foodDetail', { foodId: local.id, date: props.date, mealId: props.mealId }); return; }
    const r = await lookupBarcode(c);
    setBusy(false);
    if (r.food) { swap(1, 'foodDetail', { food: r.food, date: props.date, mealId: props.mealId }); return; }
    if (r.status === 'notfound') setMsg({ kind: 'info', text: t('No product found for {c}. You can add it yourself.', { c }), create: c });
    else setMsg({ kind: 'bad', text: r.status === 'offline' ? t('You’re offline — barcode lookup needs a connection. You can still add it yourself.') : r.status === 'rate' ? t('Lookup is rate-limited — try again shortly.') : t('Barcode lookup isn’t available right now. You can add this product yourself.'), create: c });
  };

  useEffect(() => {
    if (!supported) { setCam('unsupported'); return; }
    let stream: MediaStream | null = null;
    let raf = 0; let stopped = false; let timer: ReturnType<typeof setTimeout>;
    (async () => {
      setCam('starting');
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
        if (stopped) { stream.getTracks().forEach((x) => x.stop()); return; }
        const v = video.current!;
        v.srcObject = stream; await v.play();
        setCam('live');
        const det = new (window as any).BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
        const loop = async () => {
          if (stopped) return;
          try { const r = await det.detect(v); if (r[0]?.rawValue) await handle(r[0].rawValue); } catch { /* frame not ready */ }
          timer = setTimeout(() => { raf = requestAnimationFrame(loop); }, 220);
        };
        loop();
      } catch (e: any) {
        setCam(e?.name === 'NotAllowedError' ? 'denied' : 'error');
      }
    })();
    return () => { stopped = true; cancelAnimationFrame(raf); clearTimeout(timer); stream?.getTracks().forEach((x) => x.stop()); };
    // eslint-disable-next-line
  }, []);

  return (
    <Sheet onClose={pop} tall label={t('Scan barcode')} z={80}>
      <SheetHead title={t('Scan barcode')} onClose={pop} />
      <div className="sheet-body">
        {supported && cam !== 'denied' && cam !== 'error' && (
          <div style={{ position: 'relative', borderRadius: 'var(--r-lg)', overflow: 'hidden', aspectRatio: '4 / 3', background: '#000', boxShadow: 'var(--sh-a)' }}>
            <video ref={video} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <div style={{ position: 'absolute', inset: '24% 10%', border: '2px solid rgba(255,255,255,.85)', borderRadius: 14, boxShadow: '0 0 0 999px rgba(0,0,0,.35)' }} />
            {cam === 'starting' && <div className="small" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#fff' }}>{t('Starting camera…')}</div>}
          </div>
        )}
        {cam === 'unsupported' && <div className="plinth-2 small" style={{ padding: 14 }}><b>{t('Camera scanning isn’t supported in this browser.')}</b><div className="t2" style={{ marginTop: 4 }}>{t('Type the number under the barcode instead.')}</div></div>}
        {cam === 'denied' && <div className="plinth-2 small" style={{ padding: 14 }}><b>{t('Camera permission was denied.')}</b><div className="t2" style={{ marginTop: 4 }}>{t('Allow camera access in your browser settings, or type the number below.')}</div></div>}
        {cam === 'error' && <div className="plinth-2 small" style={{ padding: 14 }}><b>{t('Couldn’t start the camera.')}</b><div className="t2" style={{ marginTop: 4 }}>{t('Type the number below instead.')}</div></div>}
        <div className="field" style={{ marginTop: 18 }}>
          <label htmlFor="bc">{t('Barcode number')}</label>
          <div className="row-flex" style={{ gap: 8 }}>
            <input id="bc" className="input" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="5701234567890" onKeyDown={(e) => { if (e.key === 'Enter') handle(code); }} />
            <button className="btn primary press" disabled={code.length < 6 || busy} onClick={() => handle(code)}>{busy ? '…' : t('Look up')}</button>
          </div>
        </div>
        {msg && (
          <div className="plinth-2 small" style={{ padding: 14, marginTop: 14, color: msg.kind === 'bad' ? 'var(--tx)' : undefined }}>
            {msg.text}
            {msg.create && <div style={{ marginTop: 10 }}><button className="btn sm primary press" onClick={() => swap(1, 'customFood', { barcode: msg.create, afterSave: 'openDetail', date: props.date, mealId: props.mealId })}><Icon name="plus" size={16} /> {t('Add this product')}</button></div>}
          </div>
        )}
        <div className="xs t3" style={{ marginTop: 14 }}>{t('Product data comes from Open Food Facts when the lookup server is reachable; your saved foods are checked first.')}</div>
      </div>
    </Sheet>
  );
}
