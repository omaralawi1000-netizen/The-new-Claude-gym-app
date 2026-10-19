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
    expect(sys).toContain('TALKING STEERS YOU');
    expect(sys).toContain('"Age: N (as of YYYY-MM-DD)"');
    expect(sys).toMatch(/NOT SATISFIED.*remember the preference/);
    expect(sys).toMatch(/unhappy without saying why → ask ONE short question/);
    expect(sys).toMatch(/a change of goal now → also offer set_setting goal/);
  });
  it('heavy-day talk: off and quiet by words, a catch-up only when asked, help once, eating-disorder signals', () => {
    expect(sys).toMatch(/"No catch-ups ever".*set_setting heavyDays off/);
    expect(sys).toMatch(/A catch-up only when they ask for one/);
    expect(sys).toMatch(/never in a reply that only logs something/);
    expect(sys).toMatch(/remember \(kind health; a remember, never only a note\) a line starting "Eating-disorder signal:"/);
    expect(sys).toMatch(/illness or an injury mentioned in this conversation or today, or someone under 18/);
    expect(sys).toMatch(/NUMBER FIRST/);
    expect(sys).toMatch(/BEFORE the web/);
  });
  it('the age in DATA: unknown and not asked, asked, a teen', () => {
    expect(buildCoachContext(data(), today, String)).toMatch(/age unknown \(not asked yet\)/);
    expect(buildCoachContext(data({ marks: { ageAsked: '2026-10-10' } }), today, String)).toMatch(/age unknown \(asked on 2026-10-10: don't ask again\)/);
    expect(buildCoachContext(data({ memory: [{ id: 'a', text: 'Age: 16 (as of 2026-09-01)', kind: 'other', at: 0 }] }), today, String)).toMatch(/age 16 \(UNDER 18: teen rules\)/);
  });
});

describe('frequent heavy days', () => {
  it('3+ a week two weeks running: said once, then not again', () => {
    const entries: FoodEntry[] = [];
    for (let i = 1; i <= 14; i++) entries.push(food(addDays(today, -i), i % 2 ? 3300 : 2300));
    const L = eatingLines(data({ entries }), today).join('\n');
    expect(L).toMatch(/FREQUENT heavy days: \d in the last 7 days and \d in the 7 before\. Say once/);
    expect(eatingLines(data({ entries, marks: { helpSaid: '2026-10-12' } }), today).join('\n')).toMatch(/Help was mentioned on 2026-10-12: don't repeat it/);
    // notices off: nothing about heavy days at all
    const off = data({ entries }); off.settings.heavyDays = 'off';
    expect(eatingLines(off, today).join('\n')).not.toMatch(/FREQUENT|Heavy days, last 4 weeks/);
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
