/**
 * Rows read per source (`docs/design/live.md`, adapted from the creatures app's meter after its rows-read
 * incident). Cloudflare's free tier allows 5,000,000 Durable Object `rows_read` a day across the account,
 * staging included. Every SQL statement returns a cursor whose `rowsRead` is the number of rows the
 * database looked at; this wraps the object's `SqlStorage`, keeps the cursors it hands out and, at the end
 * of a request, an alarm or a socket handler, adds their sum to that source's counter (in memory).
 *
 * A source is `start` (constructor and migration), `alarm`, `socket` (upgrades and hibernation handlers) or
 * `request:<route>` for a known route (`other` for anything else, so a source never holds an id or anything
 * a player typed). Attribution is approximate where requests overlap at an `await`; the total is exact.
 * Nothing is stored: tests assert budgets, and `totals()` is there for a log line or a dev route later.
 */

/** The routes that get a source of their own; anything else is `request:other`. */
export const READ_ROUTES: ReadonlySet<string> = new Set([
  'GET /api/game',
  'POST /api/game/join',
  'POST /api/game/replace',
  'POST /api/game/move',
  'POST /api/game/act',
  'POST /api/me/seen',
  'POST /api/me/visit',
  'POST /api/live/ticket',
  'POST /api/dev/next-day',
  'POST /api/dev/pace',
  'POST /api/dev/new-season',
  // Not a path: the login the Worker makes over RPC (`createSession`).
  'session',
]);

export type ReadSource = 'start' | 'alarm' | 'socket' | `request:${string}`;

export function readSourceOfRoute(method: string, pathname: string): ReadSource {
  const route = `${method} ${pathname}`;
  return `request:${READ_ROUTES.has(route) ? route : 'other'}`;
}

/** Cursors kept between two settles; past this the older ones are summed first. */
const MAX_PENDING = 5000;

export class ReadMeter {
  /** The wrapped storage: hand this, not the raw one, to everything that reads. */
  readonly sql: SqlStorage;
  private pending: { rowsRead: number }[] = [];
  private overflow = 0;
  private readonly settled = new Map<string, number>();

  constructor(raw: SqlStorage) {
    this.sql = new Proxy(raw, {
      get: (target, prop) => {
        if (prop === 'exec') {
          return (query: string, ...bindings: unknown[]) => {
            const cursor = target.exec(query, ...(bindings as []));
            this.track(cursor);
            return cursor;
          };
        }
        const value = Reflect.get(target, prop) as unknown;
        return typeof value === 'function'
          ? (value as (...a: unknown[]) => unknown).bind(target)
          : value;
      },
    });
  }

  private track(cursor: { rowsRead: number }): void {
    if (this.pending.length >= MAX_PENDING) {
      for (const c of this.pending) this.overflow += c.rowsRead;
      this.pending = [];
    }
    this.pending.push(cursor);
  }

  /** Moves the rows read since the last settle to `source`. Returns that number. */
  settle(source: ReadSource): number {
    let sum = this.overflow;
    for (const c of this.pending) sum += c.rowsRead;
    this.pending = [];
    this.overflow = 0;
    if (sum > 0) this.settled.set(source, (this.settled.get(source) ?? 0) + sum);
    return sum;
  }

  /** Rows read per source so far. */
  totals(): Record<string, number> {
    return Object.fromEntries(this.settled);
  }

  /** Forgets the totals (tests). */
  reset(): void {
    this.pending = [];
    this.overflow = 0;
    this.settled.clear();
  }
}
