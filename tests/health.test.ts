// @vitest-environment jsdom
// Coach 2.0, phase 5b, part D: the watch, automatic. The Android app opens Aven with "#hc=…"; the page checks it, keeps the
// workouts as activities (never twice, a hand-logged one becomes the watch's) and the steps per day, takes it out of the
// address, and believes it only when the Android app opened the page.
import { describe, it, expect, beforeEach } from 'vitest';
import { applyHcFromAddress, hcStatus, intensityOf, mergeHc, parseHc, type HcPayload } from '../src/lib/healthSync';
import { useStore } from '../src/state/store';
import { defaultData } from '../src/state/defaults';

const enc = (o: unknown) => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const now = Date.now();
const H = 3600000;
const payload = (ex: object[], days: [string, number][] = []): HcPayload => ({ v: 1, avail: true, on: true, granted: true, at: now, days, ex: ex as any });
const stairs = { id: 'hc-1', t: 'stair_machine', s: now - 3 * H, e: now - 3 * H + 45 * 60000, hr: 150, hx: 176, kc: 520 };
const fromApp = (yes: boolean) => Object.defineProperty(document, 'referrer', { value: yes ? 'android-app://app.aven.android/' : '', configurable: true });

beforeEach(() => {
  localStorage.clear();
  const d = defaultData(); d.settings.onboarded = true; d.settings.dayStartHour = 0;
  useStore.getState().replaceAll(d);
  fromApp(true);
});

describe('reading the address', () => {
  it('a real payload, checked', () => {
    const p = parseHc(`#hc=${enc(payload([stairs], [['2026-10-18', 12100]]))}`)!;
    expect(p.ex![0]).toMatchObject({ id: 'hc-1', t: 'stair_machine', hr: 150 });
    expect(p.days).toEqual([['2026-10-18', 12100]]);
  });
  it('nonsense is dropped, not believed', () => {
    expect(parseHc('#hc=!!!')).toBeNull();
    expect(parseHc(`#hc=${enc({ v: 2 })}`)).toBeNull();
    const p = parseHc(`#hc=${enc(payload([{ ...stairs, e: stairs.s - 1 }, { ...stairs, id: 'x', hr: 999 }], [['yesterday', 5], ['2026-10-18', -3]]))}`)!;
    expect(p.ex).toHaveLength(1); // the backwards one is gone
    expect(p.ex![0].hr).toBeUndefined(); // 999 bpm is not a heart rate
    expect(p.days).toEqual([]);
  });
});

describe('merging', () => {
  it('a workout becomes an activity with its heart rate and how hard it was; twice is still once', () => {
    const cur = { activities: [], steps: [] };
    const a = mergeHc(payload([stairs]), cur, 0);
    expect(a.added).toBe(1);
    expect(a.activities[0]).toMatchObject({ kind: 'stairs', source: 'watch', hcId: 'hc-1', durationSec: 2700, avgHr: 150, maxHr: 176, kcal: 520, name: 'Stair climber', intensity: 2 });
    const b = mergeHc(payload([{ ...stairs, hr: 165 }]), a, 0);
    expect(b.added).toBe(0);
    expect(b.activities).toHaveLength(1);
    expect(b.activities[0].avgHr).toBe(165);
  });
  it('lifting from the watch is left out (Aven logs the gym); unknown types are "other"', () => {
    const r = mergeHc(payload([{ ...stairs, id: 'g', t: 'strength' }, { ...stairs, id: 'o', t: 'pickleball' }]), { activities: [], steps: [] }, 0);
    expect(r.activities.map((a) => a.kind)).toEqual(['other']);
  });
  it('a run you logged yourself becomes the watch’s, your note kept', () => {
    const date = new Date(stairs.s).toISOString().slice(0, 10);
    const mine = { id: 'm1', date: new Date(stairs.s - new Date(stairs.s).getTimezoneOffset() * 60000).toISOString().slice(0, 10), kind: 'run' as const, durationSec: 1800, note: 'felt good', at: now };
    void date;
    const r = mergeHc(payload([{ ...stairs, id: 'r1', t: 'treadmill', e: stairs.s + 32 * 60000 }]), { activities: [mine], steps: [] }, 0);
    expect(r.activities).toHaveLength(1);
    expect(r.activities[0]).toMatchObject({ id: 'm1', note: 'felt good', hcId: 'r1', name: 'Treadmill', source: 'watch' });
  });
  it('steps per day are the watch’s', () => {
    const r = mergeHc(payload([], [['2026-10-17', 11000], ['2026-10-18', 4000]]), { activities: [], steps: [{ date: '2026-10-17', count: 9000 }, { date: '2026-10-10', count: 8000 }] }, 0);
    expect(r.steps).toEqual([{ date: '2026-10-10', count: 8000 }, { date: '2026-10-17', count: 11000 }, { date: '2026-10-18', count: 4000 }]);
  });
  it('how hard: under 70 % easy, to 85 % hard, above max (never against a top below 185)', () => {
    expect(intensityOf(120, 190)).toBe(1);
    expect(intensityOf(150, 190)).toBe(2);
    expect(intensityOf(170, 190)).toBe(3);
    expect(intensityOf(150, 100)).toBe(2); // (100 is not a real top: 185 is used)
    expect(intensityOf(undefined, 190)).toBeUndefined();
  });
});

describe('from the address into the app', () => {
  it('kept, said once, and out of the address', () => {
    history.replaceState(null, '', `/The-new-Claude-gym-app/#hc=${enc(payload([stairs], [['2026-10-18', 12100]]))}`);
    applyHcFromAddress();
    const st = useStore.getState();
    expect(st.activities).toHaveLength(1);
    expect(st.steps).toEqual([{ date: '2026-10-18', count: 12100 }]);
    expect(location.hash).toBe('');
    expect(hcStatus()).toMatchObject({ on: true, granted: true });
    // the burned calories never touch the food target
    expect(st.settings.goals).toEqual(defaultData().settings.goals);
  });
  it('a link with a made-up "#hc=" (not opened by the Android app) does nothing', () => {
    fromApp(false);
    history.replaceState(null, '', `/The-new-Claude-gym-app/#hc=${enc(payload([stairs]))}`);
    applyHcFromAddress();
    expect(useStore.getState().activities).toHaveLength(0);
    expect(location.hash).toBe('');
  });
});

describe('everything else the watch measures (19 Oct)', () => {
  const hd = [
    { d: '2026-10-18', s: 9000, ak: 640, tk: 2900, m: 7200, fl: 12, rh: 51, hv: 63, sl: 431, dp: 72, rm: 95, lt: 240, aw: 24, sb: now - 10 * H, se: now - 3 * H, w: 82.43, bf: 14.26, vo: 47.9, o2: 96.4, rr: 14.2 },
    { d: '2026-10-17', rh: 400, hv: -3, sl: 5000, w: 3, junk: 'x' },
  ];
  it('sleep, recovery and body numbers are read, checked and rounded; nonsense is dropped', () => {
    const p = parseHc(`#hc=${enc({ ...payload([]), hd })}`)!;
    expect(p.hd).toHaveLength(1); // the second day has nothing believable
    expect(p.hd![0]).toMatchObject({ date: '2026-10-18', activeKcal: 640, totalKcal: 2900, restHr: 51, hrv: 63, sleepMin: 431, deepMin: 72, remMin: 95, weightKg: 82.4, bodyFat: 14.3, vo2max: 47.9, spo2: 96.4, respRate: 14.2, floors: 12 });
    expect(p.hd![0].sleepEnd! > p.hd![0].sleepStart!).toBe(true);
  });
  it('an older payload (no hd) still reads exactly as before', () => {
    const p = parseHc(`#hc=${enc(payload([stairs], [['2026-10-18', 12100]]))}`)!;
    expect(p.hd).toBeUndefined();
    expect(p.ex).toHaveLength(1);
  });
  it('history: workouts up to two years back are kept; a day read again replaces that day', () => {
    const old = { ...stairs, id: 'hc-old', s: now - 400 * 24 * H, e: now - 400 * 24 * H + 40 * 60000 };
    expect(parseHc(`#hc=${enc(payload([old]))}`)!.ex).toHaveLength(1);
    const first = mergeHc({ ...payload([]), hd: [{ date: '2026-10-18', sleepMin: 300 }, { date: '2026-10-17', restHr: 50 }] }, { activities: [], steps: [], health: [] }, 0);
    const again = mergeHc({ ...payload([]), hd: [{ date: '2026-10-18', sleepMin: 420, hrv: 60 }] }, first, 0);
    expect(again.health).toEqual([{ date: '2026-10-17', restHr: 50 }, { date: '2026-10-18', sleepMin: 420, hrv: 60 }]);
    expect(mergeHc({ ...payload([]), hd: [{ date: '2026-10-18', sleepMin: 420, hrv: 60 }] }, again, 0).health).toEqual(again.health); // idempotent
  });
});
