import type { Equipment, EquipmentAccess, Exercise } from '../../lib/types';

export function equipmentSet(a: EquipmentAccess): Set<Equipment> {
  switch (a) {
    case 'fullGym': return new Set<Equipment>(['barbell', 'dumbbell', 'machine', 'smith', 'cable', 'bodyweight', 'kettlebell', 'band', 'bench', 'other']);
    case 'barbellHome': return new Set<Equipment>(['barbell', 'dumbbell', 'bodyweight', 'bench', 'band', 'other']);
    case 'homeDumbbells': return new Set<Equipment>(['dumbbell', 'bodyweight', 'kettlebell', 'band', 'bench', 'other']);
    case 'bodyweight': return new Set<Equipment>(['bodyweight', 'band', 'other']);
  }
}

/**
 * Can the user do this exercise with the equipment they have?
 * `equipment` lists alternatives (e.g. barbell OR dumbbell) — except a bench, which is only an accessory:
 * it never makes a barbell exercise possible by itself.
 */
export function usable(e: Exercise, access: Set<Equipment>): boolean {
  const main = e.equipment.filter((q) => q !== 'bench');
  return main.length ? main.some((q) => access.has(q)) : access.has('bench');
}

/** Substitutes share the primary muscle and (preferably) the movement; equipment the user has ranks first. */
export function substitutesFor(ex: Exercise, all: Exercise[], access: Set<Equipment>): Exercise[] {
  return all
    .filter((e) => e.id !== ex.id && !e.archived && e.muscles[0] === ex.muscles[0] && e.logType === ex.logType)
    .map((e) => ({ e, score: (e.movement === ex.movement ? 3 : 0) + (usable(e, access) ? 2 : -3) + (e.equipment.some((q) => ex.equipment.includes(q)) ? 0 : 0.5) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.e);
}
