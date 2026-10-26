// The one look at an answer before it is shown (living coach, 26 Oct): what the reply says it did must be done by an
// action, an action must have something in it, and a GOALS MUST SAY line must reach the reply.
import { describe, it, expect } from 'vitest';
import { answerProblems, checkNote, mustSays } from '../src/lib/answerCheck';
import type { AgentAction } from '../src/lib/agent';

const SYS = `RULES…\n\nDATA:\nGOALS (told in chat). Running:\n- [memory 4] Goal: 82 → 81 kg. Reached. MUST SAY THIS TURN (holding it): those days are what undoes it at maintenance; the plan to hold it caps them at maintenance + 300 = 3,540, about 1,040 less than they average.\nGOAL WATCH (what a coach keeps an eye on):\n- MUST SAY THIS TURN (once, with the numbers): no strength training in 2 weeks, 0 sessions.`;
const long = (s: string) => `${s} ${'Well done, that is a real result and you earned it. '.repeat(5)}`;

describe('answer check', () => {
  it('a routine said to be changed with an empty edit, or made with none sent', () => {
    const empty: AgentAction[] = [{ type: 'edit_routine', routine: 'Push', add: [], change: [], remove: [] }];
    const p = answerProblems('I\'ve updated your goal plan and your Push routine to match this.', empty, '');
    expect(p.some((x) => /edit_routine for "Push" has nothing/.test(x))).toBe(true);
    expect(p.some((x) => /routine was made or changed/.test(x))).toBe(true);
    expect(p.some((x) => /plan was saved/.test(x))).toBe(true);
    expect(answerProblems('I\'ve created a simple Full Body routine for you to preview.', [], '')).toHaveLength(1);
    expect(answerProblems('I\'ve put together a Full Body routine below: tap Apply.', [{ type: 'create_routine', name: 'Full Body', items: [] }], '')).toHaveLength(0);
  });
  it('a plan said to be updated needs its goalPlan; a target said to be set needs set_setting', () => {
    const rem: AgentAction = { type: 'remember', kind: 'goal', text: 'Goal: bench 100', replaces: 4 };
    expect(answerProblems('I\'ve updated your goal plan.', [rem], '')[0]).toMatch(/goalPlan/);
    expect(answerProblems('I\'ve updated your goal plan.', [{ ...rem, plan: '4 × 5 at 77.5' }], '')).toHaveLength(0);
    expect(answerProblems('I\'ve set your daily target to 3,340 kcal.', [], '')[0]).toMatch(/set_setting/);
    expect(answerProblems('Want me to set your target to 3,340 kcal?', [], '')).toHaveLength(0);
  });
  it('a MUST SAY in GOALS reaches the reply (its number), GOAL WATCH ones are not checked, short replies are left alone', () => {
    expect(mustSays(SYS)).toHaveLength(1);
    expect(answerProblems(long('You hit 81 kg. Maintenance is about 3,240 kcal.'), [], SYS)[0]).toMatch(/MUST SAY/);
    expect(answerProblems(long('Cap the weekend days at 3,540 kcal.'), [], SYS)).toHaveLength(0);
    expect(answerProblems(long('Cap the weekend days at 3.540 kcal.'), [], SYS)).toHaveLength(0);
    expect(answerProblems('Logged 80.7 kg.', [], SYS)).toHaveLength(0);
  });
  it('the note names each problem and carries the answer to fix', () => {
    const n = checkNote(['A', 'B'], { reply: 'x', actions: [] });
    expect(n).toMatch(/CHECK OF YOUR ANSWER[^]*- A\n- B[^]*Your answer was: \{"reply":"x"/);
  });
});

import { changeFromReply } from '../src/lib/agent';
describe('an empty routine change read from the reply', () => {
  const push = { name: 'Push', items: [{ id: 'i1', exerciseId: 'bench-press', workingSets: 3, repMin: 8, repMax: 12 }] as any[] };
  const nameOf = () => 'Barbell Bench Press';
  it('the new sets and reps after "to", with the exercise and routine named', () => {
    expect(changeFromReply('Let\'s move Barbell Bench Press in Push to 4 sets of 4–6 reps for the next 4 weeks.', push, nameOf)).toEqual([{ exercise: 'Barbell Bench Press', sets: 4, repMin: 4, repMax: 6 }]);
    expect(changeFromReply('I\'ve put the Push routine update (Barbell Bench Press from 3×8–12 to 4×5–8) up for you.', push, nameOf)).toEqual([{ exercise: 'Barbell Bench Press', sets: 4, repMin: 5, repMax: 8 }]);
  });
  it('nothing from a weight on the bar, or a sentence about something else', () => {
    expect(changeFromReply('Aim for 77.5 kg × 6 on Barbell Bench Press in Push.', push, nameOf)).toEqual([]);
    expect(changeFromReply('Your squat went to 4 sets of 5.', push, nameOf)).toEqual([]);
  });
});

describe('answer check: no false alarms (judge, 26 Oct)', () => {
  it('Danish "mål" as a goal, an if, a fact, and a curly apostrophe', () => {
    expect(answerProblems('Jeg har sat dit mål op til 19. november.', [], '')).toHaveLength(0);
    expect(answerProblems('Jeg har opdateret dit kaloriemål til 2.460 kcal.', [], '')).toHaveLength(1);
    expect(answerProblems('If I set your target to 2,460 you land on the 16th.', [], '')).toHaveLength(0);
    expect(answerProblems('Your target is set at 2,500 right now.', [], '')).toHaveLength(0);
    expect(answerProblems('I’ve updated your Push routine.', [], '')).toHaveLength(1);
  });
});

describe('dates in a reply are said in words (Flash wrote "lands around 2027-01-04", 26 Oct)', () => {
  it('this year without the year, another year with it, Danish too', async () => {
    const { readableDates } = await import('../src/lib/answerCheck');
    expect(readableDates('Christmas (2026-12-25), or around 2027-01-04.', 'en', '2026-10-26')).toBe('Christmas (25 December), or around 4 January 2027.');
    expect(readableDates('til 2026-12-24', 'da', '2026-10-26')).toBe('til 24. december');
  });
});

describe('one question, and a stated target is set (judge, 26 Oct)', () => {
  it('two questions, or "…, or should I …?", is flagged; one is not', async () => {
    const { answerProblems } = await import('../src/lib/answerCheck');
    expect(answerProblems('What date in December is the weigh-in, or should I set this up for 1 December?', [], '')).toHaveLength(1);
    expect(answerProblems('Is this for a weigh-in? Want me to set it up?', [], '')).toHaveLength(1);
    expect(answerProblems('Is this for a wrestling weigh-in?', [], '')).toEqual([]);
  });
  it('"All set … Daily target: 2,460 kcal" with no set_setting is flagged', async () => {
    const { answerProblems } = await import('../src/lib/answerCheck');
    expect(answerProblems('All set up: 79.7 kg by 16 November.\n- Daily target: 2,460 kcal, 180 g protein.', [], '')).toHaveLength(1);
    expect(answerProblems('All set up: 79.7 kg by 16 November.\n- Daily target: 2,460 kcal, 180 g protein.', [{ type: 'set_setting', pairs: [] } as any], '')).toEqual([]);
    expect(answerProblems('Keep your 2,500 kcal target this week.', [], '')).toEqual([]);
  });
});

describe('a goal lift\'s new plan is saved; no "shall I save it?" under a saved goal (26 Oct)', () => {
  it('flags both, and leaves the right answers alone', async () => {
    const { answerProblems } = await import('../src/lib/answerCheck');
    const sys = 'GOALS (told in chat): … When you change its plan (one change), make it in this answer …';
    const edit = { type: 'edit_routine', routine: 'Push', change: [{ exercise: 'Barbell Bench Press', sets: 5, repMin: 3, repMax: 5 }] } as any;
    expect(answerProblems('I have updated your Push routine to 5 × 3–5.', [edit], sys)).toHaveLength(1);
    expect(answerProblems('I have updated your Push routine to 5 × 3–5.', [edit, { type: 'remember', text: 'Goal', replaces: 4, plan: '5 × 3–5 at 77.5' } as any], sys)).toEqual([]);
    const goal = { type: 'remember', text: 'Goal: 74.8 → 71.8 kg by 2026-12-24', kind: 'goal' } as any;
    expect(answerProblems('Shall I set your targets to 2,390 kcal and save this goal?', [goal], '')).toHaveLength(1);
    expect(answerProblems('Shall I set your targets to 2,390 kcal and save this goal?', [], '')).toEqual([]);
    expect(answerProblems('Saved. Want me to set up two full-body routines?', [goal], '')).toEqual([]);
  });
});

describe('nothing-to-choose questions and long replies are flagged (26 Oct)', () => {
  it('flags "keep the date?", ", or should we …", and 150+ words', async () => {
    const { answerProblems } = await import('../src/lib/answerCheck');
    expect(answerProblems('Keep 2,350 kcal. Should we keep 16 November as your target date?', [], '')).toHaveLength(1);
    expect(answerProblems('Is this for a weigh-in, or should we lock in the 4-week plan?', [], '')).toHaveLength(1);
    expect(answerProblems(Array(160).fill('word').join(' ') + ' at 0.5 kg a week.', [], '')).toHaveLength(1);
    expect(answerProblems(Array(160).fill('word').join(' ') + '.', [], '')).toEqual([]);
    expect(answerProblems('Want me to move your goal date to 19 November?', [], '')).toEqual([]);
  });
});
