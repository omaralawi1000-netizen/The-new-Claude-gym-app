import { describe, it, expect } from 'vitest';
import { moodOf } from '../src/ui/stardust/mood';

describe('the mood of what it says (Stardust leans its colour with it)', () => {
  it('glad news leans warm, serious leans cool, plain is neutral', () => {
    expect(moodOf('Great job, that is a new record! Proud of you.')).toBeGreaterThan(0.5);
    expect(moodOf('Careful with that knee, the pain is a warning sign. Rest today.')).toBeLessThan(-0.5);
    expect(moodOf('You had 1240 kcal today and 98 g protein.')).toBe(0);
  });
  it('Danish too, and "not" turns a word', () => {
    expect(moodOf('Flot! Ny rekord, tillykke')).toBeGreaterThan(0.5);
    expect(moodOf('Desværre en skade, vær forsigtig')).toBeLessThan(-0.5);
    expect(moodOf('That is not good')).toBeLessThan(0);
  });
  it('one word only leans a little', () => {
    expect(Math.abs(moodOf('Nice.'))).toBeLessThan(0.4);
  });
});
