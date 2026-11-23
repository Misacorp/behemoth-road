/**
 * Peoples, as data: who lives along the road. A settlement of a people can be
 * befriended (for a boon) or angered (it sends a threat). Rules read tags and
 * properties, never ids. `icon` names what the art kit draws.
 */

/** What a friendly settlement can do for the team, once. */
export type Boon = 'gift' | 'mislead' | 'shelter';

export const BOONS: readonly Boon[] = ['gift', 'mislead', 'shelter'];

export interface PeopleType {
  readonly id: string;
  readonly name: string;
  readonly tags: readonly string[];
  readonly icon: string;
  /** Favour at which a wary settlement turns friendly. */
  readonly favourNeeded: number;
  /** The boons its settlements offer (one per settlement). */
  readonly boons: readonly Boon[];
  /** What the `gift` boon puts into the team stores. */
  readonly gift: readonly { readonly material: string; readonly amount: number }[];
  /** The threat type (`THREAT_TYPES`) an angered settlement sends from its hex. */
  readonly angryThreat: string;
  /**
   * Where its settlements stand: on a hex whose terrain, or a neighbour's, has
   * one of these tags (river folk by the water). Absent: anywhere fit.
   */
  readonly near?: readonly string[];
}

export const PEOPLE_TYPES: readonly PeopleType[] = [
  {
    id: 'hill-folk',
    name: 'Hill folk',
    tags: ['people', 'herders'],
    icon: 'hill-folk',
    favourNeeded: 3,
    boons: ['gift', 'mislead', 'shelter'],
    gift: [
      { material: 'forage', amount: 2 },
      { material: 'timber', amount: 1 },
    ],
    angryThreat: 'raiders',
  },
  {
    id: 'river-folk',
    name: 'River folk',
    tags: ['people', 'fishers'],
    icon: 'river-folk',
    // Quicker to trust, but they keep no refuge: no shelter among their boons.
    favourNeeded: 2,
    boons: ['gift', 'mislead'],
    gift: [
      { material: 'forage', amount: 1 },
      { material: 'stone', amount: 2 },
    ],
    angryThreat: 'raiders',
    near: ['water', 'boggy'],
  },
];
