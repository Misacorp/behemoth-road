/**
 * The version of the content (terrain, generation, roles, traits, quirks, names).
 * Bump it when a change to content would change or break a stored game: a game
 * records the version it was made with, and a state with an unknown version is
 * refused rather than read with the wrong content.
 *
 * 2: 128-bit seeds (every map differs from version 1). Version 1 was never stored.
 * 3: features (nodes, sites, traps), materials, items and recipes. Version 2 games
 *    load through `migrateGame` and keep their map and characters.
 */
export const CONTENT_VERSION = 3;

/** Content versions this code can load (older ones are migrated on load). */
export const KNOWN_CONTENT_VERSIONS: readonly number[] = [2, CONTENT_VERSION];
