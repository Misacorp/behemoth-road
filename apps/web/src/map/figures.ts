/**
 * Where characters' figures are drawn, worked out the same way the art kit's scene places them: riders in
 * numbered slots on the creature's back (in character order), others on their hex, side by side when they
 * share one. Picking, the selection ring and the path arrow all use these points.
 */
import {
  figureAnchor,
  hexCenter,
  type Projection,
  riderAnchor,
  riderSeats,
} from '@behemoth-road/art';
import { type GameState, hexKey, type Place } from '@behemoth-road/core';
import { creatureArt } from './cells.ts';
import type { OtherFigure, Point } from './pick.ts';

/** The feet of the rider in `slot` on the creature's back. */
export function seatPoint(state: GameState, p: Projection, slot: number): Point {
  const art = creatureArt(state);
  return riderAnchor(art.look, art.heading, slot, hexCenter(p, art.q, art.r), p.size, p.squash);
}

/**
 * The rider slot a character has, or would take on boarding: the art kit's `riderSeats` over the active
 * characters in order, as the scene seats them (`characterArts` passes the same order).
 */
export function seatSlot(state: GameState, characterId: string): number {
  const active = state.characters.filter((c) => c.status === 'active');
  const seats = riderSeats(active, (c) => c.at.kind === 'creature' || c.id === characterId);
  return seats.get(characterId) ?? 0;
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

/**
 * Figures a tap can land on, for picking: characters standing on hexes. Riders are not tap targets of
 * their own; a tap anywhere on the creature means the creature.
 */
export function pickableFeet(
  state: GameState,
  characterId: string,
  p: Projection,
): { readonly mine: Point | null; readonly others: OtherFigure[] } {
  const onHex = state.characters.filter((c) => c.status === 'active' && c.at.kind === 'hex');
  const feet = (id: string): Point[] => {
    const f = figureFeet(state, id, p);
    return f ? [f] : [];
  };
  return {
    mine: onHex.some((c) => c.id === characterId) ? (feet(characterId)[0] ?? null) : null,
    others: onHex
      .filter((c) => c.id !== characterId)
      .flatMap((c) => feet(c.id).map((f) => ({ id: c.id, feet: f }))),
  };
}
