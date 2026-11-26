/**
 * Hazards: patches laid across the creature's route ahead as it walks (`../hazards.ts`). A patch is
 * either terrain that harms a creature stepping onto it (its `perilOnStep`) or a cluster of threats laid
 * together. Rules read tags and properties, never ids.
 */

export interface HazardType {
  readonly id: string;
  readonly name: string;
  /** `scree` and `falls`: a cluster of threats; `poisoned` and `sharp`: terrain. */
  readonly tags: readonly string[];
  readonly icon: string;
  /** How often the seeded pick takes it. */
  readonly weight: number;
  /** The patch is a ragged disc round its centre, this many hexes in radius (min and max, whole numbers). */
  readonly radius: readonly [number, number];
  /** Chance each hex on the disc's edge is left out (terrain patches). */
  readonly ragged: number;
  /** Terrain it lays (from `TERRAIN_TYPES`), for a terrain patch. */
  readonly terrain?: string;
  /** Threat it lays (from `THREAT_TYPES`) and how many (min and max, inclusive), for a cluster. */
  readonly cluster?: { readonly threat: string; readonly count: readonly [number, number] };
}

export const HAZARD_TYPES: readonly HazardType[] = [
  {
    id: 'scree-field',
    name: 'Scree field',
    tags: ['scree', 'falls'],
    icon: 'scree',
    weight: 1,
    radius: [1, 1],
    ragged: 0,
    cluster: { threat: 'rockslide', count: [3, 5] },
  },
  {
    id: 'poisoned-lake',
    name: 'Poisoned lake',
    tags: ['water', 'poisoned'],
    icon: 'poisoned-lake',
    weight: 1,
    radius: [1, 1],
    ragged: 0.2,
    terrain: 'poisoned-lake',
  },
  {
    id: 'glass-waste',
    name: 'Glass waste',
    tags: ['dry', 'sharp'],
    icon: 'glass-waste',
    weight: 1,
    radius: [1, 1],
    ragged: 0.3,
    terrain: 'glass-waste',
  },
];
