/**
 * The destination area as the view reports it (`game.destination.hexes`): the hexes the creature needs to
 * reach, drawn with a glow over fog too. A server without one gives none.
 */
import type { Hex } from '@behemoth-road/core';

export function destinationHexes(state: object): readonly Hex[] {
  const d = (state as { destination?: { hexes?: readonly Hex[] } }).destination;
  const hexes = d?.hexes;
  return Array.isArray(hexes) ? (hexes as readonly Hex[]) : [];
}
