// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
describe('overlay navigation', () => {
  beforeEach(() => { history.replaceState(null, ''); });
  it('rapid double close never unwinds more history than was pushed', async () => {
    const { useUI } = await import('../src/state/ui');
    let backs = 0;
    const go = history.go.bind(history);
    history.go = (n?: number) => { backs += -(n ?? 0); return go(n); };
    const ui = useUI.getState();
    ui.push('settings'); ui.push('datePicker');
    ui.pop(); ui.pop(); ui.pop(); ui.pop(); // 4 closes for 2 overlays
    expect(useUI.getState().overlays.length).toBe(0);
    expect(backs).toBe(2);
  });
  it('closeAll after swap keeps history consistent', async () => {
    const { useUI } = await import('../src/state/ui');
    const ui = useUI.getState();
    ui.push('foodSearch'); ui.push('customFood'); ui.swap(1, 'foodDetail', {});
    expect(useUI.getState().overlays.map((o) => o.type)).toEqual(['foodSearch', 'foodDetail']);
    ui.closeAll(); ui.closeAll();
    expect(useUI.getState().overlays.length).toBe(0);
  });
});

describe('haptics', () => {
  it('plays the named pattern, and nothing when Settings turns haptics off', async () => {
    const { haptic, HAPTICS } = await import('../src/state/ui');
    const { useStore } = await import('../src/state/store');
    const felt: unknown[] = [];
    Object.defineProperty(navigator, 'vibrate', { value: (p: unknown) => { felt.push(p); return true; }, configurable: true });
    useStore.setState((s) => ({ settings: { ...s.settings, haptics: true } }));
    haptic('gain'); haptic('set');
    expect(felt).toEqual([HAPTICS.gain, HAPTICS.set]);
    useStore.setState((s) => ({ settings: { ...s.settings, haptics: false } }));
    haptic('restOver');
    expect(felt.length).toBe(2);
    // every pattern is short pulses and pauses in whole milliseconds
    for (const p of Object.values(HAPTICS)) for (const ms of [p].flat()) expect(Number.isInteger(ms) && ms > 0 && ms <= 400).toBe(true);
  });
});
