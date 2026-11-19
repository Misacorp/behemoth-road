/**
 * How each terrain looks, as data. Rules read these entries; drawing code never names a terrain. Unknown
 * terrain ids get the neutral look.
 */
import type { Material } from './palette.ts';

export type GroundMark = 'flecks' | 'ripples' | 'waves' | 'scree' | 'none';

export interface PropRule {
  /** A prop kind (`props.ts`). */
  readonly kind: string;
  /** How many, both included. */
  readonly count: readonly [number, number];
  /** Chance the rule applies at all (default 1). */
  readonly chance?: number;
}

export interface TerrainLook {
  readonly ground: Material;
  readonly side: Material;
  readonly marks: GroundMark;
  readonly props: readonly PropRule[];
  /** Draws a river ribbon joined to neighbouring river tiles. */
  readonly river?: boolean;
}

export const TERRAIN_LOOKS: Readonly<Record<string, TerrainLook>> = {
  meadow: {
    ground: 'grass',
    side: 'earth',
    marks: 'flecks',
    props: [
      { kind: 'tuft', count: [1, 3] },
      { kind: 'broadleaf', count: [1, 1], chance: 0.15 },
    ],
  },
  forest: {
    ground: 'moss',
    side: 'earth',
    marks: 'none',
    props: [
      { kind: 'broadleaf', count: [2, 3] },
      { kind: 'conifer', count: [0, 2] },
    ],
  },
  pines: {
    ground: 'moss',
    side: 'earth',
    marks: 'none',
    props: [{ kind: 'conifer', count: [3, 5] }],
  },
  hills: {
    ground: 'heath',
    side: 'earth',
    marks: 'flecks',
    props: [
      { kind: 'hill', count: [1, 2] },
      { kind: 'tuft', count: [0, 1] },
    ],
  },
  desert: {
    ground: 'sand',
    side: 'earth',
    marks: 'ripples',
    props: [{ kind: 'dune', count: [1, 2] }],
  },
  rocks: {
    ground: 'heath',
    side: 'rock',
    marks: 'scree',
    props: [
      { kind: 'rock', count: [2, 3] },
      { kind: 'tuft', count: [0, 1] },
    ],
  },
  cliff: {
    ground: 'rock',
    side: 'rock',
    marks: 'scree',
    props: [{ kind: 'cliff', count: [1, 1] }],
  },
  river: {
    ground: 'grass',
    side: 'earth',
    marks: 'none',
    props: [],
    river: true,
  },
  lake: {
    ground: 'water',
    side: 'earth',
    marks: 'waves',
    props: [],
  },
};

export const FALLBACK_LOOK: TerrainLook = {
  ground: 'neutral',
  side: 'earth',
  marks: 'none',
  props: [],
};

export function terrainLook(id: string): TerrainLook {
  return Object.hasOwn(TERRAIN_LOOKS, id) ? TERRAIN_LOOKS[id]! : FALLBACK_LOOK;
}

/** Sites drawn on top of a tile in place of its props. */
export const SITE_PROPS: Readonly<Record<string, readonly PropRule[]>> = {
  ruin: [
    { kind: 'ruin', count: [1, 1] },
    { kind: 'tuft', count: [1, 2] },
  ],
};
