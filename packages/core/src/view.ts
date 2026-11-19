/**
 * What leaves the server, and what comes back from storage.
 */

import { DEFAULT_CONFIG, type TuningConfig } from './config.ts';
import { CONTENT_VERSION, KNOWN_CONTENT_VERSIONS } from './content/index.ts';
import { addFeatures, keyToHex } from './features.ts';
import { EMPTY_INVENTORY } from './game.ts';
import { isSeed } from './random.ts';
import type { GameState, GameStateView } from './state.ts';

/**
 * The game as a player may see it: the state without the seed. Known tiles carry
 * their terrain, so the client can draw and plan; nothing unknown can be derived.
 */
export const toPlayerView = (state: GameState): GameStateView => {
  // Listed field by field, so a server-only field added later never leaks by default.
  const view: GameStateView = {
    contentVersion: state.contentVersion,
    artSeed: state.artSeed,
    day: state.day,
    config: state.config,
    creature: state.creature,
    tiles: state.tiles,
    characters: state.characters,
    // Only revealed features leave the server; hidden ones show at most as a glint.
    features: Object.fromEntries(Object.entries(state.features).filter(([, f]) => f.revealed)),
    glints: state.glints,
    inventory: state.inventory,
  };
  // A deep copy, so nothing done to the view can reach the server's state.
  return JSON.parse(JSON.stringify(view)) as GameStateView;
};

export class UnknownContentVersionError extends Error {
  constructor(readonly version: unknown) {
    super(`Unknown content version: ${String(version)}`);
    this.name = 'UnknownContentVersionError';
  }
}

/** Whether this code has the content a state was made with. */
export const isKnownContentVersion = (version: unknown): boolean =>
  typeof version === 'number' && KNOWN_CONTENT_VERSIONS.includes(version);

/**
 * Brings a stored game up to the current content version, keeping its map and
 * characters. Version 2 to 3: the new tuning values take their defaults, every
 * character gets a craft count, the team an empty inventory, and the tiles
 * already in view get their (hidden) features, as if they had just come into view.
 */
export const migrateGame = (stored: GameState): GameState => {
  if (stored.contentVersion === CONTENT_VERSION) return stored;
  if (stored.contentVersion !== 2) throw new UnknownContentVersionError(stored.contentVersion);
  const old = stored as unknown as Omit<GameState, 'features' | 'glints' | 'inventory'>;
  const config: TuningConfig = { ...DEFAULT_CONFIG, ...old.config };
  const seen = Object.entries(old.tiles)
    .filter(([, t]) => t.visibility === 'seen')
    .map(([key]) => keyToHex(key));
  return {
    ...old,
    contentVersion: CONTENT_VERSION,
    config,
    characters: old.characters.map((c) => ({ ...c, craftsToday: 0 })),
    features: addFeatures({}, old.tiles, seen, old.seed, config.featureChance),
    glints: {},
    inventory: EMPTY_INVENTORY,
  };
};

/**
 * Reads a stored game. Refuses (throws `UnknownContentVersionError`) a state made
 * with content this code does not have, rather than reading it with the wrong
 * data; migrates an older known version (`migrateGame`).
 */
export const loadGame = (stored: unknown): GameState => {
  const state = stored as Partial<GameState> | null;
  if (typeof state !== 'object' || state === null) throw new TypeError('Not a stored game');
  if (!isKnownContentVersion(state.contentVersion)) {
    throw new UnknownContentVersionError(state.contentVersion);
  }
  if (!isSeed(state.seed)) throw new TypeError('A stored game needs its seed');
  return migrateGame(state as GameState);
};
