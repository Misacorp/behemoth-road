/**
 * Where characters' figures are drawn, worked out the same way the art kit's scene places them: riders in
 * numbered slots on the creature's back (in character order), others on their hex, side by side when they
 * share one. Picking, the selection ring and the path arrow all use these points.
 */
import { figureAnchor, hexCenter, type Projection, riderAnchor } from '@behemoth-road/art';
import { type GameState, hexKey, type Place } from '@behemoth-road/core';
import { creatureArt, riderOrder } from './cells.ts';
import type { Point } from './pick.ts';

/** The feet of the rider in `slot` on the creature's back. */
export function seatPoint(state: GameState, p: Projection, slot: number): Point {
  const art = creatureArt(state);
  return riderAnchor(art.look, art.heading, slot, hexCenter(p, art.q, art.r), p.size, p.squash);
}

/** The rider slot a character has, or would take on boarding (`riderOrder`, shared with the scene). */
export function seatSlot(state: GameState, characterId: string): number {
  return riderOrder(state, characterId).indexOf(characterId);
}

/** Where an active character's figure stands, or null when it is lost or unknown. */
export function figureFeet(state: GameState, characterId: string, p: Projection): Point | null {
  const perHex = new Map<string, number>();
  for (const c of state.characters) {
    if (c.status !== 'active') continue;
    if (c.at.kind === 'creature') {
      if (c.id === characterId) return seatPoint(state, p, seatSlot(state, c.id));
      continue;
    }
    const key = hexKey(c.at.hex);
    const slot = perHex.get(key) ?? 0;
    perHex.set(key, slot + 1);
    if (c.id === characterId) return figureAnchor(p, c.at.hex, slot);
  }
  return null;
}

/** Where a character would stand at `place`: its seat on the creature, or its spot on the hex. */
export function placePoint(
  state: GameState,
  characterId: string,
  place: Place,
  p: Projection,
): Point {
  return place.kind === 'creature'
    ? seatPoint(state, p, seatSlot(state, characterId))
    : figureAnchor(p, place.hex);
}

/** Where every other active character's figure stands (for picking among overlapping figures). */
export function otherFigureFeet(state: GameState, characterId: string, p: Projection): Point[] {
  return state.characters
    .filter((c) => c.status === 'active' && c.id !== characterId)
    .flatMap((c) => figureFeet(state, c.id, p) ?? []);
}
