import { describe, expect, it } from 'vitest';
import {
  createGame,
  type GameState,
  hexDistance,
  hexKey,
  isCreatureHex,
  isReachable,
  legalMoves,
  move,
  nextDay,
  predictCreature,
  visibilityAt,
  windowHexes,
} from '../src/index.ts';

/** The walker spends its actions closing in on the creature's centre. */
const walkTowardsCreature = (state: GameState, id: string): GameState => {
  let s = state;
  for (;;) {
    const here = s.characters.find((c) => c.id === id)!.position;
    const centre = s.creature.centre;
    const best = legalMoves(s, id)
      .filter((h) => hexDistance(h, centre) < hexDistance(here, centre))
      .sort((a, b) => hexDistance(a, centre) - hexDistance(b, centre))[0];
    if (!best) return s;
    const result = move(s, id, best);
    if (!result.ok) return s;
    s = result.state;
  }
};

describe('30 seeded days', () => {
  it('keeps its invariants with a walker who follows and a sitter who stays put', () => {
    let state = createGame(2026, { characterIds: ['walker', 'sitter'] });
    const { windowRadius, graceDays } = state.config;
    let sitterLostOn: number | undefined;

    for (let d = 0; d < 30; d++) {
      state = walkTowardsCreature(state, 'walker');
      const options = predictCreature(state).map((o) => hexKey(o.centre));
      state = nextDay(state);

      expect(options).toContain(hexKey(state.creature.centre));
      const window = windowHexes(state);
      expect(window.every((h) => visibilityAt(state, h) === 'seen')).toBe(true);
      expect(window.every((h) => hexDistance(h, state.creature.centre) <= windowRadius)).toBe(true);

      for (const c of state.characters) {
        if (c.status !== 'active') continue;
        expect(isReachable(state, c.position)).toBe(true);
        expect(isCreatureHex(state, c.position)).toBe(false);
        expect(hexDistance(c.position, state.creature.centre)).toBeLessThanOrEqual(
          windowRadius + graceDays,
        );
      }
      const sitter = state.characters.find((c) => c.id === 'sitter')!;
      if (sitter.status === 'lost') sitterLostOn ??= state.day;
      if (sitterLostOn !== undefined) expect(sitter.status).toBe('lost');
    }

    expect(state.day).toBe(31);
    expect(state.characters.find((c) => c.id === 'walker')?.status).toBe('active');
    expect(sitterLostOn).toBeGreaterThan(1 + windowRadius);
  });
});
