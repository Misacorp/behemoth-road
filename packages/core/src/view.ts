/**
 * What leaves the server, and what comes back from storage.
 */

import { KNOWN_CONTENT_VERSIONS } from './content/index.ts';
import type { GameState, GameStateView } from './state.ts';

/**
 * The game as a player may see it: the state without the seed. Known tiles carry
 * their terrain, so the client can draw and plan; nothing unknown can be derived.
 */
export const toPlayerView = (state: GameState): GameStateView => ({
  // Listed field by field, so a server-only field added later never leaks by default.
  contentVersion: state.contentVersion,
  day: state.day,
  config: state.config,
  creature: state.creature,
  tiles: state.tiles,
  characters: state.characters,
});

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
 * Reads a stored game. Refuses (throws `UnknownContentVersionError`) a state made
 * with content this code does not have, rather than reading it with the wrong data.
 */
export const loadGame = (stored: unknown): GameState => {
  const state = stored as Partial<GameState> | null;
  if (typeof state !== 'object' || state === null) throw new TypeError('Not a stored game');
  if (!isKnownContentVersion(state.contentVersion)) {
    throw new UnknownContentVersionError(state.contentVersion);
  }
  if (!Number.isInteger(state.seed)) throw new TypeError('A stored game needs its seed');
  return state as GameState;
};
