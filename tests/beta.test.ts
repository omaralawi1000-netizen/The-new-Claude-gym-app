import { describe, expect, it } from 'vitest';
import { betaBoot, PENDING, PREFIX } from '../src/lib/beta';

/** A bare-bones Storage, enough to stand in for the browser's. */
function fake(init: Record<string, string> = {}): Storage {
  const m = new Map(Object.entries(init));
  return {
    get length() { return m.size; }, key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); }, clear: () => m.clear(),
  } as Storage;
}
/** Runs betaBoot the way the page does: pasted in as source text, so it may not lean on anything outside itself. */
function boot(native: Storage) {
  const win: any = { localStorage: native, indexedDB: undefined };
  new Function(`return (${betaBoot.toString()})`)()(win, PREFIX, PENDING);
  return win;
}

describe('Aven Beta storage', () => {
  it('writes only beta: keys and never touches the real ones', () => {
    const native = fake({ 'aven.v1': 'REAL', 'aven.keys': 'KEYS' });
    const beta: Storage = boot(native).localStorage;
    expect(beta.getItem('aven.v1')).toBeNull(); // the beta can't even see the real data
    beta.setItem('aven.v1', 'BETA');
    beta.removeItem('aven.keys');
    expect(native.getItem('aven.v1')).toBe('REAL');
    expect(native.getItem('aven.keys')).toBe('KEYS');
    expect(native.getItem('beta:aven.v1')).toBe('BETA');
    expect(beta.getItem('aven.v1')).toBe('BETA');
  });
  it('lists, counts and clears only its own keys (Settings → Delete all data walks them)', () => {
    const native = fake({ 'aven.v1': 'REAL', 'aven.theme': 'dark' });
    const beta: Storage = boot(native).localStorage;
    beta.setItem('aven.v1', 'B'); beta.setItem('aven.theme', 'light');
    expect(beta.length).toBe(2);
    expect(Object.keys(beta).sort()).toEqual(['aven.theme', 'aven.v1']);
    Object.keys(beta).forEach((k) => beta.removeItem(k));
    expect(beta.length).toBe(0);
    expect(native.getItem('aven.v1')).toBe('REAL'); expect(native.getItem('aven.theme')).toBe('dark');
    beta.setItem('x', '1'); beta.clear();
    expect(native.getItem('aven.v1')).toBe('REAL');
  });
  it('copy real → beta at start: replaces the beta, leaves the real as it was, skips sign-in tokens', () => {
    const native = fake({ 'aven.v1': 'REAL', 'aven.keys': 'KEYS', 'aven.drive': 'TOKEN', 'aven.v1.corrupt.1': 'x', other: 'o', 'beta:aven.v1': 'OLD', 'beta:aven.stale': 's', [PREFIX + PENDING]: '1' });
    const beta: Storage = boot(native).localStorage;
    expect(native.getItem('beta:aven.v1')).toBe('REAL');
    expect(beta.getItem('aven.keys')).toBe('KEYS');
    expect(native.getItem('beta:aven.stale')).toBeNull();
    expect(native.getItem('beta:aven.drive')).toBeNull();
    expect(native.getItem('beta:' + PENDING)).toBeNull(); // the note is used up
    expect(native.getItem('aven.v1')).toBe('REAL'); expect(native.getItem('aven.keys')).toBe('KEYS'); expect(native.getItem('aven.drive')).toBe('TOKEN');
  });
  it('runs once even if it is started twice (the page script, then the fallback import)', () => {
    const native = fake();
    const win = boot(native);
    betaBoot(win, PREFIX, PENDING);
    win.localStorage.setItem('a', '1');
    expect(native.getItem('beta:a')).toBe('1'); expect(native.getItem('beta:beta:a')).toBeNull();
  });
});
