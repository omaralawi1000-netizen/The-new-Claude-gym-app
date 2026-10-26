import { describe, expect, it } from 'vitest';
import { curve, dayLoad, readyScore, sleepScore, type SleepInput } from '../src/lib/scores';
import type { SleepSession, Stage } from '../src/lib/watchDetail';
import type { HealthDay } from '../src/lib/types';

const H = 3600000;
/** a night from 23:00 with `asleep` minutes in a natural mix (deep early, REM late), `lat` minutes to fall asleep and
 *  `wakes` wake-ups of 8 minutes */
function night({ asleep, deep = 0.2, rem = 0.23, lat = 10, wakes = 1, startHour = 23 }: { asleep: number; deep?: number; rem?: number; lat?: number; wakes?: number; startHour?: number }): SleepSession {
  const start = new Date(2026, 9, 19, startHour, 0).getTime();
  const stages: SleepSession['stages'] = [];
  let at = 0;
  const add = (stage: Stage, min: number) => { if (min > 0) { stages.push({ stage, from: at, min: Math.round(min) }); at += Math.round(min); } };
  add(0, lat);
  const blocks = wakes + 1;
  for (let b = 0; b < blocks; b++) {
    add(2, (asleep * deep) / blocks); add(1, (asleep * (1 - deep - rem)) / blocks); add(3, (asleep * rem) / blocks);
    if (b < blocks - 1) add(0, 8);
  }
  return { start, end: start + at * 60000, stages };
}
const flatHr = (s: SleepSession, bpm: number) => Array.from({ length: Math.round((s.end - s.start) / 60000) }, (_, i) => ({ t: s.start + i * 60000, bpm: bpm + (i < 200 ? 0 : 1) }));
const usual = Array(14).fill(0).map(() => 15 * 60 + 15); // midpoints around 03:15
const base = (n: SleepSession, more: Partial<SleepInput> = {}): SleepInput => ({ night: n, age: 20, pastMidpoints: usual.map(() => ((new Date((n.start + n.end) / 2).getHours() * 60 + 720) % 1440)), restHr: 52, hr: flatHr(n, 54), ...more });

describe('curve', () => {
  it('draws straight lines between points and stays flat past the ends', () => {
    expect(curve(0.5, [[0, 0], [1, 100]])).toBe(50);
    expect(curve(-1, [[0, 0], [1, 100]])).toBe(0);
    expect(curve(9, [[0, 0], [1, 100]])).toBe(100);
  });
});

describe('Sleep score', () => {
  it('a full 8 h night with good stages is Great', () => {
    const s = sleepScore(base(night({ asleep: 480 })))!;
    expect(s.score).toBeGreaterThanOrEqual(95);
    expect(s.band).toBe('Great');
  });
  it('7 h, however tidy, is Good at best (84), never Great', () => {
    const s = sleepScore(base(night({ asleep: 420 })))!;
    expect(s.score).toBe(84);
    expect(s.band).toBe('Good');
  });
  it('5 h 30 is at most 74, under 5 h at most 59', () => {
    expect(sleepScore(base(night({ asleep: 330 })))!.score).toBeLessThanOrEqual(74);
    expect(sleepScore(base(night({ asleep: 280 })))!.score).toBeLessThanOrEqual(59);
  });
  it('a bedtime far from usual lowers Timing', () => {
    const n = night({ asleep: 480, startHour: 3 });
    const s = sleepScore(base(n, { pastMidpoints: usual }))!;
    expect(s.parts.find((p) => p.key === 'timing')!.score).toBeLessThan(50);
    expect(s.score).toBeLessThan(sleepScore(base(night({ asleep: 480 })))!.score);
  });
  it('a high heart rate night lowers Heart, and a late low point costs more', () => {
    const n = night({ asleep: 480 });
    const hot = sleepScore(base(n, { hr: flatHr(n, 62) }))!;
    expect(hot.parts.find((p) => p.key === 'heart')!.score).toBeLessThan(50);
    const late = flatHr(n, 54).map((p) => (p.t > n.end - H ? { ...p, bpm: 48 } : p));
    expect(sleepScore(base(n, { hr: late }))!.parts.find((p) => p.key === 'heart')!.score).toBe(90);
  });
  it('restless nights lose Restfulness', () => {
    const calm = sleepScore(base(night({ asleep: 450 })))!.parts.find((p) => p.key === 'rest')!.score;
    const broken = sleepScore(base(night({ asleep: 450, wakes: 6, lat: 40 })))!.parts.find((p) => p.key === 'rest')!.score;
    expect(broken).toBeLessThan(calm - 20);
  });
  it('without stages there is no score; without heart or history the rest share the weight', () => {
    expect(sleepScore({ night: { start: 0, end: 8 * H, stages: [] } })).toBeNull();
    const s = sleepScore({ night: night({ asleep: 480 }) })!;
    expect(s.parts.map((p) => p.key)).toEqual(['duration', 'deep', 'rem', 'rest']);
    expect(s.score).toBeGreaterThanOrEqual(95);
  });
  it('little deep sleep shows as the reason', () => {
    expect(sleepScore(base(night({ asleep: 480, deep: 0.06 })))!.low).toBe('deep');
  });
});

/** 60 days of normal numbers, then today */
function weeks(today: Partial<HealthDay>, n = 60): HealthDay[] {
  const out: HealthDay[] = [];
  for (let i = 0; i < n; i++) out.push({ date: `d${i}`, hrv: 70 + ((i * 7) % 11) - 5, restHr: 52 + ((i * 3) % 5) - 2, respRate: 14 });
  out.push({ date: 'today', hrv: 70, restHr: 52, respRate: 14, ...today });
  return out;
}
const steady = Array(28).fill(80);

describe('Ready score', () => {
  it('learns your normal for 14 days first', () => {
    expect(readyScore({ days: weeks({}, 9), sleep: 90 })).toEqual({ learning: 9 });
  });
  it('a rested, normal week is Ready', () => {
    const r = readyScore({ days: weeks({}), sleep: 92, week: Array(7).fill(470), loads: steady, age: 20 });
    expect('score' in r && r.score).toBeGreaterThanOrEqual(85);
  });
  it('two hard days, short sleep, low HRV and a high resting rate land in the 40s–50s', () => {
    const days = weeks({ hrv: 52, restHr: 58 });
    days[days.length - 2].hrv = 55; days[days.length - 3].hrv = 60;
    const loads = [...Array(26).fill(80), 260, 280];
    const r = readyScore({ days, sleep: 62, week: [420, 400, 380, 360, 400, 390, 330], loads, age: 20 });
    expect('score' in r && r.score).toBeGreaterThanOrEqual(35);
    expect('score' in r && r.score).toBeLessThan(60);
  });
  it('fast breathing and low oxygen take points off', () => {
    const ok = readyScore({ days: weeks({}), sleep: 90, loads: steady });
    const sick = readyScore({ days: weeks({ respRate: 16, spo2: 91 }), sleep: 90, loads: steady });
    expect('score' in ok && 'score' in sick && ok.score - sick.score).toBe(13);
  });
  it('a night warmer than normal takes points off and is named', () => {
    const ok = readyScore({ days: weeks({}), sleep: 90, loads: steady });
    const warm = readyScore({ days: weeks({ skinDelta: 1.2 }), sleep: 90, loads: steady });
    expect('score' in ok && 'score' in warm && ok.score - warm.score).toBe(12);
    expect('low' in warm && warm.low).toBe('temp');
  });
});

describe('Training load', () => {
  it('counts a hard wrestling session more than an easy run of the same length', () => {
    const base = { sessions: [], restHr: 52, age: 20 };
    const wrestle = dayLoad('x', { ...base, activities: [{ id: 'a', date: 'x', kind: 'wrestling', durationSec: 3600, intensity: 3, at: 0 } as any] });
    const run = dayLoad('x', { ...base, activities: [{ id: 'b', date: 'x', kind: 'run', durationSec: 3600, avgHr: 130, at: 0 } as any] });
    expect(wrestle).toBeGreaterThan(run);
  });
});
