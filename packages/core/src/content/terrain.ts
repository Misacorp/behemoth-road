/**
 * Terrain types as data. Rules read properties and tags, never ids.
 * Where each terrain appears is in `generation.ts`.
 */

export interface TerrainType {
  readonly id: string;
  readonly tags: readonly string[];
  /** Whether a character can enter the hex without help. */
  readonly passable: boolean;
  /** Actions added to the base move cost for entering the hex. */
  readonly extraMoveCost: number;
  /** Height for a later isometric view; 0 everywhere for now. */
  readonly elevation: number;
  /**
   * Peril the creature takes each time a step ends its centre on this terrain (a hazard: poisoned water,
   * sharp glass). Absent: none. Defence does not reduce it.
   */
  readonly perilOnStep?: number;
}

export const TERRAIN_TYPES: readonly TerrainType[] = [
  { id: 'plains', tags: ['open'], passable: true, extraMoveCost: 0, elevation: 0 },
  { id: 'forest', tags: ['wooded'], passable: true, extraMoveCost: 0, elevation: 0 },
  {
    id: 'desert',
    tags: ['dry', 'open'],
    passable: true,
    extraMoveCost: 0,
    elevation: 0,
  },
  {
    id: 'swamp',
    tags: ['wet', 'boggy'],
    passable: true,
    // Mud and reeds slow a walker (2 actions a step); marsh boards undo it.
    extraMoveCost: 1,
    elevation: 0,
  },
  { id: 'river', tags: ['water'], passable: true, extraMoveCost: 0, elevation: 0 },
  // Standing water. Deep water cannot be walked: the creature swims it, riders cross with it, and
  // the raft lets everyone else over (`UNLOCKS`). Shallows can be waded.
  {
    id: 'shallows',
    tags: ['water', 'shallow'],
    passable: true,
    extraMoveCost: 0,
    elevation: 0,
  },
  { id: 'lake', tags: ['water', 'deep', 'fresh'], passable: false, extraMoveCost: 0, elevation: 0 },
  {
    id: 'sea',
    tags: ['water', 'deep', 'salt'],
    passable: false,
    extraMoveCost: 0,
    elevation: 0,
  },
  // A little land inside a lake or the sea: reached by raft, or from the creature as it swims past.
  { id: 'islet', tags: ['open', 'island'], passable: true, extraMoveCost: 0, elevation: 0 },
  { id: 'cliff', tags: ['steep'], passable: false, extraMoveCost: 0, elevation: 0 },
  // Hazards (`hazards.ts` lays them across the route): the creature stepping onto them takes peril, so
  // steering round them pays. The poisoned lake is deep water nobody gathers from; the glass waste is
  // dry, sharp ground that costs a walker an action more.
  {
    id: 'poisoned-lake',
    tags: ['water', 'deep', 'fresh', 'poisoned'],
    passable: false,
    extraMoveCost: 0,
    elevation: 0,
    perilOnStep: 2,
  },
  {
    id: 'glass-waste',
    tags: ['dry', 'sharp'],
    passable: true,
    extraMoveCost: 1,
    elevation: 0,
    perilOnStep: 2,
  },
];
