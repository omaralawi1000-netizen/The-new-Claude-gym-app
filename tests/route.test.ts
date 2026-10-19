// @vitest-environment jsdom
// Which model answers what (review round 1, 19 Oct): risky messages and decisions to the main model thinking hard (they
// used to go to the quick one at low), quick facts and everyday logging to the quick one (a banana's calories used to go
// to the main one at high), English and Danish, both ways.
import { describe, it, expect } from 'vitest';
import { route } from '../src/lib/agentTurn';

const main = (s: string) => expect(route(s, 'medium'), s).toEqual({ effort: 'high', main: true });
const quick = (s: string) => expect(route(s, 'medium').main, s).toBe(false);

describe('the main model, thinking hard', () => {
  it('the four risky lines the review found going to the quick model', () => {
    ['I ate 2000 extra yesterday, what now?', 'How do I drop 4 kg in 10 days?', 'I keep bingeing every night', 'Jeg overspiste igen i går, hvad gør jeg?'].forEach(main);
  });
  it('eating problems, weight cuts, warning signs (English)', () => {
    ['I threw up after dinner', 'should I use laxatives', 'I skip meals to compensate', 'can I lose 3 kg in a week', 'cut 5 kg in 2 weeks for a tournament', 'how do I make weight for Saturday', 'my weigh-in is Friday', 'is a water cut safe', 'I felt faint at practice', 'chest pains when I run', 'I missed my period', 'I starve myself after big days'].forEach(main);
  });
  it('eating problems, weight cuts, warning signs (Danish, the verb forms)', () => {
    ['jeg kastede op efter aftensmaden', 'jeg kaster op når jeg har spist for meget', 'jeg brækkede mig', 'jeg trøstespiste hele aftenen', 'kan jeg tabe 4 kg på 10 dage', 'smide 3 kg på 7 dage', 'indvejning på lørdag', 'jeg skal ned i vægtklasse', 'jeg var ved at besvime', 'ondt i brystet når jeg løber', 'udebleven menstruation'].forEach(main);
  });
  it('supplements, sauna and pain when asked about', () => {
    ['should I take creatine?', 'is the sauna safe after practice', 'skal jeg tage kreatin?', 'my knee hurts, what should I do?', 'hvorfor gør det ondt i skulderen?'].forEach(main);
  });
  it('decisions and "think about it properly"', () => {
    ["what's my maintenance?", 'how many calories should I eat to bulk?', 'Why am I not losing weight?', 'Hvorfor taber jeg mig ikke?', 'should I cut or bulk', 'plan my next week', 'lav en ny plan til mig', 'think about it properly: is my split ok', 'tænk dig grundigt om'].forEach(main);
  });
  it('a photo: the main model at the setting', () => {
    expect(route('what is this', 'medium', true)).toEqual({ effort: 'medium', main: true });
  });
});

describe('the quick model', () => {
  it('quick facts and logging, low effort', () => {
    for (const s of ['how many calories in a banana', 'hvor mange kalorier er der i en banan', 'log 2 eggs', 'only 9 reps', '67 kilos same reps', 'cut the rice from dinner', 'put wrestling on Tuesday'])
      expect(route(s, 'medium'), s).toEqual({ effort: 'low', main: false });
  });
  it('words that only look risky: logged, or another meaning', () => {
    ['5 g kreatin', 'log 5 g creatine', 'faste måltider hver dag', 'ondt i benene efter træning', 'plank 60 seconds', 'I lost the cutlery', 'binder clip', 'I passed the exam', 'fastest 5k ever'].forEach(quick);
  });
  it('planning and analysis: the quick model at the setting', () => {
    expect(route('Build me a push day for wrestling season', 'high')).toEqual({ effort: 'high', main: false });
    expect(route('Why is my bench stuck?', 'medium')).toEqual({ effort: 'medium', main: false });
  });
});

describe('the time limit is only for starting to answer', () => {
  it('first words at 15 s, done at 35 s, limit 20 s: not cut; no words by 20 s: handed over', async () => {
    const { withTimeout } = await import('../src/lib/agentTurn');
    const slow = (wordsAt: number | null, doneAt: number) => (signal: AbortSignal, seen: () => void) => new Promise<string>((ok, no) => {
      if (wordsAt !== null) setTimeout(seen, wordsAt);
      const t = setTimeout(() => ok('done'), doneAt);
      signal.addEventListener('abort', () => { clearTimeout(t); no(Object.assign(new Error('aborted'), { code: 'aborted' })); });
    });
    const outer = new AbortController().signal;
    await expect(withTimeout(200, outer, slow(150, 350))).resolves.toBe('done');
    await expect(withTimeout(200, outer, slow(null, 350))).rejects.toMatchObject({ code: 'timeout' });
    await expect(withTimeout(0, outer, slow(null, 50))).resolves.toBe('done'); // (no Gemini to hand over to: it waits)
  });
});

describe('found by the exam (19 Oct)', () => {
  it('"I don\'t lose anything, my metabolism is broken" and catch-up complaints: the main model', () => {
    ["I eat 1500 a day and I don't lose anything. my metabolism is broken", 'that cut was too much. max 150 a day for catch-ups', 'jeg taber ikke noget', 'min forbrænding er i stykker', 'ingen indhentning mere'].forEach(main);
  });
});
