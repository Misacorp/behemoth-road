/**
 * The game of one Discord server, inside its Durable Object (`guild-world.ts`). It owns the object's
 * SQLite database: the guild it serves, the game state (one JSON row with a version), the players and
 * their sessions. The object runs one request at a time, and every write here is one `transactionSync`.
 *
 * Every game rule goes through `game-core.ts` (the core package). Identity comes from the session only.
 * The seed and the creature's nature and condition stay in the stored state: only `toPlayerView` output
 * and the viewer's `creatureSigns` leave this file.
 */
import type { GuildApi } from './discord.ts';
import { DiscordError } from './discord.ts';
import { canManageGuild } from './discord-permissions.ts';
import {
  addCharacter,
  addSeen,
  readSeen,
  type SeenId,
  characterOf,
  characterOffers,
  createGame,
  creatureSigns,
  glintsFor,
  loadGame,
  actWithEvents,
  OutdatedGameError,
  moveWithEvents,
  type EventResult,
  type GameEvent,
  tickWithEvents,
  isSeasonOver,
  replaceCharacter,
  toPlayerView,
  type CharacterOffer,
  type ConfigOverrides,
  type CreatureSigns,
  type Hex,
  type GameState,
  type GameStateView,
  type Seed,
} from './game-core.ts';
import { errorResponse, json, notFound, parseBody } from './http.ts';
import type { LiveHooks } from './live.ts';
import { applyMigrations } from './migrations.ts';
import { TokenBucketLimiter } from './ratelimit.ts';
import {
  ActBodySchema,
  EmptyBodySchema,
  PaceBodySchema,
  MoveBodySchema,
  PickBodySchema,
  SeenBodySchema,
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
  /** How days advance: on the daily schedule, or (staging) as soon as every active character is done. */
  pace: Pace;
  /** Fast pace: when the next day starts early (epoch ms), or null. */
  fastTickAt: number | null;
  /** The server clock when the view was built (epoch ms), so a client can measure its own clock's skew. */
  now: number;
  /** `admin`: may run the staging "next day"; always false with the dev tools off. */
  you: {
    userId: string;
    characterId: string | null;
    admin: boolean;
    /** What this player was shown once (the core's `SEEN_IDS`), so the intro and the hints never repeat. */
    seen: string[];
    /**
     * The game day and version of this player's previous visit (null on their first), for the "while you
     * were away" recap. `POST /api/me/visit` moves them on to now.
     */
    lastDay: number | null;
    lastVersion: number | null;
  };
  /** The characters this player may pick (the rolls, then the plain one): only while they have no active character. */
  offers: CharacterOffer[] | null;
  game: GameStateView;
  /**
   * What this viewer reads off the creature, from their active character (a keeper sees clearer and sees
   * cues). Per viewer, a pure function of the stored state, so it changes only with the version.
   */
  signs: CreatureSigns;
  /**
   * Hexes that glint for this viewer (the scout's glints skill): unexplored hexes near their character
   * that hold something, never what. Per viewer, a pure function of the stored state; empty without the
   * skill. Never part of the shared `game` view.
   */
  glints: Hex[];
  players: PlayerEntry[];
  devTools: boolean;
}

type Storage = Pick<
  DurableObjectStorage,
  'sql' | 'transactionSync' | 'getAlarm' | 'setAlarm' | 'deleteAlarm'
>;

/**
 * The core tuning overrides a new game is created with: the short dev season where the dev tools are on
 * (staging, local), the core defaults everywhere else. `devTools` is true only for `DEV_TOOLS` "on", so
 * any other value (or none) gives production's season.
 */
export const seasonConfig = (devTools: boolean): ConfigOverrides =>
  devTools ? SERVER_CONFIG.devSeason : {};

export interface GuildGameOptions {
  now(): number;
  /** A fresh 128-bit game seed. Production: the core's `newSeed` (Web Crypto); tests pass a fixed one. */
  newSeed(): Seed;
  /** The public cosmetic seed of a new game. Production: the core's `newArtSeed`. */
  newArtSeed(): number;
  /** DEV_TOOLS is on (staging and local only). */
  devTools: boolean;
  /** Read-only guild lookups for the admin check; null when there is no bot token (then nobody is admin). */
  guildApi: GuildApi | null;
  /** Local development only (`ENVIRONMENT` "local"): every player counts as a server admin. */
  everyoneIsAdmin: boolean;
  /** Core tuning overrides for every new game: `seasonConfig(devTools)`; tests may pass their own. */
  gameConfig: ConfigOverrides;
  /** The live sockets (`live.ts`); absent or null where there are none (tests that do not need them). */
  live?: LiveHooks | null;
}

interface CachedSession {
  userId: string;
  displayName: string;
  lastUsedAt: number;
  expiresAt: number;
}

interface GameRow {
  state: GameState;
  version: number;
  nextTickAt: number;
  pace: Pace;
  /** Fast pace: when the early tick is due, or null. */
  fastTickAt: number | null;
}

type PlayerRow = {
  user_id: string;
  display_name: string;
  seen: string;
  last_day: number | null;
  last_version: number | null;
};

/** A stored game this build cannot read: corrupt JSON, or content it does not have (a newer build's). */
export class GameUnreadable extends Error {
  constructor() {
    super('stored game unreadable');
    this.name = 'GameUnreadable';
  }
}

/** A stored seen record (JSON text) as the known ids it holds; anything unreadable is an empty record. */
function readSeenText(text: string): SeenId[] {
  try {
    return readSeen(JSON.parse(text));
  } catch {
    return [];
  }
}

function readState(text: string): GameState {
  try {
    return loadGame(JSON.parse(text));
  } catch {
    throw new GameUnreadable();
  }
}

/** A game event as clients get it: the core's event and the game version that produced it. */
export type VersionedEvent = GameEvent & { readonly version: number };

type EventStop = Extract<EventResult, { ok: true }>['stopped'];

const { eventLogSize, tick, sessions, rateLimits, adminCacheMs, maxCatchUpTicks, fastTickDelayMs } =
  SERVER_CONFIG;

export type Pace = 'daily' | 'fast';

/** Fast pace waits for this: the season runs and every active character has spent all their actions. */
function everyoneSpent(state: GameState): boolean {
  if (isSeasonOver(state)) return false;
  const active = state.characters.filter((c) => c.status === 'active');
  return active.length > 0 && active.every((c) => c.actionsLeft === 0);
}

export class GuildGame {
  private readonly limiter: TokenBucketLimiter;
  private readonly adminCache = new Map<string, { may: boolean; at: number }>();
  /**
   * What the object keeps in memory so a request that changes nothing reads no storage: the game row (as
   * last read; dropped by every write transaction and reloaded on the next read), the guild id, the live
   * sessions, and the time the alarm is known to be set for (`undefined`: not known yet).
   */
  private cachedGame: GameRow | null = null;
  private cachedGuildId: string | null = null;
  private readonly cachedSessions = new Map<string, CachedSession>();
  private armedFor: number | null | undefined = undefined;
  /** The highest version written in the running write transaction, for the one push after its commit. */
  private pendingVersion: number | null = null;

  constructor(
    private readonly storage: Storage,
    private readonly options: GuildGameOptions,
  ) {
    this.limiter = new TokenBucketLimiter({ ...rateLimits.game, now: () => options.now() });
  }

  private get sql(): SqlStorage {
    return this.storage.sql;
  }

  /** Forgets what is kept in memory. Only for tests that change storage behind the object's back. */
  dropMemory(): void {
    this.cachedGame = null;
    this.cachedGuildId = null;
    this.cachedSessions.clear();
    this.armedFor = undefined;
  }

  /**
   * A transaction that may change the game: the in-memory game is dropped when it starts (a read inside
   * reloads it) and again if it fails, so a rolled-back write never leaves a state in memory that is not
   * in storage.
   */
  private tx<T>(fn: () => T): T {
    this.cachedGame = null;
    this.pendingVersion = null;
    let result: T;
    try {
      result = this.storage.transactionSync(fn);
    } catch (err) {
      this.cachedGame = null;
      // A rolled-back write is never announced.
      this.pendingVersion = null;
      throw err;
    }
    // One push per write transaction, after it committed (a client that asks at once sees the version).
    const version = this.pendingVersion;
    this.pendingVersion = null;
    if (version !== null) this.options.live?.changed(version);
    return result;
  }

  /** Bumps the game's version without a state change (a name, the pace). Call inside a transaction. */
  private bumpVersion(): void {
    this.cachedGame = null;
    const row = this.sql
      .exec<{ version: number }>(
        'UPDATE game SET version = version + 1 WHERE id = 1 RETURNING version',
      )
      .one();
    this.pendingVersion = row.version;
  }

  /** The game's version (for a socket's `hello`), or null when there is no readable game. */
  version(): number | null {
    return this.readGameOrNull()?.version ?? null;
  }

  /** The guild this object serves, or null before the first sign-in. */
  boundGuildId(): string | null {
    return this.guildId();
  }

  /**
   * Whether the player has a session that is still valid. Looks at the sessions kept in memory first and
   * reads one row only on a miss (the cache is cleared whenever someone signs in).
   */
  hasSession(userId: string): boolean {
    const t = this.options.now();
    const valid = (expiresAt: number, lastUsedAt: number): boolean =>
      t < expiresAt && t - lastUsedAt < sessions.idleMs;
    for (const row of this.cachedSessions.values()) {
      if (row.userId === userId && valid(row.expiresAt, row.lastUsedAt)) return true;
    }
    return this.sql
      .exec<{ expires_at: number; last_used_at: number }>(
        'SELECT expires_at, last_used_at FROM sessions WHERE user_id = ?',
        userId,
      )
      .toArray()
      .some((r) => valid(r.expires_at, r.last_used_at));
  }

  /** Brings the schema up to date. Call inside `blockConcurrencyWhile`. */
  migrate(): void {
    applyMigrations(this.storage, this.sql);
    this.replaceOutdatedGame();
  }

  /**
   * Before a stable release there is no migration (Misa: everything can be wiped): a game stored with
   * older content is replaced by a new game for this server, in one transaction. The players stay and
   * rejoin with new offers; the version keeps counting up, so no client's `since` matches the new game.
   * A newer or unreadable stored game is left alone (a rollback must not wipe a newer game); requests then
   * answer 503 until a build that can read it is deployed.
   */
  private replaceOutdatedGame(): void {
    this.tx(() => {
      const row = this.sql
        .exec<{ state: string; version: number }>('SELECT state, version FROM game WHERE id = 1')
        .toArray()[0];
      if (row === undefined) return;
      try {
        loadGame(JSON.parse(row.state));
        return;
      } catch (err) {
        // Only an older content version is replaced; anything else is left for `readGame` to refuse.
        if (!(err instanceof OutdatedGameError)) return;
      }
      // Its schedule starts from now, so a long-outdated game's missed ticks are not run on the new one.
      const t = this.options.now();
      this.replaceGame(nextOccurrence(t, tick.hour, tick.minute, tick.timeZone));
    });
  }

  /** A fresh game with a new seed, from these options' config. */
  private newState(): GameState {
    return createGame(this.options.newSeed(), {
      artSeed: this.options.newArtSeed(),
      config: this.options.gameConfig,
    });
  }

  /**
   * Replaces the stored game with a new one (no characters; players join again) and drops the old game's
   * events, so every client that saw it is told it missed some (`eventsTruncated`) and reloads. The
   * version keeps counting up. Call inside a transaction.
   */
  private replaceGame(nextTickAt?: number): number {
    const version = this.writeGame(this.newState(), nextTickAt);
    this.sql.exec('DELETE FROM events');
    this.sql.exec('UPDATE game SET events_pruned_through = ? WHERE id = 1', version);
    return version;
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
    this.cachedSessions.clear();
    this.tx(() => {
      this.bindGuild(guildId);
      this.ensureGame(t);
      this.sql.exec(
        'DELETE FROM sessions WHERE expires_at <= ? OR last_used_at <= ?',
        t,
        t - sessions.idleMs,
      );
      const before = this.player(user.id);
      const game = this.readGameOrNull();
      this.sql.exec(
        `INSERT INTO players (user_id, display_name, created_at, last_seen_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET display_name = excluded.display_name, last_seen_at = excluded.last_seen_at`,
        user.id,
        user.displayName,
        t,
        t,
      );
      // A new name of someone on the map changes what everyone sees.
      if (
        before !== null &&
        before.display_name !== user.displayName &&
        game !== null &&
        characterOf(game.state, user.id) !== undefined
      ) {
        this.bumpVersion();
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
    try {
      await this.catchUpAndArm();
    } catch (err) {
      // Sign-in still works; game requests answer 503 until the game can be read.
      if (!(err instanceof GameUnreadable)) throw err;
    }
    return secret;
  }

  /** Records the guild on first use; a different guild later is a routing bug, so it throws. */
  private bindGuild(guildId: string): void {
    if (!SNOWFLAKE_RE.test(guildId)) throw new Error('invalid guild id');
    const stored = this.guildId();
    if (stored === null) {
      this.sql.exec('INSERT INTO guild_meta (id, guild_id) VALUES (1, ?)', guildId);
      this.cachedGuildId = guildId;
    } else if (stored !== guildId) {
      throw new Error('guild id does not match this Durable Object');
    }
  }

  private guildId(): string | null {
    if (this.cachedGuildId !== null) return this.cachedGuildId;
    const row = this.sql
      .exec<{ guild_id: string }>('SELECT guild_id FROM guild_meta WHERE id = 1')
      .toArray()[0];
    this.cachedGuildId = row?.guild_id ?? null;
    return this.cachedGuildId;
  }

  /** The session's user, or null if the secret is unknown or the session expired. Live sessions are kept in memory. */
  private async lookupSession(secret: string): Promise<SessionUser | null> {
    const tokenHash = await hashSecret(secret);
    const t = this.options.now();
    let row = this.cachedSessions.get(tokenHash);
    if (row === undefined) {
      const found = this.sql
        .exec<{
          user_id: string;
          display_name: string;
          last_used_at: number;
          expires_at: number;
        }>(
          `SELECT s.user_id, p.display_name, s.last_used_at, s.expires_at
         FROM sessions s JOIN players p ON p.user_id = s.user_id WHERE s.token_hash = ?`,
          tokenHash,
        )
        .toArray()[0];
      if (found === undefined) return null;
      row = {
        userId: found.user_id,
        displayName: found.display_name,
        lastUsedAt: found.last_used_at,
        expiresAt: found.expires_at,
      };
    }
    if (t >= row.expiresAt || t - row.lastUsedAt >= sessions.idleMs) {
      this.cachedSessions.delete(tokenHash);
      this.sql.exec('DELETE FROM sessions WHERE token_hash = ?', tokenHash);
      return null;
    }
    if (t - row.lastUsedAt >= sessions.touchIntervalMs) {
      const userId = row.userId;
      this.storage.transactionSync(() => {
        this.sql.exec('UPDATE sessions SET last_used_at = ? WHERE token_hash = ?', t, tokenHash);
        this.sql.exec('UPDATE players SET last_seen_at = ? WHERE user_id = ?', t, userId);
      });
      row = { ...row, lastUsedAt: t };
    }
    this.cachedSessions.set(tokenHash, row);
    return { id: row.userId, displayName: row.displayName };
  }

  // --- The game row ---

  /** Creates the game on the server's first sign-in, with a seed only this object knows. */
  private ensureGame(t: number): void {
    const exists = this.sql.exec('SELECT 1 FROM game WHERE id = 1').toArray().length > 0;
    if (exists) return;
    const state = this.newState();
    this.sql.exec(
      'INSERT INTO game (id, state, version, next_tick_at, created_at) VALUES (1, ?, 1, ?, ?)',
      JSON.stringify(state),
      nextOccurrence(t, tick.hour, tick.minute, tick.timeZone),
      t,
    );
  }

  /** The stored game, or null before the first sign-in. Throws `GameUnreadable` for a stored game this build cannot read. */
  private readGame(): GameRow | null {
    if (this.cachedGame !== null) return this.cachedGame;
    const row = this.sql
      .exec<{
        state: string;
        version: number;
        next_tick_at: number;
        pace: string;
        fast_tick_at: number | null;
      }>('SELECT state, version, next_tick_at, pace, fast_tick_at FROM game WHERE id = 1')
      .toArray()[0];
    if (row === undefined) return null;
    this.cachedGame = {
      // Refuses a state made with content this build does not have, rather than misreading it.
      state: readState(row.state),
      version: row.version,
      nextTickAt: row.next_tick_at,
      pace: row.pace === 'fast' ? 'fast' : 'daily',
      fastTickAt: row.fast_tick_at,
    };
    return this.cachedGame;
  }

  /** The stored game, or null when there is none or it cannot be read (for paths that must not fail). */
  private readGameOrNull(): GameRow | null {
    try {
      return this.readGame();
    } catch (err) {
      if (err instanceof GameUnreadable) return null;
      throw err;
    }
  }

  /** Writes a changed state and bumps the version. Call inside a transaction. */
  private writeGame(
    state: GameState,
    nextTickAt?: number,
    events: readonly GameEvent[] = [],
  ): number {
    this.writeState(state, nextTickAt);
    const version = this.sql
      .exec<{ version: number }>('SELECT version FROM game WHERE id = 1')
      .one().version;
    this.logEvents(version, events);
    this.pendingVersion = version;
    return version;
  }

  /**
   * Keeps the events of a change, stamped with its version, and drops the oldest past `eventLogSize`,
   * remembering the highest dropped version. Call inside a transaction.
   */
  private logEvents(version: number, events: readonly GameEvent[]): void {
    for (const event of events) {
      this.sql.exec(
        'INSERT INTO events (version, event) VALUES (?, ?)',
        version,
        JSON.stringify(event),
      );
    }
    const dropped = this.sql
      .exec<{ v: number | null }>(
        // Versions only grow with `seq`, so the newest dropped row has the highest dropped version: one
        // primary-key lookup. (`MAX(version) ... WHERE seq <= ...` read the whole index on every write.)
        'SELECT version AS v FROM events WHERE seq <= (SELECT MAX(seq) FROM events) - ? ORDER BY seq DESC LIMIT 1',
        eventLogSize,
      )
      .toArray()[0]?.v;
    if (dropped === undefined) return;
    this.sql.exec('DELETE FROM events WHERE version <= ?', dropped);
    this.sql.exec(
      'UPDATE game SET events_pruned_through = MAX(events_pruned_through, ?) WHERE id = 1',
      dropped,
    );
  }

  /** The kept events after `since`, oldest first, each with its version, and whether some were dropped. */
  private eventsSince(since: number): { events: VersionedEvent[]; eventsTruncated: boolean } {
    const rows = this.sql
      .exec<{ version: number; event: string }>(
        'SELECT version, event FROM events WHERE version > ? ORDER BY version, seq',
        since,
      )
      .toArray();
    const pruned = this.sql
      .exec<{ p: number }>('SELECT events_pruned_through AS p FROM game WHERE id = 1')
      .one().p;
    return {
      events: rows.map((r) => ({ ...(JSON.parse(r.event) as GameEvent), version: r.version })),
      eventsTruncated: since < pruned,
    };
  }

  private writeState(state: GameState, nextTickAt?: number): void {
    this.cachedGame = null;
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
    this.syncFastTick(state);
    this.cachedGame = null;
  }

  /**
   * Fast pace: after any change, schedules the early tick when everyone is done (keeping an earlier
   * schedule that still holds, so a harmless write does not push it back), else clears it. Daily pace never
   * has one. Call inside a transaction.
   */
  private syncFastTick(state: GameState): void {
    const row = this.sql
      .exec<{ pace: string; fast_tick_at: number | null }>(
        'SELECT pace, fast_tick_at FROM game WHERE id = 1',
      )
      .one();
    let next: number | null = null;
    if (row.pace === 'fast' && everyoneSpent(state)) {
      next = row.fast_tick_at ?? this.options.now() + fastTickDelayMs;
    }
    if (next !== row.fast_tick_at) {
      this.cachedGame = null;
      this.sql.exec('UPDATE game SET fast_tick_at = ? WHERE id = 1', next);
    }
  }

  private player(userId: string): PlayerRow | null {
    return (
      this.sql
        .exec<PlayerRow>(
          'SELECT user_id, display_name, seen, last_day, last_version FROM players WHERE user_id = ?',
          userId,
        )
        .toArray()[0] ?? null
    );
  }

  // --- The day tick ---

  /**
   * Runs every tick that is due (at most `maxCatchUpTicks`; older ones are skipped), in one
   * transaction, then makes sure the alarm is set for the next one. Once the season is over no tick
   * runs and no alarm is set: the ended game stays as it is until a new season replaces it.
   */
  private async catchUpAndArm(): Promise<void> {
    const t = this.options.now();
    const due = this.readGame();
    const dailyDue = due !== null && t >= due.nextTickAt && !isSeasonOver(due.state);
    if (dailyDue)
      this.tx(() => {
        const game = this.readGame();
        if (game === null || t < game.nextTickAt || isSeasonOver(game.state)) return;
        let { state, nextTickAt } = game;
        // Each tick is its own version, so its events are stamped with it. The tick that ends the season
        // is the last one.
        for (let i = 0; i < maxCatchUpTicks && t >= nextTickAt && !isSeasonOver(state); i++) {
          const ticked = tickWithEvents(state);
          state = ticked.state;
          nextTickAt = nextOccurrence(nextTickAt, tick.hour, tick.minute, tick.timeZone);
          // Ticks beyond the limit are skipped: the schedule jumps to the next one after now.
          if (i === maxCatchUpTicks - 1 && t >= nextTickAt) {
            nextTickAt = nextOccurrence(t, tick.hour, tick.minute, tick.timeZone);
          }
          this.writeGame(state, nextTickAt, ticked.events);
        }
      });
    // Fast pace: the early tick, once, when it is due (the same tick as the daily one; the schedule stays).
    const early = this.readGame();
    if (early !== null && early.fastTickAt !== null && t >= early.fastTickAt)
      this.tx(() => {
        const game = this.readGame();
        if (game === null || game.fastTickAt === null || t < game.fastTickAt) return;
        if (game.pace !== 'fast' || !everyoneSpent(game.state)) {
          this.syncFastTick(game.state);
          return;
        }
        const ticked = tickWithEvents(game.state);
        this.writeGame(ticked.state, undefined, ticked.events);
      });
    await this.armAlarm();
  }

  /** Sets the one alarm to the earliest of the daily tick and the fast tick; none once the season is over. */
  private async armAlarm(): Promise<void> {
    const game = this.readGame();
    if (game === null) return;
    if (isSeasonOver(game.state)) {
      if (this.armedFor !== null) {
        if ((await this.storage.getAlarm()) !== null) await this.storage.deleteAlarm();
        this.armedFor = null;
      }
      return;
    }
    const due =
      game.fastTickAt === null ? game.nextTickAt : Math.min(game.nextTickAt, game.fastTickAt);
    if (this.armedFor === due) return;
    if ((await this.storage.getAlarm()) !== due) await this.storage.setAlarm(due);
    this.armedFor = due;
  }

  /** The Durable Object's alarm: the scheduled day tick. Idempotent: an early or repeated alarm only re-arms. */
  async alarm(): Promise<void> {
    // The alarm that just fired is gone from storage.
    this.armedFor = null;
    try {
      await this.catchUpAndArm();
    } catch (err) {
      // An unreadable game: no tick and no new alarm (a throwing alarm is retried); the next request or
      // sign-in after a fixing deploy arms it again.
      if (!(err instanceof GameUnreadable)) throw err;
      console.error('game unreadable; the tick is paused');
    }
  }

  // --- Requests ---

  /** Handles an API request the Worker forwarded after checking the token's MAC. */
  async handle(request: Request): Promise<Response> {
    try {
      return await this.handleRequest(request);
    } catch (err) {
      if (err instanceof GameUnreadable) return errorResponse('game_unavailable', 503);
      throw err;
    }
  }

  private async handleRequest(request: Request): Promise<Response> {
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

    const response = await this.route(user, request, url);
    // A change may have scheduled or cleared the fast tick: the alarm follows it.
    if (request.method === 'POST') await this.armAlarm();
    return response;
  }

  private route(user: SessionUser, request: Request, url: URL): Promise<Response> | Response {
    const { pathname } = url;
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
      case 'POST /api/game/act':
        return this.act(user, request);
      case 'POST /api/me/seen':
        return this.markSeen(user, request);
      case 'POST /api/me/visit':
        return this.visit(user, request);
      case 'POST /api/live/ticket':
        return this.liveTicket(user, request);
      case 'POST /api/dev/next-day':
        return this.devNextDay(user, request);
      case 'POST /api/dev/pace':
        return this.devPace(user, request);
      case 'POST /api/dev/new-season':
        return this.devNewSeason(user, request);
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
    // Without `since` (a first load) there is nothing to replay; with it, every kept event after it.
    const log =
      since === null ? { events: [], eventsTruncated: false } : this.eventsSince(Number(since));
    return json({ ...(await this.view(user, game)), ...log });
  }

  /**
   * `POST /api/me/visit`: moves the session player's "last visit" (the day and version the recap compares
   * with) to the game as it is now. The client sends it once per open and when the day turns under an open
   * page. A read of the game stays read-only: nothing is written by a `GET`.
   */
  private async visit(user: SessionUser, request: Request): Promise<Response> {
    const body = await parseBody(request, EmptyBodySchema);
    if (body === undefined) return errorResponse('invalid_body', 400);
    const game = this.readGame();
    if (game === null) return errorResponse('no_game', 409);
    this.tx(() => {
      this.sql.exec(
        `UPDATE players SET last_day = ?, last_version = ?
         WHERE user_id = ? AND (last_day IS NOT ? OR last_version IS NOT ?)`,
        game.state.day,
        game.version,
        user.id,
        game.state.day,
        game.version,
      );
    });
    return json({ ok: true });
  }

  /**
   * `POST /api/me/seen`: adds ids to the session player's seen record (a union; an id is never removed) and
   * answers it. The player is the session's, never the body's. Not a game change: the version stays.
   */
  private async markSeen(user: SessionUser, request: Request): Promise<Response> {
    const body = await parseBody(request, SeenBodySchema);
    if (body === undefined) return errorResponse('invalid_body', 400);
    const seen = this.tx(() => {
      const row = this.player(user.id);
      if (row === null) return null;
      const next = addSeen(readSeenText(row.seen), body.ids);
      const text = JSON.stringify(next);
      if (text !== row.seen) {
        this.sql.exec('UPDATE players SET seen = ? WHERE user_id = ?', text, user.id);
      }
      return next;
    });
    if (seen === null) return errorResponse('invalid_session', 401);
    return json({ seen });
  }

  /** A one-time ticket for a live socket, for the session's player. 404 where the flag is off. */
  private async liveTicket(user: SessionUser, request: Request): Promise<Response> {
    const live = this.options.live;
    if (live === undefined || live === null || !live.enabled) return notFound();
    const body = await parseBody(request, EmptyBodySchema);
    if (body === undefined) return errorResponse('invalid_body', 400);
    const guildId = this.guildId();
    if (guildId === null) return errorResponse('no_game', 409);
    return json({ ticket: await live.mintTicket(guildId, user.id) });
  }

  /** Join (the first character) or replace (a lost one): the same pick of an offer and a role. */
  private async pick(
    user: SessionUser,
    request: Request,
    kind: 'join' | 'replace',
  ): Promise<Response> {
    const body = await parseBody(request, PickBodySchema);
    if (body === undefined) return errorResponse('invalid_body', 400);
    const refusal = this.tx((): string | null => {
      const game = this.readGame();
      if (game === null) return 'no_game';
      // Join with a character already made answers the view unchanged, so a repeated tap is harmless.
      if (kind === 'join' && characterOf(game.state, user.id) !== undefined) return null;
      const request = { userId: user.id, offer: body.offer, role: body.role };
      const result =
        kind === 'join' ? addCharacter(game.state, request) : replaceCharacter(game.state, request);
      if (!result.ok) return result.reason;
      this.writeGame(result.state);
      return null;
    });
    if (refusal !== null) return errorResponse(refusal, 409);
    return this.currentView(user);
  }

  private async move(user: SessionUser, request: Request): Promise<Response> {
    const body = await parseBody(request, MoveBodySchema);
    if (body === undefined) return errorResponse('invalid_body', 400);
    return this.withOwnCharacter(user, body.version, (state, id) =>
      moveWithEvents(state, id, body.path),
    );
  }

  /** `POST /api/game/act`: an action (survey, gather, work a site, build, light a fire, feed, linger) by the player's own character. */
  private async act(user: SessionUser, request: Request): Promise<Response> {
    const body = await parseBody(request, ActBodySchema);
    if (body === undefined) return errorResponse('invalid_body', 400);
    return this.withOwnCharacter(user, body.version, (state, id) =>
      actWithEvents(state, id, body.action),
    );
  }

  /**
   * Runs a rule for the player's newest character (a lost one is refused by the core) against the version
   * the client saw, in one transaction. Answers the new view with what happened (`events`, and `stopped`
   * when a trap ended a walk), or
   * `409 { error }` for a stale version or a refusal.
   */
  private async withOwnCharacter(
    user: SessionUser,
    version: number,
    rule: (state: GameState, characterId: string) => EventResult,
  ): Promise<Response> {
    let outcome: { events: readonly VersionedEvent[]; stopped: EventStop } = {
      events: [],
      stopped: null,
    };
    const refusal = this.tx((): string | null => {
      const game = this.readGame();
      if (game === null) return 'no_game';
      if (version !== game.version) return 'stale';
      const character = characterOf(game.state, user.id);
      if (character === undefined) return 'no-character';
      const result = rule(game.state, character.id);
      if (!result.ok) return result.reason;
      const written = this.writeGame(result.state, undefined, result.events);
      outcome = {
        events: result.events.map((e) => ({ ...e, version: written })),
        stopped: result.stopped,
      };
      return null;
    });
    if (refusal !== null) return errorResponse(refusal, 409);
    const game = this.readGame();
    if (game === null) return errorResponse('no_game', 409);
    return json({ ...(await this.view(user, game)), ...outcome });
  }

  /** A dev route's checks: an empty body and a server admin. Null when both hold, else the answer. */
  private async devGate(user: SessionUser, request: Request): Promise<Response | null> {
    const body = await parseBody(request, EmptyBodySchema);
    if (body === undefined) return errorResponse('invalid_body', 400);
    let admin: boolean;
    try {
      admin = await this.isAdmin(user.id);
    } catch (err) {
      if (err instanceof DiscordError) return errorResponse('discord_unavailable', 503);
      throw err;
    }
    return admin ? null : errorResponse('forbidden', 403);
  }

  /**
   * Staging only (the route is a 404 otherwise): a server admin runs the tick now. Once the season is
   * over it changes nothing and answers the view as it is.
   */
  private async devNextDay(user: SessionUser, request: Request): Promise<Response> {
    const refused = await this.devGate(user, request);
    if (refused !== null) return refused;
    this.tx(() => {
      const game = this.readGame();
      // The schedule is left alone: the next scheduled tick still comes at its time.
      if (game !== null && !isSeasonOver(game.state)) {
        const ticked = tickWithEvents(game.state);
        this.writeGame(ticked.state, undefined, ticked.events);
      }
    });
    return this.currentView(user);
  }

  /** Staging only (404 otherwise): a server admin sets the pace. Bumps the version, so every client sees it. */
  private async devPace(user: SessionUser, request: Request): Promise<Response> {
    const body = await parseBody(request, PaceBodySchema);
    if (body === undefined) return errorResponse('invalid_body', 400);
    let admin: boolean;
    try {
      admin = await this.isAdmin(user.id);
    } catch (err) {
      if (err instanceof DiscordError) return errorResponse('discord_unavailable', 503);
      throw err;
    }
    if (!admin) return errorResponse('forbidden', 403);
    this.tx(() => {
      const game = this.readGame();
      if (game === null || game.pace === body.pace) return;
      this.sql.exec('UPDATE game SET pace = ? WHERE id = 1', body.pace);
      this.bumpVersion();
      this.syncFastTick(game.state);
    });
    await this.catchUpAndArm();
    return this.currentView(user);
  }

  /**
   * Staging only (the route is a 404 otherwise): a server admin starts a new season, at any time. A new
   * game with a new seed replaces the old one; every character is gone, so players join again (their
   * sessions stay). The next tick is scheduled afresh from now.
   */
  private async devNewSeason(user: SessionUser, request: Request): Promise<Response> {
    const refused = await this.devGate(user, request);
    if (refused !== null) return refused;
    const t = this.options.now();
    this.tx(() => {
      if (this.readGame() === null) return;
      this.replaceGame(nextOccurrence(t, tick.hour, tick.minute, tick.timeZone));
    });
    await this.catchUpAndArm();
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
      .exec<PlayerRow>('SELECT user_id, display_name, seen, last_day, last_version FROM players')
      .toArray();
    const names = new Map(rows.map((r) => [r.user_id, r.display_name]));
    const own = rows.find((r) => r.user_id === user.id);
    // One entry per player who has a character: their newest one.
    const players: PlayerEntry[] = [];
    for (const userId of new Set(game.state.characters.map((c) => c.userId))) {
      const character = characterOf(game.state, userId);
      if (character === undefined) continue;
      players.push({
        userId,
        name: names.get(userId) ?? character.name,
        characterId: character.id,
        role: character.role,
        joinedDay: character.joinedDay,
      });
    }
    const mine = characterOf(game.state, user.id);
    let admin = false;
    if (this.options.devTools) {
      try {
        admin = await this.isAdmin(user.id);
      } catch {
        // Discord could not answer: the control stays hidden until it can.
      }
    }
    return {
      version: game.version,
      day: game.state.day,
      pace: game.pace,
      fastTickAt: game.fastTickAt,
      now: this.options.now(),
      you: {
        userId: user.id,
        characterId: mine?.id ?? null,
        admin,
        seen: readSeenText(own?.seen ?? '[]'),
        lastDay: own?.last_day ?? null,
        lastVersion: own?.last_version ?? null,
      },
      offers: mine?.status === 'active' ? null : characterOffers(game.state, user.id),
      game: toPlayerView(game.state),
      signs: creatureSigns(game.state, mine?.status === 'active' ? mine.id : null),
      glints: glintsFor(game.state, mine?.status === 'active' ? mine.id : null),
      players,
      devTools: this.options.devTools,
    };
  }
}
