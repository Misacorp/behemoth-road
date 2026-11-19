/**
 * Terrain types as data. Rules read properties and tags, never ids.
 * Weights are relative chances in map generation: most hexes are plain.
 */

export interface TerrainType {
  readonly id: string;
  readonly tags: readonly string[];
  /** Relative chance of a hex having this terrain. */
  readonly weight: number;
  /** Whether a character can enter the hex without help. */
  readonly passable: boolean;
  /** Actions added to the base move cost for entering the hex. */
  readonly extraMoveCost: number;
  /** Height for a later isometric view; 0 everywhere for now. */
  readonly elevation: number;
}

export const TERRAIN_TYPES: readonly TerrainType[] = [
  { id: 'plains', tags: ['open'], weight: 70, passable: true, extraMoveCost: 0, elevation: 0 },
  { id: 'forest', tags: ['wooded'], weight: 12, passable: true, extraMoveCost: 0, elevation: 0 },
  {
    id: 'desert',
    tags: ['dry', 'open'],
    weight: 8,
    passable: true,
    extraMoveCost: 0,
    elevation: 0,
  },
  { id: 'river', tags: ['water'], weight: 5, passable: true, extraMoveCost: 0, elevation: 0 },
  { id: 'cliff', tags: ['steep'], weight: 5, passable: false, extraMoveCost: 0, elevation: 0 },
];
