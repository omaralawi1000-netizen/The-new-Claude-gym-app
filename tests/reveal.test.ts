import { describe, it, expect } from 'vitest';
import { wordEnds, revealPrefix, revealRate } from '../src/lib/reveal';
import { richLines } from '../src/lib/tts';

const upTo = (text: string, n: number, live = false) => revealPrefix(text, wordEnds(text, live), n);

describe('word reveal', () => {
  it('shows whole words only, holding back the one still arriving', () => {
    expect(wordEnds('Two easy on', true)).toEqual([3, 8]);
    expect(upTo('Two easy on', 5, true)).toBe('Two easy');
    expect(upTo('Two easy one', 2)).toBe('Two easy');
    expect(upTo('Two easy one', 9)).toBe('Two easy one');
    expect(upTo('Two easy one', 0)).toBe('');
  });
  it('a bold phrase is bold from its first word, so nothing restyles when it closes', () => {
    const text = 'Build it around **Monday wrestling** and legs';
    expect(upTo(text, 4)).toBe('Build it around **Monday**');
    expect(richLines(upTo(text, 4))[0].segs).toEqual([{ bold: false, text: 'Build it around ' }, { bold: true, text: 'Monday' }]);
    expect(richLines(upTo(text, 5))[0].segs[1]).toEqual({ bold: true, text: 'Monday wrestling' });
  });
  it('a bullet mark arrives with its first word, never alone', () => {
    const text = 'Plan:\n- Bench 3x8\n2. Rows';
    expect(upTo(text, 2)).toBe('Plan:\n- Bench');
    expect(richLines(upTo(text, 2))[1].bullet).toBe(true);
    expect(upTo(text, 5)).toBe('Plan:\n- Bench 3x8\n2. Rows');
  });
  it('keeps pace with what is waiting, within calm limits', () => {
    expect(revealRate(0, true)).toBe(6);
    expect(revealRate(0, false)).toBe(24);
    expect(revealRate(27, true)).toBeCloseTo(30);
    expect(revealRate(500, false)).toBe(45);
  });
});
