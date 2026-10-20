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

describe('found by the final reviews (19 Oct)', () => {
  it('dictated risky lines: the main model', () => {
    ['jeg har spist alt for meget i aften hvad gør jeg', 'I ate way too much tonight what should I do', 'jeg har ædt alt for meget i går hvad skal jeg gøre',
      'I want to drop to 74 for the tournament', 'jeg vil gerne tabe 5 kilo inden turneringen', 'hvordan taber jeg 3 kg på en uge', 'Jeg skal tabe 3 kg på en uge',
      'ondt i knæet efter squat skal jeg stoppe', 'my knee hurts when I squat should I stop', "I'm going to skip dinner because I ate too much at lunch",
      'jeg springer aftensmaden over fordi jeg spiste for meget til frokost', 'jeg springer måltider over for at kompensere', 'I feel dizzy after cutting water',
      'how do I cut weight for my match on Saturday', 'I need to lose 4 kilos by Saturday', 'should I fast tomorrow to make up for last night?',
      'I feel out of control around food', 'jeg skal ned 3 kg til stævnet', 'is it ok to train with a sore shoulder'].forEach(main);
  });
  it('logging and everyday words: the quick model', () => {
    ['kan du logge 5 g kreatin', 'can you log 5g creatine', 'kan du logge sauna 20 min', "I'm starving, log 2 eggs", 'morning weigh in 81.2', 'log my weigh in 84.5',
      'hvad nu hvis jeg spiser pizza i morgen', 'I binge watched netflix and had pizza', "what's a good pre-workout meal", 'how many calories in a scoop of pre-workout'].forEach(quick);
  });
  it('Danish and English plans alike', () => {
    expect(route('lav en plan for næste uge', 'medium').main).toBe(route('plan my next week', 'medium').main);
  });
});

describe('the model chooser (Coach 2.1, 20 Oct): obvious cases at once, the rest read by the quick model', async () => {
  const { fastRoute, chooseModel } = await import('../src/lib/agentTurn');
  it('logging and quick facts: quick, no call; risky and decision phrases: main thinking hard, no call; a photo: main', () => {
    for (const s of ['log 2 eggs', 'only 9 reps', '67 kilos same reps', 'bench 100 for 8, 8, 6', 'how many calories in a banana']) expect(fastRoute(s, 'high')?.tier, s).toBe('quick');
    for (const s of ['I threw up after dinner', 'Hvorfor taber jeg mig ikke?', 'should I cut or bulk']) expect(fastRoute(s, 'high')?.tier, s).toBe('main_high');
    expect(fastRoute('what is this', 'high', true)?.tier).toBe('main');
    for (const s of ['why?', 'Hvorfor tager I mig jer mig ikke?', 'and tomorrow?', 'what should I eat tonight']) expect(fastRoute(s, 'high'), s).toBeNull();
  });
  it('the rest goes where the quick model says; it sees the conversation before and that it was dictated', async () => {
    let seen = '';
    const r = await chooseModel('Hvorfor tager I mig jer mig ikke?', { setting: 'high', dictated: true, prev: [{ role: 'user', text: 'morning' }, { role: 'model', text: 'Morning! Yesterday ended +1,890 kcal.' }], ask: async (_s, u) => { seen = u; return { tier: 'main' }; } });
    expect(r).toMatchObject({ main: true, tier: 'main' });
    expect(seen).toMatch(/Message \(dictated\): Hvorfor tager/);
    expect(seen).toMatch(/Coach: Morning! Yesterday ended/);
    expect(await chooseModel('why?', { setting: 'high', ask: async () => '{"tier":"quick_think"}' })).toMatchObject({ main: false, effort: 'medium' });
  });
  it('a chooser that fails, answers nonsense or is slow: the phrase lists decide', async () => {
    expect((await chooseModel('why is my bench stuck?', { setting: 'medium', ask: async () => { throw new Error('offline'); } })).tier).toBe('fallback');
    expect((await chooseModel('why is my bench stuck?', { setting: 'medium', ask: async () => ({ tier: 'genius' }) })).tier).toBe('fallback');
    expect((await chooseModel('why is my bench stuck?', { setting: 'medium', timeoutMs: 20, ask: () => new Promise((ok) => setTimeout(() => ok({ tier: 'main' }), 200)) })).tier).toBe('fallback');
  });
});

describe('found by the Coach 2.1 review (20 Oct)', async () => {
  const { fastRoute, chooseModel, mentionsHeavy, withTimeout } = await import('../src/lib/agentTurn');
  it('short statements about not eating, weight, pills, pain or age are read by the chooser, never sent straight to the quick model', () => {
    for (const s of ['fasting tomorrow to make up', "I'm not eating tomorrow", 'jeg spiser ikke noget i morgen', 'ate 4000 kcal last night, fasting tomorrow', 'only water until friday', 'sauna tonight to drop weight', '2 hours cardio tomorrow to burn it off', 'took some dulcolax', 'jeg tog afføringspiller', 'I hate my body', 'need to be 74 by saturday', 'jeg skal veje 74 på lørdag', 'headache since practice', 'Im 16 btw', "I haven't eaten in 2 days", 'I feel fat and disgusting', 'I am pregnant', 'I keep gaining weight', 'I am always hungry'])
      expect(fastRoute(s, 'high'), s).not.toMatchObject({ tier: 'quick' });
  });
  it('real commands, thanks and plain logs still skip it', () => {
    for (const s of ['dark mode please', 'move it to lunch', 'thanks!', 'ok', 'undo that', 'start my workout', 'delete the banana', 'log 2 eggs', '200 g chicken for lunch', 'I weighed in this morning at 97.3 kg', 'samme igen', 'only 9 reps'])
      expect(fastRoute(s, 'high')?.tier, s).toBe('quick');
  });
  it('Stop while it is choosing stops the turn (it used to fall back and answer anyway)', async () => {
    const c = new AbortController();
    const p = chooseModel('why is my bench stuck?', { setting: 'high', signal: c.signal, ask: (_s, _u, signal) => new Promise((_, no) => signal.addEventListener('abort', () => no(Object.assign(new Error('aborted'), { code: 'aborted' })))) });
    setTimeout(() => c.abort(), 10);
    await expect(p).rejects.toMatchObject({ code: 'aborted' });
    // and a request started after Stop is stopped too
    await expect(withTimeout(5000, c.signal, (signal) => new Promise((ok, no) => { if (signal.aborted) no(new Error('stopped')); else ok('ran'); }))).rejects.toThrow('stopped');
  });
  it('no quick model on the key: no choosing call at all (never the main model just to choose)', async () => {
    expect((await chooseModel('why is my bench stuck?', { setting: 'medium' })).tier).toBe('fallback');
  });
  it('a heavy day counts as talked about by its own number (rounded is fine), never by a number inside another', () => {
    expect(mentionsHeavy('Your target is 2,300 today.', 300)).toBe(false);
    expect(mentionsHeavy('12000 steps today, nice.', 1200)).toBe(false);
    expect(mentionsHeavy('Trim the fat off the chicken before cooking.', 1400)).toBe(false);
    expect(mentionsHeavy('Yesterday went about 1,200 over.', 1187)).toBe(true);
    expect(mentionsHeavy('You overate a bit yesterday, no stress.', 1500)).toBe(true);
    expect(mentionsHeavy('I går var 2.000 kcal over.', 2000)).toBe(true);
  });
});
