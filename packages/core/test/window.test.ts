import { describe, expect, it } from 'vitest';
import {
  createGame,
  hex,
  hexDistance,
  hexesInRange,
  hexKey,
  isReachable,
  nextDay,
  visibilityAt,
  windowHexes,
} from '../src/index.ts';
import { placeCharacter } from './helpers.ts';

// The creature walks straight north: its centre is (0, 1 - day).
const straight = { veerWeights: { left: 0, right: 0 } };

describe('window and fog of war', () => {
  it('sees the window and hides everything beyond it', () => {
    const state = createGame(1);
    expect(windowHexes(state)).toHaveLength(91);
    for (const h of windowHexes(state)) expect(visibilityAt(state, h)).toBe('seen');
    expect(visibilityAt(state, hex(0, -6))).toBe('hidden');
    expect(visibilityAt(state, hex(4, 4))).toBe('hidden');
  });

  it('keeps a hex that falls behind reachable for the grace day, then loses it for good', () => {
    const day1 = createGame(1, { config: straight });
    const behind = hex(0, 5);
    expect(isReachable(day1, behind)).toBe(true);
    const day2 = nextDay(day1);
    expect(hexDistance(behind, day2.creature.centre)).toBe(6);
    expect(visibilityAt(day2, behind)).toBe('seen');
    expect(isReachable(day2, behind)).toBe(true);
    const day3 = nextDay(day2);
    expect(visibilityAt(day3, behind)).toBe('lost');
    expect(visibilityAt(nextDay(nextDay(day3)), behind)).toBe('lost');
  });

  it('loses a hex at once with no grace days', () => {
    const day2 = nextDay(createGame(1, { config: { ...straight, graceDays: 0 } }));
    expect(visibilityAt(day2, hex(0, 5))).toBe('lost');
  });

  it('shows new hexes at the leading edge', () => {
    const day2 = nextDay(createGame(1, { config: straight }));
    expect(visibilityAt(day2, hex(0, -6))).toBe('seen');
  });

  it('always has the whole window in play, even a hex lost earlier', () => {
    const state = createGame(1, { config: straight });
    const lostAhead = {
      ...state,
      tiles: {
        ...state.tiles,
        [hexKey(hex(0, -6))]: { visibility: 'lost' as const, terrain: 'plains' },
      },
    };
    expect(visibilityAt(nextDay(lostAhead), hex(0, -6))).toBe('seen');
  });

  it('loses a character left outside the window after the grace day', () => {
    let state = createGame(1, { characterIds: ['a', 'b'], config: straight });
    state = placeCharacter(state, 'a', hex(0, 5));
    state = nextDay(state); // a is out of the window, in grace
    expect(state.characters.map((c) => c.status)).toEqual(['active', 'active']);
    expect(state.characters[0]?.actionsLeft).toBe(3);
    state = nextDay(state);
    expect(state.characters[0]).toMatchObject({ status: 'lost', actionsLeft: 0 });
    expect(state.characters[1]?.status).toBe('active');
    for (let i = 0; i < 3; i++) state = nextDay(state);
    expect(state.characters[0]?.status).toBe('lost');
  });

  it('keeps the window centred on the creature each day', () => {
    let state = createGame(4);
    for (let i = 0; i < 10; i++) state = nextDay(state);
    const inPlay = hexesInRange(state.creature.centre, 5);
    expect(inPlay.every((h) => visibilityAt(state, h) === 'seen')).toBe(true);
  });
});
