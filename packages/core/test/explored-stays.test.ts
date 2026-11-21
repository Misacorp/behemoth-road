import { describe, expect, it } from 'vitest';
import { type GameState, hexKey, isExplored, leadingEdge, nextDay } from '../src/index.ts';
import { settlementSpots } from '../src/settlements.ts';
import { fieldGame, QUIET } from './helpers.ts';

/** Marks the given hex keys (default: all) explored, as scouts sweeping the window would. */
const exploreKeys = (state: GameState, only?: ReadonlySet<string>): GameState => ({
  ...state,
  tiles: Object.fromEntries(
    Object.entries(state.tiles).map(([key, tile]) => [
      key,
      !only || only.has(key) ? { ...tile, explored: true } : tile,
    ]),
  ),
});

const ROUTE = { ...QUIET, settlementFirst: 1, settlementEvery: 1 };

describe('explored hexes keep their content', () => {
  it('never offers an explored hex as a settlement spot', () => {
    const state = exploreKeys(fieldGame(['a'], ROUTE));
    expect(leadingEdge(state).length).toBeGreaterThan(0);
    expect(settlementSpots(state)).toEqual([]);
  });

  it('no settlement lands on a hex that was explored before the tick, over many seeds and days', () => {
    for (let seed = 1; seed <= 40; seed++) {
      let state = fieldGame(['a'], ROUTE, seed);
      for (let day = 0; day < 8; day++) {
        // Scouts have swept the whole leading edge and the ring inside it.
        const swept = new Set(leadingEdge(state).map(hexKey));
        const before = exploreKeys(state, swept);
        const after = nextDay(before);
        for (const s of after.settlements) {
          if (before.settlements.some((b) => b.id === s.id)) continue;
          expect(isExplored(before, s.hex), `seed ${seed} day ${day}`).toBe(false);
        }
        // Explored hexes gain no feature either.
        for (const [key, f] of Object.entries(after.features)) {
          if (before.tiles[key]?.explored) expect(before.features[key], key).toEqual(f);
        }
        state = after;
      }
    }
  });
});
