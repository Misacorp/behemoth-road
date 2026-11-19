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
  v.object({ visibility: v.literal('seen'), terrain: id, leftWindowOnDay: v.nullable(count) }),
  v.object({ visibility: v.literal('lost'), terrain: id }),
]);

const character = v.object({
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
  status: v.picklist(['active', 'lost']),
});

const config = v.object({
  actionsPerDay: count,
  moveCost: count,
  creatureRadius: count,
  windowRadius: count,
  graceDays: count,
  lostTileRings: count,
  playerCap: count,
  veerWeights: v.object({ left: v.number(), straight: v.number(), right: v.number() }),
});

/** The core state without the seed (the core's `GameStateView`): known tiles carry their terrain. */
export const GameStateViewSchema = v.object({
  contentVersion: count,
  /** A public cosmetic seed for drawing variety; unrelated to the game seed. */
  artSeed: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(0xffffffff)),
  day: count,
  config,
  creature: v.object({ centre: hex, heading: direction }),
  tiles: v.pipe(
    v.record(v.pipe(v.string(), v.regex(/^-?\d+,-?\d+$/), v.maxLength(24)), tile),
    v.check((t) => Object.keys(t).length <= 20_000, 'too many tiles'),
  ),
  characters: v.pipe(v.array(character), v.maxLength(64)),
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

/** Something that happened in a move or an action, for the map's short moments (core event list). */
export const GameEventSchema = v.object({
  kind: v.pipe(v.string(), v.maxLength(40)),
  hex: v.optional(hex),
  /** What was found or revealed, as a content id, when the event names one. */
  item: v.optional(id),
});

/** The answer to a move or an action: the new view and what happened on the way. */
export const ActionAnswerSchema = v.object({
  ...PlayerViewSchema.entries,
  events: v.optional(v.pipe(v.array(GameEventSchema), v.maxLength(64)), []),
});

export type GameEvent = v.InferOutput<typeof GameEventSchema>;
export type ActionAnswer = v.InferOutput<typeof ActionAnswerSchema>;

/** `POST /api/game/act` action bodies. */
export type GameAction =
  | { readonly kind: 'gather' }
  | { readonly kind: 'craft'; readonly recipe: string }
  | { readonly kind: 'work-site' };
