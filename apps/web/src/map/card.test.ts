import { toPlayerView } from '@behemoth-road/core';
import { describe, expect, it } from 'vitest';
import { chainScenario } from '../api/fixtures.ts';
import { toView } from '../api/fixtures.ts';
import { identities } from '../game/identity.ts';
import {
  ACTION_W,
  bubbleSize,
  characterSize,
  CHARACTER_SIZE,
  inspectSize,
  SETTLEMENT_SIZE,
  settlementSize,
} from './Popover.tsx';

describe('cards that carry a Move button', () => {
  it('grow by one action button each: move, survey', () => {
    const none = inspectSize(0);
    expect(inspectSize(1).width).toBe(none.width + ACTION_W);
    expect(inspectSize(2).width).toBe(none.width + 2 * ACTION_W);
    expect(inspectSize(1).height).toBeGreaterThanOrEqual(none.height);
  });

  it("make room for Move on a settlement's card and the creature's bubble", () => {
    expect(settlementSize(false)).toEqual(SETTLEMENT_SIZE);
    expect(settlementSize(true).width).toBe(SETTLEMENT_SIZE.width + ACTION_W);
    expect(bubbleSize(2, true, true).width).toBe(bubbleSize(2, true).width + ACTION_W);
  });
});

describe('the character card and taken skills', () => {
  it('grows a row only when the character has taken a node', () => {
    expect(characterSize(false, 0).height).toBe(CHARACTER_SIZE.height);
    expect(characterSize(true, 2).height).toBeGreaterThan(CHARACTER_SIZE.height);
    expect(characterSize(true, 2).width).toBe(characterSize(true, 0).width);
  });

  it("carries every character's taken nodes in its identity, others' too", () => {
    const s = chainScenario({ role: 'scout', taken: ['scout-b1'], pipTaken: ['keeper-a1'] });
    const ids = [...identities(toView(s)).values()];
    expect(ids.filter((i) => i.skills.length > 0).map((i) => i.skills)).toEqual([
      ['keeper-a1'],
      ['scout-b1'],
    ]);
    expect(toPlayerView(s.state).characters.length).toBe(ids.length);
  });
});
