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
 * 11: swamp (2 actions a step on foot) and the marsh boards replace slower sand
 *    and the sand sledge; shrine, undertow and river folk also fit swamp.
 * 12: settlements only appear on unexplored hexes (settlement placement changed).
 * 13: threats have a reach: a rockslide strikes only on its own hex, never its neighbours.
 * 14: skill trees: notches and picks on every character, the pick-skill action.
 * 15: one XP pool replaces role notches (any contributing act earns XP; scouts earn for exploring);
 *    stats gain the peril breakdown (where peril came from).
 * 16: Guardian and Envoy merge into the Warden (five roles; one Warden skill tree: shield and word).
 */
export const CONTENT_VERSION = 16;

/** Content versions this code can load. */
export const KNOWN_CONTENT_VERSIONS: readonly number[] = [CONTENT_VERSION];
