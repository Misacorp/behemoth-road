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

export interface TerrainGeneration {
  readonly fallback: string;
  readonly rules: readonly TerrainRule[];
}

const water: FieldRef = { name: 'water', scale: 16, octaves: 1 };
const rock: FieldRef = { name: 'rock', scale: 12, octaves: 2 };
const highland: FieldRef = { name: 'highland', scale: 24, octaves: 1 };
const moisture: FieldRef = { name: 'moisture', scale: 10, octaves: 2 };

export const TERRAIN_GENERATION: TerrainGeneration = {
  fallback: 'plains',
  rules: [
    { terrain: 'river', field: water, when: { contour: 0.5 } },
    {
      terrain: 'cliff',
      field: rock,
      when: { contour: 0.5 },
      mask: { field: highland, above: 0.5 },
    },
    { terrain: 'forest', field: moisture, when: { above: 0.71 } },
    { terrain: 'desert', field: moisture, when: { below: 0.27 } },
  ],
};
