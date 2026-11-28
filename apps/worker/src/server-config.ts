/**
 * The server's tuning values, in one place. Game rule numbers (actions per day, window, player cap) live
 * in `@behemoth-road/core`'s config; these are the numbers only the server has.
 */
export const SERVER_CONFIG = {
  /** The day tick: a local wall-clock time in a named IANA zone (DST-safe, see `time.ts`). */
  tick: { hour: 6, minute: 0, timeZone: 'Europe/Helsinki' },
  /**
   * The most missed ticks run at once when the object wakes after a long sleep (an alarm is normally
   * on time; this only bounds the work after an outage). Ticks beyond it are skipped, not queued.
   */
  maxCatchUpTicks: 7,
  /**
   * Fast pace: how long after every active character has spent all their actions the early tick runs. It
   * lets the last animations finish and shows a short countdown.
   */
  fastTickDelayMs: 6000,
  sessions: {
    /** A session unused for this long is dead. */
    idleMs: 60 * 60 * 1000,
    /** Absolute lifetime, however active the session is. */
    absoluteMs: 12 * 60 * 60 * 1000,
    /** last_used_at is refreshed at most this often, to avoid a write on every request. */
    touchIntervalMs: 5 * 60 * 1000,
    /** Sessions kept per player (one per device, roughly); the oldest go first. */
    maxPerUser: 5,
  },
  rateLimits: {
    /** Sign-in, per Activity instance (client-chosen): a burst of 10, then one every 5 seconds. */
    auth: { capacity: 10, refillPerSecond: 0.2, maxKeys: 5000 },
    /** Sign-in, per client IP (`CF-Connecting-IP`), so rotating instance ids does not escape the limit. */
    authIp: { capacity: 20, refillPerSecond: 0.2, maxKeys: 5000 },
    /** Sign-in, all callers together (per isolate): a ceiling on Discord token exchanges. */
    authGlobal: { capacity: 60, refillPerSecond: 1, maxKeys: 1 },
    /** Game requests, per player: a burst of 30, then one a second (polling is every 30 s). */
    game: { capacity: 30, refillPerSecond: 1, maxKeys: 100 },
  },
  /**
   * Live sockets (`docs/design/live.md`): a push tells clients to fetch their view. Caps keep one guild
   * small; a socket with no ping for `staleMs` (clients ping every 60 s) is dead.
   */
  live: {
    ticketTtlMs: 30_000,
    ticketMaxPending: 200,
    maxSocketsPerUser: 3,
    maxSocketsPerGuild: 64,
    staleMs: 150_000,
    /** No socket outlives the session that could have made its ticket. */
    maxAgeMs: 12 * 60 * 60 * 1000,
  },
  /** Game events kept for `GET /api/game?since=` (the last this many; older ones are dropped). */
  eventLogSize: 100,
  /** How long a player's "may manage the server" answer is reused before Discord is asked again. */
  adminCacheMs: 10 * 60 * 1000,
  /**
   * Core tuning overrides for a game created where the dev tools are on (staging, local). None: staging
   * plays the full production season (decision "Staging plays the full season"). The dev tools (skip to
   * next day, fast rounds) are on there regardless; this is only the tuning.
   */
  devSeason: {} as Readonly<Record<string, never>>,
  limits: {
    /** Bound on hex coordinates in a request; the creature walks one hex a day. */
    maxCoordinate: 100_000,
    /** Most steps in one move request. */
    maxPathLength: 32,
    /** Most characters offered on joining, the plain one included (`offer` is 0..maxOffers-1). */
    maxOffers: 4,
  },
} as const;
