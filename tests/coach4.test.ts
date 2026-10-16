// @vitest-environment jsdom
// Coach 2.0, phase 3: memory that grows. The whole conversation is kept and searched; memory notes are replaced and end by
// themselves; the Coach learns from what is applied and undone; the week is reviewed from numbers the app computes.
import { describe, it, expect, beforeEach } from 'vitest';
import { archive, archived, clearArchive, importArchive, searchArchive } from '../src/lib/archive';
import { readThread, threadSaid, writeThread, type ThreadMsg } from '../src/lib/thread';
import { runLookups } from '../src/lib/agentLookup';
import { useStore, allExercises } from '../src/state/store';
import { defaultData } from '../src/state/defaults';
import { buildBackup, parseBackup } from '../src/lib/backup';

const DAY = 86_400_000;
const env = () => ({ today: '2026-10-16', lang: 'en' as const, pool: allExercises(useStore.getState().exercises), mealLabel: (x: string) => x });

describe('the whole conversation, kept', () => {
  beforeEach(async () => { await clearArchive(); localStorage.clear(); useStore.getState().replaceAll(defaultData('en')); });

  it('keeps what the chat lets go of (the chat holds 60, the archive all of it)', () => {
    const t0 = Date.now() - 200 * DAY;
    const msgs: ThreadMsg[] = [];
    for (let i = 0; i < 100; i++) msgs.push({ id: `m${i}`, role: i % 2 ? 'model' : 'user', text: i === 0 ? 'My left knee hurts on lunges' : `message ${i}`, at: t0 + i * 60_000 });
    writeThread(msgs);
    expect(readThread()).toHaveLength(60);
    expect(archived()).toHaveLength(100);
    const out = runLookups(useStore.getState(), [{ kind: 'conversations', query: 'knee' }], { ...env(), said: threadSaid(readThread()) });
    expect(out).toMatch(/User: My left knee hurts on lunges/);
    expect(out).toMatch(/↳ Coach: message 1/); // with the answer beside it
  });

  it('writes a message once, and again only when it changed (a card applied later)', () => {
    archive([{ id: 'a', at: 1, role: 'cards', text: '(preview, not applied: Your week)' }]);
    archive([{ id: 'a', at: 5, role: 'cards', text: '(preview, not applied: Your week)' }]);
    archive([{ id: 'a', at: 9, role: 'cards', text: '(done: Your week)' }]);
    expect(archived()).toEqual([{ id: 'a', at: 1, role: 'cards', text: '(done: Your week)' }]);
  });

  it('searches in Danish and English, by the start of a word, best match first, within a range', () => {
    const list = [
      { at: Date.parse('2026-08-02T10:00'), role: 'user' as const, text: 'Mit knæ gør ondt efter brydning' },
      { at: Date.parse('2026-08-02T10:01'), role: 'model' as const, text: 'Tag det roligt med squat i dag.' },
      { at: Date.parse('2026-09-10T09:00'), role: 'user' as const, text: 'log a banana' },
      { at: Date.parse('2026-10-01T09:00'), role: 'user' as const, text: 'knæet er bedre nu' },
    ];
    expect(searchArchive(list, 'knæ').map((x) => x.text)).toEqual(['Mit knæ gør ondt efter brydning', 'knæet er bedre nu']);
    expect(searchArchive(list, 'knæ', '2026-09-01').map((x) => x.text)).toEqual(['knæet er bedre nu']);
    expect(searchArchive(list, 'what did i say about the')).toEqual([]); // only words that carry meaning count
    expect(searchArchive(list, 'knæ brydning')[0].beside?.text).toBe('Tag det roligt med squat i dag.');
  });

  it('rides along in backups and merges back in (an old backup without it still restores)', () => {
    archive([{ id: 'x1', at: 1000, role: 'user', text: 'hello' }]);
    const b = buildBackup();
    expect(b.chat).toHaveLength(1);
    const parsed = parseBackup(JSON.stringify(b), 'en');
    clearArchive();
    importArchive(parsed.chat);
    expect(archived().map((m) => m.text)).toEqual(['hello']);
    const old = parseBackup(JSON.stringify({ app: 'aven', v: 1, data: defaultData('en') }), 'en');
    expect(old.chat).toBeUndefined();
    importArchive(old.chat);
    expect(archived()).toHaveLength(1);
  });
});
