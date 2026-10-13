import { describe, it, expect } from 'vitest';
import { sessionHeadline } from '../src/lib/workout';
import type { WorkoutSession } from '../src/lib/types';

let k = 0;
const ses = (o: Partial<WorkoutSession> & { kg?: number }): WorkoutSession => ({
  id: `w${k++}`, name: 'Push', date: '2026-10-13', startedAt: 0, endedAt: k * 1000, pausedMs: 0, status: 'done',
  exercises: [{ id: 'se', exerciseId: 'bench', sets: [{ id: 's', type: 'working', done: true, weightKg: o.kg ?? 50, reps: 10 }] }], ...o,
} as WorkoutSession);
const fmt = (kg: number) => `${Math.round(kg)} kg`;

describe('sessionHeadline', () => {
  it('a record comes first, strongest before anything else', () => {
    const s = ses({ records: [{ exerciseId: 'row', kind: 'volume', value: 1, previous: 0, setId: 's', date: '' }, { exerciseId: 'bench', kind: 'weight', value: 1, previous: 0, setId: 's', date: '' }] });
    expect(sessionHeadline(s, [], fmt)).toMatchObject({ key: 'Strongest {exercise} yet', exerciseId: 'bench' });
  });
  it('the biggest session of this routine, needs two before it', () => {
    const h = [ses({ kg: 40, date: '2026-09-01' }), ses({ kg: 45, date: '2026-09-08' })];
    expect(sessionHeadline(ses({ kg: 50 }), h, fmt).key).toBe('Your biggest {name} session yet');
  });
  it('more than last time', () => {
    const h = [ses({ kg: 60, date: '2026-09-01' }), ses({ kg: 45, date: '2026-09-08' })];
    expect(sessionHeadline(ses({ kg: 50 }), h, fmt)).toMatchObject({ key: '{x} more than last {name}', vars: { x: '50 kg', name: 'Push' } });
  });
  it('else where it sits in the month', () => {
    expect(sessionHeadline(ses({ kg: 50 }), [], fmt).key).toBe('First workout this month');
    const h = [ses({ name: 'Legs', date: '2026-10-02' }), ses({ name: 'Pull', date: '2026-09-30' })];
    expect(sessionHeadline(ses({ kg: 50 }), h, fmt)).toMatchObject({ key: 'Workout {n} this month', vars: { n: 2 } });
  });
});
