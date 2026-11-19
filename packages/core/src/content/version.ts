/**
 * The version of the content (terrain, generation, roles, traits, quirks, names).
 * Bump it when a change to content would change or break a stored game: a game
 * records the version it was made with, and a state with an unknown version is
 * refused rather than read with the wrong content.
 *
 * 2: 128-bit seeds (every map differs from version 1). Version 1 was never stored.
 */
export const CONTENT_VERSION = 2;

/** Content versions this code can load. */
export const KNOWN_CONTENT_VERSIONS: readonly number[] = [CONTENT_VERSION];
