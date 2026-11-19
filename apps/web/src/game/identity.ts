/**
 * Who each character is, from the player view: name, role, trait and quirk, and the accent colour its
 * cloak is drawn in. The accent comes from the character's name (a stable hash), so a rolled character
 * keeps its colour from the join drawer onto the map.
 */
import { ACCENTS } from '@behemoth-road/art';
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
}

/** A stable accent for a name: the same name always gets the same colour. */
export function accentForName(name: string): string {
  let h = 2166136261;
  for (let i = 0; i < name.length; i += 1) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ACCENTS[(h >>> 0) % ACCENTS.length]!;
}

export function identities(view: PlayerView): Map<string, Identity> {
  const out = new Map<string, Identity>();
  for (const c of view.game.characters) {
    const owner = view.players.find((p) => p.characterId === c.id) ?? null;
    const name = c.name ?? c.id;
    out.set(c.id, {
      id: c.id,
      name,
      role: owner?.role ?? null,
      trait: c.trait ?? null,
      quirk: c.quirk ?? null,
      player: owner?.name ?? null,
      accent: accentForName(name),
    });
  }
  return out;
}

// The accents of the characters in the current view, for the map's drawing code (set when a view arrives).
let accents: ReadonlyMap<string, string> = new Map();

export function setAccents(ids: ReadonlyMap<string, Identity>): void {
  accents = new Map([...ids].map(([id, who]) => [id, who.accent]));
}

/** A character's accent, or the default when the view does not know it (a local game). */
export function accentOf(characterId: string, fallback: string): string {
  return accents.get(characterId) ?? fallback;
}
