import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { expect } from 'vitest';
import { DiscordError, type DiscordApi, type GuildApi } from '../src/discord.ts';
import { GuildGame, type GuildGameOptions, type SessionUser } from '../src/guild-game.ts';
import { createHandler } from '../src/index.ts';
import type { ActivityInstance, DiscordMember, DiscordRole, DiscordUser } from '../src/schemas.ts';
import { formatSessionToken, getSessionKey } from '../src/session.ts';

export const ORIGIN = 'https://behemoth.test';
export const USER_ID = '111111111111111111';
export const OTHER_USER_ID = '222222222222222222';
export const GUILD_ID = '333333333333333333';
export const ACCESS_TOKEN = 'fake-access-token';
/** 2030-06-01T12:00:00Z: a fixed start (in the future, so a real alarm never fires during a test) for the fake clock. */
export const T0 = Date.UTC(2030, 5, 1, 12, 0, 0);
export const SEED = 3141592653;

export { DiscordError };

/** A different guild id per call, so tests never share a Durable Object. */
let guildCounter = 0;
export function freshGuildId(): string {
  guildCounter += 1;
  return `4${String(Date.now() % 1e9).padStart(9, '0')}${String(guildCounter).padStart(8, '0')}`;
}

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
  const calls: FakeDiscord['calls'] = { exchangeCode: [], getCurrentUser: [], getActivityInstance: [] };
  return {
    calls,
    exchangeCode(code) {
      calls.exchangeCode.push(code);
      return options.exchangeError ? Promise.reject(options.exchangeError) : Promise.resolve(ACCESS_TOKEN);
    },
    getCurrentUser(accessToken) {
      calls.getCurrentUser.push(accessToken);
      return options.userError ? Promise.reject(options.userError) : Promise.resolve(user);
    },
    getActivityInstance(instanceId) {
      calls.getActivityInstance.push(instanceId);
      return options.instanceError ? Promise.reject(options.instanceError) : Promise.resolve(instance);
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
    handler.fetch(request as Request<unknown, IncomingRequestCfProperties>, { ...env, ...envOverrides }, ctx),
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

/** Fails the test if the body (any JSON) carries a `seed` key anywhere, or the seed's value as a number. */
export function expectNoSeed(body: unknown, seed: number = SEED): void {
  const text = JSON.stringify(body);
  expect(text).not.toMatch(/"seed"/);
  expect(text).not.toMatch(new RegExp(`[^0-9]${String(seed)}[^0-9]`));
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
  /** One API request as that player; every body is checked for the seed. */
  call(token: string, method: string, path: string, body?: unknown): Promise<Called>;
}

/**
 * Runs `fn` inside a guild's real Durable Object with a GuildGame driven by a fake clock and a fixed
 * seed. The object's own GuildGame (real clock) has already migrated the same database.
 */
export async function runGame<R>(
  fn: (ctx: GameContext) => Promise<R> | R,
  options: Partial<GuildGameOptions> & { guildId?: string; seed?: number } = {},
): Promise<R> {
  const guildId = options.guildId ?? freshGuildId();
  const seed = options.seed ?? SEED;
  const stub = env.GUILD_WORLD.get(env.GUILD_WORLD.idFromName(guildId));
  return runInDurableObject(stub, async (_instance, state) => {
    const clock = { t: options.now?.() ?? T0 };
    const game = new GuildGame(state.storage, {
      newSeed: () => seed,
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
          ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
        }),
      );
      expectApiHeaders(res);
      const parsed: unknown = await res.json();
      expectNoSeed(parsed, seed);
      return { status: res.status, body: parsed };
    };
    return fn({ guildId, game, clock, sql: state.storage.sql, storage: state.storage, signIn, call });
  });
}

export const MISA: SessionUser = { id: USER_ID, displayName: 'Misa' };
export const ROBIN: SessionUser = { id: OTHER_USER_ID, displayName: 'Robin' };
