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
 * 5: the living creature: its hidden nature and hunger, fires, food and lingering.
 * 6: threats and an ending: threats, peoples and settlements, peril and the
 *    season's route.
 * 7: stone, iron and timber nodes on open ground (generation changed).
 */
export const CONTENT_VERSION = 7;

/** Content versions this code can load. */
export const KNOWN_CONTENT_VERSIONS: readonly number[] = [CONTENT_VERSION];
