/**
 * The version of the content (terrain, generation, roles, traits, quirks, names).
 * Bump it when a change to content would change or break a stored game: a game
 * records the version it was made with, and a state with an unknown version is
 * refused rather than read with the wrong content.
 *
 * 2: 128-bit seeds (every map differs from version 1). Version 1 was never stored.
 * 3: features, items and recipes (an overnight draft, never released).
 * 4: features, exploration, packs, team stores and unlocks. Before a stable
 *    release, older games are not migrated: the server starts a new game.
 */
export const CONTENT_VERSION = 4;

/** Content versions this code can load. */
export const KNOWN_CONTENT_VERSIONS: readonly number[] = [CONTENT_VERSION];
