import { describe, expect, it } from 'vitest';
import {
  createGame,
  type GameState,
  hexDistance,
  isReachable,
  legalMoves,
  move,
  nextDay,
  terrainAt,
} from '../src/index.ts';

/** Plays `days` days; each day every character takes its first legal moves. */
const play = (start: GameState, days: number): GameState => {
  let state = start;
  for (let d = 0; d < days; d++) {
    for (const c of state.characters) {
      for (;;) {
        const to = legalMoves(state, c.id)[0];
        if (!to) break;
        const result = move(state, c.id, to);
        if (!result.ok) break;
        state = result.state;
      }
    }
    state = nextDay(state);
  }
  return state;
};

describe('createGame', () => {
  it('places every character on a passable hex near the creature, with full actions', () => {
    for (let seed = 0; seed < 50; seed++) {
      const state = createGame(seed, { characterIds: ['a', 'b', 'c'] });
      expect(state.day).toBe(1);
      for (const c of state.characters) {
        expect(terrainAt(seed, c.position).passable).toBe(true);
        expect(hexDistance(c.position, state.creature.centre)).toBeLessThanOrEqual(2);
        expect(isReachable(state, c.position)).toBe(true);
        expect(c).toMatchObject({ actionsLeft: 3, status: 'active' });
      }
    }
  });

  it('rejects bad seeds and characters', () => {
    expect(() => createGame(-1)).toThrow(RangeError);
    expect(() => createGame(1.5)).toThrow(RangeError);
    expect(() => createGame(1, { characterIds: ['a', 'a'] })).toThrow(/unique/);
    expect(() => createGame(1, { characterIds: [''] })).toThrow(RangeError);
    const many = Array.from({ length: 16 }, (_, i) => `c${i}`);
    expect(() => createGame(1, { characterIds: many })).toThrow(/cap/);
    expect(createGame(1, { characterIds: many.slice(0, 15) }).characters).toHaveLength(15);
  });
});

describe('determinism and serialisation', () => {
  it('gives identical states for the same seed and inputs', () => {
    const a = play(createGame(77, { characterIds: ['a', 'b'] }), 12);
    const b = play(createGame(77, { characterIds: ['a', 'b'] }), 12);
    expect(b).toEqual(a);
    const c = play(createGame(78, { characterIds: ['a', 'b'] }), 12);
    expect(c).not.toEqual(a);
  });

  it('survives a JSON round trip and plays on identically', () => {
    const state = play(createGame(9, { characterIds: ['a'] }), 5);
    const copy = JSON.parse(JSON.stringify(state)) as GameState;
    expect(copy).toEqual(state);
    expect(play(copy, 5)).toEqual(play(state, 5));
  });
});
