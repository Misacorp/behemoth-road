import { characterOf, hexDistance, toPlayerView } from '@behemoth-road/core';
import { describe, expect, it } from 'vitest';
import { chainScenario, USERS } from '../api/fixtures.ts';
import { surveyHexes } from './survey.ts';

function scene(taken: readonly string[]) {
  const s = chainScenario({ taken });
  const state = toPlayerView(s.state);
  const me = characterOf(s.state, USERS.MISA)!;
  const at = me.at.kind === 'hex' ? me.at.hex : null;
  return { state, id: me.id, at: at! };
}

describe('the hexes you can survey', () => {
  it('are only the unexplored neighbours without the long survey', () => {
    const { state, id, at } = scene([]);
    const hexes = surveyHexes(state, id);
    expect(hexes.length).toBeGreaterThan(0);
    expect(hexes.every((h) => hexDistance(h, at) === 1)).toBe(true);
  });

  it('reach further out once the scout has the long survey, and include the neighbours', () => {
    const near = scene([]);
    const far = scene(['scout-a1', 'scout-a2']);
    const nearHexes = surveyHexes(near.state, near.id);
    const farHexes = surveyHexes(far.state, far.id);
    expect(farHexes.length).toBeGreaterThan(nearHexes.length);
    expect(farHexes.some((h) => hexDistance(h, far.at) > 1)).toBe(true);
    expect(farHexes.every((h) => hexDistance(h, far.at) <= 2)).toBe(true);
    for (const h of nearHexes) expect(farHexes.some((f) => f.q === h.q && f.r === h.r)).toBe(true);
  });

  it('are none for a character that is lost', () => {
    const { state } = scene([]);
    expect(surveyHexes(state, 'nobody')).toEqual([]);
  });
});
