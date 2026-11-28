/**
 * The destination's glow hexes: every hex of the core's destination band (`game.destination`, a line and a
 * depth) inside the drawn layer, fogged ones too (the destination is public from the start). Read through the
 * core's `inDestination`, so the web never re-derives the band.
 */
import { destinationHexesNear, type Destination, type Hex } from '@behemoth-road/core';
import type { Projection } from '@behemoth-road/art';
import { worldToHex } from './pick.ts';

/** The most hexes out from the layer's centre the glow is worked for (a guard on a runaway box). */
const MAX_RADIUS = 80;

export interface WorldBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The destination hexes on a layer's box (world px): around its centre, out to a radius that covers it. */
export function destinationHexesOn(d: Destination, box: WorldBox, p: Projection): Hex[] {
  const centre = worldToHex(p, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  const columns = box.width / (1.5 * p.size);
  const rows = box.height / (Math.sqrt(3) * p.size * p.squash);
  // A hex's distance is at most half the columns plus half the rows away, from a centre.
  const radius = Math.min(MAX_RADIUS, Math.ceil(columns / 2 + rows / 2) + 2);
  return destinationHexesNear(d, centre, radius);
}
