// @vitest-environment jsdom
// The watch in detail: heart rate and steps a minute at a time and every sleep stage, sent by the Android app in "dt"
// (HealthSync.java), checked, and kept on the phone apart from the app's data (lib/watchDetail.ts).
import { describe, it, expect, beforeEach } from 'vitest';
import { applyHcFromAddress, hcLastLine, hcStatus, parseHc } from '../src/lib/healthSync';
import { clearWatchDetail, minutes, parseDetail, saveWatchDetail, watchDetail, watchDetailCount } from '../src/lib/watchDetail';
import { useStore } from '../src/state/store';
import { defaultData } from '../src/state/defaults';

const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
/** The Android app's packing (HealthSync.pack): two characters a minute, the empty end left off. */
const pack = (v: number[]) => { let n = v.length; while (n > 0 && v[n - 1] <= 0) n--; return v.slice(0, n).map((x) => ABC[x >> 6] + ABC[x & 63]).join(''); };
const enc = (o: unknown) => {
  const b = new TextEncoder().encode(JSON.stringify(o));
  let s = '';
  for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const now = Date.now();
const day = new Date(now).toISOString().slice(0, 10);
// a full day: heart rate every minute (60–179), steps in the afternoon
const hr = Array.from({ length: 1440 }, (_, i) => 60 + (i % 120));
const steps = Array.from({ length: 1440 }, (_, i) => (i >= 900 && i < 960 ? 110 : 0));
const bed = now - 9 * 3600000;
// light 20 min, deep 45, REM 25, awake 3, light 30
const night = [bed, bed + 123 * 60000, 1, 0, 20, 2, 20, 45, 3, 65, 25, 0, 90, 3, 1, 93, 30];

beforeEach(async () => {
  localStorage.clear();
  await clearWatchDetail();
  const d = defaultData(); d.settings.onboarded = true; d.settings.dayStartHour = 0;
  useStore.getState().replaceAll(d);
  Object.defineProperty(document, 'referrer', { value: 'android-app://app.aven.android/', configurable: true });
});

describe('packed minutes', () => {
  it('unpack to 1440 numbers, the empty end of the day as 0', () => {
    expect(minutes(pack(hr))).toEqual(hr);
    const half = [...steps.slice(0, 960), ...new Array(480).fill(0)];
    expect(pack(half).length).toBe(960 * 2);
    expect(minutes(pack(half))).toEqual(half);
    expect(minutes(undefined)).toEqual(new Array(1440).fill(0));
  });
});

describe('checking what the app sent', () => {
  it('keeps a real day: every minute and every stage', () => {
    const [d] = parseDetail([{ d: day, hm: pack(hr), sm: pack(steps), sp: [night] }], now);
    expect(minutes(d.hr)).toEqual(hr);
    expect(minutes(d.steps)[930]).toBe(110);
    expect(d.sleep![0].stages).toEqual([
      { stage: 1, from: 0, min: 20 }, { stage: 2, from: 20, min: 45 }, { stage: 3, from: 65, min: 25 }, { stage: 0, from: 90, min: 3 }, { stage: 1, from: 93, min: 30 },
    ]);
  });
  it('drops what makes no sense', () => {
    const bad = [...hr]; bad[10] = 400; // a heart rate of 400
    const out = parseDetail([
      { d: day, hm: pack(bad), sm: pack(steps) }, // the heart rate goes, the steps stay
      { d: 'yesterday', hm: pack(hr) },
      { d: day, hm: 'A' }, // odd length
      { d: day, sp: [[bed, bed - 1, 1, 0, 5]] }, // ends before it starts
      { d: day, sp: [[bed, bed + 60 * 60000, 9, 0, 5, 2, 0, 500]] }, // a stage that doesn't exist, one longer than the night
    ], now);
    expect(out).toHaveLength(2);
    expect(out[0].hr).toBeUndefined();
    expect(out[0].steps).toBe(pack(steps));
    expect(out[1].sleep![0].stages).toEqual([]);
  });
});

describe('through the address', () => {
  it('a week of detail fits, arrives and is kept apart from the app data', async () => {
    const dt = Array.from({ length: 7 }, (_, i) => ({ d: new Date(now - i * 86400000).toISOString().slice(0, 10), hm: pack(hr), sm: pack(steps), sp: [night] }));
    const hash = `#hc=${enc({ v: 1, avail: true, on: true, granted: true, at: now, days: [[day, 9000]], ex: [], dt, bg: true, ms: 4200 })}`;
    expect(hash.length).toBeLessThan(400000);
    const p = parseHc(hash)!;
    expect(p.dt).toHaveLength(7);
    expect(p.bg).toBe(true);
    location.hash = hash.slice(1);
    applyHcFromAddress();
    await new Promise((r) => setTimeout(r, 0));
    expect(await watchDetailCount()).toBe(7);
    expect(minutes((await watchDetail(day))!.hr)).toEqual(hr);
    expect(hcStatus()?.bg).toBe(true);
    expect(hcLastLine()).toContain('7 detail days');
    // (not in the app's data: every save would carry it)
    expect(JSON.stringify(useStore.getState())).not.toContain(pack(hr).slice(0, 200));
  });
  it('squeezed by the Android app (the usual way now): unpacked, about 4× smaller', async () => {
    const dt = Array.from({ length: 7 }, (_, i) => ({ d: new Date(now - i * 86400000).toISOString().slice(0, 10), hm: pack(hr), sm: pack(steps), sp: [night] }));
    const json = JSON.stringify({ v: 1, avail: true, on: true, granted: true, at: now, days: [[day, 9000]], ex: [], dt });
    // (squeezed the way the Android app does: raw deflate, then base64url)
    const zs = new Response(new TextEncoder().encode(json)).body!.pipeThrough(new CompressionStream('deflate-raw'));
    const zb = new Uint8Array(await new Response(zs).arrayBuffer());
    let bin = '';
    for (let i = 0; i < zb.length; i += 8192) bin += String.fromCharCode(...zb.subarray(i, i + 8192));
    const z = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(z.length * 3).toBeLessThan(enc(JSON.parse(json)).length);
    const hash = `#hc=z~${z}`;
    expect(parseHc(hash)).toBeNull(); // (needs the unpacking)
    location.hash = encodeURIComponent(hash.slice(1)); // (as Android writes it: "hc%3Dz~…")
    applyHcFromAddress();
    for (let i = 0; i < 50 && (await watchDetailCount()) < 7; i++) await new Promise((r) => setTimeout(r, 10));
    expect(await watchDetailCount()).toBe(7);
    expect(useStore.getState().steps.find((x) => x.date === day)?.count).toBe(9000);
    expect(location.hash).toBe('');
  });
  it('a day that comes again without heart rate keeps the heart rate it had', async () => {
    await saveWatchDetail(parseDetail([{ d: day, hm: pack(hr) }], now));
    await saveWatchDetail(parseDetail([{ d: day, sm: pack(steps) }], now));
    const d = (await watchDetail(day))!;
    expect(d.hr).toBe(pack(hr));
    expect(d.steps).toBe(pack(steps));
  });
  it('days over a year old go', async () => {
    const old = new Date(now - 400 * 86400000).toISOString().slice(0, 10);
    await saveWatchDetail([{ date: old, hr: pack(hr), at: now }, { date: day, hr: pack(hr), at: now }], now);
    expect(await watchDetail(old)).toBeNull();
    expect(await watchDetail(day)).not.toBeNull();
  });
});

// body composition, temperature, climbing and GPS routes (20 Oct, v0.1.168)
import { parseRoutes, routeOf, routePoints, saveRoutes } from '../src/lib/watchDetail';
import { mergeHc } from '../src/lib/healthSync';

/** HealthSync.polyline's encoding (Google's encoded polyline, 1e-5°). */
const poly = (pts: [number, number][]) => {
  let out = '', la0 = 0, lo0 = 0;
  const enc = (v: number) => { let x = v < 0 ? ~(v << 1) : v << 1; while (x >= 0x20) { out += String.fromCharCode((0x20 | (x & 0x1f)) + 63); x >>= 5; } out += String.fromCharCode(x + 63); };
  for (const [la, lo] of pts) { const a = Math.round(la * 1e5), o = Math.round(lo * 1e5); enc(a - la0); enc(o - lo0); la0 = a; lo0 = o; }
  return out;
};

describe('more from the watch', () => {
  it('body composition, BMR, body and skin temperature per day; how much a workout climbed', () => {
    const p = parseHc(`#hc=${enc({ v: 1, avail: true, on: true, granted: true, at: now, days: [], hd: [{ d: day, lb: 64.3, bw: 47.1, bm: 3.2, bmr: 1780, bt: 36.8, sk: 0.42, skb: 33.9 }, { d: day, lb: 900, sk: 12 }],
      ex: [{ id: 'run1', t: 'run', s: now - 3600000, e: now - 1800000, m: 5200, el: 64 }] })}`)!;
    expect(p.hd![0]).toMatchObject({ leanKg: 64.3, bodyWaterKg: 47.1, boneKg: 3.2, bmr: 1780, bodyTemp: 36.8, skinDelta: 0.42, skinBase: 33.9 });
    expect(p.hd![1]).toBeUndefined(); // (nonsense only: dropped)
    const r = mergeHc(p, { activities: [], steps: [] }, 0);
    expect(r.activities[0]).toMatchObject({ kind: 'run', distanceM: 5200, elevationM: 64 });
  });
  it('a GPS route arrives, decodes to the same places and is kept by the workout id', async () => {
    const pts: [number, number][] = [[56.15674, 10.21076], [56.15701, 10.21152], [56.1581, 10.2131]];
    expect(routePoints(poly(pts))).toEqual(pts);
    const rt = parseRoutes([{ id: 'run1', p: poly(pts) }, { id: 'bad', p: '!!' }, { id: '', p: poly(pts) }], now);
    expect(rt.map((x) => x.id)).toEqual(['run1']);
    await saveRoutes(rt);
    expect(routePoints((await routeOf('run1'))!.poly)).toEqual(pts);
  });
});
