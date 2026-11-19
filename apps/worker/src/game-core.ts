/**
 * The one module through which the Worker reaches the game rules in `@behemoth-road/core`. Every rule
 * (moves, the tick, rolling, adding and replacing characters, the player view) runs in the core; this
 * file only names what the server uses, so the rest of the Worker imports the core from one place.
 */
import { loadGame, moveAlong, ROLES, type GameState, type Place } from '@behemoth-road/core';

export {
  addCharacter,
  characterOf,
  characterOffers,
  createGame,
  loadGame,
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

// --- Milestone 3 ---
// TEMPORARY: the core session (`m3/core`) is adding actions, features, events and the v2 -> v3 migration.
// Until it lands, the functions marked STUB stand in with the narrowest behaviour `docs/design/m3-chain.md`
// needs. Swap them for the core's exports when it lands; nothing else in the Worker should change.

/** STUB until the core's recipe content lands. */
export const RECIPE_IDS: readonly string[] = ['grappling-hook', 'lantern', 'climbing-spikes'];

/** Something that happened during a move or an action, for a short moment on the map. */
export interface GameEvent {
  readonly kind: string;
  readonly hex?: { readonly q: number; readonly r: number };
  readonly [key: string]: unknown;
}

export type GameAction =
  | { readonly kind: 'gather' }
  | { readonly kind: 'craft'; readonly recipe: string }
  | { readonly kind: 'work-site' };

export type EventResult =
  | { readonly ok: true; readonly state: GameState; readonly events: readonly GameEvent[] }
  | { readonly ok: false; readonly reason: string };

/** The core's move, with the events of the walk (STUB: none until the core reports them). */
export function moveWithEvents(
  state: GameState,
  characterId: string,
  path: readonly Place[],
): EventResult {
  const result = moveAlong(state, characterId, path);
  if (!result.ok) return { ok: false, reason: result.reason };
  const events = (result as { events?: readonly GameEvent[] }).events ?? [];
  return { ok: true, state: result.state, events };
}

/** STUB: every action is refused until the core's rules land. */
export function act(state: GameState, characterId: string, action: GameAction): EventResult {
  void state;
  void characterId;
  void action;
  return { ok: false, reason: 'not-available' };
}

/** STUB: the content version this build writes. */
export const CONTENT_VERSION = 2;

/** STUB: brings a stored game up to this build's content (the core's `migrateGame`). */
export function migrateGame(stored: unknown): GameState {
  return loadGame(stored);
}
