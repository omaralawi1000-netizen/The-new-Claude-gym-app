import { useEffect, useRef, useState } from 'react';
import { useIsPresent } from 'motion/react';
import { useStore, foodPool } from '../../state/store';
import { useUI } from '../../state/ui';
import { useT } from '../../lib/i18n';
import { lookupBarcode } from '../../lib/foodApi';
import { createReader, extractCode } from '../../lib/barcode';
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
  const [shown, setShown] = useState(false); // the camera's first frame is on screen
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ kind: 'info' | 'bad'; text: string; create?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const last = useRef({ code: '', at: 0 });
  // false the moment the scanner starts to leave (Back, a swipe): a lookup still on its way then opens nothing
  const alive = useRef(true);
  // codes this scanner has already answered (not found, offline…): the camera doesn't ask again every few seconds
  const answered = useRef(new Set<string>());
  const present = useIsPresent();
  useEffect(() => { alive.current = present; return () => { alive.current = false; }; }, [present]);
  const supported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia; // camera needed; the reader itself is bundled

  const handle = async (raw: string, typed = false) => {
    const c = extractCode(raw) ?? raw.replace(/\D/g, '');
    if (c.length < 6 || busy) return;
    if (!typed && answered.current.has(c)) return; // "Look up" still asks again
    if (!typed && last.current.code === c && Date.now() - last.current.at < 4000) return;
    last.current = { code: c, at: Date.now() };
    setBusy(true); setMsg((m) => (m?.create === c ? m : null)); // the same code again keeps its answer on screen
    const local = pool.find((f) => f.barcode === c);
    if (local) { swap(1, 'foodDetail', { foodId: local.id, date: props.date, mealId: props.mealId }); return; }
    const r = await lookupBarcode(c);
    if (!alive.current) return;
    setBusy(false);
    if (r.food) { swap(1, 'foodDetail', { food: r.food, date: props.date, mealId: props.mealId }); return; }
    answered.current.add(c);
    if (r.status !== 'notfound') setCode(c); // a lookup that failed can be tried again with one tap on "Look up"
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
        // the sheet puts its contents in a couple of frames after it starts to slide (see Sheet): a camera that answers
        // sooner waits for its video element instead of failing
        for (let i = 0; i < 60 && !video.current && !stopped; i++) await new Promise((r) => requestAnimationFrame(r));
        if (stopped) { stream.getTracks().forEach((x) => x.stop()); return; }
        const v = video.current!;
        v.srcObject = stream; await v.play();
        setCam('live');
        // the picture fades in only once its first frame is on screen: before that the phone draws an empty grey box (and
        // "Starting camera…" vanished first), a flicker of three looks instead of one calm fade from the dark box; the words
        // go first, then the picture comes (fading the two across each other left the words over the barcode)
        const rvfc = (v as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number }).requestVideoFrameCallback;
        if (rvfc) rvfc.call(v, () => { if (!stopped) setShown(true); });
        else if (v.readyState >= 2) setShown(true); else v.addEventListener('loadeddata', () => { if (!stopped) setShown(true); }, { once: true });
        const reader = await createReader();
        const loop = async () => {
          if (stopped) return;
          try { const code = await reader.detect(v); if (code) await handle(code); } catch { /* frame not ready */ }
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
    <Sheet onClose={pop} size="full" label={t('Scan barcode')} z={80}>
      <SheetHead title={t('Scan barcode')} onClose={pop} />
      <div className="sheet-body">
        {supported && cam !== 'denied' && cam !== 'error' && (
          <div style={{ position: 'relative', borderRadius: 'var(--r-lg)', overflow: 'hidden', aspectRatio: '4 / 3', background: '#000', boxShadow: 'var(--sh-a)' }}>
            <video ref={video} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: shown ? 1 : 0, transition: shown ? 'opacity 420ms var(--ease-out) 180ms' : 'none' }} />
            <div style={{ position: 'absolute', inset: '24% 10%', border: '2px solid rgba(255,255,255,.85)', borderRadius: 14, boxShadow: '0 0 0 999px rgba(0,0,0,.35)' }} />
            <div className="small" aria-hidden={shown || undefined} style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#fff', opacity: shown ? 0 : 1, transition: 'opacity 180ms linear', pointerEvents: 'none' }}>{t('Starting camera…')}</div>
          </div>
        )}
        {cam === 'unsupported' && <div className="plinth-2 small" style={{ padding: 14 }}><b>{t('Camera scanning isn’t supported in this browser.')}</b><div className="t2" style={{ marginTop: 4 }}>{t('Type the number under the barcode instead.')}</div></div>}
        {cam === 'denied' && <div className="plinth-2 small" style={{ padding: 14 }}><b>{t('Camera permission was denied.')}</b><div className="t2" style={{ marginTop: 4 }}>{t('Allow camera access in your browser settings, or type the number below.')}</div></div>}
        {cam === 'error' && <div className="plinth-2 small" style={{ padding: 14 }}><b>{t('Couldn’t start the camera.')}</b><div className="t2" style={{ marginTop: 4 }}>{t('Type the number below instead.')}</div></div>}
        <div className="field" style={{ marginTop: 18 }}>
          <label htmlFor="bc">{t('Barcode number')}</label>
          <div className="row-flex" style={{ gap: 8 }}>
            <input id="bc" className="input" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="5701234567890" onKeyDown={(e) => { if (e.key === 'Enter') handle(code, true); }} />
            <button className="btn primary press" disabled={code.length < 6 || busy} onClick={() => handle(code, true)}>{busy ? '…' : t('Look up')}</button>
          </div>
        </div>
        {msg && (
          <div className="plinth-2 small" style={{ padding: 14, marginTop: 14, color: msg.kind === 'bad' ? 'var(--tx)' : undefined }}>
            {msg.text}
            {msg.create && <div style={{ marginTop: 10 }}><button className="btn sm primary press" onClick={() => swap(1, 'customFood', { barcode: msg.create, afterSave: 'openDetail', date: props.date, mealId: props.mealId })}><Icon name="plus" size={16} /> {t('Add this product')}</button></div>}
          </div>
        )}
      </div>
    </Sheet>
  );
}
