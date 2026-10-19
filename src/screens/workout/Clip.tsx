import { memo, useEffect, useRef } from 'react';
import type { Exercise } from '../../lib/types';

/**
 * Rendered exercise clips: a muscled body doing the movement, the worked muscles lit (our own renders, Z-Anatomy CC BY-SA 4.0
 * based). One seamless rep that loops. Light on the phone: a ~200 KB webm (mp4 for anything without VP9), fetched only when
 * the page opens (the browser keeps it after that), and playing only while it's on screen and the app is in view.
 * Reduced motion: the first frame stands still.
 */
// The take is in the file name (`<id>.r15`), so a re-rendered clip is a new file: phones fetch it instead of the old cached one.
const CLIPS: Record<string, string> = {
  'barbell-curl': 'figures/barbell-curl.r18',   // hands locked on the bar (they slid 8 cm in r15), anti-aliased glow edge
  'ez-bar-curl': 'figures/ez-bar-curl.r1',   // starts mid-lift (f30 of the render) so the poster shows the W of the bar
};

export function clipFor(ex: Exercise | undefined): string | null {
  return (ex && CLIPS[ex.id]) || null;
}

export const Clip = memo(function Clip({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current; if (!v) return;
    const reduce = document.documentElement.dataset.motion === 'reduce'
      || (document.documentElement.dataset.motion !== 'full' && matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (reduce) return;
    let seen = false;
    const sync = () => { if (seen && !document.hidden) v.play().catch(() => {}); else v.pause(); };
    const io = new IntersectionObserver(([e]) => { seen = e.isIntersecting; sync(); }, { threshold: 0.15 });
    io.observe(v);
    document.addEventListener('visibilitychange', sync);
    return () => { io.disconnect(); document.removeEventListener('visibilitychange', sync); v.pause(); };
  }, [src]);
  return (
    <video ref={ref} className="exd-clip" poster={`${src}.jpg`} muted loop playsInline preload="metadata"
      disablePictureInPicture disableRemotePlayback aria-hidden>
      <source src={`${src}.webm`} type="video/webm; codecs=vp9" />
      <source src={`${src}.mp4`} type="video/mp4" />
    </video>
  );
});
