import { describe, expect, it } from 'vitest';
import {
  createGame,
  type GameState,
  hex,
  hexDistance,
  isCreatureHex,
  terrainAt,
  legalMoves,
  move,
  nextDay,
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
  it('puts every character on one free hex next to the creature, with full actions', () => {
    for (let seed = 0; seed < 50; seed++) {
      const state = createGame(seed, { characterIds: ['a', 'b', 'c'] });
      const start = state.characters[0]!.position;
      expect(state.day).toBe(1);
      expect(hexDistance(start, state.creature.centre)).toBe(state.config.creatureRadius + 1);
      expect(isCreatureHex(state, start)).toBe(false);
      expect(terrainAt(seed, start).passable).toBe(true);
      for (const c of state.characters) {
        expect(c.position).toEqual(start);
        expect(c).toMatchObject({ actionsLeft: 3, status: 'active' });
      }
      expect(createGame(seed, { characterIds: ['x'] }).characters[0]?.position).toEqual(start);
    }
  });

  it('starts beside the creature when that hex is free', () => {
    // Heading north, the hexes level with the creature two steps out are (-2, 1) and (2, -1).
    for (const seed of [0, 1, 2, 3, 4, 5, 6, 7]) {
      const state = createGame(seed, { characterIds: ['a'] });
      const beside = [hex(-2, 1), hex(2, -1)].filter((h) => terrainAt(seed, h).passable);
      if (beside.length > 0) expect(state.characters[0]?.position).toEqual(beside[0]);
    }
  });

  it('rejects bad seeds and characters', () => {
    expect(() => createGame(-1)).toThrow(RangeError);
    expect(() => createGame(1.5)).toThrow(RangeError);
    expect(() => createGame(1, { characterIds: ['a', 'a'] })).toThrow(/unique/);
    expect(() => createGame(1, { characterIds: [''] })).toThrow(RangeError);
    expect(() => createGame(1, { start: hex(0.5, 0) })).toThrow(RangeError);
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
