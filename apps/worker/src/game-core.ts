/**
 * The one module through which the Worker reaches the game rules in `@behemoth-road/core`. Every rule
 * (moves, the tick, rolling, adding and replacing characters, the player view) runs in the core; this
 * file only names what the server uses, so the rest of the Worker imports the core from one place.
 */
import { ROLES } from '@behemoth-road/core';

export {
  addCharacter,
  characterOf,
  characterOffers,
  createGame,
  loadGame,
  moveAlong,
  newArtSeed,
  newSeed,
  nextDay,
  replaceCharacter,
  toPlayerView,
  type CharacterOffer,
  type CharacterResult,
  type GameState,
  type GameStateView,
  type Place,
  type Seed,
} from '@behemoth-road/core';

/** The role ids from content, for the request schemas. */
export const ROLE_IDS: readonly string[] = ROLES.map((r) => r.id);
