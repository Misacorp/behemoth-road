import { describe, expect, it } from 'vitest';
import {
  CONTENT_VERSION,
  createGame,
  creatureEdge,
  entryInto,
  type GameState,
  hex,
  hexDistance,
  hexesInRange,
  hexKey,
  isPassable,
  legalMoves,
  loadGame,
  move,
  nextDay,
  ON_CREATURE,
  onHex,
  planPath,
  predictCreature,
  reachablePlaces,
  terrainIdAt,
  terrainOf,
  toPlayerView,
  UnknownContentVersionError,
  visibilityAt,
} from '../src/index.ts';

/** A few days in, with one character off the creature. */
const played = (seed: number): GameState => {
  let state = createGame(seed, { characterIds: ['a', 'b'] });
  const off = creatureEdge(state).find((h) => isPassable(state, h))!;
  const result = move(state, 'a', off);
  if (result.ok) state = result.state;
  for (let d = 0; d < 4; d++) state = nextDay(state);
  return state;
};

describe('the player view', () => {
  it('carries no seed', () => {
    const state = createGame(123456789, { characterIds: ['a'] });
    const view = toPlayerView(state);
    expect('seed' in view).toBe(false);
    expect(JSON.stringify(view)).not.toContain('123456789');
  });

  it('is the same whatever the seed, given the same known world', () => {
    const state = played(5);
    const other: GameState = { ...state, seed: 999 };
    expect(toPlayerView(other)).toEqual(toPlayerView(state));
  });

  it('knows the terrain of known tiles only, as generated', () => {
    const state = played(7);
    const view = toPlayerView(state);
    for (const [key, tile] of Object.entries(state.tiles)) {
      const [q, r] = key.split(',').map(Number) as [number, number];
      expect(tile.terrain).toBe(terrainIdAt(state.seed, hex(q, r)));
      expect(terrainOf(view, hex(q, r))?.id).toBe(tile.terrain);
    }
    const unknown = hexesInRange(state.creature.centre, 12).filter((h) => !state.tiles[hexKey(h)]);
    expect(unknown.length).toBeGreaterThan(0);
    for (const h of unknown) {
      expect(visibilityAt(view, h)).toBe('hidden');
      expect(terrainOf(view, h)).toBeNull();
      expect(entryInto(view, h)).toBeNull();
    }
  });

  it('plans, reaches and predicts exactly as the full state does', () => {
    for (const seed of [1, 2, 3]) {
      const state = played(seed);
      const view = toPlayerView(state);
      for (const id of ['a', 'b']) {
        expect(reachablePlaces(view, id)).toEqual(reachablePlaces(state, id));
        expect(legalMoves(view, id)).toEqual(legalMoves(state, id));
        for (const h of hexesInRange(state.creature.centre, 6)) {
          expect(planPath(view, id, h)).toEqual(planPath(state, id, h));
        }
      }
      expect(predictCreature(view)).toEqual(predictCreature(state));
    }
  });

  it("refuses to work out the creature's next step", () => {
    const view = toPlayerView(played(4));
    expect(() => nextDay(view as GameState)).toThrow(/seed/);
  });

  it('moves a character on the view as on the server', () => {
    const state = played(8);
    const view = toPlayerView(state);
    const plan = planPath(view, 'b', reachablePlaces(view, 'b').at(-1)!.place);
    if (!plan.ok) throw new Error(plan.reason);
    const onServer = move(state, 'b', plan.steps[0]!.place);
    const onClient = move(view, 'b', plan.steps[0]!.place);
    expect(onServer.ok && onClient.ok).toBe(true);
    if (onServer.ok && onClient.ok) expect(toPlayerView(onServer.state)).toEqual(onClient.state);
  });
});

describe('pruning lost tiles', () => {
  it('keeps the state from growing, but keeps the fog near the creature and under characters', () => {
    let state = createGame(11, { characterIds: ['rider', 'left'] });
    const behind = creatureEdge(state)
      .filter((h) => isPassable(state, h))
      .sort((a, b) => 2 * b.r + b.q - (2 * a.r + a.q))[0]!;
    const off = move(state, 'left', behind);
    if (off.ok) state = off.state;
    const limit = state.config.windowRadius + state.config.lostTileRings;
    const sizes: number[] = [];
    for (let d = 0; d < 60; d++) {
      state = nextDay(state);
      sizes.push(Object.keys(state.tiles).length);
      for (const [key, tile] of Object.entries(state.tiles)) {
        if (tile.visibility !== 'lost' || key === hexKey(behind)) continue;
        const [q, r] = key.split(',').map(Number) as [number, number];
        expect(hexDistance(hex(q, r), state.creature.centre)).toBeLessThanOrEqual(limit);
      }
    }
    expect(state.characters[1]).toMatchObject({ status: 'lost', at: onHex(behind) });
    expect(state.tiles[hexKey(behind)]?.visibility).toBe('lost');
    // Never more than the hexes within the limit, plus the one under the lost character.
    expect(Math.max(...sizes)).toBeLessThanOrEqual(1 + 3 * limit * (limit + 1) + 1);
    expect(state.characters[0]?.at).toEqual(ON_CREATURE);
  });
});

describe('content version', () => {
  it('is pinned in a new game and survives storage', () => {
    const state = played(2);
    expect(state.contentVersion).toBe(CONTENT_VERSION);
    expect(loadGame(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });

  it('refuses a stored game with unknown content, or without its seed', () => {
    const state = played(2);
    expect(() => loadGame({ ...state, contentVersion: CONTENT_VERSION + 1 })).toThrow(
      UnknownContentVersionError,
    );
    expect(() => loadGame({ ...state, contentVersion: undefined })).toThrow(
      UnknownContentVersionError,
    );
    expect(() => loadGame(toPlayerView(state))).toThrow(/seed/);
    expect(() => loadGame(null)).toThrow(TypeError);
  });
});
