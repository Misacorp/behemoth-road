/**
 * Who each character is, from the player view: name, role, trait, quirk, the player's display name, and
 * how it looks. Looks and cloak colours come from the art kit's `assignLooks` over the characters' look
 * seeds in join order, so no two characters on the map look alike while combinations last.
 */
import { ACCENTS, assignLooks, type CharacterLook } from '@behemoth-road/art';
import type { PlayerView } from '../api/schema.ts';

export interface Identity {
  readonly id: string;
  readonly name: string;
  readonly role: string | null;
  readonly trait: string | null;
  readonly quirk: string | null;
  /** The Discord display name of the player (text only). */
  readonly player: string | null;
  readonly accent: string;
  readonly look: CharacterLook | undefined;
}

/** The look seeds of the party in join order: what the map assigns looks from. */
export const partySeeds = (view: PlayerView): number[] =>
  view.game.characters.map((c) => c.lookSeed);

/**
 * How an offered character will look once it joins: the art kit assigns looks in join order, so the
 * preview is the party's seeds plus the offer's, last.
 */
export function offerLook(
  party: readonly number[],
  lookSeed: number,
): {
  accent: string;
  look: CharacterLook;
} {
  return assignLooks([...party, lookSeed]).at(-1)!;
}

export function identities(view: PlayerView): Map<string, Identity> {
  const chars = view.game.characters;
  const looks = assignLooks(chars.map((c) => c.lookSeed));
  const out = new Map<string, Identity>();
  chars.forEach((c, i) => {
    const owner = view.players.find((p) => p.userId === c.userId) ?? null;
    out.set(c.id, {
      id: c.id,
      name: c.name,
      role: c.role,
      trait: c.trait,
      quirk: c.quirk,
      player: owner?.name ?? null,
      accent: looks[i]?.accent ?? ACCENTS[0],
      look: looks[i]?.look,
    });
  });
  return out;
}

// How the characters in the current view look, for the map's drawing code (set when a view arrives).
let known: ReadonlyMap<string, Identity> = new Map();

export function setAccents(ids: ReadonlyMap<string, Identity>): void {
  known = ids;
}

/** A character's accent, or the default when the view does not know it (a local game, a test). */
export function accentOf(characterId: string, fallback: string): string {
  return known.get(characterId)?.accent ?? fallback;
}

/** A character's look, or undefined (the art kit's default explorer). */
export function lookOf(characterId: string): CharacterLook | undefined {
  return known.get(characterId)?.look;
}
