import { describe, expect, it } from 'vitest';
import { addSeen, isSeenId, readSeen, SEEN_IDS } from '../src/index.ts';

describe('the seen record', () => {
  it('knows its ids', () => {
    expect(isSeenId('intro')).toBe(true);
    expect(isSeenId('hint:trap')).toBe(true);
    expect(isSeenId('hint:unknown')).toBe(false);
    expect(isSeenId(3)).toBe(false);
  });

  it('reads back only known ids, once each, in list order', () => {
    expect(readSeen(['hint:fog', 'intro', 'intro', 'nope', 7])).toEqual(['intro', 'hint:fog']);
    expect(readSeen('intro')).toEqual([]);
    expect(readSeen(null)).toEqual([]);
  });

  it('adds as a union and never grows past the list', () => {
    expect(addSeen(['intro'], ['practice', 'intro'])).toEqual(['intro', 'practice']);
    expect(addSeen([], ['zzz'])).toEqual([]);
    expect(addSeen([...SEEN_IDS], [...SEEN_IDS])).toHaveLength(SEEN_IDS.length);
  });
});
