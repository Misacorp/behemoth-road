/**
 * Threats, as data: what attacks the creature on the road. Rules read tags and
 * properties (`strength`, `speed`, `approach`, `weight`), never ids. `icon`
 * names what the art kit draws.
 */

/**
 * Where a threat appears: `behind` (the window's edge opposite the heading),
 * `flank` (the window's edge, ahead-left or ahead-right), `path` (on the
 * straight-ahead line, `threatPathDistance` from the centre), or `sent` (only
 * sent by something on the map, from its hex: an angered settlement).
 */
export type ThreatApproach = 'behind' | 'flank' | 'path' | 'sent';

export interface ThreatType {
  readonly id: string;
  readonly name: string;
  /** `ground`: never appears on water. `pursuer`: led away by a mislead. */
  readonly tags: readonly string[];
  readonly icon: string;
  /** Base strength, before scaling by players and days. */
  readonly strength: number;
  /** Hexes it moves toward the creature at each tick (0: it waits where it is). */
  readonly speed: number;
  readonly approach: ThreatApproach;
  /**
   * Where it may appear: only on a hex whose terrain has one of these tags (an
   * ambush in the forest). Absent: anywhere but water.
   */
  readonly on?: readonly string[];
  /** How often the daily roll picks it; 0 means never rolled. */
  readonly weight: number;
}

export const THREAT_TYPES: readonly ThreatType[] = [
  {
    id: 'captors',
    name: 'Captor band',
    tags: ['ground', 'pursuer', 'people'],
    icon: 'captors',
    strength: 3,
    speed: 2,
    approach: 'behind',
    weight: 1,
  },
  {
    id: 'swarm',
    name: 'Pterodactyl swarm',
    tags: ['flying', 'beast'],
    icon: 'swarm',
    strength: 2,
    speed: 2,
    approach: 'flank',
    weight: 1,
  },
  {
    id: 'rockslide',
    name: 'Rockslide',
    tags: ['terrain', 'stone'],
    icon: 'rockslide',
    strength: 3,
    speed: 0,
    approach: 'path',
    weight: 1,
  },
  // Added with content version 9: the same behaviour as the first three, other data.
  {
    id: 'ambush',
    name: 'Ambush',
    tags: ['ground', 'people', 'hidden'],
    icon: 'ambush',
    strength: 2,
    speed: 1,
    approach: 'flank',
    on: ['wooded'],
    weight: 0.5,
  },
  {
    id: 'stampede',
    name: 'Stampede',
    tags: ['ground', 'beast', 'herd'],
    icon: 'stampede',
    strength: 1,
    speed: 2,
    approach: 'behind',
    on: ['open'],
    weight: 0.5,
  },
  {
    id: 'raiders',
    name: 'Raiders',
    tags: ['ground', 'people'],
    icon: 'raiders',
    strength: 2,
    speed: 1,
    approach: 'sent',
    weight: 0,
  },
];
