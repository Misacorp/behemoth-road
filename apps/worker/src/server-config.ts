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
    /** Sign-in, per Activity instance: a burst of 10, then one every 5 seconds. */
    auth: { capacity: 10, refillPerSecond: 0.2, maxKeys: 5000 },
    /** Game requests, per player: a burst of 30, then one a second (polling is every 30 s). */
    game: { capacity: 30, refillPerSecond: 1, maxKeys: 100 },
  },
  /** How long a player's "may manage the server" answer is reused before Discord is asked again. */
  adminCacheMs: 10 * 60 * 1000,
  limits: {
    /** Bound on hex coordinates in a request; the creature walks one hex a day. */
    maxCoordinate: 100_000,
    /** Most steps in one move request. */
    maxPathLength: 32,
    /** Characters offered on joining, the plain one included (0..maxOffers-1). */
    maxOffers: 4,
  },
} as const;
