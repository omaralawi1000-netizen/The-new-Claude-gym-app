import { memo, useEffect, useRef } from 'react';
import type { Exercise, MuscleGroup } from '../../lib/types';

/**
 * Aven's own moving figures: a calm side-view figure doing the movement, the muscles it works glowing in the area's
 * accent. Built from rounded limbs nested at their joints (hip → torso → shoulder → arm → forearm, hip → thigh → shin), so
 * a pose is a handful of joint angles and a rep is each joint turning between two poses. Every limb turns with a
 * browser-run transform animation (compositor, full refresh rate, nothing per frame on the page), and only the figure on
 * the page you're looking at moves.
 *
 * Angles are where a limb points: 0 = straight down, 90 = forward (the figure faces right), 180 = up, 270 = back.
 */

type Pose = { torso: number; arm: number; fore: number; thigh: number; shin: number };
type Kind = 'press' | 'row' | 'curl';
type Spec = {
  hip: [number, number];            // where the hip sits on the 240 × 170 stage
  floor: number;                    // where the feet stand
  a: Pose; b: Pose;                 // the start and the end of a rep
  bench?: [number, number, number]; // x, y, width of a bench under the figure
  load: 'bar' | 'db';               // what the hands hold
};

// one calm rep: the lift (1.05 s), a beat at the top, the slower way back
const REP_MS = 2800;
const OFFS = [0, 0.38, 0.5, 1];

const SPECS: Record<Kind, Spec> = {
  // lying on a bench, head to the left, the bar pressed from the chest to straight arms
  press: { hip: [158, 108], floor: 150, bench: [84, 120, 96], load: 'bar',
    a: { torso: 270, arm: 62, fore: 196, thigh: 78, shin: 4 },
    b: { torso: 270, arm: 180, fore: 180, thigh: 78, shin: 4 } },
  // hinged forward with a flat back, the bar rowed from hanging arms to the lower ribs
  row: { hip: [100, 82], floor: 152, load: 'bar',
    a: { torso: 128, arm: 2, fore: 0, thigh: 14, shin: -8 },
    b: { torso: 128, arm: -62, fore: 12, thigh: 14, shin: -8 } },
  // standing tall, the dumbbell curled from a straight arm to the shoulder
  curl: { hip: [110, 88], floor: 158, load: 'db',
    a: { torso: 180, arm: 2, fore: 4, thigh: 2, shin: 0 },
    b: { torso: 180, arm: 12, fore: 152, thigh: 2, shin: 0 } },
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

// limb sizes (px): length, thickness
const L = { torso: [52, 25], arm: [27, 11], fore: [26, 8.5], thigh: [36, 14], shin: [34, 10.5] } as const;

// CSS turns for each joint, from where the limbs point (see the note at the top): the torso is drawn pointing up from the
// hip, every other limb pointing down from its joint, and each turns inside its parent
const css = (p: Pose) => ({
  torso: 180 - p.torso,
  arm: p.torso - p.arm - 180,
  fore: p.arm - p.fore,
  thigh: -p.thigh,
  shin: p.thigh - p.shin,
});

type Seg = 'torso' | 'arm' | 'fore' | 'thigh' | 'shin';

/**
 * The muscles drawn on each limb, in that limb's own frame (px from its joint; +x is the limb's front, the way the figure
 * faces when it stands with arms down; the torso is drawn upwards so its y is negative). Each one rounds the body out a
 * little; the ones the exercise works glow: the main one in the full accent, the others softer.
 */
type Part = { m: MuscleGroup; x: number; w: number; y0: number; y1: number };
const PARTS: Record<Seg, Part[]> = {
  torso: [
    { m: 'back', x: -5, w: 17, y0: -51, y1: -16 },
    { m: 'glutes', x: -6, w: 18, y0: -10, y1: 10 },
    { m: 'chest', x: 5, w: 19, y0: -52, y1: -30 },
    { m: 'core', x: 5, w: 13, y0: -31, y1: -5 },
  ],
  arm: [
    { m: 'triceps', x: -2, w: 7, y0: 4, y1: 25 },
    { m: 'biceps', x: 2, w: 7, y0: 6, y1: 23 },
    { m: 'shoulders', x: 0, w: 15, y0: -7, y1: 10 },
  ],
  fore: [{ m: 'forearms', x: 0, w: 8.5, y0: -3, y1: 17 }],
  thigh: [
    { m: 'hamstrings', x: -3, w: 10, y0: 5, y1: 33 },
    { m: 'quads', x: 3, w: 11, y0: 3, y1: 33 },
  ],
  shin: [{ m: 'calves', x: -2, w: 8, y0: 3, y1: 19 }],
};

export const Figure = memo(function Figure({ ex, kind, active }: { ex?: Exercise; kind: Kind; active: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const anims = useRef<Animation[]>([]);
  const spec = SPECS[kind];
  const muscles = ex?.muscles ?? [];
  const tone = (m: MuscleGroup) => (muscles[0] === m ? 'hot' : muscles.includes(m) ? 'warm' : '');

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

  const limb = (k: Seg, children?: React.ReactNode, before?: React.ReactNode) => (
    <div className={`fg-j fg-${k}`} data-j={k} style={{ ['--l' as string]: `${L[k][0]}px`, ['--w' as string]: `${L[k][1]}px` }}>
      {before}
      <i className="fg-limb" />
      {/* every muscle is drawn (its curve gives the body its shape); the ones worked light up */}
      {PARTS[k].map((pt) => <i key={pt.m} className={`fg-part ${tone(pt.m)}`} style={{ left: pt.x - pt.w / 2, top: pt.y0, width: pt.w, height: pt.y1 - pt.y0 }} />)}
      {children}
    </div>
  );
  const load = spec.load === 'bar' ? <span className="fg-bar" /> : <span className="fg-db" />;
  const arm = (far: boolean) => <div className={`fg-top${far ? ' fg-far' : ''}`}>{limb('arm', <div className="fg-end">{limb('fore', <div className="fg-end">{!far && load}</div>)}</div>)}</div>;
  const leg = (far: boolean) => <div className={far ? 'fg-far' : undefined}>{limb('thigh', <div className="fg-end">{limb('shin')}</div>)}</div>;
  return (
    <div ref={root} className={`fg fg-${kind}`} aria-hidden>
      {spec.bench && <span className="fg-bench" style={{ left: spec.bench[0], top: spec.bench[1], width: spec.bench[2] }} />}
      <span className="fg-floor" style={{ top: spec.floor }} />
      <div className="fg-hip" style={{ left: spec.hip[0], top: spec.hip[1] }}>
        {/* the far arm and leg sit a little behind and in shade, the near ones in front: depth without a second figure */}
        {leg(true)}
        {leg(false)}
        {limb('torso', <>
          <span className="fg-head" />
          {arm(false)}
        </>, arm(true))}
      </div>
    </div>
  );
});
