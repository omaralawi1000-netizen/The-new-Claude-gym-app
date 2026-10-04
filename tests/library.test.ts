import { describe, it, expect } from 'vitest';
import { REFERENCE_FOODS } from '../src/data/foods';
import { REFERENCE_FOODS_DK2 } from '../src/data/foods-dk2';
import { searchFoods } from '../src/lib/foodText';
import { SEED_EXERCISES } from '../src/data/exercises';
import { matchExercises } from '../src/lib/workoutText';

describe('exercise library', () => {
  it('has unique ids and how-to steps for every exercise', () => {
    const ids = SEED_EXERCISES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(150);
    for (const e of SEED_EXERCISES) { expect(e.instructions.length).toBeGreaterThan(1); expect(e.nameDa).toBeTruthy(); }
  });
  it('finds the Incline Smith Machine Press however it is typed', () => {
    for (const q of ['Incline Smith Machine Press', 'incline smith', 'smith incline bench', 'skråt bænkpres smith'])
      expect(matchExercises(q, SEED_EXERCISES, 'en', 3)[0]?.ex.id, q).toBe('smith-incline-press');
  });
  it('finds machines by their other names', () => {
    expect(matchExercises('hex bar deadlift', SEED_EXERCISES, 'en', 1)[0]?.ex.id).toBe('trap-bar-deadlift');
    expect(matchExercises('butterfly', SEED_EXERCISES, 'en', 1)[0]?.ex.id).toBe('pec-deck');
  });
});

describe('food reference table', () => {
  // ids and energy-vs-macros for the whole table are checked in core.test.ts
  it('includes the wider Danish list', () => expect(REFERENCE_FOODS_DK2.every((f) => REFERENCE_FOODS.includes(f))).toBe(true));
  it('finds Danish foods by their Danish names', () => {
    for (const [q, id] of [['hønsesalat', 'ref:honsesalat'], ['drømmekage', 'ref:drommekage'], ['dürüm', 'ref:durum'], ['karbonade', 'ref:karbonade']] as const)
      expect(searchFoods(q, REFERENCE_FOODS, undefined, 3)[0]?.food.id, q).toBe(id);
  });
});
