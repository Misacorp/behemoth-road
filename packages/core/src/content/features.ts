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
  /**
   * How often it appears where it fits, against `FEATURE_WEIGHT_SCALE`: 20 means a
   * hex holds it with `featureChance`, 40 twice that, 5 a quarter. Each feature
   * that fits a hex takes its own slice, so they add up.
   */
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
  /** Unlock tags the team must have to work it (a tier-2 tomb needs `light`). */
  readonly needs: readonly string[];
  /** What a successful working finds. */
  readonly finds: { readonly material: string; readonly amount: number };
}

export interface TrapType extends FeatureBase {
  readonly kind: 'trap';
}

/**
 * A place that takes fire (an old brazier or beacon cairn), tagged `fire-site`. It is placed by map
 * generation along the creature's route (`brazierPlan`), never rolled by weight, and shown as soon as
 * its hex is seen.
 */
export interface HearthType extends FeatureBase {
  readonly kind: 'hearth';
}

export type FeatureType = NodeType | SiteType | TrapType | HearthType;

/** A feature with this weight appears with `featureChance` where it fits. */
export const FEATURE_WEIGHT_SCALE = 20;

export const FEATURE_TYPES: readonly FeatureType[] = [
  {
    id: 'iron-deposit',
    kind: 'node',
    name: 'Iron deposit',
    tags: ['ore', 'mine'],
    icon: 'ore',
    placement: { on: ['dry'], near: ['steep'], weight: 15 },
    charges: 3,
    yields: { material: 'iron', amount: 1 },
  },
  {
    id: 'river-stones',
    kind: 'node',
    name: 'Sturdy river stones',
    tags: ['stone', 'quarry'],
    icon: 'stones',
    placement: { on: ['water'], near: ['water'], weight: 10 },
    charges: 3,
    yields: { material: 'stone', amount: 1 },
  },
  {
    id: 'timber-stand',
    kind: 'node',
    name: 'Timber stand',
    tags: ['wood', 'fell'],
    icon: 'logs',
    placement: { on: ['wooded'], near: ['wooded'], weight: 25 },
    charges: 3,
    yields: { material: 'timber', amount: 1 },
  },
  {
    id: 'tomb',
    kind: 'site',
    name: 'Tomb',
    tags: ['tomb', 'ancient'],
    icon: 'tomb',
    placement: { on: ['open', 'dry'], weight: 1 },
    tier: 1,
    needs: [],
    finds: { material: 'old-coin', amount: 1 },
  },
  {
    id: 'deep-tomb',
    kind: 'site',
    name: 'Deep tomb',
    tags: ['tomb', 'ancient', 'dark'],
    icon: 'deep-tomb',
    placement: { on: ['open', 'dry'], weight: 9 },
    tier: 2,
    needs: ['light'],
    finds: { material: 'ancient-alloy', amount: 1 },
  },
  {
    id: 'snare',
    kind: 'trap',
    name: 'Snare',
    tags: ['trap', 'hidden', 'burnable'],
    icon: 'snare',
    placement: { on: ['wooded', 'open'], weight: 1 },
  },
  {
    id: 'pitfall',
    kind: 'trap',
    name: 'Pitfall',
    tags: ['trap', 'hidden'],
    icon: 'pitfall',
    placement: { on: ['open', 'dry'], weight: 1 },
  },
  // Last, so adding it left every earlier feature where it was. Weight 10: about
  // 3 bushes in a new game's window and one more every two or three days of walking.
  {
    id: 'berry-bushes',
    kind: 'node',
    name: 'Berry bushes',
    tags: ['food', 'forage'],
    icon: 'berries',
    placement: { on: ['wooded', 'open'], weight: 10 },
    charges: 3,
    yields: { material: 'forage', amount: 1 },
  },
  // Also last, for the same reason: stone, iron and timber where the land has no
  // river, cliff or forest (most of it is open plain), so a party meets what the
  // first unlocks need within about a week (measured by `scripts/findability.ts`).
  // Smaller than the river, cliff and forest kinds; iron deposits (30 → 15) and
  // timber stands (40 → 25) were lightened with them, so about as many hexes hold
  // something as before (content version 7).
  {
    id: 'fieldstones',
    kind: 'node',
    name: 'Fieldstones',
    tags: ['stone', 'quarry'],
    icon: 'fieldstones',
    placement: { on: ['open'], weight: 4 },
    charges: 3,
    yields: { material: 'stone', amount: 1 },
  },
  {
    id: 'ore-outcrop',
    kind: 'node',
    name: 'Ore outcrop',
    tags: ['ore', 'mine'],
    icon: 'outcrop',
    placement: { on: ['open'], weight: 7 },
    charges: 3,
    yields: { material: 'iron', amount: 1 },
  },
  {
    id: 'deadfall',
    kind: 'node',
    name: 'Deadfall',
    tags: ['wood', 'fell', 'burnable'],
    icon: 'deadfall',
    placement: { on: ['open'], weight: 2 },
    charges: 3,
    yields: { material: 'timber', amount: 1 },
  },
  // Content version 10 retuned weights and charges so the scripted chain reaches the
  // spikes sooner (`scripts/pacing.ts`): deep tomb 4 -> 9, tomb 2 -> 1, river stones
  // 20 -> 10, ore outcrop 5 -> 7, deadfall 3 -> 2, snare and pitfall 2 -> 1, 3 charges on
  // fieldstones, ore outcrops and deadfall; the sum stays under the sparse-map test.
  // Content version 9, last again so nothing earlier moved: a shrine on the water
  // (weight 8, about 3% of river hexes) and an undertow (about 1%).
  {
    id: 'sunken-shrine',
    kind: 'site',
    name: 'Sunken shrine',
    tags: ['shrine', 'ancient'],
    icon: 'shrine',
    placement: { on: ['water', 'boggy'], weight: 8 },
    tier: 1,
    needs: [],
    finds: { material: 'river-pearl', amount: 1 },
  },
  {
    id: 'undertow',
    kind: 'trap',
    name: 'Undertow',
    tags: ['trap', 'hidden'],
    icon: 'undertow',
    placement: { on: ['water', 'boggy'], weight: 3 },
  },
  // Content version 20, last again: the water temple on a lake or sea island (a scholar's site,
  // tagged like the sunken shrine so every rule for shrines applies). Islands are rare and
  // small, so the weight is high: about 4 in 10 island hexes.
  {
    id: 'water-temple',
    kind: 'site',
    name: 'Water temple',
    tags: ['shrine', 'ancient', 'temple'],
    icon: 'temple',
    placement: { on: ['island'], weight: 100 },
    tier: 1,
    needs: [],
    finds: { material: 'river-pearl', amount: 1 },
  },
  // Content version 23, last again: the brazier. Weight 0 and no terrain: it is never rolled by chance;
  // `brazierPlan` puts it along the creature's likely route.
  {
    id: 'brazier',
    kind: 'hearth',
    name: 'Old brazier',
    tags: ['fire-site'],
    icon: 'brazier',
    placement: { on: [], weight: 0 },
  },
];
