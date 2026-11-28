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

/**
 * A land vehicle an unlock makes: finishing it places a vehicle on the map instead of adding the
 * unlock to the team's list (`docs/design/world/vehicles.md`). Rules read these properties, never ids.
 */
export interface VehicleSpec {
  /** The terrain tags it can roll on (a hex needs at least one). Never water, cliff, swamp. */
  readonly terrainTags: readonly string[];
  /** Terrain tags it never rolls on, even where a tag above matches (an islet is open ground, but cut off). */
  readonly terrainNotTags?: readonly string[];
  /** Seats for riders (the puller is not seated). */
  readonly seats: number;
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
  /** Set for a vehicle: finishing it places one on the map (see `cart.ts`). */
  readonly vehicle?: VehicleSpec;
}

export const MATERIALS: readonly Material[] = [
  { id: 'iron', name: 'Iron', tags: ['metal'], icon: 'iron' },
  { id: 'stone', name: 'Stone', tags: ['stone'], icon: 'stone' },
  { id: 'timber', name: 'Timber', tags: ['wood'], icon: 'timber' },
  { id: 'ancient-alloy', name: 'Ancient alloy', tags: ['metal', 'rare', 'ancient'], icon: 'alloy' },
  // A tier-1 tomb's find: nothing uses it yet (the Warden's trade, later).
  { id: 'old-coin', name: 'Old coin', tags: ['rare', 'ancient', 'trade'], icon: 'coin' },
  { id: 'forage', name: 'Food', tags: ['food'], icon: 'forage', nourishes: 4 },
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
  // A rider throws the line to a character cut off near the creature; they grab it to be hauled aboard.
  {
    id: 'towline',
    name: 'Tow line',
    tags: ['towline'],
    icon: 'towline',
    cost: [
      { material: 'timber', amount: 2 },
      { material: 'stone', amount: 1 },
    ],
    work: 3,
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
    id: 'marsh-boards',
    name: 'Marsh boards',
    tags: ['glide', 'boards'],
    icon: 'boards',
    cost: [
      { material: 'timber', amount: 2 },
      { material: 'iron', amount: 1 },
    ],
    work: 4,
    movement: { terrainTags: ['boggy'], cost: 1 },
  },
  // A log raft: deep water (lake, sea) becomes a step at one action more than walking. Only a
  // crossing tool for now; seats and carrying are a later vehicle system.
  {
    id: 'raft',
    name: 'Raft',
    tags: ['float', 'boat'],
    icon: 'raft',
    cost: [{ material: 'timber', amount: 3 }],
    work: 4,
    movement: { terrainTags: ['deep'], cost: 2 },
  },
  // A hand cart, the first land vehicle (Misa's ask): it carries goods and one rider, hitched to a
  // puller who pays more per step. Built like the raft; finishing it places the cart on the map.
  {
    id: 'cart',
    name: 'Cart',
    tags: ['vehicle', 'wheeled'],
    icon: 'cart',
    cost: [{ material: 'timber', amount: 2 }],
    work: 3,
    vehicle: { terrainTags: ['open', 'wooded'], terrainNotTags: ['island'], seats: 1 },
  },
];
