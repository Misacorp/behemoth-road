/**
 * Places: a hex, or the creature as a whole. Tapping or naming any of the
 * creature's footprint hexes means the creature.
 */

import { type Hex, hexDistance, hexKey, hexRing, isValidHex, neighbours } from './hex.ts';
import type { GameStateView, Place } from './state.ts';
import { isCreatureHex } from './window.ts';

export const ON_CREATURE: Place = { kind: 'creature' };

export const onHex = (h: Hex): Place => ({ kind: 'hex', hex: { q: h.q, r: h.r } });

/** The place a hex stands for: the creature if it is under the footprint, else the hex. */
export const placeAt = (state: GameStateView, h: Hex): Place =>
  isCreatureHex(state, h) ? ON_CREATURE : onHex(h);

/** A hex or a place, as a place. Returns null for malformed input. */
export const toPlace = (state: GameStateView, target: Hex | Place): Place | null => {
  if (typeof target !== 'object' || target === null) return null;
  if ('kind' in target) {
    if (target.kind === 'creature') return ON_CREATURE;
    if (target.kind === 'hex' && isValidHex(target.hex)) return placeAt(state, target.hex);
    return null;
  }
  return isValidHex(target) ? placeAt(state, target) : null;
};

/** A stable string key: `creature`, or the hex key. */
export const placeKey = (place: Place): string =>
  place.kind === 'creature' ? 'creature' : hexKey(place.hex);

export const placeEquals = (a: Place, b: Place): boolean => placeKey(a) === placeKey(b);

/** The hex to draw a place at: the hex itself, or the creature's centre. */
export const placeHex = (state: GameStateView, place: Place): Hex =>
  place.kind === 'creature' ? state.creature.centre : place.hex;

/** The hexes next to the footprint: where characters board from and step off to. */
export const creatureEdge = (state: GameStateView): Hex[] =>
  hexRing(state.creature.centre, state.config.creatureRadius + 1);

/** Whether a hex lies next to the creature's footprint. */
export const isBesideCreature = (state: GameStateView, h: Hex): boolean =>
  hexDistance(h, state.creature.centre) === state.config.creatureRadius + 1;

/** The places one step from a place, in a fixed order. The creature counts once. */
export const placeNeighbours = (state: GameStateView, place: Place): Place[] => {
  if (place.kind === 'creature') return creatureEdge(state).map(onHex);
  const out: Place[] = [];
  let creatureAdded = false;
  for (const h of neighbours(place.hex)) {
    if (isCreatureHex(state, h)) {
      if (!creatureAdded) out.push(ON_CREATURE);
      creatureAdded = true;
    } else {
      out.push(onHex(h));
    }
  }
  return out;
};

/** Whether two places are one step apart. */
export const arePlacesAdjacent = (state: GameStateView, a: Place, b: Place): boolean =>
  placeNeighbours(state, a).some((p) => placeEquals(p, b));
