import { describe, expect, it } from 'vitest';
import {
  createGame,
  creatureEdge,
  creatureHexes,
  entryInto,
  hex,
  isPassable,
  move,
  nextDay,
  ON_CREATURE,
  onHex,
  terrainAt,
} from '../src/index.ts';
import { CALM, findSeed, gameAt, withCharacter } from './helpers.ts';

// The creature walks straight north: its centre is (0, 1 - day).
const straight = { config: { veerWeights: { left: 0, right: 0 } } };
const west = hex(-2, 1); // beside the starting footprint
const openWest = (s: number) => terrainAt(s, west).passable;

describe('riding the creature', () => {
  it('treats the footprint as one place, not hexes to stand on', () => {
    const state = createGame(1);
    expect(creatureHexes(state)).toHaveLength(7);
    for (const h of creatureHexes(state)) expect(entryInto(state, h)).toBeNull();
  });

  it('boards from a hex beside the footprint for one step, naming any footprint hex', () => {
    const state = gameAt(findSeed(openWest), west);
    for (const target of [...creatureHexes(state), ON_CREATURE]) {
      const result = move(state, 'a', target);
      expect(result.ok).toBe(true);
      if (result.ok)
        expect(result.state.characters[0]).toMatchObject({ at: ON_CREATURE, actionsLeft: 2 });
    }
    const dear = gameAt(findSeed(openWest), west, { config: { moveCost: 2 } });
    expect(move(dear, 'a', ON_CREATURE)).toMatchObject({ ok: true });
    const tired = withCharacter(dear, { ...dear.characters[0]!, actionsLeft: 1 });
    expect(move(tired, 'a', ON_CREATURE)).toEqual({ ok: false, reason: 'not-enough-actions' });
  });

  it('refuses boarding from further away', () => {
    const far = hex(-3, 1);
    const state = gameAt(
      findSeed((s) => terrainAt(s, far).passable),
      far,
    );
    expect(move(state, 'a', ON_CREATURE)).toEqual({ ok: false, reason: 'not-adjacent' });
  });

  it('steps off onto any passable hex beside the footprint, for its entry cost', () => {
    const state = createGame(7, { characterIds: ['a'] });
    for (const h of creatureEdge(state)) {
      const result = move(state, 'a', h);
      if (terrainAt(7, h).passable) {
        expect(result).toMatchObject({ ok: true });
        if (result.ok)
          expect(result.state.characters[0]).toMatchObject({ at: onHex(h), actionsLeft: 2 });
      } else {
        expect(result).toEqual({ ok: false, reason: 'impassable' });
      }
    }
  });

  it('refuses stepping off further than beside the footprint, or onto the creature again', () => {
    const state = createGame(1, { characterIds: ['a'] });
    expect(move(state, 'a', hex(0, -3))).toEqual({ ok: false, reason: 'not-adjacent' });
    expect(move(state, 'a', hex(0, -1))).toEqual({ ok: false, reason: 'not-adjacent' });
    expect(move(state, 'a', ON_CREATURE)).toEqual({ ok: false, reason: 'not-adjacent' });
  });

  it('carries riders day after day, never leaving them behind', () => {
    let state = createGame(9, { characterIds: ['a', 'b'], config: CALM });
    for (let day = 0; day < 40; day++) {
      state = { ...state, characters: state.characters.map((c) => ({ ...c, actionsLeft: 0 })) };
      state = nextDay(state);
      for (const c of state.characters) {
        expect(c).toMatchObject({ at: ON_CREATURE, status: 'active', actionsLeft: 3 });
      }
    }
  });

  it('picks up a character the creature steps onto, at no cost', () => {
    const ahead = hex(1, -2); // under the footprint once the centre moves to (0, -1)
    const seed = findSeed((s) => terrainAt(s, ahead).passable);
    let state = gameAt(seed, ahead, straight);
    state = withCharacter(state, { ...state.characters[0]!, actionsLeft: 0 });
    expect(isPassable(state, ahead)).toBe(true);
    const day2 = nextDay(state);
    expect(day2.characters[0]).toMatchObject({ at: ON_CREATURE, status: 'active', actionsLeft: 3 });
    expect(nextDay(state)).toEqual(day2);
  });
});
