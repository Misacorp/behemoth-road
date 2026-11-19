import { describe, expect, it } from 'vitest';
import {
  createGame,
  type GameState,
  type Hex,
  hex,
  hexDistance,
  hexesInRange,
  isCreatureHex,
  isPassable,
  legalMoves,
  move,
  neighbours,
  terrainAt,
} from '../src/index.ts';
import { findSeed, placeCharacter, withCharacter } from './helpers.ts';

const expectOk = (result: ReturnType<typeof move>): GameState => {
  if (!result.ok) throw new Error(`move refused: ${result.reason}`);
  return result.state;
};

const outsideCreature = hexesInRange(hex(0, 0), 4).filter((h) => hexDistance(h, hex(0, 0)) >= 2);

/** A cliff outside the creature, in the window, next to a plain hex also outside it. */
const cliffBeside = (seed: number): { cliff: Hex; from: Hex } | undefined => {
  for (const cliff of outsideCreature) {
    if (terrainAt(seed, cliff).passable) continue;
    const from = neighbours(cliff).find(
      (n) => hexDistance(n, hex(0, 0)) >= 2 && terrainAt(seed, n).passable,
    );
    if (from) return { cliff, from };
  }
  return undefined;
};

describe('move', () => {
  it('moves one hex for one action and leaves the old state untouched', () => {
    const state = createGame(1, { characterIds: ['a'] });
    const to = hex(0, -1); // a creature hex: always passable
    const next = expectOk(move(state, 'a', to));
    expect(next.characters[0]).toMatchObject({ position: to, actionsLeft: 2 });
    expect(state.characters[0]).toMatchObject({ position: hex(0, 0), actionsLeft: 3 });
  });

  it('refuses a hex that is not adjacent', () => {
    const state = createGame(1, { characterIds: ['a'] });
    expect(move(state, 'a', hex(0, -2))).toEqual({ ok: false, reason: 'not-adjacent' });
    expect(move(state, 'a', hex(0, 0))).toEqual({ ok: false, reason: 'not-adjacent' });
  });

  it('refuses coordinates that are not whole numbers', () => {
    const state = createGame(1, { characterIds: ['a'] });
    for (const bad of [hex(0.5, -1), hex(Number.NaN, 0), hex(0, Infinity), hex(2 ** 60, 0)]) {
      expect(move(state, 'a', bad)).toEqual({ ok: false, reason: 'invalid-hex' });
    }
    expect(move(state, 'a', null as unknown as Hex)).toEqual({ ok: false, reason: 'invalid-hex' });
  });

  it('refuses impassable terrain (cliffs) outside the creature', () => {
    const seed = findSeed((s) => cliffBeside(s) !== undefined);
    const { cliff, from } = cliffBeside(seed)!;
    expect(terrainAt(seed, cliff).tags).toContain('steep');
    const state = placeCharacter(createGame(seed, { characterIds: ['a'] }), 'a', from);
    expect(move(state, 'a', cliff)).toEqual({ ok: false, reason: 'impassable' });
  });

  it('lets characters onto the creature even where it stands on a cliff', () => {
    const ring = neighbours(hex(0, 0)); // the creature's hexes around its centre
    const seed = findSeed((s) => ring.some((h) => !terrainAt(s, h).passable));
    const state = createGame(seed, { characterIds: ['a'] });
    const cliff = ring.find((h) => !terrainAt(seed, h).passable)!;
    expect(isCreatureHex(state, cliff)).toBe(true);
    expect(isPassable(state, cliff)).toBe(true);
    expect(expectOk(move(state, 'a', cliff)).characters[0]?.position).toEqual(cliff);
  });

  it('refuses a hex out of reach (hidden beyond the window)', () => {
    const state = placeCharacter(createGame(1, { characterIds: ['a'] }), 'a', hex(0, -5));
    expect(move(state, 'a', hex(0, -6))).toEqual({ ok: false, reason: 'unreachable' });
  });

  it('lets a character on the window edge move along it but not past it', () => {
    const seed = findSeed((s) => terrainAt(s, hex(1, -5)).passable);
    const edge = hex(0, -5);
    const state = placeCharacter(createGame(seed, { characterIds: ['a'] }), 'a', edge);
    expect(hexDistance(edge, state.creature.centre)).toBe(state.config.windowRadius);
    expect(expectOk(move(state, 'a', hex(1, -5))).characters[0]?.position).toEqual(hex(1, -5));
    expect(legalMoves(state, 'a').every((h) => hexDistance(h, hex(0, 0)) <= 5)).toBe(true);
  });

  it('refuses when the character has too few actions left', () => {
    let state = createGame(1, { characterIds: ['a'], config: { moveCost: 2 } });
    state = expectOk(move(state, 'a', hex(0, -1)));
    expect(state.characters[0]?.actionsLeft).toBe(1);
    expect(move(state, 'a', hex(0, 0))).toEqual({ ok: false, reason: 'not-enough-actions' });
  });

  it('lets characters stand in and pass through the creature', () => {
    const column = [hex(0, 2), hex(0, 1), hex(0, 0), hex(0, -1), hex(0, -2)];
    const seed = findSeed((s) => column.every((h) => terrainAt(s, h).passable));
    let state = createGame(seed, { characterIds: ['a'], config: { actionsPerDay: 4 } });
    state = placeCharacter(state, 'a', column[0]!);
    for (const h of column.slice(1)) state = expectOk(move(state, 'a', h));
    expect(state.characters[0]).toMatchObject({ position: hex(0, -2), actionsLeft: 0 });
  });

  it('refuses unknown and lost characters', () => {
    const state = createGame(1, { characterIds: ['a'] });
    const to = hex(0, -1);
    expect(move(state, 'nobody', to)).toEqual({ ok: false, reason: 'unknown-character' });
    const lost = withCharacter(state, { ...state.characters[0]!, status: 'lost' });
    expect(move(lost, 'a', to)).toEqual({ ok: false, reason: 'character-lost' });
  });

  it('lists exactly the legal moves', () => {
    for (const seed of [1, 2, 3]) {
      const start = createGame(seed, { characterIds: ['a'] });
      const state = placeCharacter(start, 'a', hex(2, -3));
      const expected = neighbours(hex(2, -3)).filter(
        (h) => isCreatureHex(state, h) || terrainAt(seed, h).passable,
      );
      expect(legalMoves(state, 'a')).toEqual(expected);
      expect(legalMoves(state, 'nobody')).toEqual([]);
    }
  });
});
