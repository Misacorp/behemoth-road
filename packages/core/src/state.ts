/**
 * Game state: plain, immutable, JSON-serialisable data. Rules never mutate it;
 * they return a new state.
 */

import type { TuningConfig } from './config.ts';
import type { Reaction } from './content/creatures.ts';
import type { Destination } from './destination.ts';
import type { Direction, Hex } from './hex.ts';
import { isSeed, type Seed } from './random.ts';
import type { SeasonStats } from './stats.ts';

/** hidden: never in view. seen: in play (in the window or its grace). lost: gone to the fog. */
export type Visibility = 'hidden' | 'seen' | 'lost';

/**
 * What is known of a hex that has been in view. `terrain` is its terrain id.
 * `explored`: someone has entered or surveyed it (its feature, if any, is revealed).
 */
export type TileKnowledge =
  | {
      readonly visibility: 'seen';
      readonly terrain: string;
      readonly explored: boolean;
      /** The day the hex left the window, or null while it is in the window. */
      readonly leftWindowOnDay: number | null;
    }
  | { readonly visibility: 'lost'; readonly terrain: string; readonly explored: boolean };

/** Material counts by content id (a pack, the team stores). */
export type Materials = Readonly<Record<string, number>>;

/** What a trace marks (`docs/design/story.md`). */
export type TraceKind = 'fire' | 'trail' | 'cairn' | 'chain' | 'gate';

/**
 * A mark the season left on the map, written when its event happened (the event log keeps only 100):
 * a fire scar, the trail the creature left, a cairn where it lingered, broken chain where captors were
 * cleared, a small open gate where a character was lost. Public.
 */
export interface Burnt {
  readonly hex: Hex;
  /** The feature type id that burnt (its `burntLook` says how the ground looks now). */
  readonly feature: string;
}

export interface Trace {
  readonly kind: TraceKind;
  readonly hex: Hex;
  /** The creature's steps when it was made. */
  readonly step: number;
  /** The character it is credited to (who lit the fire, cleared the captors, was lost), if any. */
  readonly by?: string;
}

/** A storylet waiting for its turn (the day's cap was reached). Public. */
export interface StoryQueued {
  readonly id: string;
  /** The hex of a `hex`-anchored storylet, from the moment its conditions held. */
  readonly hex: Hex | null;
  /** The conditions that held, for debugging (`kind` or `kind:parameter`, joined by `+`). */
  readonly when: string;
}

/** Storylets fired and waiting. Public. */
export interface StoryState {
  /** Ids of storylets that have fired (each at most once), in order. */
  readonly fired: readonly string[];
  /** Ids whose conditions held but whose turn has not come (the day's cap), in order. */
  readonly queue: readonly StoryQueued[];
  /** How many fired on which day, for the cap. */
  readonly today: { readonly day: number; readonly count: number };
}

export const emptyStory = (): StoryState => ({ fired: [], queue: [], today: { day: 0, count: 0 } });

export interface Creature {
  readonly centre: Hex;
  /** The creature's kind (content `CREATURE_TYPES`). Public: creatures are known to everyone; what it feels is not. */
  readonly kind: string;
  /** The general heading. Each step goes this way or one sixth of a turn to either side. */
  readonly heading: Direction;
  /** A keeper asked it to stay put: it does not step at the next tick. Public. */
  readonly lingering: boolean;
  /** The last day it lingered (it cannot linger the day after), or null. */
  readonly lingeredDay: number | null;
  /** Days in a row it has lingered, up to the last one (a linger-chain skill is capped by it). */
  readonly lingerStreak?: number;
  /** Steps walked this season (lingering adds none). Public: the route strip. */
  readonly steps: number;
  /** Wardens defending it until the next tick (character ids). Public. */
  readonly defenders: readonly string[];
  /** Tow lines thrown today, each from a rider to a character cut off outside; they lapse at the tick. Public. */
  readonly tows: readonly { readonly from: string; readonly to: string }[];
}

/** A threat on the map (content `THREAT_TYPES`). Public: seeing it come is the forecast. */
export interface Threat {
  readonly id: string;
  /** Content id. */
  readonly type: string;
  readonly hex: Hex;
  /** What it does to the creature (less any defence); strikes on it lower it. */
  readonly strength: number;
  readonly appearedDay: number;
  /** The id of the hazard patch (a scree field) that laid it, when one did. Such threats do not count toward `threatsMax`. */
  readonly patch?: string;
}

/** A small animal on the map that draws or drives off the creature like a fire (content `LURE_TYPES`). Public. */
export interface Lure {
  readonly id: string;
  /** Content id. */
  readonly type: string;
  readonly hex: Hex;
  /** Times it can still be led; at 0 it has settled: it stays put and still acts on the creature. */
  readonly leadsLeft: number;
}

/**
 * A hazard patch laid across the route ahead (content `HAZARD_TYPES`). Server only: its terrain shows as
 * the tiles come into view, its threats (a scree field's rockslides) appear once the patch is near.
 */
export interface HazardPatch {
  readonly id: string;
  /** Content id. */
  readonly type: string;
  readonly centre: Hex;
  /** The hexes whose terrain it replaces (terrain patches); none for a cluster. */
  readonly hexes: readonly Hex[];
  /** Where a cluster's threats stand (none for a terrain patch). */
  readonly threats: readonly Hex[];
  /** The cluster's threats are on the map now (they are laid once, when the patch comes within reach). */
  readonly spawned: boolean;
}

export type Attitude = 'wary' | 'friendly' | 'angry';

/** A settlement of a people (content `PEOPLE_TYPES`). Public: a village is not hidden. */
export interface Settlement {
  readonly id: string;
  /** Content id. */
  readonly type: string;
  readonly hex: Hex;
  readonly attitude: Attitude;
  readonly favour: number;
  /** The boon it gave, or null while none has been taken. */
  readonly boon: string | null;
}

export type SeasonOutcome = 'safe' | 'wounded' | 'lost';

/** Whether the season goes on, or how and on which day it ended. */
export type Season =
  | { readonly status: 'on' }
  | { readonly status: 'over'; readonly outcome: SeasonOutcome; readonly day: number };

/** A stimulus set out on the map (a lit fire). Public: everyone sees it. */
export interface Stimulus {
  /** Content id (`STIMULUS_TYPES`). */
  readonly type: string;
  readonly hex: Hex;
  /** The day it was set; it acts on that day's tick (and on later ones while it lasts). */
  readonly litDay: number;
  /** Reach in hexes when a beacon skill lit it; the tuning's `stimulusRange` when absent. */
  readonly range?: number;
  /** How many times the type's push it counts for when a beacon skill lit it; 1 when absent. */
  readonly push?: number;
  /**
   * Nights it burns (a brazier); the type's `lastsTicks` when absent. It acts on the tick that ends the
   * day it was lit and on `nights - 1` ticks after it.
   */
  readonly nights?: number;
  /** Hexes around it that it shows (counted as explored) while it burns (a brazier); none when absent. */
  readonly reveal?: number;
}

/** The creature's hidden nature, rolled from the seed when the game starts. Server only. */
export interface Nature {
  /** Content id (`CREATURE_TYPES`). */
  readonly type: string;
  /** Per stimulus tag, how this creature reacts. A tag not listed means indifferent. */
  readonly reactions: Readonly<Record<string, Reaction>>;
}

/** What the creature felt about one stimulus at a tick. */
export interface Cue {
  readonly hex: Hex;
  /** The stimulus's content id. */
  readonly stimulus: string;
  readonly reaction: Reaction;
}

/** The creature's hidden condition. Server only. */
export interface Care {
  /** Hunger: 0 (starving) to the creature type's `hunger.max`. */
  readonly satiety: number;
  /** Reactions felt at the last tick, shown to keepers on `day` (the day after). */
  readonly cues: { readonly day: number; readonly list: readonly Cue[] };
  /** The last day soothing herbs eased peril (once a day), if ever. */
  readonly soothedDay?: number;
}

export type CharacterStatus = 'active' | 'lost';

/**
 * Where a character is: on a hex, or riding the creature. The creature's
 * footprint is one place, not hexes to stand on.
 */
export type Place = { readonly kind: 'hex'; readonly hex: Hex } | { readonly kind: 'creature' };

/**
 * A character's skill progress. `xp` is one pool, earned by any contributing act (`ACTION_XP`),
 * scouts' exploring and the catch-up; a pick costs `xpPerPick`. `taken` lists node ids in the order
 * picked; the branch of each tree is implied by them (the first pick closes the other branch).
 */
export interface Skills {
  readonly xp: number;
  readonly taken: readonly string[];
}

export const emptySkills = (): Skills => ({ xp: 0, taken: [] });

export interface Character {
  readonly id: string;
  /** The player who runs this character (a Discord user id from Milestone 2). */
  readonly userId: string;
  readonly name: string;
  /** Content ids (`content/`); null for the plain character. */
  readonly trait: string | null;
  readonly quirk: string | null;
  readonly role: string;
  /** Public: picks the figure's look. Rolled with the character, never from the map. */
  readonly lookSeed: number;
  /** The day the character joined. */
  readonly joinedDay: number;
  readonly at: Place;
  readonly actionsLeft: number;
  /** What the character carries (gathered and found), up to `packCapacity` units. */
  readonly pack: Materials;
  readonly status: CharacterStatus;
  /** The day a threat struck them (they start it with fewer actions), or null. Public. */
  readonly struckDay: number | null;
  /**
   * The stance (content `STANCES`) the character's unspent actions go to at the tick: chosen any time,
   * free, kept until changed. Public: it shows on the map and the roster.
   */
  readonly stance: string;
  /** The character ended their day (wait): no more acts today; the stance gets the rest at the tick. Public. */
  readonly waiting: boolean;
  /** XP earned and skill nodes taken this season. Public. */
  readonly skills: Skills;
  /**
   * The day a falling slide pinned them, or absent. Pinned: no moving or acting (but struggling, setting the stance and
   * picking skills) until they struggle free, another character digs them out, or the end of the next tick after the day
   * they were pinned. Public: others must see it to help.
   */
  readonly pinnedDay?: number;
  /** Failed struggles under the current pin (absent when none); reset when they are freed. Public. */
  readonly struggles?: number;
}

/**
 * A feature on a hex (content `FEATURE_TYPES`). `left` is what remains: a node's
 * charges, 1 for an unworked site (0 once found), 1 for a trap.
 */
export interface FeatureState {
  readonly type: string;
  readonly revealed: boolean;
  readonly left: number;
  /** Old dry fuel lies in the bowl (a brazier not yet lit): the first fire needs no fuel from a pack. Public. */
  readonly stocked?: boolean;
}

/**
 * A hand cart on the map (`docs/design/cart.md`). Always on a hex (never on the creature). Public.
 * A `puller` has it hitched: it moves with them. A `rider` sits in its one seat and moves with it.
 * Both stand on its hex.
 */
export interface Cart {
  readonly id: string;
  readonly hex: Hex;
  /** What it carries, up to `config.cartCargo` units. */
  readonly cargo: Materials;
  readonly puller: string | null;
  readonly rider: string | null;
}

/** The unlock the engineers are working on, and the work done so far. */
export interface Project {
  readonly unlock: string;
  readonly work: number;
}

/**
 * The game as a player may see it: everything but the seed. Terrain is known
 * only for tiles that have been in view (`tiles`), so the map ahead and the
 * creature's next step cannot be worked out from it. Every rule a client uses
 * reads this type.
 */
export interface GameStateView {
  /** The content the state was made with (`CONTENT_VERSION`). */
  readonly contentVersion: number;
  /**
   * A public random number for cosmetic variety in drawing (props, figures).
   * Unrelated to the game seed, so it reveals nothing about the map.
   */
  readonly artSeed: number;
  /** Starts at 1 and goes up by one each tick. */
  readonly day: number;
  /** The tuning this game was created with; every rule reads it from here. */
  readonly config: TuningConfig;
  readonly creature: Creature;
  /** The destination band across the map (`docs/design/destination.md`): public from the start; the season ends when the creature's centre steps onto it. */
  readonly destination: Destination;
  /** Knowledge of hexes that have been in view, by `hexKey`. Absent means hidden. */
  readonly tiles: Readonly<Record<string, TileKnowledge>>;
  readonly characters: readonly Character[];
  /**
   * Features by `hexKey`. On the server this holds hidden ones too; a player
   * view holds only revealed ones.
   */
  readonly features: Readonly<Record<string, FeatureState>>;
  /** The team stores, on the creature: packs are emptied into them on boarding. */
  readonly stores: Materials;
  /** Unlocks the team has finished (permanent), by content id. */
  readonly unlocks: readonly string[];
  /** The one unlock in progress, if any. */
  readonly project: Project | null;
  /** Carts on the map (at most `config.cartsMax`). */
  readonly carts: readonly Cart[];
  /** Stimuli on the map now (lit fires). */
  readonly stimuli: readonly Stimulus[];
  /** Threats on the map now. */
  readonly threats: readonly Threat[];
  /** Lures (small animals) on the map now. */
  readonly lures: readonly Lure[];
  /** Settlements in reach (each stays until its hex is lost to the fog). */
  readonly settlements: readonly Settlement[];
  /** The creature's peril: 0 to `perilMax`. At the max the season is lost. */
  readonly peril: number;
  readonly season: Season;
  /** The season's tallies for the recap (public counters; see `stats.ts`). */
  readonly stats: SeasonStats;
  /** No pursuer appears at a tick that starts a day up to this one (a mislead); null for none. */
  readonly misleadUntilDay: number | null;
  /** What the season left on the map (at most `traceCap`). */
  readonly traces: readonly Trace[];
  /** Burnables a fire burnt away for good, with the feature that stood there (public, shown where seen). */
  readonly burnt: readonly Burnt[];
  /** The story so far. */
  readonly story: StoryState;
}

/**
 * The whole game, held only by the server: the view plus the seed that generates
 * the map and the creature's hidden nature and condition.
 */
export interface GameState extends GameStateView {
  /** 128 bits; never sent to players. */
  readonly seed: Seed;
  /** Never sent to players. */
  readonly nature: Nature;
  /** Never sent to players. */
  readonly care: Care;
  /**
   * Where map generation puts the braziers along the creature's likely route (`brazierPlan`), nearest first.
   * Never sent to players: only a brazier whose hex has been seen shows, as a feature.
   */
  readonly brazierPlan: readonly Hex[];
  /**
   * Hazard patches laid so far across the route ahead (`hazards.ts`), oldest first. Never sent to players:
   * the terrain shows as tiles do, and a cluster's threats are public once on the map.
   */
  readonly hazardPlan: readonly HazardPatch[];
  /** Lures placed so far (the next lure's index, for its id and its place along the route). Never sent. */
  readonly lureCount: number;
  /** Carts built so far (the next cart's id), so an id is never reused after one is lost. Never sent. */
  readonly cartCount: number;
}

export const hasSeed = (state: GameStateView): state is GameState =>
  isSeed((state as Partial<GameState>).seed);

/** The character, no longer pinned. */
export const unpinned = <C extends Character>(c: C): C => {
  if (c.pinnedDay === undefined && c.struggles === undefined) return c;
  const rest: Record<string, unknown> = { ...(c as Character) };
  delete rest['pinnedDay'];
  delete rest['struggles'];
  return rest as unknown as C;
};

export const findCharacter = (state: GameStateView, id: string): Character | undefined =>
  state.characters.find((c) => c.id === id);

export const isSeasonOver = (state: GameStateView): boolean => state.season.status === 'over';
