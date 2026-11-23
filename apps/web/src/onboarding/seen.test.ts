import { describe, expect, it } from 'vitest';
import { joined, notJoined } from '../api/fixtures.ts';
import { AFTER_INTRO, AFTER_PRACTICE, openingStage, withSeen } from './seen.ts';

describe('where a first open starts', () => {
  const empty: ReadonlySet<string> = new Set();

  it('walks a new player through the intro, then the practice, then the game', () => {
    expect(openingStage(notJoined(), empty)).toBe('intro');
    expect(openingStage(notJoined(), new Set(AFTER_INTRO))).toBe('practice');
    expect(openingStage(notJoined(), new Set(AFTER_PRACTICE))).toBe('game');
  });

  it('never makes a player who already has a character sit through either', () => {
    expect(openingStage(joined(), empty)).toBe('game');
  });

  it('only ever adds to the record', () => {
    const seen = withSeen(new Set(['intro']), ['hint:fog', 'intro']);
    expect([...seen].sort()).toEqual(['hint:fog', 'intro']);
  });
});
