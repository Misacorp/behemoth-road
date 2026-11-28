/**
 * How terrain is laid out, as data. Each rule reads a seeded noise field and
 * claims a hex when the field's value meets its condition; the first rule that
 * matches wins, and unclaimed hexes get the fallback. Rules that name the same
 * field share it (forest and desert both read moisture, so they never touch).
 *
 * Tuned by eye and by `test/map.test.ts`: about 70% plains, regions a few hexes
 * across, and a river crossing the route every few days of walking.
 */

import type { NoiseField } from '../noise.ts';

export interface FieldRef extends NoiseField {
  /** Name of the field; rules with the same name and settings read the same values. */
  readonly name: string;
}

export type FieldCondition =
  | { readonly above: number }
  | { readonly below: number }
  /** In a band of the field: at or above the first value and below the second. */
  | { readonly between: readonly [number, number] }
  /**
   * On a contour line: the hex is at or above the value and a neighbour is below it.
   * Gives connected ribbons one hex wide, such as rivers and ridges.
   */
  | { readonly contour: number };

export interface TerrainRule {
  /** The terrain id (from `TERRAIN_TYPES`) this rule places. */
  readonly terrain: string;
  readonly field: FieldRef;
  readonly when: FieldCondition;
  /** Optionally, a second field that must also be above a value (breaks ribbons into pieces). */
  readonly mask?: { readonly field: FieldRef; readonly above: number };
}

/**
 * A kind of standing water. Bodies sit on a coarse grid: each cell may hold one of each kind,
 * with its centre kept `reach` clear of the cell's edge, so two big bodies never touch.
 * A body is a ragged disc: deep water out to `radius` (never more, so a crossing is bounded
 * by construction), then shallows for `shore` more. Land inside it is an island.
 */
export interface WaterKind {
  readonly id: string;
  /** Terrain of the deep part (from `TERRAIN_TYPES`). */
  readonly deep: string;
  /** Terrain of the ring around it, if any. */
  readonly shallows?: string;
  /** Cell side in hexes: bodies of one kind are at least this far apart less their reach. */
  readonly cell: number;
  /** Chance a cell holds this kind. */
  readonly chance: number;
  /** Radius of the deep part in hex steps, both included. Under 2 means a crossing of at most 4 hexes. */
  readonly radius: readonly [number, number];
  /** Rings of shallows. */
  readonly shore: number;
  /** How much of the edge is eaten away at random, in hex steps. */
  readonly ragged: number;
  /**
   * Chance a body of this kind is set on a river (centred on one of the cell's river hexes, when it has
   * any), so the river runs into it and out of it, not past. Needs `WaterGeneration.river`.
   */
  readonly onRiver?: number;
  /** Islands: from this radius up, with this chance, one to three land hexes in the deep part. */
  readonly island?: {
    readonly minRadius: number;
    readonly chance: number;
    readonly terrain: string;
  };
}

export interface WaterGeneration {
  /** The terrain id the rules lay rivers with: bodies with `onRiver` are set on its hexes. */
  readonly river?: string;
  /** Hexes around where the creature starts that stay dry. */
  readonly startClear: number;
  /** Largest line of deep hexes the kinds allow: for tests and the tips, not read by generation. */
  readonly maxCrossing: number;
  /** Big bodies first: they win where two meet, and ponds keep clear of them. */
  readonly kinds: readonly WaterKind[];
}

export interface TerrainGeneration {
  readonly fallback: string;
  readonly rules: readonly TerrainRule[];
  /** Ponds, lakes and seas, laid over the rules. Absent: none. */
  readonly waters?: WaterGeneration;
}

const water: FieldRef = { name: 'water', scale: 16, octaves: 1 };
const rock: FieldRef = { name: 'rock', scale: 12, octaves: 2 };
const highland: FieldRef = { name: 'highland', scale: 24, octaves: 1 };
const bog: FieldRef = { name: 'bog', scale: 7, octaves: 1 };
const moisture: FieldRef = { name: 'moisture', scale: 10, octaves: 2 };

export const TERRAIN_GENERATION: TerrainGeneration = {
  fallback: 'plains',
  waters: {
    river: 'river',
    startClear: 8,
    // A crossing is a line of deep hexes: a radius under 2 allows 4 at most (about 3-4 creature steps).
    maxCrossing: 4,
    kinds: [
      {
        id: 'sea',
        deep: 'sea',
        shallows: 'shallows',
        cell: 22,
        chance: 0.5,
        radius: [1.5, 1.95],
        shore: 1,
        ragged: 0.4,
        onRiver: 1,
        island: { minRadius: 1.5, chance: 1, terrain: 'islet' },
      },
      {
        id: 'lake',
        deep: 'lake',
        shallows: 'shallows',
        cell: 12,
        chance: 0.4,
        radius: [1.0, 1.85],
        shore: 1,
        ragged: 0.5,
        onRiver: 1,
        island: { minRadius: 1.2, chance: 0.7, terrain: 'islet' },
      },
      {
        id: 'pond',
        deep: 'lake',
        cell: 6,
        chance: 0.2,
        radius: [0.3, 0.95],
        shore: 0,
        ragged: 0.2,
        onRiver: 1,
      },
    ],
  },
  rules: [
    { terrain: 'river', field: water, when: { contour: 0.5 } },
    {
      terrain: 'cliff',
      field: rock,
      when: { contour: 0.5 },
      mask: { field: highland, above: 0.57 },
    },
    // Swamp: the low ground beside a river (the water field's band just under the
    // river's contour), broken into patches by a second field so it never lines a whole bank.
    {
      terrain: 'swamp',
      field: water,
      when: { between: [0.47, 0.5] },
      mask: { field: bog, above: 0.45 },
    },
    { terrain: 'forest', field: moisture, when: { above: 0.725 } },
    { terrain: 'desert', field: moisture, when: { below: 0.26 } },
  ],
};
