import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { expect } from 'vitest';
import { DiscordError, type DiscordApi, type GuildApi } from '../src/discord.ts';
import { creatureSigns, hiddenFeatureKeys, isKeeper } from '@behemoth-road/core';
import { loadGame, type Seed } from '../src/game-core.ts';
import { GuildGame, type GuildGameOptions, type SessionUser } from '../src/guild-game.ts';
import { createHandler } from '../src/handler.ts';
import type { ActivityInstance, DiscordMember, DiscordRole, DiscordUser } from '../src/schemas.ts';
import { formatSessionToken, getSessionKey } from '../src/session.ts';

export const ORIGIN = 'https://behemoth.test';
export const USER_ID = '111111111111111111';
export const OTHER_USER_ID = '222222222222222222';
export const GUILD_ID = '333333333333333333';
export const ACCESS_TOKEN = 'fake-access-token';
/** 2030-06-01T12:00:00Z: a fixed start (in the future, so a real alarm never fires during a test) for the fake clock. */
export const T0 = Date.UTC(2030, 5, 1, 12, 0, 0);
/** A fixed 128-bit game seed: four distinctive words, none of which may appear in any response. */
export const SEED: Seed = [3141592653, 2718281828, 1414213562, 1732050807];
export const ART_SEED = 4242;

export { DiscordError };

/** A different guild id per call, so tests never share a Durable Object. */
let guildCounter = 0;
const madeGuilds: string[] = [];
export function freshGuildId(): string {
  guildCounter += 1;
  const id = `4${String(Date.now() % 1e9).padStart(9, '0')}${String(guildCounter).padStart(8, '0')}`;
  madeGuilds.push(id);
  return id;
}

/** A guild id no test allows (not made by `freshGuildId`). */
export const STRANGER_GUILD_ID = '777777777777777777';

/** The allowlist the tests run with: the fixed test guild and every guild `freshGuildId` made. */
export const testAllowlist = (): string => [GUILD_ID, ...madeGuilds].join(',');

export interface FakeDiscordOptions {
  user?: DiscordUser;
  instance?: ActivityInstance | null;
  exchangeError?: DiscordError;
  userError?: DiscordError;
  instanceError?: DiscordError;
}

export interface FakeDiscord extends DiscordApi {
  calls: { exchangeCode: string[]; getCurrentUser: string[]; getActivityInstance: string[] };
}

export function fakeDiscord(options: FakeDiscordOptions = {}): FakeDiscord {
  const user = options.user ?? { id: USER_ID, username: 'misa', global_name: 'Misa' };
  const instance =
    options.instance === undefined
      ? { location: { guild_id: GUILD_ID }, users: [user.id] }
      : options.instance;
  const calls: FakeDiscord['calls'] = {
    exchangeCode: [],
    getCurrentUser: [],
    getActivityInstance: [],
  };
  return {
    calls,
    exchangeCode(code) {
      calls.exchangeCode.push(code);
      return options.exchangeError
        ? Promise.reject(options.exchangeError)
        : Promise.resolve(ACCESS_TOKEN);
    },
    getCurrentUser(accessToken) {
      calls.getCurrentUser.push(accessToken);
      return options.userError ? Promise.reject(options.userError) : Promise.resolve(user);
    },
    getActivityInstance(instanceId) {
      calls.getActivityInstance.push(instanceId);
      return options.instanceError
        ? Promise.reject(options.instanceError)
        : Promise.resolve(instance);
    },
  };
}

export interface FakeGuildOptions {
  ownerId?: string;
  /** Roles besides @everyone. */
  roles?: DiscordRole[];
  /** The member's role ids per user id; a user not listed is not in the guild. */
  members?: Record<string, string[]>;
  failure?: DiscordError;
}

export interface FakeGuildApi extends GuildApi {
  calls: string[];
}

export function fakeGuildApi(guildId: string, options: FakeGuildOptions = {}): FakeGuildApi {
  const calls: string[] = [];
  const allRoles = [{ id: guildId, permissions: '0' }, ...(options.roles ?? [])];
  const fail = () => Promise.reject(options.failure ?? new Error('no failure set'));
  return {
    calls,
    getGuildOwnerId(id) {
      calls.push(`guild:${id}`);
      return options.failure ? fail() : Promise.resolve(options.ownerId ?? '999999999999999999');
    },
    getGuildRoles(id) {
      calls.push(`roles:${id}`);
      return options.failure ? fail() : Promise.resolve(allRoles);
    },
    getGuildMember(_id, userId): Promise<DiscordMember | null> {
      calls.push(`member:${userId}`);
      if (options.failure) return fail();
      const roles = options.members?.[userId];
      return Promise.resolve(roles === undefined ? null : { roles });
    },
  };
}

const ctx = {
  waitUntil: () => undefined,
  passThroughOnException: () => undefined,
  props: {},
} as unknown as ExecutionContext;

export type Handler = ReturnType<typeof createHandler>;

/** Calls the Worker's fetch handler with the test env (or an override of some vars). */
export function callHandler(
  handler: Handler,
  request: Request,
  envOverrides: Partial<Env> = {},
): Promise<Response> {
  if (handler.fetch === undefined) throw new Error('handler has no fetch');
  return Promise.resolve(
    handler.fetch(
      request as Request<unknown, IncomingRequestCfProperties>,
      { ...env, ALLOWED_GUILDS: testAllowlist(), ...envOverrides },
      ctx,
    ),
  );
}

export function postAuth(handler: Handler, body: unknown, raw = false): Promise<Response> {
  return callHandler(
    handler,
    new Request(`${ORIGIN}/api/auth/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: raw ? (body as string) : JSON.stringify(body),
    }),
  );
}

export function expectApiHeaders(res: Response): void {
  expect(res.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
  expect(res.headers.get('Cache-Control')).toBe('no-store');
  expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  expect(res.headers.has('Access-Control-Allow-Origin')).toBe(false);
}

/** Builds a correctly signed token the way the Worker does, using the test env's client secret. */
export async function tokenFor(guildId: string, secret: string): Promise<string> {
  return formatSessionToken(await getSessionKey(env.DISCORD_CLIENT_SECRET), guildId, secret);
}

/** Fails the test if the body (any JSON) carries a `seed` key anywhere, or any word of the seed. */
export function expectNoSeed(body: unknown, seed: Seed = SEED): void {
  const text = JSON.stringify(body);
  expect(text).not.toMatch(/"seed"/);
  for (const word of seed)
    expect(text).not.toMatch(new RegExp(`(^|[^0-9])${String(word)}([^0-9]|$)`));
}

/**
 * Fails the test if a response's view carries a feature the stored game still hides: only revealed
 * features may leave the server (glints mark a hex, never what is there).
 */
export function expectNoHiddenFeatures(body: unknown, sql: SqlStorage): void {
  const features = (body as { game?: { features?: Record<string, { revealed?: unknown }> } } | null)
    ?.game?.features;
  if (features === undefined) return;
  const row = sql.exec<{ state: string }>('SELECT state FROM game WHERE id = 1').toArray()[0];
  if (row === undefined) return;
  const hidden = hiddenFeatureKeys(loadGame(JSON.parse(row.state)));
  for (const key of hidden) expect(features, `hidden feature at ${key}`).not.toHaveProperty([key]);
  for (const [key, feature] of Object.entries(features)) {
    expect(feature.revealed, `feature at ${key}`).toBe(true);
  }
}

/** Keys of the creature's hidden nature and condition: never in any response. */
const SECRET_KEYS = ['nature', 'care', 'satiety', 'reactions'];

/**
 * Fails the test if a response carries the creature's hidden nature or condition anywhere, or signs that
 * are not exactly what the core lets this viewer read (a non-keeper gets no cues, so no reaction).
 */
export function expectNoCreatureSecrets(body: unknown, sql: SqlStorage): void {
  const walk = (value: unknown, at: string): void => {
    if (value === null || typeof value !== 'object') return;
    for (const [key, inner] of Object.entries(value)) {
      if (!Array.isArray(value)) expect(SECRET_KEYS, `${at}.${key}`).not.toContain(key);
      walk(inner, `${at}.${key}`);
    }
  };
  walk(body, '$');
  const view = body as { you?: { characterId: string | null }; signs?: unknown } | null;
  if (view?.you === undefined) return;
  const row = sql.exec<{ state: string }>('SELECT state FROM game WHERE id = 1').toArray()[0];
  if (row === undefined) return;
  const state = loadGame(JSON.parse(row.state));
  const id = view.you.characterId;
  const active = state.characters.find((c) => c.id === id)?.status === 'active' ? id : null;
  expect(view.signs).toEqual(creatureSigns(state, active));
  if (!isKeeper(state, active)) {
    expect((view.signs as { cues: unknown[] }).cues).toEqual([]);
  }
}

export interface Called {
  status: number;
  body: unknown;
}

export interface GameContext {
  guildId: string;
  game: GuildGame;
  clock: { t: number };
  sql: SqlStorage;
  storage: DurableObjectStorage;
  /** Signs a player in (as the Worker would after Discord confirmed them); returns their token. */
  signIn(user: SessionUser): Promise<string>;
  /** One API request as that player; every body is checked for the seed, hidden features and the creature's secrets. */
  call(token: string, method: string, path: string, body?: unknown): Promise<Called>;
}

/**
 * Runs `fn` inside a guild's real Durable Object with a GuildGame driven by a fake clock and a fixed
 * seed. The object's own GuildGame (real clock) has already migrated the same database.
 */
export async function runGame<R>(
  fn: (ctx: GameContext) => Promise<R> | R,
  options: Partial<GuildGameOptions> & { guildId?: string; seed?: Seed } = {},
): Promise<R> {
  const guildId = options.guildId ?? freshGuildId();
  const seed = options.seed ?? SEED;
  const stub = env.GUILD_WORLD.get(env.GUILD_WORLD.idFromName(guildId));
  return runInDurableObject(stub, async (_instance, state) => {
    const clock = { t: options.now?.() ?? T0 };
    const game = new GuildGame(state.storage, {
      newSeed: () => seed,
      newArtSeed: () => ART_SEED,
      devTools: true,
      guildApi: null,
      everyoneIsAdmin: false,
      ...options,
      now: () => clock.t,
    });
    game.migrate();
    const signIn = async (user: SessionUser) =>
      tokenFor(guildId, await game.createSession(guildId, user));
    const call = async (token: string, method: string, path: string, body?: unknown) => {
      const res = await game.handle(
        new Request(`${ORIGIN}${path}`, {
          method,
          headers: { Authorization: `Bearer ${token}` },
          ...(body === undefined
            ? {}
            : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
        }),
      );
      expectApiHeaders(res);
      const parsed: unknown = await res.json();
      expectNoSeed(parsed, seed);
      expectNoHiddenFeatures(parsed, state.storage.sql);
      expectNoCreatureSecrets(parsed, state.storage.sql);
      return { status: res.status, body: parsed };
    };
    return fn({
      guildId,
      game,
      clock,
      sql: state.storage.sql,
      storage: state.storage,
      signIn,
      call,
    });
  });
}

export const MISA: SessionUser = { id: USER_ID, displayName: 'Misa' };
export const ROBIN: SessionUser = { id: OTHER_USER_ID, displayName: 'Robin' };
