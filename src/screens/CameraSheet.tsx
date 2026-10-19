import { useEffect, useRef, useState } from 'react';
import { useIsPresent } from 'motion/react';
import { useUI, haptic, type OverlayType } from '../state/ui';
import { useT } from '../lib/i18n';
import { Sheet } from '../ui/Sheet';
import { Icon } from '../ui/Icon';
import { cameraSupported } from '../lib/photos';

type Cam = 'starting' | 'live' | 'denied' | 'unsupported' | 'error';
type Props = {
  /** the shot goes here, the pop-up closes (the Coach's image send) */
  onShot?: (f: File) => void;
  /** or: the pop-up is replaced by this one, which gets the shot (Food: "Snap your plate", with the photo already in it) */
  open?: (f: File) => [OverlayType, any];
};

/**
 * The in-app camera: a live preview in a pop-up, a big shutter, Close, the gallery and Flip. Same camera code path as the barcode
 * scanner (getUserMedia, the picture fades in on its first frame). The shot is handed on as a File, exactly what the old photo
 * picker gave, so Food's photo lookup and the Coach's image send need no changes. Black in both themes: a camera is neutral.
 */
export function CameraSheet({ props }: { props: Props }) {
  const t = useT();
  const pop = useUI((u) => u.pop);
  const video = useRef<HTMLVideoElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const flash = useRef<HTMLDivElement>(null);
  const still = useRef<HTMLCanvasElement>(null);
  const lib = useRef<HTMLInputElement>(null);
  const native = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  const taken = useRef(false);
  const [cam, setCam] = useState<Cam>(cameraSupported() ? 'starting' : 'unsupported');
  const [shown, setShown] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const flipping = useRef(false); // a flip: the held frame dips to the sheet's black, then the new picture comes in
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');

  // false the moment the pop-up starts to leave (Back, a swipe, the phone's back gesture), though it stays on screen while it slides away
  const present = useIsPresent();
  useEffect(() => { alive.current = present; return () => { alive.current = false; }; }, [present]);

  useEffect(() => {
    if (!cameraSupported()) return;
    let stream: MediaStream | null = null; let stopped = false;
    const flip = !!still.current && still.current.dataset.on === '1'; // a flip: the last frame is held under the new picture
    if (!flip) { setShown(false); setCam('starting'); }
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
        for (let i = 0; i < 60 && !video.current && !stopped; i++) await new Promise((r) => requestAnimationFrame(r)); // the sheet puts its contents in a couple of frames in
        if (stopped) { stream.getTracks().forEach((x) => x.stop()); return; }
        const v = video.current!;
        v.style.transform = facing === 'user' ? 'scaleX(-1)' : ''; // the front camera is a mirror, as in every camera app
        v.srcObject = stream; await v.play();
        setCam('live');
        const ready = () => {
          if (stopped) return;
          setShown(true);
          const s = still.current; if (s) s.dataset.on = '0';
          window.setTimeout(() => { flipping.current = false; }, 400);
        };
        const rvfc = (v as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number }).requestVideoFrameCallback;
        if (rvfc) rvfc.call(v, ready);
        else if (v.readyState >= 2) ready(); else v.addEventListener('loadeddata', ready, { once: true });
      } catch (e: any) { if (!stopped) setCam(e?.name === 'NotAllowedError' ? 'denied' : 'error'); }
    })();
    return () => { stopped = true; stream?.getTracks().forEach((x) => x.stop()); };
  }, [facing]);

  /** what the preview shows (object-fit: cover), cut from the video's frame */
  const cut = (v: HTMLVideoElement, p: HTMLElement, max: number) => {
    const pw = p.clientWidth, ph = p.clientHeight, vw = v.videoWidth, vh = v.videoHeight;
    const k = Math.max(pw / vw, ph / vh), sw = pw / k, sh = ph / k, out = Math.min(1, max / Math.max(sw, sh));
    const c = document.createElement('canvas'); c.width = Math.round(sw * out); c.height = Math.round(sh * out);
    const g = c.getContext('2d')!;
    if (facing === 'user') { g.translate(c.width, 0); g.scale(-1, 1); }
    g.drawImage(v, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, c.width, c.height);
    return c;
  };

  const hand = (f: File) => {
    if (!alive.current) return; // Back or a swipe came first: nothing is handed over, nothing underneath is closed
    wrap.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' }); // only the captured photo is ever seen as the next sheet rises
    if (props.open) { const [type, p] = props.open(f); useUI.getState().swap(1, type, p); }
    else { pop(); props.onShot?.(f); }
  };

  const shoot = async () => {
    const v = video.current, p = panel.current;
    if (!v || !p || !v.videoWidth || taken.current || cam !== 'live') return;
    taken.current = true; haptic('light');
    const c = cut(v, p, 1600);
    v.pause(); // the frame freezes under the flash; the pop-up closes over that still
    const hold = flash.current!.animate([{ opacity: 0 }, { opacity: 0.17, offset: 0.25 }, { opacity: 0 }], { duration: 260, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.9));
    try { await Promise.all([hold.finished, new Promise((r) => setTimeout(r, 0))]); } catch { return; } // cancelled: the pop-up is gone
    if (!alive.current) return;
    if (!blob) { taken.current = false; v.play().catch(() => {}); return; } // nothing came out: the preview runs again
    hand(new File([blob], 'photo.jpg', { type: 'image/jpeg' }));
  };

  const flipCam = () => {
    const v = video.current, p = panel.current, s = still.current;
    if (!v || !p || !s || cam !== 'live' || taken.current) return;
    const c = cut(v, p, 1000); // hold the current picture, then the new one fades in over it (never a cut to black)
    s.width = c.width; s.height = c.height; s.getContext('2d')!.drawImage(c, 0, 0);
    s.style.transition = 'none'; s.style.opacity = '1'; s.dataset.on = '1';
    void s.offsetWidth; s.style.transition = 'opacity 100ms cubic-bezier(0.4, 0, 1, 1)'; s.style.opacity = '0'; // the held frame dips to the sheet's black; the two pictures are never seen together
    flipping.current = true; setShown(false);
    setFacing((f) => (f === 'environment' ? 'user' : 'environment'));
  };

  const failed = cam === 'denied' || cam === 'error' || cam === 'unsupported';
  const live = cam === 'live';

  return (
    <Sheet onClose={pop} size="full" label={t('Camera')} z={110} cam>
      <div ref={wrap} className="cam-wrap">
        <div ref={panel} className="cam-panel">
          {!failed && <video ref={video} playsInline muted className="cam-video" style={{ opacity: shown ? 1 : 0, transition: shown ? (flipping.current ? 'opacity 160ms var(--ease-out) 100ms' : 'opacity 420ms var(--ease-out) 180ms') : 'none' }} />}
          <canvas ref={still} className="cam-still" aria-hidden style={{ opacity: 0 }} />
          <div ref={flash} className="cam-flash" aria-hidden />
          <div className="small cam-msg" aria-hidden={shown || failed || undefined} style={{ opacity: !failed && (shown || flipping.current) ? 0 : 1 }}>
            {failed ? <><b>{cam === 'denied' ? t('Camera permission was denied.') : cam === 'error' ? t('Couldn’t start the camera.') : t('The camera isn’t available here.')}</b>
              <span className="cam-why">{cam === 'denied' ? t('Give Aven camera access in your phone’s settings, or pick a photo instead.') : cam === 'error' ? t('Another app may be using the camera. Use the phone’s camera or pick a photo.') : ''}</span></> : t('Starting camera…')}
          </div>
          <button className="cam-btn cam-x press" aria-label={t('Close')} onClick={pop}><Icon name="close" size={20} /></button>
        </div>
        <div className="cam-bar">
          <button className="cam-btn press" aria-label={t('From gallery')} onClick={() => lib.current?.click()}><Icon name="upload" size={22} /></button>
          {failed
            ? <button className="btn primary press" onClick={() => native.current?.click()}><Icon name="camera" size={18} /> {t('Use phone camera')}</button>
            : <button className={`cam-shutter press${live ? '' : ' wait'}`} aria-label={t('Take a photo')} aria-disabled={!live} onClick={shoot}><i /></button>}
          {failed ? <span className="cam-btn-gap" aria-hidden /> : <button className="cam-btn press" aria-label={t('Flip camera')} aria-disabled={!live} style={{ opacity: live ? 1 : 0, pointerEvents: live ? 'auto' : 'none' }} onClick={flipCam}><Icon name="repeat" size={22} /></button>}
        </div>
        <input ref={lib} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) hand(f); }} />
        <input ref={native} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) hand(f); }} />
      </div>
    </Sheet>
  );
}
