/**
 * Starting a game.
 */

import { type ConfigOverrides, resolveConfig } from './config.ts';
import { type Direction, DIRECTIONS, type Hex, isValidHex } from './hex.ts';
import { CONTENT_VERSION, DEFAULT_STANCE } from './content/index.ts';
import { freshCare, rollNature } from './care.ts';
import { addFeatures, brazierPlan, keyToHex } from './features.ts';
import { ON_CREATURE } from './places.ts';
import { hashInts, hashString, newArtSeed, type Seed, toSeed } from './random.ts';
import { emptyStats } from './stats.ts';
import { fireStory } from './story.ts';
import { emptySkills, emptyStory, type GameState } from './state.ts';
import { updateTiles } from './window.ts';

export interface CreateGameOptions {
  /**
   * Plain characters for tests and local play: one per id, its own user, all riding
   * the creature. Real players join with `addCharacter`.
   */
  readonly characterIds?: readonly string[];
  readonly config?: ConfigOverrides;
  /** The creature's general heading. Default north. */
  readonly heading?: Direction;
  /** The creature's starting centre. Default the origin. */
  readonly start?: Hex;
  /** The public cosmetic seed (0 to 2^32 - 1). Default: a fresh random one, unrelated to `seed`. */
  readonly artSeed?: number;
}

const MAX_ID_LENGTH = 64;

/** The role given to characters made by `characterIds`. */
const DEV_ROLE = 'scout';
const LOOK_STREAM = hashString('dev-look');

/**
 * A new game. Pass `newSeed()` for a real game; a plain number (0 to 2^32 - 1)
 * is accepted for tests and local play.
 */
export const createGame = (
  seedOrNumber: Seed | number,
  options: CreateGameOptions = {},
): GameState => {
  const seed = toSeed(seedOrNumber);
  const artSeed = options.artSeed ?? newArtSeed();
  if (!Number.isInteger(artSeed) || artSeed < 0 || artSeed > 0xffffffff) {
    throw new RangeError('artSeed must be an integer from 0 to 2^32 - 1');
  }
  const config = resolveConfig(options.config);
  const heading = options.heading ?? 'n';
  if (!DIRECTIONS.includes(heading)) throw new RangeError(`Unknown heading: ${String(heading)}`);
  const centre = options.start ?? { q: 0, r: 0 };
  if (!isValidHex(centre)) throw new RangeError('start must have integer coordinates');
  const ids = options.characterIds ?? [];
  if (ids.length > config.playerCap) throw new RangeError('More characters than the player cap');
  if (new Set(ids).size !== ids.length) throw new RangeError('Character ids must be unique');
  if (ids.some((id) => id.length === 0 || id.length > MAX_ID_LENGTH)) {
    throw new RangeError(`Character ids must be 1 to ${MAX_ID_LENGTH} characters`);
  }

  const day = 1;
  const tiles = updateTiles({}, centre, day, config, seed);
  const nature = rollNature(seed);
  const braziers = brazierPlan(seed, centre, heading, config);
  const game: GameState = {
    contentVersion: CONTENT_VERSION,
    artSeed,
    seed,
    day,
    config,
    creature: {
      centre,
      kind: nature.type,
      heading,
      lingering: false,
      lingeredDay: null,
      steps: 0,
      defenders: [],
      tows: [],
    },
    nature,
    care: freshCare(nature, day),
    stimuli: [],
    threats: [],
    settlements: [],
    peril: 0,
    season: { status: 'on' },
    stats: emptyStats(),
    misleadUntilDay: null,
    traces: [],
    burnt: [],
    story: emptyStory(),
    tiles,
    brazierPlan: braziers,
    features: addFeatures(
      {},
      tiles,
      Object.keys(tiles).map(keyToHex),
      seed,
      config.featureChance,
      braziers,
    ),
    stores: {},
    unlocks: [],
    project: null,
    carts: [],
    characters: ids.map((id) => ({
      id,
      userId: id,
      name: id,
      trait: null,
      quirk: null,
      lookSeed: hashInts(seed, LOOK_STREAM, hashString(id)),
      role: DEV_ROLE,
      joinedDay: day,
      at: ON_CREATURE,
      actionsLeft: config.actionsPerDay,
      pack: {},
      status: 'active',
      struckDay: null,
      stance: DEFAULT_STANCE,
      waiting: false,
      skills: emptySkills(),
    })),
  };
  // What is true at the start (setting out; terrain under the first footprint) fires now, with no event
  // (a new game has no event stream): `story.fired` is the record.
  return fireStory(game).state;
};
