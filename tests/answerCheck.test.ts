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
