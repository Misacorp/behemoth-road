/**
 * The one module through which the Worker reaches the game rules in `@behemoth-road/core`. Every rule
 * (moves, the tick, rolling, adding and replacing characters, the player view) runs in the core; this
 * file only names what the server uses, so the rest of the Worker imports the core from one place.
 */
import {
  act,
  moveAlong,
  UNLOCKS,
  ROLES,
  type Action,
  type GameEvent,
  type GameState,
  type Place,
} from '@behemoth-road/core';

export {
  addCharacter,
  CONTENT_VERSION,
  OutdatedGameError,
  characterOf,
  characterOffers,
  createGame,
  creatureSigns,
  loadGame,
  newArtSeed,
  newSeed,
  nextDay,
  replaceCharacter,
  toPlayerView,
  type Action,
  type CharacterOffer,
  type GameEvent,
  type CharacterResult,
  type CreatureSigns,
  type GameState,
  type GameStateView,
  type Place,
  type Seed,
} from '@behemoth-road/core';

/** The role ids from content, for the request schemas. */
export const ROLE_IDS: readonly string[] = ROLES.map((r) => r.id);

// --- Milestone 3: actions, events and the content migration ---

/** The unlock ids from content, for the request schema. */
export const UNLOCK_IDS: readonly string[] = UNLOCKS.map((u) => u.id);

/** A rule's result as the Worker answers it: the new state, what happened, and whether a trap stopped a walk. */
export type EventResult =
  | {
      readonly ok: true;
      readonly state: GameState;
      readonly events: readonly GameEvent[];
      readonly stopped: { readonly step: number; readonly reason: 'trap' } | null;
    }
  | { readonly ok: false; readonly reason: string };

/** The core's walk, with the events on the way and where a trap stopped it. */
export function moveWithEvents(
  state: GameState,
  characterId: string,
  path: readonly Place[],
): EventResult {
  const result = moveAlong(state, characterId, path);
  if (!result.ok) return { ok: false, reason: result.reason };
  return { ok: true, state: result.state, events: result.events, stopped: result.stopped };
}

/** The core's action at the character's place (actions never stop a walk). */
export function actWithEvents(state: GameState, characterId: string, action: Action): EventResult {
  const result = act(state, characterId, action);
  if (!result.ok) return { ok: false, reason: result.reason };
  return { ok: true, state: result.state, events: result.events, stopped: null };
}
