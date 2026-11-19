/**
 * Characters for real players: rolled offers, joining and replacing a lost one.
 * Rolls are seeded by the game seed, the user and the attempt, so a reload shows
 * the same offers; only the server can roll (it holds the seed).
 */

import { BY_NAMES, NAME_ENDS, NAME_STARTS, QUIRKS, ROLES, TRAITS } from './content/index.ts';
import { ON_CREATURE } from './places.ts';
import { createRng, hashInts, hashString, type Seed, toSeed } from './random.ts';
import type { Character, GameState } from './state.ts';

/** One character a player can pick. The plain one has no trait and no quirk. */
export interface CharacterOffer {
  readonly name: string;
  readonly trait: string | null;
  readonly quirk: string | null;
}

export type CharacterRefusal =
  | 'invalid-user'
  | 'unknown-role'
  | 'invalid-offer'
  | 'has-character'
  | 'no-character'
  | 'not-lost'
  | 'cap-reached';

export type CharacterResult =
  | { readonly ok: true; readonly state: GameState; readonly characterId: string }
  | { readonly ok: false; readonly reason: CharacterRefusal };

export interface CharacterRequest {
  readonly userId: string;
  /** Index into the user's current offers (`characterOffers`). */
  readonly offer: number;
  readonly role: string;
}

const MAX_USER_ID_LENGTH = 32;
const ROLL_STREAM = hashString('characters');

const pick = <T>(items: readonly T[], rng: () => number): T =>
  items[Math.floor(rng() * items.length)] as T;

/** `count` different items, in a seeded order. */
const pickDistinct = <T>(items: readonly T[], count: number, rng: () => number): T[] => {
  const pool = items.slice();
  const out: T[] = [];
  while (out.length < count && pool.length > 0) {
    out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0] as T);
  }
  return out;
};

const rollName = (rng: () => number): string => {
  const name = pick(NAME_STARTS, rng) + pick(NAME_ENDS, rng);
  return rng() < 1 / 3 ? `${name} ${pick(BY_NAMES, rng)}` : name;
};

/**
 * Two or three rolled characters (each with a trait and a quirk, none repeated)
 * followed by the plain one. The same seed, user and attempt give the same list.
 */
export const rollCharacters = (
  seed: Seed | number,
  userId: string,
  attempt: number,
): CharacterOffer[] => {
  const rng = createRng(hashInts(toSeed(seed), ROLL_STREAM, hashString(userId), attempt));
  const count = rng() < 0.5 ? 2 : 3;
  const traits = pickDistinct(TRAITS, count, rng);
  const quirks = pickDistinct(QUIRKS, count, rng);
  const rolled = traits.map((trait, i) => ({
    name: rollName(rng),
    trait: trait.id,
    quirk: quirks[i]?.id ?? null,
  }));
  return [...rolled, { name: rollName(rng), trait: null, quirk: null }];
};

/** How many characters this user has had in this game. */
const attemptsBy = (state: GameState, userId: string): number =>
  state.characters.filter((c) => c.userId === userId).length;

/** What a user is offered now: for their first character, or to replace a lost one. */
export const characterOffers = (state: GameState, userId: string): CharacterOffer[] =>
  rollCharacters(state.seed, userId, attemptsBy(state, userId));

/** The user's newest character, if any. */
export const characterOf = (state: GameState, userId: string): Character | undefined =>
  state.characters.findLast((c) => c.userId === userId);

const create = (state: GameState, request: CharacterRequest): CharacterResult => {
  const { userId, offer, role } = request;
  if (typeof userId !== 'string' || userId.length === 0 || userId.length > MAX_USER_ID_LENGTH) {
    return { ok: false, reason: 'invalid-user' };
  }
  if (!ROLES.some((r) => r.id === role)) return { ok: false, reason: 'unknown-role' };
  const offers = characterOffers(state, userId);
  const picked = Number.isInteger(offer) ? offers[offer] : undefined;
  if (!picked) return { ok: false, reason: 'invalid-offer' };
  const active = state.characters.filter((c) => c.status === 'active').length;
  if (active >= state.config.playerCap) return { ok: false, reason: 'cap-reached' };

  const attempt = attemptsBy(state, userId);
  const character: Character = {
    id: `${userId}.${attempt}`,
    userId,
    name: picked.name,
    trait: picked.trait,
    quirk: picked.quirk,
    role,
    joinedDay: state.day,
    at: ON_CREATURE,
    actionsLeft: state.config.actionsPerDay,
    status: 'active',
  };
  return {
    ok: true,
    state: { ...state, characters: [...state.characters, character] },
    characterId: character.id,
  };
};

/** A user's first character: it starts riding the creature. One per user; the cap applies. */
export const addCharacter = (state: GameState, request: CharacterRequest): CharacterResult =>
  characterOf(state, request.userId)
    ? { ok: false, reason: 'has-character' }
    : create(state, request);

/**
 * A new character for a user whose character is lost. The lost one stays in the
 * game (it is still drawn where it was lost).
 */
export const replaceCharacter = (state: GameState, request: CharacterRequest): CharacterResult => {
  const current = characterOf(state, request.userId);
  if (!current) return { ok: false, reason: 'no-character' };
  if (current.status !== 'lost') return { ok: false, reason: 'not-lost' };
  return create(state, request);
};
