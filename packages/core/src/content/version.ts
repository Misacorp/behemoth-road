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
 * 16: stances and waiting: every character has a stance and a waiting flag (docs/design/stances.md).
 * 17: merged Warden and stances.
 * 18: onboarding: the core's SEEN_IDS (what a player was shown once) joins the shared ids.
 * 19: skill tiers 2 and 3 are active (new effects; fires may carry a range and push, care a soothed day).
 * 20: water: lakes, ponds, seas and islands (deep water needs the raft; the creature swims), the water
 *    temple, the raft; forest, desert and cliff thinned a little to keep the plains share.
 * 21: the tow line unlock; the creature carries the day's thrown tow lines (`creature.tows`).
 * 22: the world (docs/design/story.md): creature fate, sound, habit, blessing, tier and route; threats may
 *    have an `ending`; traces and the story (storylets) join the state; the creature has a public kind.
 */
export const CONTENT_VERSION = 22;

/** Content versions this code can load. */
export const KNOWN_CONTENT_VERSIONS: readonly number[] = [CONTENT_VERSION];
