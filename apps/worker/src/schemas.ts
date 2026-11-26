import * as v from 'valibot';
import {
  DIRECTIONS,
  ROLE_IDS,
  SEEN_IDS,
  SEEN_MAX,
  SKILL_IDS,
  STANCE_IDS,
  STORY_IDS,
  UNLOCK_IDS,
} from './game-core.ts';
import { SERVER_CONFIG } from './server-config.ts';

export const SNOWFLAKE_RE = /^\d{17,20}$/;

const snowflake = v.pipe(v.string(), v.regex(SNOWFLAKE_RE));

// --- Request bodies: strict, unknown keys rejected, every length and number bounded ---

/** Request body of POST /api/auth/session. */
export const AuthSessionBodySchema = v.strictObject({
  code: v.pipe(v.string(), v.minLength(1), v.maxLength(512)),
  instanceId: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
});

const { maxCoordinate, maxPathLength, maxOffers } = SERVER_CONFIG.limits;

const coordinate = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(-maxCoordinate),
  v.maxValue(maxCoordinate),
);

/** A place: exactly `{ kind: 'hex', hex: { q, r } }` or `{ kind: 'creature' }`. */
export const PlaceSchema = v.variant('kind', [
  v.strictObject({
    kind: v.literal('hex'),
    hex: v.strictObject({ q: coordinate, r: coordinate }),
  }),
  v.strictObject({ kind: v.literal('creature') }),
]);

/** One of the six role ids from content. */
export const RoleSchema = v.pipe(
  v.string(),
  v.maxLength(32),
  v.check((id) => ROLE_IDS.includes(id)),
);

/** The game version a client last saw. */
export const VersionSchema = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(2 ** 31));

/** POST /api/me/seen: ids from the core's list of things shown once, at most the whole list. */
export const SeenBodySchema = v.strictObject({
  ids: v.pipe(v.array(v.picklist(SEEN_IDS)), v.minLength(1), v.maxLength(SEEN_MAX)),
});

/** POST /api/me/story-read: storylet ids from content, each a known id, at most the whole list. */
export const StoryReadBodySchema = v.strictObject({
  ids: v.pipe(
    v.array(v.picklist(STORY_IDS as [string, ...string[]])),
    v.minLength(1),
    v.maxLength(STORY_IDS.length),
  ),
});

/** POST /api/dev/pace: how the game's days advance. */
export const PaceBodySchema = v.strictObject({ pace: v.picklist(['daily', 'fast']) });

/** POST /api/game/join and /replace: a role, and the index of the picked character in the view's `offers`. */
export const PickBodySchema = v.strictObject({
  role: RoleSchema,
  offer: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(maxOffers - 1)),
});

/** POST /api/game/move. */
export const MoveBodySchema = v.strictObject({
  version: VersionSchema,
  path: v.pipe(v.array(PlaceSchema), v.minLength(1), v.maxLength(maxPathLength)),
});

/** A threat id, material id or boon name: short, lower-case letters, digits and dashes. */
const contentId = v.pipe(v.string(), v.regex(/^[a-z0-9-]{1,64}$/));

/** An action by the player's own character: exactly one of the shapes. */
export const ActionSchema = v.variant('kind', [
  v.strictObject({
    kind: v.literal('survey'),
    hex: v.strictObject({ q: coordinate, r: coordinate }),
  }),
  v.strictObject({ kind: v.literal('gather') }),
  v.strictObject({ kind: v.literal('work-site') }),
  v.strictObject({
    kind: v.literal('build'),
    unlock: v.pipe(
      v.string(),
      v.maxLength(64),
      v.check((id) => UNLOCK_IDS.includes(id)),
    ),
  }),
  // Milestone 4: the creature's care, at the character's place.
  v.strictObject({ kind: v.literal('light-fire') }),
  v.strictObject({ kind: v.literal('feed') }),
  v.strictObject({ kind: v.literal('linger') }),
  // The tow line: a rider throws it to a character (the core refuses unknown or out-of-reach targets by
  // name); the target grabs it with their own action.
  v.strictObject({
    kind: v.literal('throw-line'),
    to: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
  }),
  v.strictObject({ kind: v.literal('grab-line') }),
  // Milestone 5: threats and settlements. The core refuses an unknown threat, material or boon by name
  // (`no-threat`, `no-trade-good`, `unknown-boon`), so the schema only bounds the strings.
  v.strictObject({ kind: v.literal('strike'), threat: contentId }),
  v.strictObject({ kind: v.literal('defend') }),
  // Frees a pinned character: the target's id (the core refuses an unknown, free or distant one by name).
  v.strictObject({
    kind: v.literal('dig-out'),
    target: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
  }),
  // Leads a lure (a small animal) one hex: its id, and exactly one of a direction or a target hex beside it.
  // The core refuses the rest by name (`no-lure`, `not-near`, `settled`, `blocked`, `pinned`, ...).
  v.pipe(
    v.strictObject({
      kind: v.literal('lead'),
      lure: contentId,
      direction: v.exactOptional(v.picklist(DIRECTIONS)),
      to: v.exactOptional(v.strictObject({ q: coordinate, r: coordinate })),
    }),
    v.check((a) => (a.direction === undefined) !== (a.to === undefined)),
  ),
  v.strictObject({ kind: v.literal('parley') }),
  v.strictObject({ kind: v.literal('offer'), material: contentId }),
  v.strictObject({ kind: v.literal('ask-boon'), boon: contentId }),
  // Skills: a node id from the content list (veiled and unknown nodes are the core's to refuse by name).
  v.strictObject({
    kind: v.literal('pick-skill'),
    node: v.pipe(
      v.string(),
      v.maxLength(64),
      v.check((id) => SKILL_IDS.includes(id)),
    ),
  }),
  // Stances (docs/design/stances.md): both are free. `wait` ends the character's day.
  v.strictObject({
    kind: v.literal('set-stance'),
    stance: v.pipe(
      v.string(),
      v.maxLength(64),
      v.check((id) => STANCE_IDS.includes(id)),
    ),
  }),
  v.strictObject({ kind: v.literal('wait') }),
]);

/** POST /api/game/act. */
export const ActBodySchema = v.strictObject({ version: VersionSchema, action: ActionSchema });

/** POST /api/dev/next-day. */
export const EmptyBodySchema = v.strictObject({});

/** `?since=<version>` of GET /api/game: digits only, bounded. */
export const SINCE_RE = /^\d{1,10}$/;

// --- Discord responses: lenient about extra keys (Discord adds fields), strict about the ones read ---

export const DiscordTokenResponseSchema = v.object({
  access_token: v.pipe(v.string(), v.minLength(1)),
});

export const DiscordUserSchema = v.object({
  id: snowflake,
  username: v.string(),
  global_name: v.nullish(v.string()),
});
export type DiscordUser = v.InferOutput<typeof DiscordUserSchema>;

export const ActivityInstanceSchema = v.object({
  location: v.object({
    guild_id: v.nullish(v.string()),
    channel_id: v.nullish(v.string()),
  }),
  users: v.array(v.string()),
});
export type ActivityInstance = v.InferOutput<typeof ActivityInstanceSchema>;

/** A permission bit field as Discord sends it: a decimal string of an unsigned 64-bit integer. */
const permissionString = v.pipe(v.string(), v.regex(/^\d{1,20}$/));

/** Discord allows 250 roles per guild; the limit here is generous but bounded. */
const MAX_ROLES = 1000;

/** `GET /guilds/{guild.id}`: only the owner matters. */
export const DiscordGuildSchema = v.object({ owner_id: snowflake });

/** `GET /guilds/{guild.id}/roles`: id and permission bits of every role (the @everyone role included). */
export const DiscordRolesSchema = v.pipe(
  v.array(v.object({ id: snowflake, permissions: permissionString })),
  v.maxLength(MAX_ROLES),
);
export type DiscordRole = v.InferOutput<typeof DiscordRolesSchema>[number];

/** `GET /guilds/{guild.id}/members/{user.id}`: the ids of the member's roles. */
export const DiscordMemberSchema = v.object({
  roles: v.pipe(v.array(snowflake), v.maxLength(MAX_ROLES)),
});
export type DiscordMember = v.InferOutput<typeof DiscordMemberSchema>;
