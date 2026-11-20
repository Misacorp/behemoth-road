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
  newSeed,
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
    const seed = newSeed();
    const state = createGame(seed, { characterIds: ['a'] });
    const view = toPlayerView(state);
    expect('seed' in view).toBe(false);
    const json = JSON.stringify(view);
    for (const word of seed) expect(json).not.toMatch(new RegExp(`\\b${word}\\b`));
  });

  it('carries the season, threats and settlements, but never the seed, nature or care', () => {
    let state = played(6);
    state = {
      ...state,
      peril: 3,
      misleadUntilDay: 9,
      threats: [{ id: 't1', type: 'captors', hex: hex(0, 4), strength: 3, appearedDay: 4 }],
      settlements: [
        { id: 's2', type: 'hill-folk', hex: hex(1, -5), attitude: 'wary', favour: 1, boon: null },
      ],
      creature: { ...state.creature, defenders: ['b'] },
    };
    const view = toPlayerView(state) as unknown as Record<string, unknown>;
    for (const key of ['seed', 'nature', 'care']) expect(key in view).toBe(false);
    expect(view).toMatchObject({
      peril: 3,
      season: { status: 'on' },
      misleadUntilDay: 9,
      threats: state.threats,
      settlements: state.settlements,
      creature: { steps: state.creature.steps, defenders: ['b'] },
    });
    const json = JSON.stringify(view);
    expect(json).not.toMatch(/satiety|reactions|"cues"/);
  });

  it('is a deep copy: changing it never reaches the server state', () => {
    const state = played(3);
    const before = JSON.stringify(state);
    const view = toPlayerView(state) as unknown as {
      creature: { centre: { q: number } };
      characters: { actionsLeft: number }[];
      tiles: Record<string, { terrain: string }>;
      config: { actionsPerDay: number };
    };
    view.creature.centre.q = 99;
    view.characters[0]!.actionsLeft = 99;
    Object.values(view.tiles)[0]!.terrain = 'cliff';
    view.config.actionsPerDay = 99;
    expect(JSON.stringify(state)).toBe(before);
  });

  it('carries a public art seed that is unrelated to the game seed', () => {
    const seed = newSeed();
    const a = createGame(seed);
    const b = createGame(seed);
    // The same game seed gives different art seeds: nothing about one follows from the other.
    expect(a.artSeed).not.toBe(b.artSeed);
    expect(toPlayerView(a).artSeed).toBe(a.artSeed);
    // Any art seed can go with any game seed, and choosing it leaves the game unchanged.
    const pinned = createGame(seed, { artSeed: 12345 });
    expect(pinned.artSeed).toBe(12345);
    expect({ ...pinned, artSeed: a.artSeed }).toEqual(a);
    expect(() => createGame(seed, { artSeed: -1 })).toThrow(RangeError);
    expect(() => createGame(seed, { artSeed: 2 ** 32 })).toThrow(RangeError);
  });

  it('is the same whatever the seed, given the same known world', () => {
    const state = played(5);
    const other: GameState = { ...state, seed: [999, 1, 2, 3] };
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
    // The same movement; only the server can reveal what the hex held.
    if (onServer.ok && onClient.ok) {
      const server = toPlayerView(onServer.state);
      const client = onClient.state;
      if (!onServer.trapped) expect(server.characters).toEqual(client.characters);
      expect({ ...server, features: {}, glints: {}, characters: [] }).toEqual({
        ...client,
        features: {},
        glints: {},
        characters: [],
      });
    }
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
