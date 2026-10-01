import type { ActivityKind, ActivityLog, Lang } from './types';
import { fmtNum } from './units';

export const ACTIVITY_KINDS: ActivityKind[] = ['wrestling', 'run', 'walk', 'cycle', 'swim', 'row', 'hike', 'mobility', 'warmup', 'recovery', 'other'];
export const ACTIVITY_LABEL: Record<ActivityKind, string> = { wrestling: 'Wrestling', run: 'Run', walk: 'Walk', cycle: 'Cycle', swim: 'Swim', row: 'Row', hike: 'Hike', mobility: 'Mobility', warmup: 'Warm-up', recovery: 'Recovery', other: 'Other' };
export const INTENSITY_LABEL = { 1: 'Easy', 2: 'Hard', 3: 'Max' } as const;
export const activityIcon = (k: ActivityKind) => (k === 'wrestling' ? 'wrestle' : 'run');

/** "60 min · 6 rounds · Hard" — the facts of one activity, translated. */
export function activityLine(a: ActivityLog, t: (k: string) => string, lang: Lang, distanceUnit: 'km' | 'mi'): string {
  const parts = [`${Math.round(a.durationSec / 60)} min`];
  if (a.distanceM) parts.push(`${fmtNum(distanceUnit === 'mi' ? a.distanceM / 1609.344 : a.distanceM / 1000, lang, 2)} ${distanceUnit}`);
  if (a.rounds) parts.push(`${a.rounds} ${t('rounds')}`);
  if (a.intensity) parts.push(t(INTENSITY_LABEL[a.intensity]));
  return parts.join(' · ');
}
