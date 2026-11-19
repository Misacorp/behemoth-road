/**
 * The game of one Discord server, inside its Durable Object (`guild-world.ts`). It owns the object's
 * SQLite database: the guild it serves, the game state (one JSON row with a version), the players and
 * their sessions. The object runs one request at a time, and every write here is one `transactionSync`.
 *
 * Every game rule goes through `game-core.ts` (the core package). Identity comes from the session only.
 * The seed stays in the stored state: only `toPlayerView` output leaves this file.
 */
import type { GuildApi } from './discord.ts';
import { DiscordError } from './discord.ts';
import { canManageGuild } from './discord-permissions.ts';
import {
  addCharacter,
  createGame,
  moveAlong,
  nextDay,
  offersFor,
  replaceCharacter,
  toPlayerView,
  type CharacterOffer,
  type CharacterResult,
  type GameState,
  type GameStateView,
  type RoleId,
} from './game-core.ts';
import { errorResponse, json, notFound, parseBody } from './http.ts';
import { applyMigrations } from './migrations.ts';
import { TokenBucketLimiter } from './ratelimit.ts';
import {
  EmptyBodySchema,
  MoveBodySchema,
  PickBodySchema,
  SINCE_RE,
  SNOWFLAKE_RE,
} from './schemas.ts';
import { SERVER_CONFIG } from './server-config.ts';
import { generateSessionSecret, hashSecret, parseAuthorization } from './session.ts';
import { nextOccurrence } from './time.ts';

export interface SessionUser {
  id: string;
  /** Sanitised Discord display name; shown as text only. */
  displayName: string;
}

export interface PlayerEntry {
  userId: string;
  name: string;
  characterId: string;
  role: string;
  joinedDay: number;
}

export interface PlayerView {
  version: number;
  day: number;
  you: { userId: string; characterId: string | null };
  game: GameStateView;
  players: PlayerEntry[];
  /** The characters this player may pick: only while they have no active character. */
  offers: CharacterOffer[] | null;
  devTools: boolean;
}

type Storage = Pick<DurableObjectStorage, 'sql' | 'transactionSync' | 'getAlarm' | 'setAlarm'>;

export interface GuildGameOptions {
  now(): number;
  /** A fresh game seed, 0 to 2^32 - 1. Production: `crypto.getRandomValues`; tests pass a fixed one. */
  newSeed(): number;
  /** DEV_TOOLS is on (staging and local only). */
  devTools: boolean;
  /** Read-only guild lookups for the admin check; null when there is no bot token (then nobody is admin). */
  guildApi: GuildApi | null;
  /** Local development only (`ENVIRONMENT` "local"): every player counts as a server admin. */
  everyoneIsAdmin: boolean;
}

/** The seed source of a deployed object: 32 random bits from the platform's CSPRNG. */
export function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
}

interface GameRow {
  state: GameState;
  version: number;
  nextTickAt: number;
}

type PlayerRow = {
  user_id: string;
  display_name: string;
  character_id: string | null;
  role: string | null;
  joined_day: number | null;
  attempts: number;
};

const { tick, sessions, rateLimits, adminCacheMs, maxCatchUpTicks } = SERVER_CONFIG;

export class GuildGame {
  private readonly limiter: TokenBucketLimiter;
  private readonly adminCache = new Map<string, { may: boolean; at: number }>();

  constructor(
    private readonly storage: Storage,
    private readonly options: GuildGameOptions,
  ) {
    this.limiter = new TokenBucketLimiter({ ...rateLimits.game, now: () => options.now() });
  }

  private get sql(): SqlStorage {
    return this.storage.sql;
  }

  /** Brings the schema up to date. Call inside `blockConcurrencyWhile`. */
  migrate(): void {
    applyMigrations(this.storage, this.sql);
  }

  // --- Sessions ---

  /**
   * Binds the guild, creates the game if this is the server's first sign-in, upserts the player and
   * creates a session. Returns the secret half of the token. Only the Worker calls this (RPC), after
   * Discord confirmed the user and the guild.
   */
  async createSession(guildId: string, user: SessionUser): Promise<string> {
    const secret = generateSessionSecret();
    const tokenHash = await hashSecret(secret);
    const t = this.options.now();
    this.storage.transactionSync(() => {
      this.bindGuild(guildId);
      this.ensureGame(t);
      this.sql.exec(
        'DELETE FROM sessions WHERE expires_at <= ? OR last_used_at <= ?',
        t,
        t - sessions.idleMs,
      );
      const before = this.player(user.id);
      this.sql.exec(
        `INSERT INTO players (user_id, display_name, created_at, last_seen_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET display_name = excluded.display_name, last_seen_at = excluded.last_seen_at`,
        user.id,
        user.displayName,
        t,
        t,
      );
      // A new name of someone on the map changes what everyone sees.
      if (before?.character_id != null && before.display_name !== user.displayName) {
        this.sql.exec('UPDATE game SET version = version + 1 WHERE id = 1');
      }
      this.sql.exec(
        'INSERT INTO sessions (token_hash, user_id, created_at, last_used_at, expires_at) VALUES (?, ?, ?, ?, ?)',
        tokenHash,
        user.id,
        t,
        t,
        t + sessions.absoluteMs,
      );
      this.sql.exec(
        `DELETE FROM sessions WHERE user_id = ? AND token_hash NOT IN (
           SELECT token_hash FROM sessions WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?
         )`,
        user.id,
        user.id,
        sessions.maxPerUser,
      );
    });
    await this.catchUpAndArm();
    return secret;
  }

  /** Records the guild on first use; a different guild later is a routing bug, so it throws. */
  private bindGuild(guildId: string): void {
    if (!SNOWFLAKE_RE.test(guildId)) throw new Error('invalid guild id');
    const stored = this.guildId();
    if (stored === null) {
      this.sql.exec('INSERT INTO guild_meta (id, guild_id) VALUES (1, ?)', guildId);
    } else if (stored !== guildId) {
      throw new Error('guild id does not match this Durable Object');
    }
  }

  private guildId(): string | null {
    const row = this.sql
      .exec<{ guild_id: string }>('SELECT guild_id FROM guild_meta WHERE id = 1')
      .toArray()[0];
    return row?.guild_id ?? null;
  }

  /** The session's user, or null if the secret is unknown or the session expired. */
  private async lookupSession(secret: string): Promise<SessionUser | null> {
    const tokenHash = await hashSecret(secret);
    const t = this.options.now();
    const row = this.sql
      .exec<{ user_id: string; display_name: string; last_used_at: number; expires_at: number }>(
        `SELECT s.user_id, p.display_name, s.last_used_at, s.expires_at
         FROM sessions s JOIN players p ON p.user_id = s.user_id WHERE s.token_hash = ?`,
        tokenHash,
      )
      .toArray()[0];
    if (row === undefined) return null;
    if (t >= row.expires_at || t - row.last_used_at >= sessions.idleMs) {
      this.sql.exec('DELETE FROM sessions WHERE token_hash = ?', tokenHash);
      return null;
    }
    if (t - row.last_used_at >= sessions.touchIntervalMs) {
      this.storage.transactionSync(() => {
        this.sql.exec('UPDATE sessions SET last_used_at = ? WHERE token_hash = ?', t, tokenHash);
        this.sql.exec('UPDATE players SET last_seen_at = ? WHERE user_id = ?', t, row.user_id);
      });
    }
    return { id: row.user_id, displayName: row.display_name };
  }

  // --- The game row ---

  /** Creates the game on the server's first sign-in, with a seed only this object knows. */
  private ensureGame(t: number): void {
    const exists = this.sql.exec('SELECT 1 FROM game WHERE id = 1').toArray().length > 0;
    if (exists) return;
    const state = createGame(this.options.newSeed());
    this.sql.exec(
      'INSERT INTO game (id, state, version, next_tick_at, created_at) VALUES (1, ?, 1, ?, ?)',
      JSON.stringify(state),
      nextOccurrence(t, tick.hour, tick.minute, tick.timeZone),
      t,
    );
  }

  private readGame(): GameRow | null {
    const row = this.sql
      .exec<{ state: string; version: number; next_tick_at: number }>(
        'SELECT state, version, next_tick_at FROM game WHERE id = 1',
      )
      .toArray()[0];
    if (row === undefined) return null;
    return {
      state: JSON.parse(row.state) as GameState,
      version: row.version,
      nextTickAt: row.next_tick_at,
    };
  }

  /** Writes a changed state and bumps the version. Call inside a transaction. */
  private writeGame(state: GameState, nextTickAt?: number): void {
    if (nextTickAt === undefined) {
      this.sql.exec(
        'UPDATE game SET state = ?, version = version + 1 WHERE id = 1',
        JSON.stringify(state),
      );
    } else {
      this.sql.exec(
        'UPDATE game SET state = ?, version = version + 1, next_tick_at = ? WHERE id = 1',
        JSON.stringify(state),
        nextTickAt,
      );
    }
  }

  private player(userId: string): PlayerRow | null {
    return (
      this.sql
        .exec<PlayerRow>(
          'SELECT user_id, display_name, character_id, role, joined_day, attempts FROM players WHERE user_id = ?',
          userId,
        )
        .toArray()[0] ?? null
    );
  }

  // --- The day tick ---

  /**
   * Runs every tick that is due (at most `maxCatchUpTicks`; older ones are skipped), in one
   * transaction, then makes sure the alarm is set for the next one.
   */
  private async catchUpAndArm(): Promise<void> {
    const t = this.options.now();
    this.storage.transactionSync(() => {
      const game = this.readGame();
      if (game === null || t < game.nextTickAt) return;
      let { state, nextTickAt } = game;
      for (let i = 0; i < maxCatchUpTicks && t >= nextTickAt; i++) {
        state = nextDay(state);
        nextTickAt = nextOccurrence(nextTickAt, tick.hour, tick.minute, tick.timeZone);
      }
      if (t >= nextTickAt) nextTickAt = nextOccurrence(t, tick.hour, tick.minute, tick.timeZone);
      this.writeGame(state, nextTickAt);
    });
    const game = this.readGame();
    if (game === null) return;
    const existing = await this.storage.getAlarm();
    if (existing === null || existing !== game.nextTickAt) {
      await this.storage.setAlarm(game.nextTickAt);
    }
  }

  /** The Durable Object's alarm: the scheduled day tick. Idempotent: an early or repeated alarm only re-arms. */
  async alarm(): Promise<void> {
    await this.catchUpAndArm();
  }

  // --- Requests ---

  /** Handles an API request the Worker forwarded after checking the token's MAC. */
  async handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    // Checked before the session too, so the dev routes do not exist at all with the dev tools off.
    if (pathname.startsWith('/api/dev/') && !this.options.devTools) return notFound();
    const token = parseAuthorization(request.headers.get('Authorization'));
    if (token === null || token.guildId !== this.guildId()) {
      return errorResponse('invalid_session', 401);
    }
    const user = await this.lookupSession(token.secret);
    if (user === null) return errorResponse('invalid_session', 401);

    const limit = this.limiter.take(user.id);
    if (!limit.allowed) {
      return errorResponse('rate_limited', 429, { 'Retry-After': String(limit.retryAfterSeconds) });
    }
    await this.catchUpAndArm();

    const route = `${request.method} ${pathname}`;
    switch (route) {
      case 'GET /api/game':
        return this.getGame(user, url.searchParams);
      case 'POST /api/game/join':
        return this.pick(user, request, 'join');
      case 'POST /api/game/replace':
        return this.pick(user, request, 'replace');
      case 'POST /api/game/move':
        return this.move(user, request);
      case 'POST /api/dev/next-day':
        return this.devNextDay(user, request);
      default:
        return notFound();
    }
  }

  private async getGame(user: SessionUser, params: URLSearchParams): Promise<Response> {
    const since = params.get('since');
    if (since !== null && !SINCE_RE.test(since)) return errorResponse('invalid_since', 400);
    const game = this.readGame();
    if (game === null) return errorResponse('no_game', 409);
    if (since !== null && Number(since) === game.version) return json({ unchanged: true });
    return json(await this.view(user, game));
  }

  /** Join (the first character) or replace (a lost one): the same pick of an offer and a role. */
  private async pick(
    user: SessionUser,
    request: Request,
    kind: 'join' | 'replace',
  ): Promise<Response> {
    const body = await parseBody(request, PickBodySchema);
    if (body === undefined) return errorResponse('invalid_body', 400);
    const refusal = this.storage.transactionSync((): string | null => {
      const game = this.readGame();
      const player = this.player(user.id);
      if (game === null || player === null) return 'no_game';
      const current =
        player.character_id === null
          ? undefined
          : game.state.characters.find((c) => c.id === player.character_id);
      // Join with a character already made answers the view unchanged, so a repeated tap is harmless.
      if (kind === 'join' && player.character_id !== null) return null;
      if (kind === 'replace' && current?.status !== 'lost') return 'not-lost';
      const offer = offersFor(game.state, user.id, player.attempts)[body.choice];
      if (offer === undefined) return 'invalid-choice';
      const id = `${user.id}.${String(player.attempts + 1)}`;
      const result: CharacterResult =
        kind === 'join' || player.character_id === null
          ? addCharacter(game.state, id, offer)
          : replaceCharacter(game.state, player.character_id, id, offer);
      if (!result.ok) return result.reason;
      this.writeGame(result.state);
      this.sql.exec(
        'UPDATE players SET character_id = ?, role = ?, joined_day = ?, attempts = attempts + 1 WHERE user_id = ?',
        id,
        body.role satisfies RoleId,
        result.state.day,
        user.id,
      );
      return null;
    });
    if (refusal !== null) return errorResponse(refusal, 409);
    return this.currentView(user);
  }

  private async move(user: SessionUser, request: Request): Promise<Response> {
    const body = await parseBody(request, MoveBodySchema);
    if (body === undefined) return errorResponse('invalid_body', 400);
    const refusal = this.storage.transactionSync((): string | null => {
      const game = this.readGame();
      const characterId = this.player(user.id)?.character_id ?? null;
      if (game === null) return 'no_game';
      if (body.version !== game.version) return 'stale';
      if (characterId === null) return 'no-character';
      const result = moveAlong(game.state, characterId, body.path);
      if (!result.ok) return result.reason;
      this.writeGame(result.state);
      return null;
    });
    if (refusal !== null) return errorResponse(refusal, 409);
    return this.currentView(user);
  }

  /** Staging only (the route is a 404 otherwise): a server admin runs the tick now. */
  private async devNextDay(user: SessionUser, request: Request): Promise<Response> {
    const body = await parseBody(request, EmptyBodySchema);
    if (body === undefined) return errorResponse('invalid_body', 400);
    let admin: boolean;
    try {
      admin = await this.isAdmin(user.id);
    } catch (err) {
      if (err instanceof DiscordError) return errorResponse('discord_unavailable', 503);
      throw err;
    }
    if (!admin) return errorResponse('forbidden', 403);
    this.storage.transactionSync(() => {
      const game = this.readGame();
      // The schedule is left alone: the next scheduled tick still comes at its time.
      if (game !== null) this.writeGame(nextDay(game.state));
    });
    return this.currentView(user);
  }

  /** Owner, Administrator or Manage Server, from Discord; cached for a few minutes per player. */
  private async isAdmin(userId: string): Promise<boolean> {
    if (this.options.everyoneIsAdmin) return true;
    const api = this.options.guildApi;
    const guildId = this.guildId();
    if (api === null || guildId === null) return false;
    const t = this.options.now();
    const cached = this.adminCache.get(userId);
    if (cached !== undefined && t - cached.at < adminCacheMs) return cached.may;
    const may = await canManageGuild(api, guildId, userId);
    this.adminCache.set(userId, { may, at: t });
    return may;
  }

  private async currentView(user: SessionUser): Promise<Response> {
    const game = this.readGame();
    if (game === null) return errorResponse('no_game', 409);
    return json(await this.view(user, game));
  }

  private async view(user: SessionUser, game: GameRow): Promise<PlayerView> {
    const rows = this.sql
      .exec<PlayerRow>(
        `SELECT user_id, display_name, character_id, role, joined_day, attempts FROM players
         WHERE character_id IS NOT NULL ORDER BY joined_day, user_id`,
      )
      .toArray();
    const players: PlayerEntry[] = rows.map((r) => ({
      userId: r.user_id,
      name: r.display_name,
      characterId: r.character_id ?? '',
      role: r.role ?? '',
      joinedDay: r.joined_day ?? 0,
    }));
    const me = this.player(user.id);
    const characterId = me?.character_id ?? null;
    const mine =
      characterId === null ? undefined : game.state.characters.find((c) => c.id === characterId);
    let devTools = false;
    if (this.options.devTools) {
      try {
        devTools = await this.isAdmin(user.id);
      } catch {
        // Discord could not answer: the control stays hidden until it can.
      }
    }
    return {
      version: game.version,
      day: game.state.day,
      you: { userId: user.id, characterId },
      game: toPlayerView(game.state),
      players,
      offers: mine?.status === 'active' ? null : offersFor(game.state, user.id, me?.attempts ?? 0),
      devTools,
    };
  }
}
