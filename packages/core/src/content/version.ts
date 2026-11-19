/**
 * The version of the content (terrain, generation, roles, traits, quirks, names).
 * Bump it when a change to content would change or break a stored game: a game
 * records the version it was made with, and a state with an unknown version is
 * refused rather than read with the wrong content.
 */
export const CONTENT_VERSION = 1;

/** Content versions this code can load. */
export const KNOWN_CONTENT_VERSIONS: readonly number[] = [CONTENT_VERSION];
