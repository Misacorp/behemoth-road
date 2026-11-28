/**
 * The destination (docs/design/destination.md): a band of hexes across the whole map, perpendicular to
 * the creature's heading, a fixed number of rows out from where it set out. The season ends when the
 * creature's centre steps onto it. The band is a sanctuary: threats never enter, appear in or strike from it;
 * hazards and lures are never laid in it. It is public from the first day (it is a place, not a secret),
 * stored as a compact line: a point, a direction, and where along it the band starts and how thick it is.
 *
 * "Rows" measure progress along the heading: one straight step is 1 row, a step a sixth of a turn to either
 * side is half a row. Everything here is exact (quarters of a row), with no floating point.
 */

import type { TuningConfig } from './config.ts';
import { type Direction, directionOffset, type Hex, hexesInRange } from './hex.ts';
import type { GameStateView } from './state.ts';

/** The region tag of the destination: what keeps threats out (read like a terrain tag). */
export const SANCTUARY_TAG = 'sanctuary';

/** The destination band: every hex whose `rowsAlong` from `origin` is at least `from` and below `from + depth`. */
export interface Destination {
  /** Where the creature set out. */
  readonly origin: Hex;
  /** The creature's heading at the start; rows are measured along it. */
  readonly heading: Direction;
  /** Rows out from the origin to the band's near edge (in half rows). */
  readonly from: number;
  /** The band's thickness in rows: at least 1, so no step can cross it. */
  readonly depth: number;
}

/** Rows along `d.heading` from `d.origin` to a hex (negative behind). Exact: a multiple of 0.25. */
export const rowsAlong = (d: Pick<Destination, 'origin' | 'heading'>, h: Hex): number => {
  const q = h.q - d.origin.q;
  const r = h.r - d.origin.r;
  const { q: a, r: b } = directionOffset(d.heading);
  return (3 * q * a + (2 * r + q) * (2 * b + a)) / 4;
};

/** Whether a hex lies in the destination band. */
export const inDestination = (d: Destination, h: Hex): boolean => {
  const rows = rowsAlong(d, h);
  return rows >= d.from && rows < d.from + d.depth;
};

/**
 * The band for a new game: `routeLength` steps out, in rows. A step is a row straight on and half a row
 * to either side; `destinationRowsPerStep` says what a step is worth on average in play (half rows).
 */
export const destinationFor = (
  config: Pick<TuningConfig, 'routeLength' | 'destinationRowsPerStep' | 'destinationDepth'>,
  origin: Hex,
  heading: Direction,
): Destination => ({
  origin,
  heading,
  from: Math.max(1, Math.round(config.routeLength * config.destinationRowsPerStep * 2) / 2),
  depth: config.destinationDepth,
});

/** The destination hexes within `radius` of a hex, for drawing and for blocking. */
export const destinationHexesNear = (d: Destination, centre: Hex, radius: number): Hex[] =>
  hexesInRange(centre, radius).filter((h) => inDestination(d, h));

/** Region tags of a hex: `sanctuary` in the destination. Public: reads only the destination. */
export const regionTagsAt = (state: Pick<GameStateView, 'destination'>, h: Hex): string[] =>
  inDestination(state.destination, h) ? [SANCTUARY_TAG] : [];

/** Whether a hex is a sanctuary (threats never enter, appear in or strike from it). */
export const isSanctuary = (state: Pick<GameStateView, 'destination'>, h: Hex): boolean =>
  regionTagsAt(state, h).includes(SANCTUARY_TAG);

/**
 * Rows still to go before the creature's centre reaches the band (0 once it is there or past it).
 * One straight step covers 1 row, so this is the fewest steps left.
 */
export const rowsToDestination = (state: Pick<GameStateView, 'destination' | 'creature'>): number =>
  Math.max(0, state.destination.from - rowsAlong(state.destination, state.creature.centre));

/** How far along the way the creature is: 0 at the start, 1 at the band's near edge (never above 1). */
export const destinationProgress = (
  state: Pick<GameStateView, 'destination' | 'creature'>,
): number => {
  const total = state.destination.from;
  const done = rowsAlong(state.destination, state.creature.centre);
  return Math.min(1, Math.max(0, done / total));
};
