/**
 * Map generation. A hex's terrain is a pure function of (seed, q, r), so the
 * map is generated lazily wherever it is looked at and never stored whole.
 * Smooth noise fields (`noise.ts`) make terrain form regions and ribbons;
 * the layout rules are data (`content/generation.ts`).
 */

import {
  type FieldCondition,
  type FieldRef,
  TERRAIN_GENERATION,
  TERRAIN_TYPES,
  type TerrainGeneration,
  type TerrainType,
} from './content/index.ts';
import { type Hex, neighbours } from './hex.ts';
import { noiseAt } from './noise.ts';
import { hashString } from './random.ts';

export interface MapContent {
  readonly terrains: readonly TerrainType[];
  readonly generation: TerrainGeneration;
}

export const DEFAULT_MAP_CONTENT: MapContent = {
  terrains: TERRAIN_TYPES,
  generation: TERRAIN_GENERATION,
};

const sample = (seed: number, field: FieldRef, h: Hex): number =>
  noiseAt(seed, hashString(field.name), field, h);

const meets = (seed: number, field: FieldRef, when: FieldCondition, h: Hex): boolean => {
  const value = sample(seed, field, h);
  if ('above' in when) return value > when.above;
  if ('below' in when) return value < when.below;
  return value >= when.contour && neighbours(h).some((n) => sample(seed, field, n) < when.contour);
};

/** The id of the terrain the generation rules place at a hex. */
export const terrainIdAt = (
  seed: number,
  h: Hex,
  generation: TerrainGeneration = TERRAIN_GENERATION,
): string => {
  for (const rule of generation.rules) {
    if (!meets(seed, rule.field, rule.when, h)) continue;
    if (rule.mask && !(sample(seed, rule.mask.field, h) > rule.mask.above)) continue;
    return rule.terrain;
  }
  return generation.fallback;
};

export const terrainAt = (
  seed: number,
  h: Hex,
  content: MapContent = DEFAULT_MAP_CONTENT,
): TerrainType => {
  const id = terrainIdAt(seed, h, content.generation);
  const terrain = content.terrains.find((t) => t.id === id);
  if (!terrain) throw new Error(`Generation names unknown terrain: ${id}`);
  return terrain;
};
