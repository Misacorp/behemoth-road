import { describe, expect, it } from 'vitest';
import {
  createGame,
  type GameState,
  hex,
  hexDistance,
  hexKey,
  isCreatureHex,
  isFreeHex,
  nearestFreeHex,
  nextDay,
  terrainAt,
} from '../src/index.ts';
import { findSeed, gameAt } from './helpers.ts';

// The creature walks straight north: its centre is (0, 1 - day).
const straight = { config: { veerWeights: { left: 0, right: 0 } } };

describe('the creature stepping onto a character', () => {
  it('moves the character to the nearest free hex, for free, and keeps it active', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const at = hex(1, -2); // ahead of the creature, inside its next footprint
      const state = gameAt(seed, at, straight);
      const spent = { ...state, characters: [{ ...state.characters[0]!, actionsLeft: 0 }] };
      const day2 = nextDay(spent);
      expect(isCreatureHex(day2, at)).toBe(true);
      const c = day2.characters[0]!;
      expect(isCreatureHex(day2, c.position)).toBe(false);
      expect(isFreeHex(day2, c.position)).toBe(true);
      expect(hexDistance(c.position, at)).toBe(1);
      expect(c).toMatchObject({ status: 'active', actionsLeft: 3 });
      expect(nextDay(spent)).toEqual(day2);
    }
  });

  it('prefers a hex beside the creature over one ahead', () => {
    // On the next centre, every hex one step away is the creature's; two steps out,
    // the hexes level with it are (-2, 0) and (2, -2).
    const seed = findSeed((s) => terrainAt(s, hex(2, -2)).passable);
    const day2 = nextDay(gameAt(seed, hex(0, -1), straight));
    const c = day2.characters[0]!;
    expect(hexDistance(c.position, hex(0, -1))).toBe(2);
    const beside = [hex(-2, 0), hex(2, -2)].filter((h) => terrainAt(seed, h).passable);
    expect(beside.map(hexKey)).toContain(hexKey(c.position));
  });

  it('never leaves an active character on the creature', () => {
    for (let seed = 0; seed < 25; seed++) {
      const ids = ['a', 'b', 'c', 'd'];
      let state = createGame(seed, { characterIds: ids });
      // Scatter them in front of the creature, then let it walk into them.
      const spots = [hex(0, -2), hex(1, -3), hex(-1, -2), hex(0, -4)];
      state = {
        ...state,
        characters: state.characters.map((c, i) => ({ ...c, position: spots[i]! })),
      };
      for (let day = 0; day < 8; day++) {
        state = nextDay(state);
        for (const c of state.characters) {
          if (c.status === 'active') expect(isCreatureHex(state, c.position)).toBe(false);
        }
      }
    }
  });
});

describe('nearestFreeHex', () => {
  it('searches at any distance when nothing nearby is free', () => {
    const base = createGame(1);
    const far = hex(0, -9);
    const seed = findSeed((s) => terrainAt(s, far).passable);
    // Only one hex is in reach, nine steps from the creature.
    const state: GameState = {
      ...createGame(seed),
      tiles: { [hexKey(far)]: { visibility: 'seen', leftWindowOnDay: null } },
    };
    expect(nearestFreeHex(state, hex(0, 0))).toEqual(far);
    expect(nearestFreeHex({ ...base, tiles: {} }, hex(0, 0))).toBeNull();
  });
});
