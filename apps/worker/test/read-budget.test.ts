import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { SessionUser } from '../src/guild-game.ts';
import { GuildWorld } from '../src/guild-world.ts';
import { SERVER_CONFIG } from '../src/server-config.ts';
import { createHandler } from '../src/handler.ts';
import { ORIGIN, callHandler, freshGuildId, tokenFor } from './helpers.ts';

/**
 * Rows read (`cursor.rowsRead`, summed per source by the read meter) per operation, against budgets of
 * about 1.5 times what was measured. Cloudflare's free tier allows 5,000,000 rows read a day across the
 * account; the creatures app used it up twice with a whole-table scan on a hot path. A budget that fails
 * here is a change in what a request reads: look at why before raising it.
 *
 * Measured when the budgets were set (a changed poll with the event log full): unchanged poll 0, changed poll 5,
 * act 14, tick 16, socket connect 0 (warm object), act + push to 8 sockets + 8 refetches 96, restart 4 at
 * start and 10 for the first two requests.
 */

const handler = createHandler();
const ROLES = ['guardian', 'scout', 'scholar', 'keeper', 'engineer', 'envoy'];
const user = (i: number): SessionUser => ({
  id: `3${String(i).padStart(17, '0')}`,
  displayName: `Player ${String(i)}`,
});

const measured: Record<string, number> = {};

interface Setup {
  guildId: string;
  stub: DurableObjectStub<GuildWorld>;
  tokens: string[];
  version: number;
  call(token: string, path: string, method?: string, body?: unknown): Promise<Response>;
  /** Rows read per source by `fn`. */
  rows(fn: () => Promise<unknown>): Promise<Record<string, number>>;
}

async function setup(players: number, fullLog = false): Promise<Setup> {
  const guildId = freshGuildId();
  const stub = env.GUILD_WORLD.get(env.GUILD_WORLD.idFromName(guildId));
  const tokens: string[] = [];
  for (let i = 0; i < players; i++) {
    tokens.push(await tokenFor(guildId, await stub.createSession(guildId, user(i + 1))));
  }
  // The event log at its cap, as in a long game: a poll must read only the events it is owed. Seeded before
  // anyone joins, so these are the oldest rows, as they would be.
  if (fullLog) {
    await runInDurableObject(stub, (_instance, state) => {
      for (let i = 0; i < SERVER_CONFIG.eventLogSize; i++) {
        state.storage.sql.exec('INSERT INTO events (version, event) VALUES (?, ?)', i - 500, '{}');
      }
    });
  }
  const call: Setup['call'] = (token, path, method = 'GET', body) =>
    callHandler(
      handler,
      new Request(`${ORIGIN}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}` },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    );
  let version = 0;
  for (const [i, token] of tokens.entries()) {
    const res = await call(token, '/api/game/join', 'POST', {
      role: ROLES[i % ROLES.length],
      offer: 0,
    });
    version = (await res.json<{ version: number }>()).version;
  }
  const rows: Setup['rows'] = async (fn) => {
    await runInDurableObject(stub, (instance) => {
      instance.meter.reset();
    });
    await fn();
    return runInDurableObject(stub, (instance) => instance.meter.totals());
  };
  return { guildId, stub, tokens, version, call, rows };
}

const sum = (r: Record<string, number>): number => Object.values(r).reduce((a, b) => a + b, 0);

async function openSocket(s: Setup, token: string): Promise<WebSocket> {
  const t = (await (await s.call(token, '/api/live/ticket', 'POST', {})).json<{ ticket: string }>())
    .ticket;
  const res = await callHandler(
    handler,
    new Request(`${ORIGIN}/api/live?t=${t}`, { headers: { Upgrade: 'websocket' } }),
  );
  const ws = res.webSocket;
  if (ws === null) throw new Error(`no socket (${String(res.status)})`);
  ws.accept();
  return ws;
}

/** Fails if a number is over its budget; records it for the report. */
function within(name: string, rows: number, budget: number): void {
  measured[name] = rows;
  expect(rows, name).toBeLessThanOrEqual(budget);
}

describe('rows read per operation', () => {
  it('an unchanged poll reads nothing', async () => {
    const s = await setup(2);
    const [token] = s.tokens;
    if (token === undefined) throw new Error('no token');
    const url = `/api/game?since=${String(s.version)}`;
    await s.call(token, url); // warms the session and the game in memory
    const rows = await s.rows(() => s.call(token, url));
    within('unchanged poll', sum(rows), 0);
  });

  it('a changed poll, an act and a tick', async () => {
    const s = await setup(3, true);
    const [a, b] = s.tokens;
    if (a === undefined || b === undefined) throw new Error('no token');
    await s.call(b, '/api/game');
    const poll = await s.rows(() => s.call(b, `/api/game?since=${String(s.version - 1)}`));
    within('changed poll', sum(poll), 8);
    const act = await s.rows(() =>
      s.call(a, '/api/game/act', 'POST', { version: s.version, action: { kind: 'defend' } }),
    );
    within('act', sum(act), 21);
    const tick = await s.rows(() => s.call(a, '/api/dev/next-day', 'POST', {}));
    within('tick (next day)', sum(tick), 24);
  });

  it('a socket connect', async () => {
    const s = await setup(2);
    const [token] = s.tokens;
    if (token === undefined) throw new Error('no token');
    await s.call(token, '/api/game');
    const rows = await s.rows(async () => {
      (await openSocket(s, token)).close();
    });
    within('socket connect (ticket + upgrade)', sum(rows), 0);
  });

  it('a push to 8 sockets and their 8 refetches', async () => {
    const s = await setup(8);
    for (const token of s.tokens) await s.call(token, '/api/game');
    const sockets = await Promise.all(s.tokens.map((t) => openSocket(s, t)));
    let pushes = 0;
    for (const ws of sockets) {
      ws.addEventListener('message', () => {
        pushes += 1;
      });
    }
    await new Promise((r) => setTimeout(r, 50));
    const hellos = pushes;
    const [actor] = s.tokens;
    if (actor === undefined) throw new Error('no token');
    const rows = await s.rows(async () => {
      const act = await s.call(actor, '/api/game/act', 'POST', {
        version: s.version,
        action: { kind: 'defend' },
      });
      expect(act.status).toBe(200);
      for (let i = 0; i < 300 && pushes < hellos + 8; i++)
        await new Promise((r) => setTimeout(r, 10));
      expect(pushes - hellos).toBe(8);
      for (const token of s.tokens) await s.call(token, `/api/game?since=${String(s.version)}`);
    });
    within('act + push to 8 + 8 refetches', sum(rows), 144);
    for (const ws of sockets) ws.close();
  });

  it('a restart of the object', async () => {
    const s = await setup(2);
    const [token] = s.tokens;
    if (token === undefined) throw new Error('no token');
    // A new object over the same storage is what a wake after eviction builds.
    await runInDurableObject(s.stub, async (_instance, state) => {
      const fresh = new GuildWorld(state, env);
      await state.blockConcurrencyWhile(() => Promise.resolve());
      measured['restart (start)'] = fresh.meter.totals()['start'] ?? 0;
      within('restart (start)', measured['restart (start)'], 6);
    });
    // The first request on the new object reads its session, the guild and the game again.
    const first = await runInDurableObject(s.stub, async (_instance, state) => {
      const fresh = new GuildWorld(state, env);
      fresh.meter.reset();
      const res = await fresh.fetch(
        new Request(`${ORIGIN}/api/game`, { headers: { Authorization: `Bearer ${token}` } }),
      );
      expect(res.status).toBe(200);
      const again = await fresh.fetch(
        new Request(`${ORIGIN}/api/game?since=${String(s.version)}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(await again.json()).toEqual({ unchanged: true });
      return fresh.meter.totals();
    });
    within('first poll after a restart', sum(first), 15);
  });
});

describe('no hot query scans a growing table', () => {
  it('uses an index or the primary key for every hot statement', async () => {
    const s = await setup(2);
    const hot = [
      'SELECT version, event FROM events WHERE version > 1 ORDER BY version, seq',
      'DELETE FROM events WHERE version <= 1',
      'SELECT version AS v FROM events WHERE seq <= (SELECT MAX(seq) FROM events) - 100 ORDER BY seq DESC LIMIT 1',
      `SELECT s.user_id, p.display_name, s.last_used_at, s.expires_at
         FROM sessions s JOIN players p ON p.user_id = s.user_id WHERE s.token_hash = 'x'`,
      "UPDATE sessions SET last_used_at = 1 WHERE token_hash = 'x'",
      "DELETE FROM sessions WHERE token_hash = 'x'",
      "SELECT user_id, display_name FROM players WHERE user_id = 'x'",
      "UPDATE players SET last_seen_at = 1 WHERE user_id = 'x'",
      'SELECT state, version, next_tick_at, pace, fast_tick_at FROM game WHERE id = 1',
      'UPDATE game SET version = version + 1 WHERE id = 1 RETURNING version',
    ];
    const plans = await runInDurableObject(s.stub, (_instance, state) =>
      hot.map((query) => ({
        query,
        details: state.storage.sql
          .exec<{ detail: string }>(`EXPLAIN QUERY PLAN ${query}`)
          .toArray()
          .map((r) => r.detail),
      })),
    );
    for (const { query, details } of plans) {
      // A bare "SCAN <table>" is a full scan; "SEARCH" and "SCAN ... USING INDEX" are not the same thing,
      // and the scalar subquery on events is a bounded primary-key lookup.
      const full = details.filter((d) => /^SCAN \w+( AS \w+)?$/.test(d));
      expect(full, query).toEqual([]);
    }
  });
});
