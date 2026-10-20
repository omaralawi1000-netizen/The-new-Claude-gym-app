import { describe, it, expect } from 'vitest';
import { newBest } from '../src/lib/workout';
import type { SetRecord, WorkoutSession } from '../src/lib/types';

const set = (weightKg: number | undefined, reps: number, done = true): SetRecord => ({ id: `s${Math.random()}`, type: 'working', done, weightKg, reps });
const ses = (sets: SetRecord[], exerciseId = 'bench'): WorkoutSession => ({ id: `w${Math.random()}`, date: '2026-10-01', startedAt: 0, endedAt: 1, pausedMs: 0, exercises: [{ id: 'se', exerciseId, sets }] } as unknown as WorkoutSession);

describe('newBest', () => {
  const hist = [ses([set(80, 8), set(80, 7), set(100, 3)])];
  it('first time an exercise is logged is a baseline, not a best', () => {
    expect(newBest('weightReps', { weightKg: 60, reps: 10 }, 'bench', [])).toBeNull();
  });
  it('heavier than ever is a weight best', () => {
    expect(newBest('weightReps', { weightKg: 102.5, reps: 1 }, 'bench', hist)).toMatchObject({ kind: 'weight', weightKg: 102.5 });
  });
  it('more reps than ever at this weight or heavier is a rep best', () => {
    expect(newBest('weightReps', { weightKg: 80, reps: 9 }, 'bench', hist)).toMatchObject({ kind: 'reps', reps: 9 });
    expect(newBest('weightReps', { weightKg: 80, reps: 8 }, 'bench', hist)).toBeNull();
    expect(newBest('weightReps', { weightKg: 100, reps: 3 }, 'bench', hist)).toBeNull();
    expect(newBest('weightReps', { weightKg: 60, reps: 8 }, 'bench', hist)).toBeNull(); // 8 at 80 already beats it
  });
  it('sets already ticked today count, so the same best is not celebrated twice', () => {
    expect(newBest('weightReps', { weightKg: 102.5, reps: 1 }, 'bench', hist, [set(102.5, 2)])).toBeNull();
    expect(newBest('weightReps', { weightKg: 102.5, reps: 1 }, 'bench', hist, [set(102.5, 2, false)])).toMatchObject({ kind: 'weight' });
  });
  it('other exercises do not count', () => {
    expect(newBest('weightReps', { weightKg: 90, reps: 1 }, 'squat', hist)).toBeNull();
  });
  it('bodyweight, assisted, holds and distance', () => {
    const pu = [ses([set(undefined, 10)], 'pullup')];
    expect(newBest('bodyweightReps', { reps: 11 }, 'pullup', pu)).toMatchObject({ kind: 'reps' });
    expect(newBest('bodyweightReps', { reps: 10 }, 'pullup', pu)).toBeNull();
    const as = [ses([set(30, 8)], 'apu')];
    expect(newBest('assisted', { weightKg: 30, reps: 9 }, 'apu', as)).toMatchObject({ kind: 'reps' });
    expect(newBest('assisted', { weightKg: 40, reps: 8 }, 'apu', as)).toBeNull(); // more help, same reps: not a best
    expect(newBest('assisted', { weightKg: 20, reps: 5 }, 'apu', as)).toBeNull(); // less help, fewer reps: not a record either (detectRecords counts reps)
    expect(newBest('assisted', { weightKg: 20, reps: 9 }, 'apu', as)).toMatchObject({ kind: 'reps' });
    const pl = [ses([{ id: 'p', type: 'working', done: true, durationSec: 60 }], 'plank')];
    expect(newBest('duration', { durationSec: 75 }, 'plank', pl)).toMatchObject({ kind: 'duration' });
    expect(newBest('duration', { durationSec: 60 }, 'plank', pl)).toBeNull();
  });
});
