/**
 * What leaves the server, and what comes back from storage.
 */

import { CONTENT_VERSION, KNOWN_CONTENT_VERSIONS } from './content/index.ts';
import { isSeed } from './random.ts';
import type { GameState, GameStateView } from './state.ts';

/**
 * The game as a player may see it: the state without the seed and without the
 * creature's nature and care (its reactions and hunger). Known tiles carry
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
    // Only revealed features leave the server.
    features: Object.fromEntries(Object.entries(state.features).filter(([, f]) => f.revealed)),
    stores: state.stores,
    unlocks: state.unlocks,
    project: state.project,
    stimuli: state.stimuli,
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
 * A stored game made with older content. Before a stable release older games are
 * not migrated: the server starts a new game instead.
 */
export class OutdatedGameError extends UnknownContentVersionError {
  constructor(version: number) {
    super(version);
    this.name = 'OutdatedGameError';
    this.message = `Outdated content version: ${version} (current ${CONTENT_VERSION})`;
  }
}

/**
 * Reads a stored game. Refuses a state made with content this code does not have,
 * rather than reading it with the wrong data: `OutdatedGameError` for an older
 * version (start a new game), `UnknownContentVersionError` otherwise.
 */
export const loadGame = (stored: unknown): GameState => {
  const state = stored as Partial<GameState> | null;
  if (typeof state !== 'object' || state === null) throw new TypeError('Not a stored game');
  const version = state.contentVersion;
  if (!isKnownContentVersion(version)) {
    if (typeof version === 'number' && Number.isInteger(version) && version < CONTENT_VERSION) {
      throw new OutdatedGameError(version);
    }
    throw new UnknownContentVersionError(version);
  }
  if (!isSeed(state.seed)) throw new TypeError('A stored game needs its seed');
  return state as GameState;
};
