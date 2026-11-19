/**
 * Materials, items and recipes, as tagged data. The team shares one inventory.
 * Rules read tags and properties (`movement`, `unique`), never ids.
 */

export interface Material {
  readonly id: string;
  readonly name: string;
  readonly tags: readonly string[];
  readonly icon: string;
}

export interface ItemMovement {
  /** Lets every character enter hexes whose terrain has one of these tags… */
  readonly terrainTags: readonly string[];
  /** …at this action cost. The cheapest item the team holds wins. */
  readonly cost: number;
}

export interface Item {
  readonly id: string;
  readonly name: string;
  readonly tags: readonly string[];
  readonly icon: string;
  /** The team needs only one; crafting another is refused. */
  readonly unique: boolean;
  readonly movement?: ItemMovement;
}

export interface Recipe {
  readonly id: string;
  /** The item it makes. */
  readonly makes: string;
  /** Tier 1: anyone can craft (non-specialists pay extra). Tier 2: specialists only. */
  readonly tier: 1 | 2;
  /** Materials used, in order; a non-specialist pays extra of the first one. */
  readonly needs: readonly { readonly material: string; readonly amount: number }[];
  readonly icon: string;
}

export const MATERIALS: readonly Material[] = [
  { id: 'iron', name: 'Iron', tags: ['metal'], icon: 'iron' },
  { id: 'stone', name: 'Stone', tags: ['stone'], icon: 'stone' },
  { id: 'timber', name: 'Timber', tags: ['wood'], icon: 'timber' },
  { id: 'ancient-alloy', name: 'Ancient alloy', tags: ['metal', 'rare', 'ancient'], icon: 'alloy' },
];

export const ITEMS: readonly Item[] = [
  {
    id: 'grappling-hook',
    name: 'Grappling hook',
    tags: ['climb', 'rope'],
    icon: 'hook',
    unique: true,
    movement: { terrainTags: ['steep'], cost: 2 },
  },
  {
    id: 'climbing-spikes',
    name: 'Climbing spikes',
    tags: ['climb'],
    icon: 'spikes',
    unique: true,
    movement: { terrainTags: ['steep'], cost: 1 },
  },
  { id: 'lantern', name: 'Lantern', tags: ['light'], icon: 'lantern', unique: true },
];

export const RECIPES: readonly Recipe[] = [
  {
    id: 'grappling-hook',
    makes: 'grappling-hook',
    tier: 1,
    needs: [
      { material: 'iron', amount: 2 },
      { material: 'timber', amount: 1 },
    ],
    icon: 'hook',
  },
  {
    id: 'lantern',
    makes: 'lantern',
    tier: 1,
    needs: [
      { material: 'stone', amount: 1 },
      { material: 'timber', amount: 1 },
    ],
    icon: 'lantern',
  },
  {
    id: 'climbing-spikes',
    makes: 'climbing-spikes',
    tier: 2,
    needs: [
      { material: 'ancient-alloy', amount: 1 },
      { material: 'iron', amount: 1 },
    ],
    icon: 'spikes',
  },
];
