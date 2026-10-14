import { useEffect, useRef, useState } from 'react';
import { useUI, haptic } from '../state/ui';
import { useT } from '../lib/i18n';
import { Sheet } from '../ui/Sheet';
import { Icon } from '../ui/Icon';
import { cameraSupported } from '../lib/photos';

type Cam = 'starting' | 'live' | 'denied' | 'unsupported' | 'error';

/**
 * The in-app camera: a live preview in a pop-up, a big shutter, Back, and the gallery. Same camera code path as the barcode
 * scanner (getUserMedia, the picture fades in on its first frame). The shot is handed to `onShot` as a File, exactly what the
 * old photo picker gave, so Food's photo lookup and the Coach's image send need no changes.
 */
export function CameraSheet({ props }: { props: { onShot: (f: File) => void } }) {
  const t = useT();
  const pop = useUI((u) => u.pop);
  const video = useRef<HTMLVideoElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const flash = useRef<HTMLDivElement>(null);
  const lib = useRef<HTMLInputElement>(null);
  const native = useRef<HTMLInputElement>(null);
  const [cam, setCam] = useState<Cam>(cameraSupported() ? 'starting' : 'unsupported');
  const [shown, setShown] = useState(false);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [taken, setTaken] = useState(false);

  useEffect(() => {
    if (!cameraSupported()) return;
    let stream: MediaStream | null = null; let stopped = false;
    setShown(false); setCam('starting');
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
        for (let i = 0; i < 60 && !video.current && !stopped; i++) await new Promise((r) => requestAnimationFrame(r)); // the sheet puts its contents in a couple of frames in
        if (stopped) { stream.getTracks().forEach((x) => x.stop()); return; }
        const v = video.current!;
        v.srcObject = stream; await v.play();
        setCam('live');
        const rvfc = (v as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number }).requestVideoFrameCallback;
        if (rvfc) rvfc.call(v, () => { if (!stopped) setShown(true); });
        else if (v.readyState >= 2) setShown(true); else v.addEventListener('loadeddata', () => { if (!stopped) setShown(true); }, { once: true });
      } catch (e: any) { if (!stopped) setCam(e?.name === 'NotAllowedError' ? 'denied' : 'error'); }
    })();
    return () => { stopped = true; stream?.getTracks().forEach((x) => x.stop()); };
  }, [facing]);

  const hand = (f: File) => { props.onShot(f); pop(); };

  const shoot = () => {
    const v = video.current, p = panel.current;
    if (!v || !p || !v.videoWidth || taken || cam !== 'live') return;
    setTaken(true); haptic('light');
    // cut the frame to what the preview shows (object-fit: cover), so the photo is what he saw
    const pw = p.clientWidth, ph = p.clientHeight, vw = v.videoWidth, vh = v.videoHeight;
    const k = Math.max(pw / vw, ph / vh), sw = pw / k, sh = ph / k;
    const out = Math.min(1, 1600 / Math.max(sw, sh));
    const c = document.createElement('canvas'); c.width = Math.round(sw * out); c.height = Math.round(sh * out);
    c.getContext('2d')!.drawImage(v, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, c.width, c.height);
    v.pause(); // the frame freezes under the flash, and the pop-up closes over that still
    flash.current?.animate([{ opacity: 0 }, { opacity: 0.32, offset: 0.2 }, { opacity: 0 }], { duration: 380, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    c.toBlob((b) => { if (b) setTimeout(() => hand(new File([b], 'photo.jpg', { type: 'image/jpeg' })), 300); else setTaken(false); }, 'image/jpeg', 0.9);
  };

  const failed = cam === 'denied' || cam === 'error' || cam === 'unsupported';

  return (
    <Sheet onClose={pop} size="full" label={t('Camera')} z={110}>
      <div className="cam-wrap">
        <div ref={panel} className="cam-panel">
          {!failed && <video ref={video} playsInline muted className="cam-video" style={{ opacity: shown ? 1 : 0, transition: shown ? 'opacity 420ms var(--ease-out) 120ms' : 'none' }} />}
          <div ref={flash} className="cam-flash" aria-hidden />
          <div className="small cam-msg" aria-hidden={shown || failed || undefined} style={{ opacity: !failed && shown ? 0 : 1 }}>
            {failed ? <><b>{cam === 'denied' ? t('Camera permission was denied.') : cam === 'error' ? t('Couldn’t start the camera.') : t('Camera scanning isn’t supported in this browser.')}</b>
              <span className="t2">{t('Allow camera access in your browser settings, or pick a photo instead.')}</span></> : t('Starting camera…')}
          </div>
          {cam === 'live' && <button className="cam-btn cam-flip press" aria-label={t('Flip camera')} onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}><Icon name="repeat" size={20} /></button>}
        </div>
        <div className="cam-bar">
          <button className="cam-btn press" aria-label={t('Back')} onClick={pop}><Icon name="chevL" size={24} /></button>
          {failed
            ? <button className="btn primary press" onClick={() => native.current?.click()}><Icon name="camera" size={18} /> {t('Use phone camera')}</button>
            : <button className="cam-shutter press" aria-label={t('Take a photo')} disabled={cam !== 'live' || taken} onClick={shoot}><i /></button>}
          <button className="cam-btn press" aria-label={t('From gallery')} onClick={() => lib.current?.click()}><Icon name="upload" size={22} /></button>
        </div>
        <input ref={lib} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) hand(f); }} />
        <input ref={native} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) hand(f); }} />
      </div>
    </Sheet>
  );
}
