// The Worker's fetch handler: the API under /api/*. `index.ts` is the entry; it exports only what
// workerd accepts there (the default handler and the Durable Object classes), so everything else lives here.
import * as v from 'valibot';
import { allowedGuilds } from './allowlist.ts';
import { handleAuthSession } from './auth.ts';
import { createDiscordApi, type DiscordApi } from './discord.ts';
import { INTERACTIONS_PATH, handleInteraction } from './discord-interactions.ts';
import {
  dispatch,
  errorResponse,
  json,
  matchRoute,
  methodNotAllowed,
  notFound,
  parseBody,
  type Routes,
} from './http.ts';
import { TokenBucketLimiter } from './ratelimit.ts';
import { SERVER_CONFIG } from './server-config.ts';
import {
  formatSessionToken,
  getSessionKey,
  parseAuthorization,
  verifyTokenMac,
} from './session.ts';

/** Plain branch names only: anything else CI could not have set is left out of /api/config. */
const BRANCH_RE = /^[A-Za-z0-9._/-]{1,100}$/;

/** The fake server of the local dev login (`POST /api/dev/login`, `ENVIRONMENT` "local" only). */
export const DEV_GUILD_ID = '100000000000000000';
const DevLoginBodySchema = v.strictObject({
  player: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(9)),
});

export interface HandlerDeps {
  /** Builds the Discord client from the Worker's env. Tests inject a fake. */
  createDiscord(env: Env): DiscordApi;
  now(): number;
}

const defaultDeps: HandlerDeps = {
  createDiscord: (env) =>
    createDiscordApi({
      clientId: env.DISCORD_CLIENT_ID,
      clientSecret: env.DISCORD_CLIENT_SECRET,
      botToken: env.DISCORD_BOT_TOKEN,
    }),
  now: () => Date.now(),
};

/** The guild's Durable Object. Only ever called with a guild id Discord or a verified MAC vouched for. */
const guildWorld = (env: Env, guildId: string) =>
  env.GUILD_WORLD.get(env.GUILD_WORLD.idFromName(guildId));

/** Builds the Worker's fetch handler. The default export uses the real Discord client and clock. */
export function createHandler(overrides: Partial<HandlerDeps> = {}): ExportedHandler<Env> {
  const deps = { ...defaultDeps, ...overrides };
  const { auth, authIp, authGlobal } = SERVER_CONFIG.rateLimits;
  const authLimiters = {
    global: new TokenBucketLimiter({ ...authGlobal, now: deps.now }),
    ip: new TokenBucketLimiter({ ...authIp, now: deps.now }),
    instance: new TokenBucketLimiter({ ...auth, now: deps.now }),
  };

  async function signIn(env: Env, guildId: string, secret: string): Promise<string> {
    return formatSessionToken(await getSessionKey(env.DISCORD_CLIENT_SECRET), guildId, secret);
  }

  const publicRoutes: Routes<Env> = {
    '/api/config': {
      GET: (_request, env) =>
        // Public on purpose: scripts/deployed.mjs and the deploy workflow read the commit back from here.
        json({
          environment: env.ENVIRONMENT,
          version: env.VERSION,
          ...(BRANCH_RE.test(env.BRANCH) ? { branch: env.BRANCH } : {}),
          discordClientId: env.DISCORD_CLIENT_ID,
          devTools: env.DEV_TOOLS === 'on',
        }),
    },
    '/api/auth/session': {
      POST: (request, env) =>
        handleAuthSession(request, {
          discord: deps.createDiscord(env),
          limiters: authLimiters,
          allowedGuilds: allowedGuilds(env.ALLOWED_GUILDS),
          createSession: (guildId, user) => guildWorld(env, guildId).createSession(guildId, user),
          formatToken: (guildId, secret) => signIn(env, guildId, secret),
        }),
    },
    // Local development only (`wrangler dev`): signs in as a fake player of a fake server, so the web app
    // runs outside Discord. Every deployed environment sets ENVIRONMENT, so there it is a 404.
    '/api/dev/login': {
      POST: async (request, env) => {
        if (env.ENVIRONMENT !== 'local') return notFound();
        const body = await parseBody(request, DevLoginBodySchema);
        if (body === undefined) return errorResponse('invalid_body', 400);
        const user = {
          id: `20000000000000000${String(body.player)}`,
          displayName: `Player ${String(body.player)}`,
        };
        const secret = await guildWorld(env, DEV_GUILD_ID).createSession(DEV_GUILD_ID, user);
        return json({
          token: await signIn(env, DEV_GUILD_ID, secret),
          accessToken: '',
          user: { id: user.id, name: user.displayName },
        });
      },
    },
  };

  async function handleApi(request: Request, env: Env, pathname: string): Promise<Response> {
    // Discord's interactions endpoint: authenticated by Discord's signature, not a session.
    if (pathname === INTERACTIONS_PATH) return handleInteraction(request, env, deps);
    // The dev routes do not exist unless the dev tools are on (staging, local): a plain 404 before
    // anything else. The Durable Object checks again.
    if (pathname.startsWith('/api/dev/') && env.DEV_TOOLS !== 'on') return notFound();
    const match = matchRoute(publicRoutes, pathname, request.method);
    if (match.kind === 'ok') return dispatch(publicRoutes, request, pathname, env);
    if (match.kind === 'method_not_allowed') return methodNotAllowed(match.allow);

    // Parse strictly before touching any Durable Object, so junk never wakes one up.
    const token = parseAuthorization(request.headers.get('Authorization'));
    if (token === null) return errorResponse('invalid_session', 401);
    // The MAC proves we issued this token, so a forged guild id never addresses a Durable Object.
    const key = await getSessionKey(env.DISCORD_CLIENT_SECRET);
    if (!(await verifyTokenMac(key, token))) return errorResponse('invalid_session', 401);
    return guildWorld(env, token.guildId).fetch(request);
  }

  return {
    async fetch(request, env): Promise<Response> {
      const { pathname } = new URL(request.url);
      if (pathname === '/api' || pathname.startsWith('/api/')) {
        try {
          return await handleApi(request, env, pathname);
        } catch (err) {
          // Log only the error type: messages could carry upstream data.
          console.error('unhandled error', err instanceof Error ? err.name : 'unknown');
          return errorResponse('internal_error', 500);
        }
      }
      // Only reached if run_worker_first is widened; static assets are normally served directly.
      return env.ASSETS.fetch(request);
    },
  };
}
