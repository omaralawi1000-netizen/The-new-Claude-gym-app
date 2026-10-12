import { memo, useEffect, useId, useLayoutEffect, useRef } from 'react';
import type { Exercise, MuscleGroup } from '../../lib/types';

/**
 * Aven's own moving figures: a calm side-view body doing the movement, the muscles it works glowing in the area's accent.
 * The body is sculpted (tapered limbs with a little muscle shape, hands, feet, neck and head), lit like a rounded form:
 * each limb is brighter down its middle and falls off to its edges, with a faint rim so it stands off a dark background.
 *
 * It is built from limbs nested at their joints (hip → torso → shoulder → arm → forearm, hip → thigh → shin), so a pose is
 * a handful of joint angles and a rep is each joint turning between two poses. Each limb is drawn once (a small static
 * SVG) and only turned by a browser-run transform animation (compositor, full refresh rate, nothing per frame on the
 * page), and only the figure on the page you're looking at moves.
 *
 * Angles are where a limb points: 0 = straight down, 90 = forward (the figure faces right), 180 = up, 270 = back.
 */

type Pose = { torso: number; arm: number; fore: number; thigh: number; shin: number };
type Kind = 'press' | 'row' | 'curl';
type Spec = {
  a: Pose; b: Pose;   // the start and the end of a rep
  bench?: boolean;    // lying on a bench (under the torso)
  load: 'bar' | 'db'; // what the hands hold
};

// one calm rep: the lift (1.05 s), a beat at the top, the slower way back
const REP_MS = 2800;
const OFFS = [0, 0.38, 0.5, 1];

const SPECS: Record<Kind, Spec> = {
  // lying on a bench, head to the left, the bar pressed from the chest to straight arms
  press: { bench: true, load: 'bar',
    a: { torso: 270, arm: 58, fore: 192, thigh: 76, shin: 6 },
    b: { torso: 270, arm: 180, fore: 180, thigh: 76, shin: 6 } },
  // hinged forward with a flat back, the bar rowed from hanging arms to the lower ribs; the back lifts a touch as it pulls
  row: { load: 'bar',
    a: { torso: 126, arm: 2, fore: 0, thigh: 16, shin: -8 },
    b: { torso: 121, arm: -64, fore: 14, thigh: 17, shin: -8 } },
  // standing tall, the dumbbell curled from a straight arm to the shoulder; the body leans back a little at the top
  curl: { load: 'db',
    a: { torso: 180, arm: 2, fore: 4, thigh: 2, shin: 0 },
    b: { torso: 176, arm: 14, fore: 150, thigh: 2, shin: 0 } },
};

/** Which figure an exercise shows (null: none yet, the muscle picture stays). */
export function figureFor(ex: Exercise | undefined): Kind | null {
  if (!ex) return null;
  const id = ex.id, n = ex.name.toLowerCase();
  if (/leg|wrist|nordic/.test(id) || /leg curl|wrist/.test(n)) return null;
  if (/curl/.test(id) || /\bcurl\b/.test(n)) return 'curl';
  if (/^(barbell-row|pendlay-row|tbar-row|smith-row|one-arm-db-row)$/.test(id)) return 'row';
  if (/(bench|chest-press|floor-press)/.test(id) && !/dip/.test(id)) return 'press';
  return null;
}

type Seg = 'torso' | 'arm' | 'fore' | 'thigh' | 'shin';
// limb lengths (joint to joint)
const L: Record<Seg, number> = { torso: 70, arm: 38, fore: 35, thigh: 50, shin: 47 };

// the figure's own box; the stage scales it to fit (see Figure below)
const W = 300, H = 200;

// CSS turns for each joint, from where the limbs point (see the note at the top). The torso is drawn pointing up from the
// hip and every other limb pointing down from its joint; arms and legs both hang inside the torso (so the near leg can
// sit in front of the body and the near arm in front of the leg), each turning by the difference to its parent.
const css = (p: Pose) => ({
  torso: 180 - p.torso,
  arm: p.torso - p.arm - 180,
  fore: p.arm - p.fore,
  thigh: p.torso - p.thigh - 180,
  shin: p.thigh - p.shin,
});

// where a limb pointing at angle a goes, on screen (y down)
const dir = (a: number): [number, number] => [Math.sin((a * Math.PI) / 180), Math.cos((a * Math.PI) / 180)];
const add = (p: [number, number], a: number, len: number): [number, number] => { const d = dir(a); return [p[0] + d[0] * len, p[1] + d[1] * len]; };

/** Where everything sits for a pose (hip at 0,0): used once to fit the figure in its box, stand it on the floor, place the bench. */
function joints(p: Pose) {
  const hip: [number, number] = [0, 0];
  const shoulder = add(hip, p.torso, L.torso);
  const head = add(shoulder, p.torso, 26);
  const elbow = add(shoulder, p.arm, L.arm);
  const hand = add(add(elbow, p.fore, L.fore), p.fore, 5);
  const knee = add(hip, p.thigh, L.thigh);
  const ankle = add(knee, p.shin, L.shin);
  const toe = add(ankle, p.shin + 90, 19);
  return { hip, shoulder, head, elbow, hand, knee, ankle, toe };
}

function layout(spec: Spec) {
  const A = joints(spec.a), B = joints(spec.b);
  const r = spec.load === 'bar' ? 19 : 10;
  const floor = Math.max(A.ankle[1], A.toe[1]) + 7;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity;
  const take = (pt: [number, number], m: number) => { x0 = Math.min(x0, pt[0] - m); x1 = Math.max(x1, pt[0] + m); y0 = Math.min(y0, pt[1] - m); };
  for (const J of [A, B]) {
    take(J.head, 14); take(J.hand, r + 1); take(J.elbow, 9); take(J.shoulder, 12); take(J.knee, 11); take(J.toe, 3); take([J.ankle[0] - 7, J.ankle[1]], 1); take(J.hip, 16);
  }
  const bench = spec.bench ? { x: A.head[0] - 6, w: 16 - (A.head[0] - 6), y: 14 } : null;
  if (bench) { x0 = Math.min(x0, bench.x); x1 = Math.max(x1, bench.x + bench.w); }
  const h = floor + 4 - y0, w = x1 - x0;
  const k = Math.min(1, (H - 12) / h, (W - 16) / w);
  // centred across, standing on the box's floor
  const tx = W / 2 - ((x0 + x1) / 2) * k, ty = H - 6 - (floor + 4) * k;
  return { k, tx, ty, floor, bench };
}

/**
 * The silhouette of each limb, in that limb's own frame (px from its joint, +y along the limb, +x its front: the way the
 * figure faces when it stands with its arms down; the torso is drawn upwards, so its y is negative). A limb is a soft
 * taper between its two joints, a little fuller where its muscle is.
 */
function limbPath(len: number, back: [number, number, number], front: [number, number, number]) {
  const [b0, bm, b1] = back, [f0, fm, f1] = front;
  const c = 1.12, r0 = (b0 + f0) / 2, r1 = (b1 + f1) / 2;
  return `M ${-b0} 0 C ${-bm * c} ${len * 0.3} ${-bm * c} ${len * 0.62} ${-b1} ${len} A ${r1} ${r1} 0 0 0 ${f1} ${len}`
    + ` C ${fm * c} ${len * 0.62} ${fm * c} ${len * 0.3} ${f0} 0 A ${r0} ${r0} 0 0 0 ${-b0} 0 Z`;
}
const SHAPE: Record<Seg, string> = {
  torso: 'M -12 9 C -17 3 -16 -10 -12 -20 C -10 -30 -15 -42 -15 -52 C -15 -64 -11 -74 -2 -77 C 6 -78 10 -74 11 -70'
    + ' C 17 -63 17 -52 13 -46 C 11 -40 11 -30 11 -22 C 11 -12 13 -2 10 6 C 5 13 -6 14 -12 9 Z',
  arm: limbPath(L.arm, [7.8, 8.4, 5.6], [8, 9.4, 5.6]),
  fore: limbPath(L.fore, [5.8, 6.8, 3.9], [5.8, 6.3, 3.9]),
  thigh: limbPath(L.thigh, [10.5, 9.6, 6.2], [10, 10.2, 6.2]),
  shin: limbPath(L.shin, [6.2, 7.6, 4], [5.8, 5.4, 4]),
};
// what hangs off a limb's far end, drawn with it: the neck and head (torso), the hand (forearm), the foot (shin)
const EXTRA: Partial<Record<Seg, string>> = {
  torso: 'M -3 -72 L -2 -83 C -1 -87 7 -87 7 -83 L 8 -72 Z M 4.5 -109 C 12 -109 16 -103 16 -95 C 16 -86 11 -82 5 -82 C -2 -82 -7 -87 -7 -95 C -7 -103 -3 -109 4.5 -109 Z',
  fore: `M 0.4 ${L.fore - 1} C 5 ${L.fore - 1} 5.5 ${L.fore + 4} 4.6 ${L.fore + 8} C 3.8 ${L.fore + 11} -3.6 ${L.fore + 11} -4 ${L.fore + 7} C -4.6 ${L.fore + 3} -3.6 ${L.fore - 1} 0.4 ${L.fore - 1} Z`,
  shin: `M -5 ${L.shin - 3} C -7.5 ${L.shin + 3} -6 ${L.shin + 7} -2 ${L.shin + 7} L 17 ${L.shin + 7} C 21 ${L.shin + 7} 21 ${L.shin + 2} 17 ${L.shin + 1} C 10 ${L.shin - 1} 5 ${L.shin - 4} 3 ${L.shin - 5} Z`,
};

/** The muscles on each limb (an ellipse in the limb's frame, kept inside its outline). The ones the exercise works glow. */
type Part = { m: MuscleGroup; cx: number; cy: number; rx: number; ry: number };
const PARTS: Record<Seg, Part[]> = {
  torso: [
    { m: 'back', cx: -8, cy: -50, rx: 7, ry: 19 },
    { m: 'glutes', cx: -8, cy: -1, rx: 7.5, ry: 9 },
    { m: 'chest', cx: 9, cy: -57, rx: 7, ry: 10 },
    { m: 'core', cx: 7.5, cy: -27, rx: 4.5, ry: 15 },
  ],
  arm: [
    { m: 'triceps', cx: -3.5, cy: 19, rx: 4.2, ry: 12 },
    { m: 'biceps', cx: 3.5, cy: 21, rx: 4.2, ry: 10 },
    { m: 'shoulders', cx: 0.5, cy: 4, rx: 8.5, ry: 10 },
  ],
  fore: [{ m: 'forearms', cx: 0.5, cy: 11, rx: 5, ry: 10 }],
  thigh: [
    { m: 'hamstrings', cx: -4.5, cy: 26, rx: 5.5, ry: 18 },
    { m: 'quads', cx: 4, cy: 24, rx: 6.5, ry: 20 },
  ],
  shin: [{ m: 'calves', cx: -3.5, cy: 16, rx: 4.6, ry: 11 }],
};

export const Figure = memo(function Figure({ ex, kind, active }: { ex?: Exercise; kind: Kind; active: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const anims = useRef<Animation[]>([]);
  const id = useId().replace(/:/g, '');
  const spec = SPECS[kind];
  const fit = layout(spec);
  const muscles = ex?.muscles ?? [];
  const tone = (m: MuscleGroup) => (muscles[0] === m ? 'hot' : muscles.includes(m) ? 'warm' : '');

  // fill the stage: scale to the room it has (measured when it settles, so a set being added doesn't re-scale every frame)
  useLayoutEffect(() => {
    const el = root.current, stage = el?.parentElement;
    if (!el || !stage) return;
    let tm = 0, first = true;
    const apply = () => {
      const s = Math.max(0.6, Math.min(1.5, (stage.clientHeight - 8) / H, (stage.clientWidth - 8) / W));
      el.style.setProperty('--fs', s.toFixed(3));
      if (first) { first = false; requestAnimationFrame(() => el.classList.add('fit')); }
    };
    apply();
    const ro = new ResizeObserver(() => { clearTimeout(tm); tm = window.setTimeout(apply, 220); });
    ro.observe(stage);
    return () => { ro.disconnect(); clearTimeout(tm); };
  }, []);

  useEffect(() => {
    const el = root.current; if (!el) return;
    const a = css(spec.a), b = css(spec.b);
    const reduce = document.documentElement.dataset.motion === 'reduce'
      || (document.documentElement.dataset.motion !== 'full' && matchMedia('(prefers-reduced-motion: reduce)').matches);
    const list: Animation[] = [];
    (Object.keys(a) as Seg[]).forEach((k) => {
      // the near limb and its twin on the far side turn together
      el.querySelectorAll<HTMLElement>(`[data-j="${k}"]`).forEach((node) => {
        node.style.transform = `rotate(${a[k]}deg)`;
        if (reduce || a[k] === b[k]) return;
        const r = (v: number) => ({ transform: `rotate(${v}deg)` });
        list.push(node.animate([
          { ...r(a[k]), offset: OFFS[0], easing: 'cubic-bezier(.42, 0, .3, 1)' },
          { ...r(b[k]), offset: OFFS[1] },
          { ...r(b[k]), offset: OFFS[2], easing: 'cubic-bezier(.45, 0, .35, 1)' },
          { ...r(a[k]), offset: OFFS[3] },
        ], { duration: REP_MS, iterations: Infinity }));
      });
    });
    anims.current = list;
    return () => { list.forEach((x) => x.cancel()); anims.current = []; };
  }, [spec]);
  // only the page you're looking at moves; the others hold their start pose (and cost nothing)
  useEffect(() => {
    for (const x of anims.current) { if (active) x.play(); else { x.pause(); x.currentTime = 0; } }
  }, [active, spec]);

  const draw = (k: Seg, far: boolean, load?: boolean) => {
    const clip = `${id}-${k}${far ? 'f' : ''}`;
    return (
      <svg className="fg-svg" width="1" height="1" aria-hidden>
        <defs><clipPath id={clip}><path d={SHAPE[k]} /></clipPath></defs>
        {EXTRA[k] && <path className="fg-skin" d={EXTRA[k]} fill={`url(#${id}-${far ? 'f' : 'n'})`} />}
        <path className="fg-skin" d={SHAPE[k]} fill={`url(#${id}-${far ? 'f' : 'n'})`} />
        {!far && PARTS[k].filter((pt) => tone(pt.m) === 'hot').map((pt) =>
          <ellipse key={pt.m} cx={pt.cx} cy={pt.cy} rx={pt.rx + 7} ry={pt.ry + 7} fill={`url(#${id}-glow)`} />)}
        <g clipPath={`url(#${clip})`}>
          {PARTS[k].map((pt) => {
            const t = tone(pt.m);
            return <ellipse key={pt.m} className={`fg-m ${t || 'rest'}`} cx={pt.cx} cy={pt.cy} rx={pt.rx} ry={pt.ry}
              fill={t ? `url(#${id}-${t}${far ? 'f' : ''})` : undefined} />;
          })}
        </g>
        {load && (spec.load === 'bar'
          ? <g className="fg-plate"><circle cx={0} cy={L.fore + 5} r={19} /><circle className="hub" cx={0} cy={L.fore + 5} r={2.6} /></g>
          : <g className="fg-plate"><rect x={-11} y={L.fore + 1} width={22} height={8} rx={4} /><circle className="hub" cx={0} cy={L.fore + 5} r={2} /></g>)}
      </svg>
    );
  };
  const limb = (k: Seg, far: boolean, children?: React.ReactNode, load?: boolean, before?: React.ReactNode) => (
    <div className={`fg-j fg-${k}`} data-j={k} style={{ ['--l' as string]: `${L[k]}px` }}>
      {before}
      {draw(k, far, load)}
      {children}
    </div>
  );
  const arm = (far: boolean) => <div className={`fg-top${far ? ' fg-far' : ''}`}>{limb('arm', far, <div className="fg-end">{limb('fore', far, undefined, !far)}</div>)}</div>;
  const leg = (far: boolean) => <div className={far ? 'fg-far' : undefined}>{limb('thigh', far, <div className="fg-end">{limb('shin', far)}</div>)}</div>;
  const bench = fit.bench;
  return (
    <div ref={root} className={`fg fg-${kind}`} aria-hidden>
      {/* the light, shared by every limb: brightest down the middle of a limb, falling off to its edges */}
      <svg className="fg-defs" width="0" height="0" aria-hidden>
        <defs>
          <linearGradient id={`${id}-n`}><stop offset="0" className="s-lo" /><stop offset=".4" className="s-hi" /><stop offset=".74" className="s-mid" /><stop offset="1" className="s-lo" /></linearGradient>
          <linearGradient id={`${id}-f`}><stop offset="0" className="s-flo" /><stop offset=".45" className="s-fhi" /><stop offset="1" className="s-flo" /></linearGradient>
          <radialGradient id={`${id}-hot`} cx=".42" cy=".38" r=".7"><stop offset="0" className="s-hot0" /><stop offset=".55" className="s-hot1" /><stop offset="1" className="s-hot2" /></radialGradient>
          <radialGradient id={`${id}-warm`} cx=".42" cy=".38" r=".7"><stop offset="0" className="s-warm0" /><stop offset="1" className="s-warm1" /></radialGradient>
          <radialGradient id={`${id}-hotf`}><stop offset="0" className="s-hotf0" /><stop offset="1" className="s-hotf1" /></radialGradient>
          <radialGradient id={`${id}-warmf`}><stop offset="0" className="s-warmf0" /><stop offset="1" className="s-warmf1" /></radialGradient>
          <radialGradient id={`${id}-glow`}><stop offset="0" className="s-glow0" /><stop offset="1" className="s-glow1" /></radialGradient>
          <radialGradient id={`${id}-sh`}><stop offset="0" className="s-sh0" /><stop offset="1" className="s-sh1" /></radialGradient>
        </defs>
      </svg>
      <div className="fg-world" style={{ transform: `translate(${fit.tx.toFixed(1)}px, ${fit.ty.toFixed(1)}px) scale(${fit.k.toFixed(3)})` }}>
        {/* the floor, a soft shadow where the body meets it, and the bench */}
        <svg className="fg-svg" width="1" height="1" aria-hidden>
          <ellipse cx={bench ? bench.x + bench.w / 2 + 20 : 4} cy={fit.floor} rx={bench ? bench.w / 2 + 40 : 34} ry={5} fill={`url(#${id}-sh)`} />
          <path className="fg-floor" d={`M ${-150} ${fit.floor} H ${150}`} />
          {bench && <g className="fg-bench">
            <rect className="leg" x={bench.x + 10} y={bench.y + 6} width={4} height={fit.floor - bench.y - 6} rx={2} />
            <rect className="leg" x={bench.x + bench.w - 14} y={bench.y + 6} width={4} height={fit.floor - bench.y - 6} rx={2} />
            <rect className="pad" x={bench.x} y={bench.y} width={bench.w} height={9} rx={4.5} />
          </g>}
        </svg>
        <div className="fg-hip">
          {/* back to front: far arm and leg in shade, the body, the near leg, the near arm (with what it holds) */}
          {limb('torso', false, <>{leg(false)}{arm(false)}</>, false, <>{arm(true)}{leg(true)}</>)}
        </div>
      </div>
    </div>
  );
});
