import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useIsPresent } from 'motion/react';
import { useUI, haptic } from '../state/ui';
import { useStore } from '../state/store';
import { useT, useLang } from '../lib/i18n';
import { Sheet } from '../ui/Sheet';
import { Icon } from '../ui/Icon';
import { cameraSupported, downscale } from '../lib/photos';
import { aiErrorText } from '../lib/gemini';
import { fmtNum } from '../lib/units';
import { Scan, ScanStage } from './food/PhotoScan';
import { CamResults } from './food/CamResults';
import { readPhoto, logReadItems, type ReadItem } from './food/photoRead';

type Cam = 'starting' | 'live' | 'denied' | 'unsupported' | 'error';
type Phase = 'live' | 'reading' | 'result' | 'error';
type Props = {
  /** the shot goes here, the pop-up closes (the Coach's image send) */
  onShot?: (f: File) => void;
  /** or: Food. The shot stays in this same pop-up: it is read here (the light wave) and turns into the result, with its Log button */
  food?: { date: string; mealId: string };
};

/**
 * The in-app camera: a live preview in a pop-up, a big shutter, Close, the gallery and Flip. Same camera code path as the barcode
 * scanner (getUserMedia, the picture fades in on its first frame). The shot is handed on as a File (the Coach's image send), or, for Food,
 * it stays in this pop-up: the frozen photo is read here (a wave of light, never shorter than a calm minimum) and then turns into the
 * result on the same surface (the photo glides to its place, the rows rise in). Black in both themes: a camera is neutral.
 */
export function CameraSheet({ props }: { props: Props }) {
  const t = useT();
  const lang = useLang();
  const pop = useUI((u) => u.pop);
  const video = useRef<HTMLVideoElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const flash = useRef<HTMLDivElement>(null);
  const still = useRef<HTMLCanvasElement>(null);
  const lib = useRef<HTMLInputElement>(null);
  const native = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  const taken = useRef(false);
  const stream = useRef<MediaStream | null>(null);
  const ctl = useRef<AbortController | null>(null);
  const [cam, setCam] = useState<Cam>(cameraSupported() ? 'starting' : 'unsupported');
  const [shown, setShown] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const flipping = useRef(false); // a flip or a retake: the held frame dips away, then the new picture comes in
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [epoch, setEpoch] = useState(0); // a retake starts the camera again

  const food = props.food;
  const meals = useStore((s) => s.settings.meals);
  const look = useStore((s) => s.settings.scanLook) ?? 'C';
  const meal = food ? meals.find((m) => m.id === food.mealId) ?? meals[0] : undefined;
  const [phase, setPhase] = useState<Phase>('live');
  const [snap, setSnap] = useState<string | null>(null); // the shot, for the light wave's brighter copy
  const [items, setItems] = useState<ReadItem[]>([]);
  const [assume, setAssume] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [noFood, setNoFood] = useState(false); // the AI looked and found no food: a helpful empty state, not an error line

  // false the moment the pop-up starts to leave (Back, a swipe, the phone's back gesture), though it stays on screen while it slides away
  const present = useIsPresent();
  useEffect(() => { alive.current = present; return () => { alive.current = false; }; }, [present]);
  useEffect(() => () => { ctl.current?.abort(); }, []);
  useEffect(() => () => { if (snap) URL.revokeObjectURL(snap); }, [snap]);

  useEffect(() => {
    if (!cameraSupported()) return;
    let st: MediaStream | null = null; let stopped = false;
    const flip = !!still.current && still.current.dataset.on === '1'; // a flip or a retake: the last frame is held under the new picture
    if (!flip) { setShown(false); setCam('starting'); }
    (async () => {
      try {
        st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
        stream.current = st;
        for (let i = 0; i < 60 && !video.current && !stopped; i++) await new Promise((r) => requestAnimationFrame(r)); // the sheet puts its contents in a couple of frames in
        if (stopped) { st.getTracks().forEach((x) => x.stop()); return; }
        const v = video.current!;
        v.style.transform = facing === 'user' ? 'scaleX(-1)' : ''; // the front camera is a mirror, as in every camera app
        v.srcObject = st; await v.play();
        setCam('live');
        const ready = () => {
          if (stopped) return;
          setShown(true);
          const s = still.current;
          if (s) { s.dataset.on = '0'; if (s.style.opacity !== '0') { s.style.transition = 'opacity 260ms var(--ease-out)'; s.style.opacity = '0'; } } // a retake: the held photo gives way to the live picture
          window.setTimeout(() => { flipping.current = false; }, 400);
        };
        const rvfc = (v as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number }).requestVideoFrameCallback;
        if (rvfc) rvfc.call(v, ready);
        else if (v.readyState >= 2) ready(); else v.addEventListener('loadeddata', ready, { once: true });
      } catch (e: any) { if (!stopped) setCam(e?.name === 'NotAllowedError' ? 'denied' : 'error'); }
    })();
    return () => { stopped = true; st?.getTracks().forEach((x) => x.stop()); };
  }, [facing, epoch]);

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

  /** Food: read the shot here. The wait is the light wave; an answer turns into the result, an error stays on the photo. */
  const startRead = async (raw: Blob) => {
    setErr(null); setNoFood(false); setItems([]);
    setSnap(URL.createObjectURL(raw));
    setPhase('reading');
    ctl.current?.abort(); const c = ctl.current = new AbortController();
    try {
      const small = await downscale(new File([raw], 'photo.jpg', { type: 'image/jpeg' }), 1024);
      const r = await readPhoto(small, lang, '', c.signal);
      if (c.signal.aborted || !alive.current) return;
      setItems(r.items); setAssume(r.assume);
      haptic('light');
      setPhase('result');
      stream.current?.getTracks().forEach((x) => x.stop()); // the camera light goes off while the result is shown
    } catch (e: any) {
      if (c.signal.aborted || !alive.current) return;
      setNoFood(e?.code === 'invalid');
      setErr(e?.code === 'invalid' ? t('That doesn’t look like food. Try another photo.') : aiErrorText(e, t));
      setPhase('error');
    }
  };

  const hand = (f: File) => {
    if (!alive.current) return; // Back or a swipe came first: nothing is handed over, nothing underneath is closed
    if (food) { void startRead(f); return; }
    wrap.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' }); // only the captured photo is ever seen as the sheet closes
    pop(); props.onShot?.(f);
  };

  /** a photo from the gallery, in the camera's place: it fades in over the preview */
  const fromGallery = async (f: File) => {
    const s = still.current, p = panel.current, v = video.current;
    if (!food || !s || !p) { hand(f); return; }
    try {
      const bmp = await createImageBitmap(f);
      const pw = p.clientWidth, ph = p.clientHeight, k = Math.max(pw / bmp.width, ph / bmp.height), sw = pw / k, sh = ph / k, out = Math.min(1, 1600 / Math.max(sw, sh));
      s.width = Math.round(sw * out); s.height = Math.round(sh * out);
      s.getContext('2d')!.drawImage(bmp, (bmp.width - sw) / 2, (bmp.height - sh) / 2, sw, sh, 0, 0, s.width, s.height); bmp.close?.();
      taken.current = true; v?.pause();
      s.style.transition = 'none'; s.style.opacity = '0'; s.dataset.on = '1'; void s.offsetWidth; s.style.transition = 'opacity 300ms var(--ease-out)'; s.style.opacity = '1';
      hand(f);
    } catch { hand(f); }
  };

  const shoot = async () => {
    const v = video.current, p = panel.current;
    if (!v || !p || !v.videoWidth || taken.current || cam !== 'live') return;
    taken.current = true; haptic('light');
    const c = cut(v, p, 1600);
    v.pause(); // the frame freezes under the flash
    const s = still.current;
    if (food && s) { s.width = c.width; s.height = c.height; s.getContext('2d')!.drawImage(c, 0, 0); s.style.transition = 'none'; s.style.opacity = '1'; s.dataset.on = '1'; } // the same pixels, so the camera can switch off later
    const hold = flash.current!.animate([{ opacity: 0 }, { opacity: 0.17, offset: 0.25 }, { opacity: 0 }], { duration: 260, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.9));
    try { await Promise.all([hold.finished, new Promise((r) => setTimeout(r, 0))]); } catch { return; } // cancelled: the pop-up is gone
    if (!alive.current) return;
    if (!blob) { taken.current = false; if (s) { s.dataset.on = '0'; s.style.opacity = '0'; } v.play().catch(() => {}); return; } // nothing came out: the preview runs again
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

  /** back to the camera: the photo glides back out, the camera starts again under it */
  const retake = () => {
    ctl.current?.abort(); taken.current = false; flipping.current = true;
    setItems([]); setErr(null); setNoFood(false); setShown(false); setPhase('live');
    setEpoch((e) => e + 1);
  };

  const failed = cam === 'denied' || cam === 'error' || cam === 'unsupported';
  const live = cam === 'live';
  const chosen = items.filter((x) => x.on);
  const total = chosen.reduce((n, x) => n + x.kcal * x.k, 0);
  const done = phase === 'result';
  const photoTo = done ? { x: 16, y: 64, scale: 0.22, opacity: 0 } : { x: 0, y: 0, scale: 1, opacity: 1 }; // the photo glides to its place; a still thumbnail takes over at the end

  return (
    <Sheet onClose={pop} size="full" label={t('Camera')} z={110} cam>
      <div ref={wrap} className="cam-wrap" data-phase={phase}>
        <ScanStage depth={!!food && look === 'C'} busy={phase === 'reading'} fill>
          <div ref={panel} className="cam-panel">
            <AnimatePresence>{done && snap && <motion.img key="thumb" className="cam-thumb" src={snap} alt="" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16, delay: 0.4 }} />}</AnimatePresence>
            <motion.div className="cam-photo" style={{ transformOrigin: '0 0' }} animate={photoTo} transition={{ type: 'spring', stiffness: 220, damping: 28, delay: done ? 0.08 : 0, opacity: { duration: 0.16, delay: done ? 0.54 : 0 } }}>
              {!failed && <video ref={video} playsInline muted className="cam-video" style={{ opacity: shown ? 1 : 0, transition: shown ? (flipping.current ? 'opacity 160ms var(--ease-out) 100ms' : 'opacity 420ms var(--ease-out) 180ms') : 'none' }} />}
              <canvas ref={still} className="cam-still" aria-hidden style={{ opacity: 0 }} />
            </motion.div>
            <div ref={flash} className="cam-flash" aria-hidden />
            <div className="small cam-msg" aria-hidden={shown || failed || undefined} style={{ opacity: !failed && (shown || flipping.current) ? 0 : 1 }}>
              {failed ? <><b>{cam === 'denied' ? t('Camera permission was denied.') : cam === 'error' ? t('Couldn’t start the camera.') : t('The camera isn’t available here.')}</b>
                <span className="cam-why">{cam === 'denied' ? t('Give Aven camera access in your phone’s settings, or pick a photo instead.') : cam === 'error' ? t('Another app may be using the camera. Use the phone’s camera or pick a photo.') : ''}</span></> : t('Starting camera…')}
            </div>
            <AnimatePresence>{phase === 'reading' && snap && <Scan key="scan" src={snap} v={look} />}</AnimatePresence>
            <AnimatePresence>
              {done && <motion.div key="res" className="cam-res" exit={{ opacity: 0, transition: { duration: 0.3 } }}><CamResults items={items} setItems={setItems} assume={assume} base={0.32} /></motion.div>}
            </AnimatePresence>
            <div className="cam-dim" aria-hidden />
            <AnimatePresence>
              {phase === 'error' && <motion.div key="err" className="cam-err" role="alert" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8, transition: { duration: 0.2 } }} transition={{ type: 'spring', stiffness: 220, damping: 28, delay: 0.12 }}>
                <span className="cam-err-ic"><Icon name="scan" size={24} /></span>
                <b className="cam-err-t">{noFood ? t('No food found') : t('Couldn’t read that')}</b>
                <span className="cam-err-s">{noFood ? t('Point at a plate, a bowl or a snack and keep it in the frame.') : err}</span>
                {noFood && <span className="cam-err-tips">{t('Fill the frame')} · {t('Good light')} · {t('One plate')}</span>}
              </motion.div>}
            </AnimatePresence>
            <button className="cam-btn cam-x press" aria-label={t('Close')} onClick={pop}><Icon name="close" size={20} /></button>
          </div>
        </ScanStage>
        <div className="cam-bar">
          <div className="cam-bar-live">
            <button className="cam-btn press" aria-label={t('From gallery')} onClick={() => lib.current?.click()}><Icon name="upload" size={22} /></button>
            {failed
              ? <button className="btn primary press" onClick={() => native.current?.click()}><Icon name="camera" size={18} /> {t('Use phone camera')}</button>
              : <button className={`cam-shutter press${live ? '' : ' wait'}`} aria-label={t('Take a photo')} aria-disabled={!live} onClick={shoot}><i /></button>}
            {failed ? <span className="cam-btn-gap" aria-hidden /> : <button className="cam-btn press" aria-label={t('Flip camera')} aria-disabled={!live} style={{ opacity: live ? 1 : 0, pointerEvents: live ? 'auto' : 'none' }} onClick={flipCam}><Icon name="repeat" size={22} /></button>}
          </div>
          {food && (
            <div className="cam-bar-res">
              {phase === 'error'
                ? <><button className="cam-btn press" aria-label={t('Choose a photo')} onClick={() => lib.current?.click()}><Icon name="upload" size={22} /></button>
                  <button className="cam-try press grow" onClick={retake}><Icon name="camera" size={18} /> {t('Try again')}</button></>
                : <button className="cam-btn press" aria-label={t('Retake')} onClick={retake}><Icon name="camera" size={22} /></button>}
              {phase === 'result' && meal && <button className="btn primary block press grow" disabled={!chosen.length} onClick={() => logReadItems(items, assume, food.date, meal, lang, t)}>{t(chosen.length === 1 ? 'Log 1 item' : 'Log {n} items', { n: chosen.length })} · {fmtNum(Math.round(total), lang, 0)} kcal</button>}
            </div>
          )}
        </div>
        <input ref={lib} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void fromGallery(f); }} />
        <input ref={native} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void fromGallery(f); }} />
      </div>
    </Sheet>
  );
}
