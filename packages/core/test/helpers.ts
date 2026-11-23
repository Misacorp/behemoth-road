import {
  type Character,
  type ConfigOverrides,
  createGame,
  featureType,
  type GameState,
  type Hex,
  hexesInRange,
  onHex,
} from '../src/index.ts';

/**
 * A season that never ends and brings no threats, settlements or hunger peril:
 * for tests of earlier rules that walk the creature a long way.
 */
export const CALM: ConfigOverrides = {
  routeLength: 100_000,
  threatsFromDay: 100_000,
  settlementFirst: 100_000,
  perilHungry: 0,
};

/** Returns a copy of the state with one character replaced. */
export const withCharacter = (state: GameState, character: Character): GameState => ({
  ...state,
  characters: state.characters.map((c) => (c.id === character.id ? character : c)),
});

/** Puts a character on a hex (off the creature). */
export const placeCharacter = (state: GameState, id: string, h: Hex): GameState => {
  const c = state.characters.find((x) => x.id === id);
  if (!c) throw new Error(`no character ${id}`);
  return withCharacter(state, { ...c, at: onHex(h) });
};

/** The first seed in 0..1999 for which `test` holds. */
export const findSeed = (test: (seed: number) => boolean): number => {
  for (let seed = 0; seed < 2000; seed++) if (test(seed)) return seed;
  throw new Error('no seed found');
};

/** A hex east of the creature's starting footprint, with room around it inside the window. */
export const P: Hex = { q: 3, r: -1 };

/** `P` plus an offset. */
export const nearP = (dq: number, dr: number): Hex => ({ q: P.q + dq, r: P.r + dr });

/** A new game with one character, 'a', standing on `at` (default `P`). */
export const gameAt = (
  seed: number,
  at: Hex = P,
  options: Omit<NonNullable<Parameters<typeof createGame>[1]>, 'characterIds'> = {},
): GameState => placeCharacter(createGame(seed, { ...options, characterIds: ['a'] }), 'a', at);

/** Sets a known tile's terrain (rules read known tiles first). */
export const withTerrain = (state: GameState, h: Hex, terrain: string): GameState => ({
  ...state,
  tiles: {
    ...state.tiles,
    [`${h.q},${h.r}`]: { visibility: 'seen', terrain, explored: false, leftWindowOnDay: null },
  },
});

const fullCharges = (type: string): number => {
  const t = featureType(type);
  return t.kind === 'node' ? t.charges : 1;
};

/** Puts a feature on a hex. */
export const withFeature = (
  state: GameState,
  h: Hex,
  type: string,
  revealed = false,
  left?: number,
): GameState => ({
  ...state,
  features: {
    ...state.features,
    [`${h.q},${h.r}`]: { type, revealed, left: left ?? fullCharges(type) },
  },
});

/** A game with no features and these characters (id = role) on plain hexes beside the creature. */
export const chainGame = (roles: readonly string[], seed = 1): GameState => {
  let state = createGame(seed, { characterIds: roles.slice(), config: CALM });
  state = { ...state, features: {} };
  state = {
    ...state,
    characters: state.characters.map((c) => ({ ...c, role: c.id })),
  };
  for (const h of hexesInRange(state.creature.centre, state.config.windowRadius)) {
    state = withTerrain(state, h, 'plains');
  }
  return state;
};

/** No rolled threats, no settlements, no hunger peril: threats and settlements are put in by hand. */
export const QUIET: ConfigOverrides = {
  threatsFromDay: 100_000,
  settlementFirst: 100_000,
  perilHungry: 0,
};

/**
 * A game with no features and these characters (id = role) riding the
 * creature, its window all plains; the season runs with `config` (default `QUIET`).
 */
export const fieldGame = (
  roles: readonly string[],
  config: ConfigOverrides = QUIET,
  seed = 1,
): GameState => {
  let state = createGame(seed, { characterIds: roles.slice(), config });
  state = {
    ...state,
    features: {},
    characters: state.characters.map((c) => ({ ...c, role: c.id })),
  };
  for (const h of hexesInRange(state.creature.centre, state.config.windowRadius)) {
    state = withTerrain(state, h, 'plains');
  }
  return state;
};

/** Puts a threat on the map. */
export const withThreat = (
  state: GameState,
  type: string,
  h: Hex,
  strength = 3,
  id = `x${type}`,
): GameState => ({
  ...state,
  threats: [...state.threats, { id, type, hex: h, strength, appearedDay: state.day }],
});

/** Puts a wary settlement of the hill folk on a hex. */
export const withSettlement = (
  state: GameState,
  h: Hex,
  change: Partial<GameState['settlements'][number]> = {},
): GameState => ({
  ...state,
  settlements: [
    ...state.settlements,
    { id: 's1', type: 'hill-folk', hex: h, attitude: 'wary', favour: 0, boon: null, ...change },
  ],
});

/** The creature stays put at the next tick (as if a keeper had asked). */
export const lingering = (state: GameState): GameState => ({
  ...state,
  creature: { ...state.creature, lingering: true },
});
