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
 * 8: threats are telegraphed: a wider window (radius 6), slower raiders, the
 *    rockslide further ahead.
 * 9: more variety: ambush and stampede threats, river folk, the sunken shrine,
 *    the undertow, the sand sledge (and slower sand).
 * 10: fires steer sideways only, hunger drains every day (food nourishes 4,
 *    comfortable 4 to 8), and the scripted chain reaches the spikes by day 15-20
 *    (more deep tombs, ore and fieldstones; cheaper hook; shorter builds).
 */
export const CONTENT_VERSION = 10;

/** Content versions this code can load. */
export const KNOWN_CONTENT_VERSIONS: readonly number[] = [CONTENT_VERSION];
