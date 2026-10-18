// @vitest-environment jsdom
// Coach 2.0, phase 5b, part C: never lose what you said. A slow line is a timeout (Gemini answers, or Try again), not a
// Stop; a question that got no answer is kept but not read as answered; "plank" doesn't make it think hard; the quota
// comes back at a time in your own clock; a new install starts its day at 04:00 (yours keeps its own).
import { describe, it, expect, beforeEach } from 'vitest';
import { effortFor, withTimeout } from '../src/lib/agentTurn';
import { AiError, quotaBackAt } from '../src/lib/gemini';
import { appendExchange, dropFailed, readThread, threadTurns } from '../src/lib/thread';
import { defaultData, normaliseData } from '../src/state/defaults';
import { findNudges } from '../src/lib/nudges';
import { makeT } from '../src/lib/i18n';

beforeEach(() => localStorage.clear());

describe('how hard to think', () => {
  it('whole words only', () => {
    expect(effortFor('plank 60 seconds', 'high')).toBe('low');
    expect(effortFor('log a painting of food lol', 'high')).toBe('low');
    expect(effortFor('build me a push day', 'high')).toBe('high');
    expect(effortFor('why is my bench stuck?', 'high')).toBe('high');
    expect(effortFor('hvorfor går det ikke frem', 'high')).toBe('high');
    expect(effortFor('my shoulder hurts', 'high')).toBe('high');
  });
});

describe('a slow line is not a Stop', () => {
  const wait = (signal: AbortSignal) => new Promise((_, no) => signal.addEventListener('abort', () => no(new AiError('aborted'))));
  it('the time limit is a timeout', async () => {
    await expect(withTimeout(30, new AbortController().signal, wait)).rejects.toMatchObject({ code: 'timeout' });
  });
  it('Stop is still Stop', async () => {
    const c = new AbortController();
    const p = withTimeout(1000, c.signal, wait);
    c.abort();
    await expect(p).rejects.toMatchObject({ code: 'aborted' });
  });
});

describe('a question that got no answer', () => {
  it('is kept with Try again, but not read by the model as answered; trying again replaces it', () => {
    appendExchange({ said: 'how was my week?', reply: '', results: [], failed: 'Slow connection.' });
    const list = readThread();
    expect(list.map((m) => m.role)).toEqual(['user', 'error']);
    expect((list[1] as any).retry.text).toBe('how was my week?');
    expect(threadTurns(list, 0)).toEqual([]);
    dropFailed('how was my week?');
    expect(readThread()).toEqual([]);
  });
});

describe('times in your own clock', () => {
  it('the free quota is back at midnight in California, said in local time', () => {
    const at = new Date('2026-10-18T12:00:00Z'); // 05:00 in Los Angeles
    expect(quotaBackAt(at)).toBe(new Date('2026-10-19T07:00:00Z').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }));
  });
  it('a new install starts the day at 04:00; saved settings keep their own', () => {
    expect(defaultData().settings.dayStartHour).toBe(4);
    const old = defaultData() as any; delete old.settings.dayStartHour;
    expect(normaliseData(old).settings.dayStartHour).toBe(0);
    const mine = defaultData() as any; mine.settings.dayStartHour = 2;
    expect(normaliseData(mine).settings.dayStartHour).toBe(2);
  });
});

describe('no nagging', () => {
  it('a health note older than four weeks is asked about once', () => {
    const d = defaultData();
    d.memory = [{ id: 'm1', text: 'Left knee hurts on squats', kind: 'health', at: Date.now() - 40 * 86400000 }];
    const n = findNudges(d, '2026-10-18', 10, makeT('en') as any, 'en', () => '').find((x) => x.id === 'health-old:m1');
    expect(n?.title).toBe('Still true? “Left knee hurts on squats”');
    expect(n?.action?.run).toMatchObject({ type: 'coach' });
    d.memory[0].at = Date.now() - 5 * 86400000;
    expect(findNudges(d, '2026-10-18', 10, makeT('en') as any, 'en', () => '').some((x) => x.id.startsWith('health-old'))).toBe(false);
  });
});
