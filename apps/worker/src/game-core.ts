/**
 * The one module through which the Worker reaches the game rules in `@behemoth-road/core`. Every rule
 * (moves, the tick, adding and replacing characters, the player view) runs in the core; this file only
 * names what the server uses, so the rest of the Worker never imports the core directly.
 *
 * TEMPORARY: the core session (`m2/core`) is adding `toPlayerView`, character content and
 * `addCharacter` / `replaceCharacter`. Until it lands, the functions marked STUB below stand in for
 * them with the narrowest behaviour the contract (`docs/design/m2-session.md`) needs. Swap them for the
 * core's exports when it lands; nothing else in the Worker should change.
 */
import {
  createGame,
  hashInts,
  hashString,
  moveAlong,
  nextDay,
  ON_CREATURE,
  terrainIdAt,
  type GameState,
  type Place,
} from '@behemoth-road/core';

export { createGame, moveAlong, nextDay, type GameState, type Place };

/** STUB until the core's role content lands: the six role ids. */
export const ROLE_IDS = ['scout', 'scholar', 'keeper', 'guardian', 'engineer', 'envoy'] as const;
export type RoleId = (typeof ROLE_IDS)[number];

/** A character a player may pick on joining. Offer 0 is always the plain one (no trait, no quirk). */
export interface CharacterOffer {
  readonly name: string;
  readonly trait: string | null;
  readonly quirk: string | null;
}

/** The core state without the seed; every known tile carries its terrain id. */
export type GameStateView = Omit<GameState, 'seed' | 'tiles'> & {
  readonly tiles: Readonly<
    Record<string, GameState['tiles'][string] & { readonly terrain: string }>
  >;
};

const STUB_NAMES = ['Aino', 'Brann', 'Cael', 'Dagny', 'Eero', 'Fenna', 'Ilmo', 'Kaja'];

/** STUB: the offers for a player's attempt, seeded by (game seed, user id, attempt). */
export function offersFor(state: GameState, userId: string, attempt: number): CharacterOffer[] {
  const pick = (i: number): string =>
    STUB_NAMES[hashInts(state.seed, hashString(userId), attempt, i) % STUB_NAMES.length] ?? 'Aino';
  return [0, 1, 2].map((i) => ({ name: pick(i), trait: null, quirk: null }));
}

export type CharacterResult =
  | { readonly ok: true; readonly state: GameState }
  | {
      readonly ok: false;
      readonly reason: 'full' | 'duplicate' | 'not-lost' | 'unknown-character';
    };

const activeCount = (state: GameState): number =>
  state.characters.filter((c) => c.status === 'active').length;

/** STUB: adds a character riding the creature, refused at the player cap. */
export function addCharacter(state: GameState, id: string, offer: CharacterOffer): CharacterResult {
  // STUB: the core's characters do not carry a name, trait or quirk yet, so the offer is not kept.
  void offer;
  if (state.characters.some((c) => c.id === id)) return { ok: false, reason: 'duplicate' };
  if (activeCount(state) >= state.config.playerCap) return { ok: false, reason: 'full' };
  const character = {
    id,
    at: ON_CREATURE,
    actionsLeft: state.config.actionsPerDay,
    status: 'active' as const,
  };
  return { ok: true, state: { ...state, characters: [...state.characters, character] } };
}

/** STUB: a lost character is replaced by a new one riding the creature. */
export function replaceCharacter(
  state: GameState,
  lostId: string,
  id: string,
  offer: CharacterOffer,
): CharacterResult {
  const lost = state.characters.find((c) => c.id === lostId);
  if (lost === undefined) return { ok: false, reason: 'unknown-character' };
  if (lost.status !== 'lost') return { ok: false, reason: 'not-lost' };
  return addCharacter(state, id, offer);
}

/** STUB: the player view, the seed left out and every known tile given its terrain. */
export function toPlayerView(state: GameState): GameStateView {
  const { seed, tiles, ...rest } = state;
  const shown: Record<string, GameState['tiles'][string] & { terrain: string }> = {};
  for (const [key, tile] of Object.entries(tiles)) {
    const [q, r] = key.split(',').map(Number);
    if (q === undefined || r === undefined) continue;
    shown[key] = { ...tile, terrain: terrainIdAt(seed, { q, r }) };
  }
  return { ...rest, tiles: shown };
}
