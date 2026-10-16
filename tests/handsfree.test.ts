// Hands-free sets (phase 5 part 2): only set-shaped phrases are read, in English and Danish; everything else is ignored.
import { describe, it, expect } from 'vitest';
import { guardSet, parseSetCommand as p } from '../src/lib/setCommand';

describe('reading a set', () => {
  it('reps at weight, weight for reps, in both languages', () => {
    expect(p('8 at 80')).toEqual({ kind: 'set', reps: 8, kg: 80 });
    expect(p('8 reps at 82.5 kilos')).toEqual({ kind: 'set', reps: 8, kg: 82.5 });
    expect(p('80 for 8')).toEqual({ kind: 'set', kg: 80, reps: 8 });
    expect(p('80 kg 8 reps')).toEqual({ kind: 'set', kg: 80, reps: 8 });
    expect(p('Eight at eighty.')).toEqual({ kind: 'set', reps: 8, kg: 80 });
    expect(p('eighty two and a half for six')).toEqual({ kind: 'set', kg: 82.5, reps: 6 });
    expect(p('otte på firs')).toEqual({ kind: 'set', reps: 8, kg: 80 });
    expect(p('eight at 80')).toEqual({ kind: 'set', reps: 8, kg: 80 });
    expect(p('8 på 80')).toEqual({ kind: 'set', reps: 8, kg: 80 });
    expect(p('otte gange på 62,5 kilo')).toEqual({ kind: 'set', reps: 8, kg: 62.5 });
    expect(p('62 og en halv til 8')).toEqual({ kind: 'set', kg: 62.5, reps: 8 });
    expect(p('Uh, that was 9.')).toEqual({ kind: 'set', reps: 9 });
    expect(p('10 reps')).toEqual({ kind: 'set', reps: 10 });
    expect(p('to gange')).toEqual({ kind: 'set', reps: 2 });
    expect(p('82.5 kilos')).toEqual({ kind: 'set', kg: 82.5 });
  });
  it('same again, done, skip, rest, undo', () => {
    expect(p('Same again')).toEqual({ kind: 'same' });
    expect(p('samme igen')).toEqual({ kind: 'same' });
    expect(p('done')).toEqual({ kind: 'done' });
    expect(p('færdig')).toEqual({ kind: 'done' });
    expect(p('skip this set')).toEqual({ kind: 'skip' });
    expect(p('spring over')).toEqual({ kind: 'skip' });
    expect(p('+15 seconds')).toEqual({ kind: 'rest', sec: 15 });
    expect(p('30 sekunder mere')).toEqual({ kind: 'rest', sec: 30 });
    expect(p('one minute more')).toEqual({ kind: 'rest', sec: 60 });
    expect(p('no')).toEqual({ kind: 'undo' });
    expect(p('fortryd')).toEqual({ kind: 'undo' });
  });
  it('anything else is ignored, never guessed', () => {
    for (const s of ['hello there', 'can you spot me', 'I did 8 at 80 yesterday with my friend and it was hard', 'hvad så', 'the 8 bus', 'what time is it', '', 'mm']) expect(p(s)).toBeNull();
    expect(p('8.5')).toBeNull(); // half a rep
  });
});

describe('a number far off is asked about, not logged', () => {
  it('a dropped digit', () => {
    expect(guardSet({ kg: 18, reps: 8 }, { kg: 80, reps: 8 })).toEqual({ kg: [18, 80] });
    expect(guardSet({ kg: 8 }, { kg: 80 })).toEqual({ kg: [8, 80] });
    expect(guardSet({ kg: 82.5, reps: 8 }, { kg: 80, reps: 8 })).toBeNull();
    expect(guardSet({ reps: 80 }, { kg: 80, reps: 8 })).toEqual({ reps: [80, 8] });
    expect(guardSet({ kg: 60 }, {})).toBeNull(); // nothing to compare with
  });
});
