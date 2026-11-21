import { describe, expect, it } from 'vitest';
import {
  type ActionResult,
  type GameState,
  type Hex,
  hex,
  hexDistance,
  hexesInRange,
  legalMoves,
  move,
  neighbours,
  onHex,
  placeNeighbours,
  terrainAt,
} from '../src/index.ts';
import { findSeed, gameAt, nearP, P, withCharacter } from './helpers.ts';

const expectOk = (result: ActionResult<GameState>): GameState => {
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

const north = nearP(0, -1);
const openNorth = (s: number) =>
  terrainAt(s, north).passable && !terrainAt(s, north).tags.includes('dry');

describe('move', () => {
  it('moves one hex for one action and leaves the old state untouched', () => {
    const state = gameAt(findSeed(openNorth));
    const next = expectOk(move(state, 'a', north));
    expect(next.characters[0]).toMatchObject({ at: onHex(north), actionsLeft: 2 });
    expect(state.characters[0]).toMatchObject({ at: onHex(P), actionsLeft: 3 });
  });

  it('refuses a hex that is not adjacent', () => {
    const state = gameAt(1);
    expect(move(state, 'a', nearP(0, -2))).toEqual({ ok: false, reason: 'not-adjacent' });
    expect(move(state, 'a', P)).toEqual({ ok: false, reason: 'not-adjacent' });
  });

  it('refuses coordinates that are not whole numbers', () => {
    const state = gameAt(1);
    for (const bad of [hex(0.5, -1), hex(Number.NaN, 0), hex(0, Infinity), hex(2 ** 60, 0)]) {
      expect(move(state, 'a', bad)).toEqual({ ok: false, reason: 'invalid-hex' });
    }
    expect(move(state, 'a', null as unknown as Hex)).toEqual({ ok: false, reason: 'invalid-hex' });
  });

  it('refuses impassable terrain (cliffs)', () => {
    const seed = findSeed((s) => cliffBeside(s) !== undefined);
    const { cliff, from } = cliffBeside(seed)!;
    expect(terrainAt(seed, cliff).tags).toContain('steep');
    expect(move(gameAt(seed, from), 'a', cliff)).toEqual({ ok: false, reason: 'impassable' });
  });

  it('refuses a hex out of reach (hidden beyond the window)', () => {
    expect(move(gameAt(1, hex(0, -6)), 'a', hex(0, -7))).toEqual({
      ok: false,
      reason: 'unreachable',
    });
  });

  it('lets a character on the window edge move along it but not past it', () => {
    const seed = findSeed((s) => terrainAt(s, hex(1, -6)).passable);
    const edge = hex(0, -6);
    const state = gameAt(seed, edge);
    expect(hexDistance(edge, state.creature.centre)).toBe(state.config.windowRadius);
    expect(expectOk(move(state, 'a', hex(1, -6))).characters[0]?.at).toEqual(onHex(hex(1, -6)));
    expect(
      legalMoves(state, 'a').every(
        (p) => p.kind === 'hex' && hexDistance(p.hex, hex(0, 0)) <= state.config.windowRadius,
      ),
    ).toBe(true);
  });

  it('refuses when the character has too few actions left', () => {
    let state = gameAt(findSeed(openNorth), P, { config: { moveCost: 2 } });
    state = expectOk(move(state, 'a', north));
    expect(state.characters[0]?.actionsLeft).toBe(1);
    expect(move(state, 'a', P)).toEqual({ ok: false, reason: 'not-enough-actions' });
  });

  it('refuses unknown and lost characters', () => {
    const state = gameAt(1);
    expect(move(state, 'nobody', north)).toEqual({ ok: false, reason: 'unknown-character' });
    const lost = withCharacter(state, { ...state.characters[0]!, status: 'lost' });
    expect(move(lost, 'a', north)).toEqual({ ok: false, reason: 'character-lost' });
  });

  it('lists exactly the legal moves', () => {
    for (const seed of [1, 2, 3]) {
      for (const at of [P, hex(1, 1)]) {
        const state = gameAt(seed, at);
        const expected = placeNeighbours(state, onHex(at)).filter((p) =>
          p.kind === 'creature' ? true : terrainAt(seed, p.hex).passable,
        );
        expect(legalMoves(state, 'a')).toEqual(expected);
      }
      expect(legalMoves(gameAt(seed), 'nobody')).toEqual([]);
    }
  });
});
