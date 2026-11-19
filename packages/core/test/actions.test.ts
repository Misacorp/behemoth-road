import { describe, expect, it } from 'vitest';
import {
  createGame,
  type GameState,
  hex,
  legalMoves,
  move,
  neighbours,
  terrainAt,
} from '../src/index.ts';
import { neighbourWhere, placeCharacter, withCharacter } from './helpers.ts';

const expectOk = (result: ReturnType<typeof move>): GameState => {
  if (!result.ok) throw new Error(`move refused: ${result.reason}`);
  return result.state;
};

/** The first seed in 0..999 for which `test` holds. */
const findSeed = (test: (seed: number) => boolean): number => {
  for (let seed = 0; seed < 1000; seed++) if (test(seed)) return seed;
  throw new Error('no seed found');
};

describe('move', () => {
  it('moves one hex for one action and leaves the old state untouched', () => {
    const seed = findSeed(
      (s) =>
        neighbourWhere(s, createGame(s, { characterIds: ['a'] }).characters[0]!.position, true) !==
        undefined,
    );
    const state = createGame(seed, { characterIds: ['a'] });
    const from = state.characters[0]!.position;
    const to = neighbourWhere(seed, from, true)!;
    const next = expectOk(move(state, 'a', to));
    expect(next.characters[0]).toMatchObject({ position: to, actionsLeft: 2 });
    expect(state.characters[0]).toMatchObject({ position: from, actionsLeft: 3 });
  });

  it('refuses a hex that is not adjacent', () => {
    const state = createGame(1, { characterIds: ['a'] });
    const { q, r } = state.characters[0]!.position;
    expect(move(state, 'a', hex(q, r - 2))).toEqual({ ok: false, reason: 'not-adjacent' });
    expect(move(state, 'a', hex(q, r))).toEqual({ ok: false, reason: 'not-adjacent' });
  });

  it('refuses impassable terrain (cliffs)', () => {
    const seed = findSeed(
      (s) =>
        neighbourWhere(s, createGame(s, { characterIds: ['a'] }).characters[0]!.position, false) !==
        undefined,
    );
    const state = createGame(seed, { characterIds: ['a'] });
    const cliff = neighbourWhere(seed, state.characters[0]!.position, false)!;
    expect(terrainAt(seed, cliff).tags).toContain('steep');
    expect(move(state, 'a', cliff)).toEqual({ ok: false, reason: 'impassable' });
  });

  it('refuses a hex out of reach (hidden beyond the window)', () => {
    const state = placeCharacter(createGame(1, { characterIds: ['a'] }), 'a', hex(0, -5));
    expect(move(state, 'a', hex(0, -6))).toEqual({ ok: false, reason: 'unreachable' });
  });

  it('refuses when the character has too few actions left', () => {
    const seed = findSeed(
      (s) =>
        neighbourWhere(s, createGame(s, { characterIds: ['a'] }).characters[0]!.position, true) !==
        undefined,
    );
    let state = createGame(seed, { characterIds: ['a'], config: { moveCost: 2 } });
    const from = state.characters[0]!.position;
    const to = neighbourWhere(seed, from, true)!;
    state = expectOk(move(state, 'a', to));
    expect(state.characters[0]?.actionsLeft).toBe(1);
    expect(move(state, 'a', from)).toEqual({ ok: false, reason: 'not-enough-actions' });
  });

  it('lets characters stand in and pass through the creature', () => {
    // A seed where the column through the creature is all passable.
    const column = [hex(0, 2), hex(0, 1), hex(0, 0), hex(0, -1), hex(0, -2)];
    const seed = findSeed((s) => column.every((h) => terrainAt(s, h).passable));
    let state = createGame(seed, { characterIds: ['a'], config: { actionsPerDay: 4 } });
    state = placeCharacter(state, 'a', column[0]!);
    for (const h of column.slice(1)) state = expectOk(move(state, 'a', h));
    expect(state.characters[0]).toMatchObject({ position: hex(0, -2), actionsLeft: 0 });
  });

  it('refuses unknown and lost characters', () => {
    const state = createGame(1, { characterIds: ['a'] });
    const to = neighbours(state.characters[0]!.position)[0]!;
    expect(move(state, 'nobody', to)).toEqual({ ok: false, reason: 'unknown-character' });
    const lost = withCharacter(state, { ...state.characters[0]!, status: 'lost' });
    expect(move(lost, 'a', to)).toEqual({ ok: false, reason: 'character-lost' });
  });

  it('lists exactly the legal moves', () => {
    for (const seed of [1, 2, 3]) {
      const state = createGame(seed, { characterIds: ['a'] });
      const from = state.characters[0]!.position;
      const expected = neighbours(from).filter((h) => terrainAt(seed, h).passable);
      expect(legalMoves(state, 'a')).toEqual(expected);
      expect(legalMoves(state, 'nobody')).toEqual([]);
    }
  });
});
