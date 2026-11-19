/**
 * The schema migrations of a guild's Durable Object database, and their runner (as in creatures).
 * `SCHEMA_VERSION` is the version of a fresh database: adding a migration to the end of the list raises
 * it by one. Never edit a released migration; add a new one.
 */

export type Migration = (sql: SqlStorage) => void;

/** Versioned schema migrations; index 0 is version 1. */
export const MIGRATIONS: readonly Migration[] = [
  (sql) => {
    // The guild this object serves, written on the first sign-in. The Worker verified it with Discord.
    sql.exec(`CREATE TABLE guild_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      guild_id TEXT NOT NULL
    )`);
    // The game: one row. `state` is the core's GameState as JSON (with the seed: it never leaves this
    // object). `version` goes up on every change a player can see. `next_tick_at` is when the next day
    // tick is due (UTC epoch ms).
    sql.exec(`CREATE TABLE game (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      state TEXT NOT NULL,
      version INTEGER NOT NULL,
      next_tick_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )`);
    // Everyone who has signed in, with their Discord display name. Their characters (name, role, the
    // day they joined) are in the game state, keyed by user id.
    sql.exec(`CREATE TABLE players (
      user_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL
    )`);
    // Only the SHA-256 of a session secret is stored; the secret lives in the client's memory.
    sql.exec(`CREATE TABLE sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES players(user_id),
      created_at INTEGER NOT NULL,
      last_used_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    )`);
    sql.exec('CREATE INDEX sessions_user_id ON sessions(user_id)');
  },
];

export const SCHEMA_VERSION = MIGRATIONS.length;

/**
 * Applies every migration whose version is not yet recorded, in order, each with its record in one
 * transaction, so each runs exactly once. The common case (up to date) reads one row.
 */
export function applyMigrations(
  storage: { transactionSync<T>(closure: () => T): T },
  sql: SqlStorage,
  list: readonly Migration[] = MIGRATIONS,
): void {
  sql.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
  const top = sql
    .exec<{ v: number | null }>('SELECT MAX(version) AS v FROM schema_version')
    .one().v;
  if (top === list.length) return;
  const applied = new Set(
    sql
      .exec<{ version: number }>('SELECT version FROM schema_version')
      .toArray()
      .map((r) => r.version),
  );
  list.forEach((migration, index) => {
    const version = index + 1;
    if (applied.has(version)) return;
    storage.transactionSync(() => {
      migration(sql);
      sql.exec('INSERT INTO schema_version (version) VALUES (?)', version);
    });
  });
}
