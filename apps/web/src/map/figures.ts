/**
 * Where characters' figures are drawn, worked out the same way the art kit's scene places them: riders in
 * numbered slots on the creature's back (in character order), others on their hex, side by side when they
 * share one. Picking, the selection ring and the path arrow all use these points.
 */
import {
  figureAnchor,
  type FigureContext,
  hexCenter,
  type Projection,
  riderAnchor,
  riderSeats,
} from '@behemoth-road/art';
import { type GameStateView, type Hex, hexKey, type Place } from '@behemoth-road/core';
import { creatureArt } from './cells.ts';
import type { OtherFigure, Point } from './pick.ts';

/** A hex holding a feature: figures stand to its front left, as the scene places them (`FigureContext.tall`). */
const anchorContext = (state: GameStateView, h: Hex): FigureContext => ({
  tall: state.features[hexKey(h)] !== undefined,
});

/** The feet of the rider in `slot` on the creature's back. */
export function seatPoint(state: GameStateView, p: Projection, slot: number): Point {
  const art = creatureArt(state);
  return riderAnchor(art.look, art.heading, slot, hexCenter(p, art.q, art.r), p.size, p.squash);
}

/**
 * The rider slot a character has, or would take on boarding: the art kit's `riderSeats` over the active
 * characters in order, as the scene seats them (`characterArts` passes the same order).
 */
export function seatSlot(state: GameStateView, characterId: string): number {
  const active = state.characters.filter((c) => c.status === 'active');
  const seats = riderSeats(active, (c) => c.at.kind === 'creature' || c.id === characterId);
  return seats.get(characterId) ?? 0;
}

/** Where an active character's figure stands, or null when it is lost or unknown. */
export function figureFeet(state: GameStateView, characterId: string, p: Projection): Point | null {
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
    if (c.id === characterId)
      return figureAnchor(p, c.at.hex, slot, anchorContext(state, c.at.hex));
  }
  return null;
}

/** Where a character would stand at `place`: its seat on the creature, or its spot on the hex. */
export function placePoint(
  state: GameStateView,
  characterId: string,
  place: Place,
  p: Projection,
): Point {
  return place.kind === 'creature'
    ? seatPoint(state, p, seatSlot(state, characterId))
    : figureAnchor(p, place.hex, 0, anchorContext(state, place.hex));
}

/** Where a lure animal stands on its hex (its feet), a little in front of the middle. */
export const lureFeet = (p: Projection, h: Hex): Point => {
  const c = hexCenter(p, h.q, h.r);
  return { x: c.x, y: c.y + 0.12 * p.size };
};

/** Where the cart's wheel stands on its hex: behind and to the right of where a character stands. */
export const cartFeet = (p: Projection, h: Hex): Point => {
  const c = hexCenter(p, h.q, h.r);
  return { x: c.x - 0.1 * p.size, y: c.y + 0.1 * p.size };
};

/**
 * Figures a tap can land on, for picking: characters standing on hexes. Riders are not tap targets of
 * their own; a tap anywhere on the creature means the creature.
 */
export function pickableFeet(
  state: GameStateView,
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
    others: [
      ...onHex
        .filter((c) => c.id !== characterId)
        .flatMap((c) => feet(c.id).map((f): OtherFigure => ({ id: c.id, feet: f }))),
      ...state.lures.map((l): OtherFigure => ({
        id: l.id,
        feet: lureFeet(p, l.hex),
        kind: 'lure',
      })),
      ...state.carts.map((c): OtherFigure => ({
        id: c.id,
        feet: cartFeet(p, c.hex),
        kind: 'cart',
      })),
    ],
  };
}
