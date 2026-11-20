/**
 * Response shapes from `docs/design/m2-session.md`, as Valibot schemas. Every response is parsed before
 * use: a wrong type throws. Objects ignore keys they do not know, so a newer server can add fields
 * without breaking an open client; requests are the server's to check strictly.
 */
import * as v from 'valibot';

const id = v.pipe(v.string(), v.minLength(1), v.maxLength(64));
const text = v.pipe(v.string(), v.maxLength(100));
const int = v.pipe(v.number(), v.integer(), v.minValue(-1_000_000), v.maxValue(1_000_000));
const count = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1_000_000));
const hex = v.object({ q: int, r: int });
const direction = v.picklist(['n', 'ne', 'se', 's', 'sw', 'nw']);

export const PlaceSchema = v.variant('kind', [
  v.object({ kind: v.literal('hex'), hex }),
  v.object({ kind: v.literal('creature') }),
]);

const tile = v.variant('visibility', [
  v.object({
    visibility: v.literal('seen'),
    terrain: id,
    explored: v.boolean(),
    leftWindowOnDay: v.nullable(count),
  }),
  v.object({ visibility: v.literal('lost'), terrain: id, explored: v.boolean() }),
]);

const hexKeyString = v.pipe(v.string(), v.regex(/^-?\d+,-?\d+$/), v.maxLength(24));
/** Materials by content id (a pack, the stores). */
const counts = v.pipe(
  v.record(id, count),
  v.check((r) => Object.keys(r).length <= 200, 'too many entries'),
);

const character = v.object({
  /** The day a threat struck them, or null. */
  struckDay: v.nullable(count),
  id,
  userId: id,
  name: text,
  /** Content ids; null for the plain character. */
  trait: v.nullable(id),
  quirk: v.nullable(id),
  role: id,
  joinedDay: count,
  /** Public seed for the character's look (`assignLooks`); unrelated to the game seed. */
  lookSeed: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(0xffffffff)),
  at: PlaceSchema,
  actionsLeft: count,
  /** What the character carries. */
  pack: counts,
  status: v.picklist(['active', 'lost']),
});

const weights = v.object({ left: v.number(), straight: v.number(), right: v.number() });

const config = v.object({
  actionsPerDay: count,
  moveCost: count,
  creatureRadius: count,
  windowRadius: count,
  graceDays: count,
  lostTileRings: count,
  playerCap: count,
  veerWeights: weights,
  featureChance: v.number(),
  packCapacity: count,
  surveyCostSpecialist: count,
  surveyCostOther: count,
  gatherCost: count,
  workSiteCost: count,
  buildCost: count,
  siteChanceSpecialistTier1: v.number(),
  siteChanceSpecialistTier2: v.number(),
  siteChanceOtherTier1: v.number(),
  siteChanceOtherTier2: v.number(),
  stimulusRange: count,
  stimulusPull: v.number(),
  hungryVeerWeights: weights,
  lightFireCost: count,
  feedCost: count,
  lingerCost: count,
  threatsFromDay: count,
  threatChanceBase: v.number(),
  threatChancePerPlayer: v.number(),
  threatChancePerDay: v.number(),
  threatChanceMax: v.number(),
  threatsMax: count,
  threatStrengthPlayers: count,
  threatStrengthDays: count,
  threatPathDistance: count,
  struckActions: count,
  strikeCost: count,
  clearPowerGuardian: count,
  clearPowerOther: count,
  defendCost: count,
  defendReduction: count,
  parleyCost: count,
  offerCost: count,
  askBoonCost: count,
  parleyFavourEnvoy: count,
  parleyFavourOther: count,
  parleyAngerChanceOther: v.number(),
  offerFavour: count,
  misleadDays: count,
  shelterPeril: count,
  settlementFirst: count,
  settlementEvery: count,
  perilMax: count,
  perilWoundedAt: count,
  perilHungry: count,
  perilHungryLevel: count,
  perilCalm: count,
  routeLength: count,
});

/** The core state without the seed (the core's `GameStateView`): known tiles carry their terrain. */
export const GameStateViewSchema = v.object({
  contentVersion: count,
  /** A public cosmetic seed for drawing variety; unrelated to the game seed. */
  artSeed: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(0xffffffff)),
  day: count,
  config,
  creature: v.object({
    centre: hex,
    heading: direction,
    /** A keeper asked it to stay put at the next tick. */
    lingering: v.boolean(),
    /** The last day it lingered, or null. */
    lingeredDay: v.nullable(count),
    /** Steps walked this season. */
    steps: count,
    /** Guardians defending it until the next tick. */
    defenders: v.pipe(v.array(id), v.maxLength(64)),
  }),
  tiles: v.pipe(
    v.record(v.pipe(v.string(), v.regex(/^-?\d+,-?\d+$/), v.maxLength(24)), tile),
    v.check((t) => Object.keys(t).length <= 20_000, 'too many tiles'),
  ),
  characters: v.pipe(v.array(character), v.maxLength(64)),
  /** Revealed features only (the server leaves hidden ones out). */
  features: v.pipe(
    v.record(hexKeyString, v.object({ type: id, revealed: v.boolean(), left: count })),
    v.check((f) => Object.keys(f).length <= 20_000, 'too many features'),
  ),
  /** The team stores, on the creature. */
  stores: counts,
  /** Unlocks the team has finished. */
  unlocks: v.pipe(v.array(id), v.maxLength(100)),
  /** The one unlock in progress. */
  project: v.nullable(v.object({ unlock: id, work: count })),
  /** Lit fires (public): each burns through the tick that ends the day it was lit. */
  stimuli: v.pipe(v.array(v.object({ type: id, hex, litDay: count })), v.maxLength(200)),
  /** Threats on the map (public). */
  threats: v.pipe(
    v.array(v.object({ id, type: id, hex, strength: count, appearedDay: count })),
    v.maxLength(200),
  ),
  /** Settlements in reach (public). */
  settlements: v.pipe(
    v.array(
      v.object({
        id,
        type: id,
        hex,
        attitude: v.picklist(['wary', 'friendly', 'angry']),
        favour: count,
        boon: v.nullable(id),
      }),
    ),
    v.maxLength(200),
  ),
  peril: count,
  season: v.variant('status', [
    v.object({ status: v.literal('on') }),
    v.object({
      status: v.literal('over'),
      outcome: v.picklist(['safe', 'wounded', 'lost']),
      day: count,
    }),
  ]),
  misleadUntilDay: v.nullable(count),
});

/**
 * What the signed-in player can read off the creature (core `CreatureSigns`): its appetite (faint for a
 * non-keeper) and, for a keeper, how it reacted to each fire at the last tick.
 */
export const SignsSchema = v.object({
  appetite: v.nullable(
    v.object({
      kind: v.picklist(['underfed', 'overfed']),
      level: v.picklist([1, 2, 3]),
      faint: v.boolean(),
    }),
  ),
  cues: v.pipe(
    v.array(v.object({ hex, stimulus: id, reaction: v.picklist(['toward', 'away', 'unmoved']) })),
    v.maxLength(64),
  ),
});

const player = v.object({
  userId: id,
  /** A Discord display name: rendered as text only. */
  name: text,
  characterId: v.nullable(id),
  role: v.nullable(id),
  joinedDay: v.nullable(count),
});

/** A character the player may pick when joining or replacing (index into `offers`). */
export const OfferSchema = v.object({
  name: text,
  trait: v.nullable(id),
  quirk: v.nullable(id),
  lookSeed: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(0xffffffff)),
});

/** Something that happened in a move or an action, for the map's short moments (core event list). */
export const GameEventSchema = v.object({
  kind: v.pipe(v.string(), v.maxLength(40)),
  hex: v.optional(hex),
  /** Whose character the event is about. */
  characterId: v.optional(id),
  /** Content ids the event names: a revealed feature, a material, an unlock. */
  feature: v.optional(id),
  material: v.optional(id),
  amount: v.optional(count),
  unlock: v.optional(id),
  /** A deposit's materials. */
  materials: v.optional(counts),
  /** The creature's step in the day tick: from and to its centre. */
  from: v.optional(hex),
  to: v.optional(hex),
  /** The new day, from the tick. */
  day: v.optional(count),
  /** Unlock progress: work done and needed. */
  work: v.optional(count),
  needed: v.optional(count),
  /** A fire's stimulus id (fire-lit, fire-out). */
  stimulus: v.optional(id),
  /** The game version the event happened in (events are logged per change). */
  version: count,
});

export const PlayerViewSchema = v.object({
  version: count,
  day: count,
  you: v.object({
    userId: id,
    characterId: v.nullable(id),
    admin: v.boolean(),
  }),
  game: GameStateViewSchema,
  players: v.pipe(v.array(player), v.maxLength(64)),
  devTools: v.boolean(),
  offers: v.nullable(v.pipe(v.array(OfferSchema), v.maxLength(8))),
  /** What you read off the creature (for your active character; no keeper detail without one). */
  signs: SignsSchema,
  /**
   * What happened since the version the client asked from (`since`), or in its own move or action,
   * oldest first. Empty on a first load.
   */
  events: v.optional(v.pipe(v.array(GameEventSchema), v.maxLength(500)), []),
  /** Some events after `since` were no longer kept: the client skips the moments. */
  eventsTruncated: v.optional(v.boolean(), false),
});

export const GameResponseSchema = v.union([
  v.object({ unchanged: v.literal(true) }),
  PlayerViewSchema,
]);

export const ConfigSchema = v.object({
  environment: text,
  version: text,
  branch: v.optional(v.nullable(text), null),
  discordClientId: v.optional(text, ''),
  devTools: v.optional(v.boolean(), false),
});

export const SessionSchema = v.object({
  token: v.pipe(v.string(), v.minLength(1), v.maxLength(4096)),
  accessToken: v.optional(v.pipe(v.string(), v.maxLength(4096)), ''),
  user: v.object({ id, name: text }),
});

export const ErrorBodySchema = v.object({ error: v.pipe(v.string(), v.maxLength(100)) });

export type PlayerView = v.InferOutput<typeof PlayerViewSchema>;
export type GameStateView = v.InferOutput<typeof GameStateViewSchema>;
export type CharacterView = GameStateView['characters'][number];
export type PlayerInfo = PlayerView['players'][number];
export type Offer = v.InferOutput<typeof OfferSchema>;
export type GameResponse = v.InferOutput<typeof GameResponseSchema>;
export type AppConfig = v.InferOutput<typeof ConfigSchema>;
export type Session = v.InferOutput<typeof SessionSchema>;
export type Signs = v.InferOutput<typeof SignsSchema>;

/** The answer to a move or an action: the new view, what happened, and where a trap stopped a walk. */
export const ActionAnswerSchema = v.object({
  ...PlayerViewSchema.entries,
  /** A walk a trap stopped: the step it stopped at. */
  stopped: v.optional(
    v.nullable(v.object({ step: count, reason: v.pipe(v.string(), v.maxLength(40)) })),
    null,
  ),
});

export type GameEvent = v.InferOutput<typeof GameEventSchema>;
export type ActionAnswer = v.InferOutput<typeof ActionAnswerSchema>;

/** `POST /api/game/act` action bodies. */
export type GameAction =
  | { readonly kind: 'survey'; readonly hex: { readonly q: number; readonly r: number } }
  | { readonly kind: 'gather' }
  | { readonly kind: 'work-site' }
  | { readonly kind: 'build'; readonly unlock: string }
  | { readonly kind: 'light-fire' }
  | { readonly kind: 'feed' }
  | { readonly kind: 'linger' }
  | { readonly kind: 'strike'; readonly threat: string }
  | { readonly kind: 'defend' }
  | { readonly kind: 'parley' }
  | { readonly kind: 'offer'; readonly material: string }
  | { readonly kind: 'ask-boon'; readonly boon: string };
