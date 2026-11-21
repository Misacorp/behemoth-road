/**
 * Materials and unlocks, as tagged data. Materials travel in packs and team
 * stores. Unlocks are permanent abilities or equipment for the whole team,
 * built by engineers: a material cost taken from the stores when work starts,
 * then `work` actions. Rules read tags and properties (`movement`), never ids.
 */

export interface Material {
  readonly id: string;
  readonly name: string;
  readonly tags: readonly string[];
  readonly icon: string;
  /** Satiety one unit adds when the creature eats it (materials tagged `food`). */
  readonly nourishes?: number;
}

export interface UnlockMovement {
  /** Lets every character enter hexes whose terrain has one of these tags… */
  readonly terrainTags: readonly string[];
  /** …at this action cost. The cheapest unlock the team has wins. */
  readonly cost: number;
}

export interface Unlock {
  readonly id: string;
  readonly name: string;
  readonly tags: readonly string[];
  readonly icon: string;
  /** Materials taken from the team stores when work starts. */
  readonly cost: readonly { readonly material: string; readonly amount: number }[];
  /** Work to finish it: one engineer action is one work. */
  readonly work: number;
  readonly movement?: UnlockMovement;
}

export const MATERIALS: readonly Material[] = [
  { id: 'iron', name: 'Iron', tags: ['metal'], icon: 'iron' },
  { id: 'stone', name: 'Stone', tags: ['stone'], icon: 'stone' },
  { id: 'timber', name: 'Timber', tags: ['wood'], icon: 'timber' },
  { id: 'ancient-alloy', name: 'Ancient alloy', tags: ['metal', 'rare', 'ancient'], icon: 'alloy' },
  // A tier-1 tomb's find: nothing uses it yet (the Envoy's trade, later).
  { id: 'old-coin', name: 'Old coin', tags: ['rare', 'ancient', 'trade'], icon: 'coin' },
  { id: 'forage', name: 'Forage', tags: ['food'], icon: 'forage', nourishes: 4 },
  // A shrine's find: an offering for any people's settlement.
  { id: 'river-pearl', name: 'River pearl', tags: ['rare', 'trade'], icon: 'pearl' },
];

export const UNLOCKS: readonly Unlock[] = [
  {
    id: 'grappling-hook',
    name: 'Grappling hook',
    tags: ['climb', 'rope'],
    icon: 'hook',
    cost: [
      { material: 'iron', amount: 2 },
      { material: 'timber', amount: 1 },
    ],
    work: 4,
    movement: { terrainTags: ['steep'], cost: 2 },
  },
  {
    id: 'lantern',
    name: 'Lantern',
    tags: ['light'],
    icon: 'lantern',
    cost: [
      { material: 'stone', amount: 1 },
      { material: 'timber', amount: 1 },
    ],
    work: 3,
  },
  {
    id: 'climbing-spikes',
    name: 'Climbing spikes',
    tags: ['climb'],
    icon: 'spikes',
    cost: [
      { material: 'ancient-alloy', amount: 1 },
      { material: 'iron', amount: 1 },
    ],
    work: 4,
    movement: { terrainTags: ['steep'], cost: 1 },
  },
  {
    id: 'sand-sledge',
    name: 'Sand sledge',
    tags: ['glide', 'sledge'],
    icon: 'sledge',
    cost: [
      { material: 'timber', amount: 2 },
      { material: 'iron', amount: 1 },
    ],
    work: 4,
    movement: { terrainTags: ['dry'], cost: 1 },
  },
];
