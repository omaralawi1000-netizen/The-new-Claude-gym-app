import type { Equipment, EquipmentAccess, Exercise, Goal, Experience, Routine, RoutineItem } from './types';
import { uid } from './nutrition';
import { equipmentSet } from '../screens/workout/subs';

/** Starter plans are simple, conventional templates — a place to begin, not a prescription. Everything stays editable. */
const SLOTS: Record<string, string[]> = {
  squat: ['back-squat', 'goblet-squat', 'leg-press', 'bodyweight-squat'],
  squat2: ['front-squat', 'hack-squat', 'goblet-squat', 'bulgarian-split-squat', 'bodyweight-squat'],
  hinge: ['romanian-deadlift', 'hip-thrust', 'kb-swing', 'glute-bridge'],
  lunge: ['walking-lunge', 'bulgarian-split-squat', 'step-up', 'bodyweight-squat'],
  hamCurl: ['leg-curl', 'romanian-deadlift', 'glute-bridge'],
  push: ['bench-press', 'db-bench-press', 'machine-chest-press', 'push-up'],
  incline: ['incline-db-press', 'dip', 'push-up'],
  press: ['overhead-press', 'db-shoulder-press', 'push-up'],
  row: ['barbell-row', 'one-arm-db-row', 'seated-cable-row', 'back-extension'],
  vpull: ['lat-pulldown', 'pull-up', 'chin-up', 'assisted-pull-up', 'one-arm-db-row'],
  lateral: ['lateral-raise', 'face-pull'],
  triceps: ['tricep-pushdown', 'overhead-tricep-ext', 'close-grip-bench', 'dip', 'push-up'],
  biceps: ['db-curl', 'barbell-curl', 'hammer-curl', 'cable-curl', 'chin-up'],
  calves: ['standing-calf-raise', 'seated-calf-raise'],
  core: ['plank', 'hanging-leg-raise', 'cable-crunch', 'russian-twist', 'ab-wheel'],
  deadlift: ['deadlift', 'romanian-deadlift', 'kb-swing', 'glute-bridge'],
};

function pick(slot: string, all: Exercise[], access: Set<Equipment>, used: Set<string>): Exercise | undefined {
  const ids = SLOTS[slot] ?? [];
  const byId = new Map(all.map((e) => [e.id, e]));
  for (const id of ids) {
    const e = byId.get(id);
    if (e && !used.has(id) && e.equipment.some((q) => access.has(q))) return e;
  }
  return undefined;
}

function params(goal: Goal, exp: Experience) {
  const sets = exp === 'new' ? 2 : 3;
  switch (goal) {
    case 'strength': return { sets: exp === 'new' ? 3 : 4, min: 4, max: 6, rest: 150, isoMin: 8, isoMax: 12 };
    case 'muscle': return { sets, min: 8, max: 12, rest: 90, isoMin: 10, isoMax: 15 };
    case 'endurance': return { sets, min: 12, max: 20, rest: 45, isoMin: 15, isoMax: 20 };
    default: return { sets, min: 8, max: 12, rest: 75, isoMin: 10, isoMax: 15 };
  }
}

export function buildStarter(opts: { days: number; goal: Goal; experience: Experience; access: EquipmentAccess }, exercises: Exercise[]): Routine[] {
  const access = equipmentSet(opts.access);
  const p = params(opts.goal, opts.experience);
  const mk = (name: string, slots: [string, 'comp' | 'iso'][]): Routine => {
    const used = new Set<string>();
    const items: RoutineItem[] = [];
    for (const [slot, kind] of slots) {
      const ex = pick(slot, exercises, access, used);
      if (!ex) continue;
      used.add(ex.id);
      const timed = ex.logType === 'duration';
      items.push({ id: uid('ri'), exerciseId: ex.id, warmupSets: kind === 'comp' && opts.experience !== 'new' && ex.equipment.includes('barbell') ? 1 : 0, workingSets: timed ? 2 : kind === 'comp' ? p.sets : Math.max(2, p.sets - (opts.experience === 'new' ? 0 : 1)) + (kind === 'iso' ? 0 : 0), repMin: kind === 'comp' ? p.min : p.isoMin, repMax: kind === 'comp' ? p.max : p.isoMax, restSec: kind === 'comp' ? p.rest : Math.round(p.rest * 0.66 / 15) * 15 });
    }
    return { id: uid('rt'), name, items, createdAt: Date.now(), updatedAt: Date.now() };
  };
  const d = Math.max(1, Math.min(6, opts.days));
  if (d <= 3) {
    return [
      mk('Full body A', [['squat', 'comp'], ['push', 'comp'], ['row', 'comp'], ['lateral', 'iso'], ['core', 'iso']]),
      mk('Full body B', [['deadlift', 'comp'], ['press', 'comp'], ['vpull', 'comp'], ['lunge', 'iso'], ['biceps', 'iso']]),
      mk('Full body C', [['squat2', 'comp'], ['incline', 'comp'], ['row', 'comp'], ['hamCurl', 'iso'], ['triceps', 'iso']]),
    ].slice(0, Math.max(2, d));
  }
  if (d === 4) {
    return [
      mk('Upper A', [['push', 'comp'], ['row', 'comp'], ['press', 'comp'], ['vpull', 'comp'], ['biceps', 'iso'], ['triceps', 'iso']]),
      mk('Lower A', [['squat', 'comp'], ['hinge', 'comp'], ['lunge', 'iso'], ['calves', 'iso'], ['core', 'iso']]),
      mk('Upper B', [['incline', 'comp'], ['vpull', 'comp'], ['press', 'comp'], ['row', 'comp'], ['lateral', 'iso'], ['biceps', 'iso']]),
      mk('Lower B', [['deadlift', 'comp'], ['squat2', 'comp'], ['hamCurl', 'iso'], ['calves', 'iso'], ['core', 'iso']]),
    ];
  }
  return [
    mk('Push', [['push', 'comp'], ['press', 'comp'], ['incline', 'comp'], ['lateral', 'iso'], ['triceps', 'iso']]),
    mk('Pull', [['vpull', 'comp'], ['row', 'comp'], ['lateral', 'iso'], ['biceps', 'iso'], ['core', 'iso']]),
    mk('Legs', [['squat', 'comp'], ['hinge', 'comp'], ['lunge', 'iso'], ['hamCurl', 'iso'], ['calves', 'iso']]),
  ];
}

/** Spread N routines over preferred weekdays (0=Sun). */
export function assignWeek(days: number[], routines: Routine[]): Record<number, string | null> {
  const w: Record<number, string | null> = { 0: null, 1: null, 2: null, 3: null, 4: null, 5: null, 6: null };
  const sorted = [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  sorted.forEach((wd, i) => { if (routines.length) w[wd] = routines[i % routines.length].id; });
  return w;
}
