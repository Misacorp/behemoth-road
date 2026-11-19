import * as v from 'valibot';
import { DiscordError, type DiscordApi } from './discord.ts';
import type { SessionUser } from './guild-game.ts';
import { errorResponse, json, readJsonBody } from './http.ts';
import { sanitizeDisplayName } from './names.ts';
import type { TokenBucketLimiter } from './ratelimit.ts';
import { AuthSessionBodySchema, SNOWFLAKE_RE } from './schemas.ts';

export const MAX_AUTH_BODY_BYTES = 4096;

export interface AuthDeps {
  discord: DiscordApi;
  /** Asks the guild's Durable Object to upsert the player and create a session; returns the secret. */
  createSession(guildId: string, user: SessionUser): Promise<string>;
  /** Signs the secret into the final `s1.<guildId>.<secret>.<mac>` token. */
  formatToken(guildId: string, secret: string): Promise<string>;
  /** Best-effort limiters (per isolate): all callers, per client IP, per Activity instance. */
  limiters: { global: TokenBucketLimiter; ip: TokenBucketLimiter; instance: TokenBucketLimiter };
}

/**
 * `POST /api/auth/session`: the Activity's sign-in (creatures' flow). The Embedded App SDK's authorize
 * code is exchanged for an access token, the user is read with it, and the Activity instance is read
 * with the bot token. The guild comes only from Discord's answer about the instance, never from the
 * client, and the user must be in that instance. A DM or group DM launch has no guild and is refused.
 */
export async function handleAuthSession(request: Request, deps: AuthDeps): Promise<Response> {
  const raw = await readJsonBody(request, MAX_AUTH_BODY_BYTES);
  if (raw === undefined) return errorResponse('invalid_body', 400);
  const parsed = v.safeParse(AuthSessionBodySchema, raw);
  if (!parsed.success) return errorResponse('invalid_body', 400);
  const { code, instanceId } = parsed.output;

  // Cloudflare sets CF-Connecting-IP on every request it routes; a request without one shares a bucket.
  const ip = (request.headers.get('CF-Connecting-IP') ?? 'unknown').slice(0, 64);
  for (const [limiter, key] of [
    [deps.limiters.global, 'all'],
    [deps.limiters.ip, ip],
    [deps.limiters.instance, instanceId],
  ] as const) {
    const limit = limiter.take(key);
    if (!limit.allowed) {
      return errorResponse('rate_limited', 429, { 'Retry-After': String(limit.retryAfterSeconds) });
    }
  }

  try {
    const accessToken = await deps.discord.exchangeCode(code);
    const discordUser = await deps.discord.getCurrentUser(accessToken);
    const instance = await deps.discord.getActivityInstance(instanceId);
    if (instance === null) return errorResponse('instance_not_found', 401);

    const guildId = instance.location.guild_id;
    if (typeof guildId !== 'string' || !SNOWFLAKE_RE.test(guildId)) {
      return errorResponse('guild_required', 400);
    }
    if (!instance.users.includes(discordUser.id)) return errorResponse('not_in_instance', 401);

    const globalName = discordUser.global_name;
    const user: SessionUser = {
      id: discordUser.id,
      displayName: sanitizeDisplayName(
        globalName !== undefined && globalName !== null && globalName !== ''
          ? globalName
          : discordUser.username,
      ),
    };
    const secret = await deps.createSession(guildId, user);
    // The access token is passed straight back for the SDK's authenticate(); never stored or logged.
    return json({
      token: await deps.formatToken(guildId, secret),
      accessToken,
      user: { id: user.id, name: user.displayName },
    });
  } catch (err) {
    if (err instanceof DiscordError) {
      return err.kind === 'auth_failed'
        ? errorResponse('discord_auth_failed', 401)
        : errorResponse('discord_unavailable', 503);
    }
    throw err;
  }
}
