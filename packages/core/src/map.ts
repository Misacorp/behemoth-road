/**
 * Map generation. A hex's terrain is a pure function of (seed, q, r), so the
 * map is generated lazily wherever it is looked at and never stored whole.
 */

import { TERRAIN_TYPES, type TerrainType } from './content/index.ts';
import type { Hex } from './hex.ts';
import { hashString, hashToUnit, pickWeighted } from './random.ts';

const TERRAIN_STREAM = hashString('terrain');

export const terrainAt = (
  seed: number,
  h: Hex,
  terrains: readonly TerrainType[] = TERRAIN_TYPES,
): TerrainType =>
  pickWeighted(terrains, (t) => t.weight, hashToUnit(seed, TERRAIN_STREAM, h.q, h.r));
