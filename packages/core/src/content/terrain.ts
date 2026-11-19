/**
 * Terrain types as data. Rules read properties and tags, never ids.
 * Where each terrain appears is in `generation.ts`.
 */

export interface TerrainType {
  readonly id: string;
  readonly tags: readonly string[];
  /** Whether a character can enter the hex without help. */
  readonly passable: boolean;
  /** Actions added to the base move cost for entering the hex. */
  readonly extraMoveCost: number;
  /** Height for a later isometric view; 0 everywhere for now. */
  readonly elevation: number;
}

export const TERRAIN_TYPES: readonly TerrainType[] = [
  { id: 'plains', tags: ['open'], passable: true, extraMoveCost: 0, elevation: 0 },
  { id: 'forest', tags: ['wooded'], passable: true, extraMoveCost: 0, elevation: 0 },
  {
    id: 'desert',
    tags: ['dry', 'open'],

    passable: true,
    extraMoveCost: 0,
    elevation: 0,
  },
  { id: 'river', tags: ['water'], passable: true, extraMoveCost: 0, elevation: 0 },
  { id: 'cliff', tags: ['steep'], passable: false, extraMoveCost: 0, elevation: 0 },
];
