// @vitest-environment jsdom
// The Coach's rules after review round 1 (19 Oct): talking steers it (plans, age, "that was too much"), heavy-day talk
// within its limits, help said once, number first for a new user or a teen, no one person's habits written in for
// everyone, and the handbook's science fixes.
import { describe, it, expect } from 'vitest';
import { AGENT_SYSTEM, buildCoachContext } from '../src/lib/coachContext';
import { INSIGHT_SYSTEM, REVIEW_SYSTEM } from '../src/lib/gemini';
import { HANDBOOK_CORE, handbookTopic } from '../src/lib/handbook';
import { eatingLines } from '../src/lib/eating';
import { defaultData } from '../src/state/defaults';
import { addDays } from '../src/lib/dates';
import type { AppData, FoodEntry } from '../src/lib/types';

const today = '2026-10-19';
let n = 0;
const food = (date: string, kcal: number): FoodEntry => ({ id: `e${n++}`, date, mealId: 'dinner', at: new Date(`${date}T20:30:00`).getTime(), snap: { name: 'x', basis: 'g', per100: { kcal } } as any, qty: { amount: 100, unit: 'g' } as any, base: 100, nutrients: { kcal, protein: 20 } });
const data = (o: Partial<AppData> = {}): AppData => { const d = defaultData(); d.settings.dayStartHour = 0; d.settings.goals.kcal = 2500; d.settings.profile.goal = 'fatloss'; return { ...d, ...o }; };

describe('talking steers the Coach', () => {
  const sys = AGENT_SYSTEM('en');
  it('plans, goal changes, age and dissatisfaction are remembered and followed', () => {
    expect(sys).toMatch(/Plans ahead.*remember with until/);
    expect(sys).toContain('"Age: N (as of YYYY-MM-DD)"');
    expect(sys).toMatch(/NOT SATISFIED.*remember the preference/);
    expect(sys).toMatch(/a change of goal now → also offer set_setting goal/);
  });
  it('heavy-day talk: off and quiet by words, a catch-up only when asked, help once, eating-disorder signals', () => {
    expect(sys).toMatch(/"No catch-ups ever".*set_setting heavyDays off/);
    expect(sys).toMatch(/A catch-up only when they ask for one/);
    expect(sys).toMatch(/remember \(kind health; a remember, never only a note\) a line starting "Eating-disorder signal:"/);
    expect(sys).toMatch(/they mention illness or an injury now, or they are under 18/);
    expect(sys).toMatch(/Don't send them to a doctor or dietitian for it/);
  });
  it('the age in DATA: unknown and not asked, asked, a teen', () => {
    expect(buildCoachContext(data(), today, String)).toMatch(/age unknown\./);
    expect(buildCoachContext(data({ marks: { ageAsked: '2026-10-10' } }), today, String)).toMatch(/age unknown \(asked on 2026-10-10, not answered\)/);
    expect(buildCoachContext(data({ memory: [{ id: 'a', text: 'Age: 16 (as of 2026-09-01)', kind: 'other', at: 0 }] }), today, String)).toMatch(/age 16 \(under 18\)/);
  });
});

describe('frequent heavy days', () => {
  it('3+ a week two weeks running: a fact, never an order to say something, and no doctor', () => {
    const entries: FoodEntry[] = [];
    for (let i = 1; i <= 14; i++) entries.push(food(addDays(today, -i), i % 2 ? 3300 : 2300));
    const L = eatingLines(data({ entries }), today).join('\n');
    expect(L).toMatch(/Frequent heavy days: \d in the last 7 days and \d in the 7 before; \d weeks running\.$/m);
    expect(L).not.toMatch(/doctor|dietitian/);
    // (no doctor or GP line, ever: Omar, 25 Oct)
    expect(eatingLines(data({ entries, marks: { helpSaid: '2026-10-12' } }), today).join('\n')).not.toMatch(/GP|dietitian|doctor/);
    // notices off: nothing about heavy days at all
    const off = data({ entries }); off.settings.heavyDays = 'off';
    expect(eatingLines(off, today).join('\n')).not.toMatch(/Frequent|Heavy days, last 4 weeks/);
  });
});

describe('nothing about one person written in for everyone', () => {
  it('no "most likely evenings", no "wrestling tracker", sport counts as hard training', () => {
    expect(AGENT_SYSTEM('en')).not.toMatch(/most likely evenings/);
    expect(INSIGHT_SYSTEM('en')).not.toMatch(/wrestling tracker/);
    expect(REVIEW_SYSTEM('en')).not.toMatch(/wrestling tracker/);
    expect(REVIEW_SYSTEM('en')).toMatch(/Sport sessions .* count as hard training/);
    expect(INSIGHT_SYSTEM('en')).toMatch(/Never bring up heavy days/);
  });
});

describe('the handbook', () => {
  it('science fixes', () => {
    expect(HANDBOOK_CORE).toMatch(/sleep 8–10 h/);
    expect(HANDBOOK_CORE).toMatch(/\+0\.5–1\.5 kg before a period/);
    expect(HANDBOOK_CORE).toMatch(/never a water cut/);
    expect(handbookTopic('newcomer')).toMatch(/1\.2 sitting most of the day/);
    expect(handbookTopic('bulking')).toMatch(/over TRUE MAINTENANCE/);
    expect(handbookTopic('teens')).toMatch(/2\.5 mg\/kg/);
  });
  it('whole words, up to 3 topics', () => {
    expect(handbookTopic('e')).toMatch(/^Handbook topics:/);
    const both = handbookTopic('teens cutting');
    expect(both).toMatch(/TEENS \(under 18\)/);
    expect(both).toMatch(/CUTTING:/);
    expect(handbookTopic('weight class')).toMatch(/MAKING WEIGHT/);
    expect(handbookTopic('teen')).toMatch(/TEENS/);
  });
});

describe('DATA is facts, never orders (Coach 2.1, 20 Oct: a "say once" line put a doctor into an unrelated answer)', () => {
  const ORDER = /\b(say|mention|tell them|bring it up|ask (them|about)|offer it|don'?t repeat|never bring)\b/i;
  it('the eating lines in every mode only state what is so', () => {
    const entries: FoodEntry[] = [];
    for (let i = 1; i <= 14; i++) entries.push(food(addDays(today, -i), i % 2 ? 3300 : 2300));
    for (const mode of [undefined, 'quiet', 'off'] as const) {
      const d = data({ entries, marks: mode ? {} : { helpSaid: '2026-10-12' } }); d.settings.heavyDays = mode;
      for (const line of eatingLines(d, today)) expect(line, line).not.toMatch(ORDER);
    }
  });
  it('a heavy day counts as talked about only when the reply talked about it', async () => {
    const { mentionsHeavy } = await import('../src/lib/agentTurn');
    expect(mentionsHeavy('Yesterday was +2,000 kcal: mostly water.', 2000)).toBe(true);
    expect(mentionsHeavy('I går var 2.000 kcal over.', 2000)).toBe(true);
    expect(mentionsHeavy('The catch-up is small.', 2000)).toBe(true);
    expect(mentionsHeavy('Logged 2 eggs. Bench looks strong this week.', 2000)).toBe(false);
  });
});
