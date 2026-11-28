import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { chainScenario, toView } from '../api/fixtures.ts';
import { GameStateViewSchema } from '../api/schema.ts';
import { destinationHexes } from './destination.ts';

describe('the destination area', () => {
  it('is none when the server sends none', () => {
    expect(destinationHexes(toView(chainScenario()).game)).toEqual([]);
  });

  it('is the staged hexes, as the view reports them (offsets from the creature)', () => {
    const s = chainScenario({
      destination: [
        { q: 0, r: -3 },
        { q: 1, r: -3 },
      ],
    });
    const c = s.state.creature.centre;
    const game = toView(s).game;
    expect(destinationHexes(game)).toEqual([
      { q: c.q, r: c.r - 3 },
      { q: c.q + 1, r: c.r - 3 },
    ]);
    // And the client's schema accepts it, so a real server's field passes the parse.
    expect(v.safeParse(GameStateViewSchema, game).success).toBe(true);
  });

  it('ignores a malformed field', () => {
    expect(destinationHexes({ destination: { hexes: 'x' } })).toEqual([]);
    expect(destinationHexes({ destination: null })).toEqual([]);
  });
});
