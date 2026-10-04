import type { Exercise, Lang, SetRecord, Settings, MuscleGroup, Equipment, Movement } from '../../lib/types';
import { fmtNum, kgToDisplay } from '../../lib/units';
import { fmtDuration } from '../../lib/dates';
import type { TFn } from '../../lib/i18n';

export const exName = (e: Exercise, lang: Lang) => (lang === 'da' && e.nameDa ? e.nameDa : e.name);
export const exSteps = (e: Exercise, lang: Lang) => (lang === 'da' && e.instructionsDa?.length ? e.instructionsDa : e.instructions);

export const MUSCLE_LABEL: Record<MuscleGroup, string> = {
  chest: 'Chest', back: 'Back', shoulders: 'Shoulders', biceps: 'Biceps', triceps: 'Triceps', forearms: 'Forearms', quads: 'Quads',
  hamstrings: 'Hamstrings', glutes: 'Glutes', calves: 'Calves', core: 'Core', cardio: 'Cardio',
};
export const EQUIP_LABEL: Record<Equipment, string> = {
  barbell: 'Barbell', dumbbell: 'Dumbbell', machine: 'Machine', smith: 'Smith machine', cable: 'Cable', bodyweight: 'Bodyweight', kettlebell: 'Kettlebell', band: 'Band', bench: 'Bench', other: 'Other',
};
export const MOVE_LABEL: Record<Movement, string> = { push: 'Push', pull: 'Pull', squat: 'Squat', hinge: 'Hinge', lunge: 'Lunge', carry: 'Carry', core: 'Core', cardio: 'Cardio', isolation: 'Isolation' };

/** "80 kg × 8", "12 reps", "0:45", "5.0 km · 25:00" */
export function fmtSet(s: SetRecord, ex: Exercise | undefined, u: Settings['units'], lang: Lang, t: TFn): string {
  const lt = ex?.logType ?? 'weightReps';
  if (lt === 'duration') return s.durationSec ? fmtDuration(s.durationSec) : '—';
  if (lt === 'distance') return [s.distanceM ? `${fmtNum(u.distance === 'mi' ? s.distanceM / 1609.344 : s.distanceM / 1000, lang, 2)} ${u.distance}` : '', s.durationSec ? fmtDuration(s.durationSec) : ''].filter(Boolean).join(' · ') || '—';
  const w = s.weightKg ? `${fmtNum(kgToDisplay(s.weightKg, u.weight), lang, 2)} ${u.weight}` : '';
  if (lt === 'bodyweightReps') return s.weightKg ? `+${w} × ${s.reps ?? 0}` : `${s.reps ?? 0} ${t('reps')}`;
  if (lt === 'assisted') return `${w ? `−${w} ` : ''}× ${s.reps ?? 0}`;
  return `${w || '—'} × ${s.reps ?? 0}`;
}

export const isStrength = (e?: Exercise) => !e || e.logType === 'weightReps' || e.logType === 'bodyweightReps' || e.logType === 'assisted';
