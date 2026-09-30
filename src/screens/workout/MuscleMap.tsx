import type { MuscleGroup } from '../../lib/types';

/** Authored front/back body diagram. Primary muscle = full accent, secondary = tint. Purely illustrative. */
export function MuscleMap({ muscles, size = 150 }: { muscles: MuscleGroup[]; size?: number }) {
  const fill = (m: MuscleGroup) => (muscles[0] === m ? 'var(--ac)' : muscles.includes(m) ? 'color-mix(in srgb, var(--ac) 42%, var(--s3))' : 'var(--s3)');
  const base = 'var(--s3)';
  const R = (x: number, y: number, w: number, h: number, m?: MuscleGroup, rx = 6) => <rect x={x} y={y} width={w} height={h} rx={rx} fill={m ? fill(m) : base} />;
  return (
    <svg width={size * 1.7} height={size * 1.5} viewBox="0 0 250 220" role="img" aria-label={muscles.join(', ')}>
      {/* FRONT */}
      <g transform="translate(5 0)">
        <circle cx="60" cy="16" r="11" fill={base} />
        {R(54, 28, 12, 8, undefined, 3)}
        <ellipse cx="34" cy="44" rx="10" ry="9" fill={fill('shoulders')} /><ellipse cx="86" cy="44" rx="10" ry="9" fill={fill('shoulders')} />
        {R(42, 40, 17, 22, 'chest', 8)}{R(61, 40, 17, 22, 'chest', 8)}
        {R(46, 65, 28, 38, 'core', 8)}
        {R(21, 54, 12, 26, 'biceps', 6)}{R(87, 54, 12, 26, 'biceps', 6)}
        {R(16, 83, 11, 30, 'forearms', 6)}{R(93, 83, 11, 30, 'forearms', 6)}
        {R(41, 106, 18, 48, 'quads', 9)}{R(61, 106, 18, 48, 'quads', 9)}
        {R(43, 158, 14, 42, 'calves', 7)}{R(63, 158, 14, 42, 'calves', 7)}
      </g>
      {/* BACK */}
      <g transform="translate(125 0)">
        <circle cx="60" cy="16" r="11" fill={base} />
        {R(54, 28, 12, 8, undefined, 3)}
        <ellipse cx="34" cy="44" rx="10" ry="9" fill={fill('shoulders')} /><ellipse cx="86" cy="44" rx="10" ry="9" fill={fill('shoulders')} />
        {R(42, 40, 36, 46, 'back', 10)}
        {R(21, 54, 12, 26, 'triceps', 6)}{R(87, 54, 12, 26, 'triceps', 6)}
        {R(16, 83, 11, 30, 'forearms', 6)}{R(93, 83, 11, 30, 'forearms', 6)}
        {R(43, 88, 34, 18, 'glutes', 9)}
        {R(41, 109, 18, 46, 'hamstrings', 9)}{R(61, 109, 18, 46, 'hamstrings', 9)}
        {R(43, 158, 14, 42, 'calves', 7)}{R(63, 158, 14, 42, 'calves', 7)}
      </g>
    </svg>
  );
}
