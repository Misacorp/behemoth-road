/**
 * What a hex can hold, as data: resource nodes, sites and traps. Each hex holds
 * at most one feature, hidden until someone enters it. Rules read `kind`, tags and
 * properties, never ids. `icon` names what the art kit draws.
 */

export interface FeaturePlacement {
  /** The hex's terrain has one of these tags. */
  readonly on: readonly string[];
  /** Or a neighbouring hex's terrain has one of these tags (cliff edges, river banks). */
  readonly near?: readonly string[];
  /** Relative chance among the features that fit a hex. */
  readonly weight: number;
}

interface FeatureBase {
  readonly id: string;
  readonly name: string;
  readonly tags: readonly string[];
  readonly icon: string;
  readonly placement: FeaturePlacement;
}

export interface NodeType extends FeatureBase {
  readonly kind: 'node';
  /** How many times it can be gathered. */
  readonly charges: number;
  /** What one gather yields (before the specialist's bonus). */
  readonly yields: { readonly material: string; readonly amount: number };
}

export interface SiteType extends FeatureBase {
  readonly kind: 'site';
  readonly tier: 1 | 2;
  /** Item tags the team must hold to work it (a tier-2 tomb needs `light`). */
  readonly needs: readonly string[];
  /** What a successful working finds. */
  readonly finds: { readonly material: string; readonly amount: number };
}

export interface TrapType extends FeatureBase {
  readonly kind: 'trap';
}

export type FeatureType = NodeType | SiteType | TrapType;

export const FEATURE_TYPES: readonly FeatureType[] = [
  {
    id: 'iron-deposit',
    kind: 'node',
    name: 'Iron deposit',
    tags: ['ore', 'mine'],
    icon: 'ore',
    placement: { on: ['dry'], near: ['steep'], weight: 20 },
    charges: 3,
    yields: { material: 'iron', amount: 1 },
  },
  {
    id: 'river-stones',
    kind: 'node',
    name: 'Sturdy river stones',
    tags: ['stone', 'quarry'],
    icon: 'stones',
    placement: { on: ['water'], weight: 20 },
    charges: 3,
    yields: { material: 'stone', amount: 1 },
  },
  {
    id: 'timber-stand',
    kind: 'node',
    name: 'Timber stand',
    tags: ['wood', 'fell'],
    icon: 'logs',
    placement: { on: ['wooded'], weight: 20 },
    charges: 3,
    yields: { material: 'timber', amount: 1 },
  },
  {
    id: 'tomb',
    kind: 'site',
    name: 'Tomb',
    tags: ['tomb', 'ancient'],
    icon: 'tomb',
    placement: { on: ['open', 'dry'], weight: 6 },
    tier: 1,
    needs: [],
    finds: { material: 'ancient-alloy', amount: 1 },
  },
  {
    id: 'deep-tomb',
    kind: 'site',
    name: 'Deep tomb',
    tags: ['tomb', 'ancient', 'dark'],
    icon: 'deep-tomb',
    placement: { on: ['open', 'dry'], weight: 5 },
    tier: 2,
    needs: ['light'],
    finds: { material: 'ancient-alloy', amount: 2 },
  },
  {
    id: 'snare',
    kind: 'trap',
    name: 'Snare',
    tags: ['trap', 'hidden'],
    icon: 'snare',
    placement: { on: ['wooded', 'open'], weight: 6 },
  },
  {
    id: 'pitfall',
    kind: 'trap',
    name: 'Pitfall',
    tags: ['trap', 'hidden'],
    icon: 'pitfall',
    placement: { on: ['open', 'dry'], weight: 5 },
  },
];
