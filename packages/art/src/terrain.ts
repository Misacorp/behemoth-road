/**
 * How each terrain looks, as data. Rules read these entries; drawing code never names a terrain. Unknown
 * terrain ids get the neutral look.
 */
import type { Material } from './palette.ts';

export type GroundMark =
  'flecks' | 'ripples' | 'waves' | 'swell' | 'shoals' | 'scree' | 'scuffs' | 'pools' | 'none';

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
  plains: {
    ground: 'plain',
    side: 'earth',
    marks: 'flecks',
    props: [
      { kind: 'tuft', count: [1, 3] },
      { kind: 'broadleaf', count: [1, 1], chance: 0.15 },
    ],
  },
  forest: {
    ground: 'wood',
    side: 'earth',
    marks: 'none',
    props: [
      { kind: 'broadleaf', count: [2, 3] },
      { kind: 'conifer', count: [0, 2] },
    ],
  },
  pines: {
    ground: 'wood',
    side: 'earth',
    marks: 'none',
    props: [{ kind: 'conifer', count: [3, 5] }],
  },
  hills: {
    ground: 'upland',
    side: 'earth',
    marks: 'flecks',
    props: [
      { kind: 'hill', count: [1, 2] },
      { kind: 'tuft', count: [0, 1] },
    ],
  },
  desert: {
    ground: 'dune',
    side: 'earth',
    marks: 'ripples',
    props: [{ kind: 'dune', count: [1, 2] }],
  },
  swamp: {
    ground: 'mire',
    side: 'earth',
    marks: 'pools',
    props: [
      { kind: 'reeds', count: [3, 4] },
      { kind: 'tuft', count: [0, 1] },
    ],
  },
  rocks: {
    ground: 'crag',
    side: 'rock',
    marks: 'scree',
    props: [
      { kind: 'rock', count: [2, 3] },
      { kind: 'tuft', count: [0, 1] },
    ],
  },
  cliff: {
    ground: 'crag',
    side: 'rock',
    marks: 'scree',
    props: [{ kind: 'cliff', count: [1, 1] }],
  },
  river: {
    ground: 'plain',
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
  // The sea: a deeper, greener blue with long swells (more and longer wave marks than a lake).
  sea: {
    ground: 'sea',
    side: 'earth',
    marks: 'swell',
    props: [],
  },
  // Shallows: light, clear water with short ripples and pale sand showing through.
  shallows: {
    ground: 'shoal',
    side: 'earth',
    marks: 'shoals',
    props: [],
  },
  // A small island: green ground with a tree or a rock, ringed by deep water.
  islet: {
    ground: 'plain',
    side: 'earth',
    marks: 'flecks',
    props: [
      { kind: 'broadleaf', count: [1, 1], chance: 0.6 },
      { kind: 'tuft', count: [1, 2] },
      { kind: 'rock', count: [1, 1], chance: 0.4 },
    ],
  },
  // Hazards laid across the route (`docs/design/hazards.md`). Placeholders on existing materials until the art lands.
  'poisoned-lake': {
    ground: 'mire',
    side: 'earth',
    marks: 'pools',
    props: [],
  },
  'glass-waste': {
    ground: 'dune',
    side: 'earth',
    marks: 'scree',
    props: [],
  },
};

export const FALLBACK_LOOK: TerrainLook = {
  ground: 'neutral',
  side: 'earth',
  marks: 'none',
  props: [],
};

/** Ground the creature is standing on: warm, trodden earth that replaces the terrain under its footprint. */
export const TRODDEN_LOOK: TerrainLook = {
  ground: 'trodden',
  side: 'earth',
  marks: 'scuffs',
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
