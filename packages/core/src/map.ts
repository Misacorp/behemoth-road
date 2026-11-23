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
import { type Hex, hexKey, neighbours } from './hex.ts';
import { noiseAt } from './noise.ts';
import { hashString, type Seed, toSeed } from './random.ts';
import { type GameStateView, hasSeed } from './state.ts';

export interface MapContent {
  readonly terrains: readonly TerrainType[];
  readonly generation: TerrainGeneration;
}

export const DEFAULT_MAP_CONTENT: MapContent = {
  terrains: TERRAIN_TYPES,
  generation: TERRAIN_GENERATION,
};

const sample = (seed: Seed, field: FieldRef, h: Hex): number =>
  noiseAt(seed, hashString(field.name), field, h);

const meets = (seed: Seed, field: FieldRef, when: FieldCondition, h: Hex): boolean => {
  const value = sample(seed, field, h);
  if ('above' in when) return value > when.above;
  if ('below' in when) return value < when.below;
  if ('between' in when) return value >= when.between[0] && value < when.between[1];
  return value >= when.contour && neighbours(h).some((n) => sample(seed, field, n) < when.contour);
};

/** The id of the terrain the generation rules place at a hex. */
export const terrainIdAt = (
  seed: Seed | number,
  h: Hex,
  generation: TerrainGeneration = TERRAIN_GENERATION,
): string => {
  const key = toSeed(seed);
  for (const rule of generation.rules) {
    if (!meets(key, rule.field, rule.when, h)) continue;
    if (rule.mask && !(sample(key, rule.mask.field, h) > rule.mask.above)) continue;
    return rule.terrain;
  }
  return generation.fallback;
};

/**
 * The terrain of a hex as the state knows it: from its known tiles first, then
 * generated from the seed when the state has one (the server). Null when the
 * hex is unknown to a player view.
 */
export const terrainOf = (state: GameStateView, h: Hex): TerrainType | null => {
  const known = state.tiles[hexKey(h)];
  if (known) return terrainById(known.terrain);
  return hasSeed(state) ? terrainAt(state.seed, h) : null;
};

/** A terrain type from its id. Throws for an id the content does not have. */
export const terrainById = (
  id: string,
  terrains: readonly TerrainType[] = TERRAIN_TYPES,
): TerrainType => {
  const terrain = terrains.find((t) => t.id === id);
  if (!terrain) throw new Error(`Unknown terrain: ${id}`);
  return terrain;
};

export const terrainAt = (
  seed: Seed | number,
  h: Hex,
  content: MapContent = DEFAULT_MAP_CONTENT,
): TerrainType => {
  return terrainById(terrainIdAt(seed, h, content.generation), content.terrains);
};
