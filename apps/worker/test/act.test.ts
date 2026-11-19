import { hexKey, hiddenFeatureKeys, legalMoves } from '@behemoth-road/core';
import { describe, expect, it } from 'vitest';
import { CONTENT_VERSION, type GameState } from '../src/game-core.ts';
import type { PlayerView } from '../src/guild-game.ts';
import { SERVER_CONFIG } from '../src/server-config.ts';
import { MISA, ROBIN, USER_ID, runGame, type GameContext } from './helpers.ts';

const asView = (body: unknown) => body as PlayerView & { events?: unknown[] };
const storedState = (sql: SqlStorage): GameState =>
  JSON.parse(
    sql.exec<{ state: string }>('SELECT state FROM game WHERE id = 1').one().state,
  ) as GameState;

/** Changes the stored game as a test setup (the rules are proven in the core; this places things). */
function edit(sql: SqlStorage, change: (state: GameState) => GameState): void {
  sql.exec(
    'UPDATE game SET state = ?, version = version + 1 WHERE id = 1',
    JSON.stringify(change(storedState(sql))),
  );
}

const ME = `${USER_ID}.0`;

/** A hex the character can step to from the creature. */
function nextHex(sql: SqlStorage): { q: number; r: number } {
  const place = legalMoves(storedState(sql), ME).find((p) => p.kind === 'hex');
  if (place?.kind !== 'hex') throw new Error('no hex to step to');
  return place.hex;
}

async function joined(ctx: GameContext) {
  const token = await ctx.signIn(MISA);
  const res = await ctx.call(token, 'POST', '/api/game/join', { role: 'engineer', offer: 0 });
  expect(res.status).toBe(200);
  return { token, version: asView(res.body).version };
}

describe('POST /api/game/act', () => {
  it('takes exactly one of the three action shapes', async () => {
    await runGame(async (ctx) => {
      const { token, version } = await joined(ctx);
      for (const body of [
        { version },
        { action: { kind: 'gather' } },
        { version, action: { kind: 'dig' } },
        { version, action: { kind: 'gather', hex: { q: 0, r: 0 } } },
        { version, action: { kind: 'craft', recipe: 'grappling-hook' } },
        { version, action: { kind: 'build' } },
        { version, action: { kind: 'build', unlock: 'warp-drive' } },
        { version, action: { kind: 'build', unlock: 'x'.repeat(65) } },
        { version, action: { kind: 'survey' } },
        { version, action: { kind: 'survey', hex: { q: 0.5, r: 0 } } },
        { version, action: { kind: 'survey', hex: { q: 0, r: 0, s: 0 } } },
        { version, action: { kind: 'survey', hex: { q: 1e9, r: 0 } } },
        { version, action: { kind: 'work-site', site: 'tomb' } },
        { version, action: { kind: 'gather' }, characterId: `${ROBIN.id}.0` },
        { version: -1, action: { kind: 'gather' } },
      ]) {
        const res = await ctx.call(token, 'POST', '/api/game/act', body);
        expect(res, JSON.stringify(body)).toEqual({ status: 400, body: { error: 'invalid_body' } });
      }
    });
  });

  it('refuses a stale version and a player without a character', async () => {
    await runGame(async (ctx) => {
      const robin = await ctx.signIn(ROBIN);
      const { token, version } = await joined(ctx);
      const gather = { kind: 'gather' };
      expect(
        await ctx.call(token, 'POST', '/api/game/act', { version: version - 1, action: gather }),
      ).toEqual({
        status: 409,
        body: { error: 'stale' },
      });
      expect(await ctx.call(robin, 'POST', '/api/game/act', { version, action: gather })).toEqual({
        status: 409,
        body: { error: 'no-character' },
      });
    });
  });

  it("answers the core's refusal as 409 and changes nothing", async () => {
    await runGame(async (ctx) => {
      const { token, version } = await joined(ctx);
      // On the creature at the start there is no node to gather and no site to work.
      for (const action of [{ kind: 'gather' }, { kind: 'work-site' }]) {
        const res = await ctx.call(token, 'POST', '/api/game/act', { version, action });
        expect(res.status).toBe(409);
        expect(typeof (res.body as { error: unknown }).error).toBe('string');
      }
      expect(asView((await ctx.call(token, 'GET', '/api/game')).body).version).toBe(version);
    });
  });
});

describe('actions that succeed', () => {
  it('starts an unlock from the team stores and answers its progress', async () => {
    await runGame(async (ctx) => {
      const { token } = await joined(ctx);
      edit(ctx.sql, (s) => ({ ...s, stores: { iron: 2, timber: 1 } }));
      const version = asView((await ctx.call(token, 'GET', '/api/game')).body).version;
      const res = await ctx.call(token, 'POST', '/api/game/act', {
        version,
        action: { kind: 'build', unlock: 'grappling-hook' },
      });
      expect(res.status).toBe(200);
      const view = asView(res.body) as PlayerView & {
        events: { kind: string }[];
        stopped: unknown;
      };
      expect(view.events.map((e) => e.kind)).toContain('unlock-progress');
      expect(view.stopped).toBeNull();
      expect(view.game.project?.unlock).toBe('grappling-hook');
      expect(view.game.stores['iron'] ?? 0).toBe(0);
      expect(view.version).toBe(version + 1);
    });
  });

  it('gathers at a revealed node the character stands on', async () => {
    await runGame(async (ctx) => {
      const { token } = await joined(ctx);
      const hex = nextHex(ctx.sql);
      edit(ctx.sql, (s) => ({
        ...s,
        characters: s.characters.map((c) => (c.id === ME ? { ...c, at: { kind: 'hex', hex } } : c)),
        features: {
          ...s.features,
          [hexKey(hex)]: { type: 'iron-deposit', revealed: true, left: 3 },
        },
      }));
      const version = asView((await ctx.call(token, 'GET', '/api/game')).body).version;
      const res = await ctx.call(token, 'POST', '/api/game/act', {
        version,
        action: { kind: 'gather' },
      });
      expect(res.status).toBe(200);
      const view = asView(res.body);
      expect(view.events).toEqual([
        {
          kind: 'gather',
          hex,
          characterId: ME,
          material: 'iron',
          amount: expect.any(Number) as number,
          version: version + 1,
        },
      ]);
      const me = view.game.characters.find((c) => c.id === ME);
      expect(me?.pack['iron']).toBeGreaterThan(0);
      expect(view.game.features[hexKey(hex)]?.left).toBe(2);
    });
  });
});

describe('moves report what happened on the way', () => {
  it('stops a walk at a hidden trap and says so', async () => {
    await runGame(async (ctx) => {
      const { token } = await joined(ctx);
      const hex = nextHex(ctx.sql);
      edit(ctx.sql, (s) => ({
        ...s,
        features: { ...s.features, [hexKey(hex)]: { type: 'snare', revealed: false, left: 1 } },
      }));
      const version = asView((await ctx.call(token, 'GET', '/api/game')).body).version;
      const res = await ctx.call(token, 'POST', '/api/game/move', {
        version,
        path: [{ kind: 'hex', hex }],
      });
      expect(res.status).toBe(200);
      const view = asView(res.body) as PlayerView & { events: unknown[]; stopped: unknown };
      expect(view.stopped).toEqual({ step: 0, reason: 'trap' });
      expect(view.events).toContainEqual({
        kind: 'trap',
        hex,
        characterId: ME,
        version: version + 1,
      });
      expect(view.game.characters.find((c) => c.id === ME)?.actionsLeft).toBe(0);
    });
  });

  it('reveals only what was entered or surveyed, and no event names a hidden feature', async () => {
    await runGame(async (ctx) => {
      const { token } = await joined(ctx);
      const hex = nextHex(ctx.sql);
      // A harmless node on the hex walked into, and hidden features on every other known hex.
      edit(ctx.sql, (s) => {
        const features: Record<string, { type: string; revealed: boolean; left: number }> = {};
        for (const key of Object.keys(s.tiles))
          features[key] = { type: 'timber-stand', revealed: false, left: 2 };
        features[hexKey(hex)] = { type: 'iron-deposit', revealed: false, left: 3 };
        return { ...s, features };
      });
      const version = asView((await ctx.call(token, 'GET', '/api/game')).body).version;
      const res = await ctx.call(token, 'POST', '/api/game/move', {
        version,
        path: [{ kind: 'hex', hex }],
      });
      expect(res.status).toBe(200);
      const view = asView(res.body) as PlayerView & {
        events: { kind: string; hex?: unknown; feature?: string }[];
      };
      expect(Object.keys(view.game.features)).toEqual([hexKey(hex)]);
      for (const event of view.events) {
        if (event.hex !== undefined) expect(event.hex).toEqual(hex);
      }
      expect(view.events.filter((e) => e.kind === 'reveal')).toEqual([
        { kind: 'reveal', hex, feature: 'iron-deposit', version: version + 1 },
      ]);
      expect(JSON.stringify(view.events)).not.toContain('timber-stand');
      // ctx.call has also checked the whole view against the stored hidden features.
    });
  });

  it('keeps hidden features on the server: a new game has some, and no view carries them', async () => {
    await runGame(async (ctx) => {
      const token = await ctx.signIn(MISA);
      expect(hiddenFeatureKeys(storedState(ctx.sql)).length).toBeGreaterThan(0);
      // ctx.call checks every response against the stored hidden features.
      const view = asView((await ctx.call(token, 'GET', '/api/game')).body);
      expect(Object.values(view.game.features).every((f) => f.revealed)).toBe(true);
    });
  });
});

describe('a stored game this build cannot use as it is', () => {
  const versionOf = (sql: SqlStorage) =>
    sql.exec<{ version: number }>('SELECT version FROM game WHERE id = 1').one().version;

  it('from older content is replaced by a new game; players stay and rejoin with new offers', async () => {
    await runGame(async (ctx) => {
      const { token } = await joined(ctx);
      const old = storedState(ctx.sql);
      ctx.sql.exec(
        'UPDATE game SET state = ?, version = 41 WHERE id = 1',
        JSON.stringify({ ...old, contentVersion: CONTENT_VERSION - 1, day: 9 }),
      );
      ctx.game.migrate();
      const fresh = storedState(ctx.sql);
      expect(fresh.contentVersion).toBe(CONTENT_VERSION);
      expect(fresh.day).toBe(1);
      expect(fresh.characters).toEqual([]);
      expect(versionOf(ctx.sql)).toBe(42);
      // Once only.
      ctx.game.migrate();
      expect(versionOf(ctx.sql)).toBe(42);
      const view = asView((await ctx.call(token, 'GET', '/api/game')).body);
      expect(view.version).toBe(42);
      expect(view.you.characterId).toBeNull();
      expect(view.offers?.length).toBeGreaterThan(0);
      expect(ctx.sql.exec('SELECT COUNT(*) AS n FROM players').one().n).toBe(1);
      const rejoined = await ctx.call(token, 'POST', '/api/game/join', { role: 'scout', offer: 0 });
      expect(rejoined.status).toBe(200);
    });
  });

  for (const [what, text] of [
    ['corrupt', '{"contentVersion": 3, "day": '],
    ['from newer content', JSON.stringify({ contentVersion: 999, seed: [1, 2, 3, 4], day: 5 })],
  ] as const) {
    it(`${what}: is kept as it is, answers 503 and never crashes the object`, async () => {
      await runGame(async (ctx) => {
        const token = await ctx.signIn(MISA);
        ctx.sql.exec('UPDATE game SET state = ?, version = 7 WHERE id = 1', text);
        expect(() => ctx.game.migrate()).not.toThrow();
        expect(await ctx.call(token, 'GET', '/api/game')).toEqual({
          status: 503,
          body: { error: 'game_unavailable' },
        });
        await expect(ctx.game.alarm()).resolves.toBeUndefined();
        // Sign-in still works, and nothing was overwritten.
        await ctx.signIn(ROBIN);
        expect(ctx.sql.exec<{ state: string }>('SELECT state FROM game').one().state).toBe(text);
        expect(versionOf(ctx.sql)).toBe(7);
      });
    });
  }
});

describe('requests at the same version', () => {
  it('apply one change: the other is refused as stale', async () => {
    await runGame(async (ctx) => {
      const { token, version } = await joined(ctx);
      edit(ctx.sql, (s) => ({ ...s, stores: { iron: 2, timber: 1 } }));
      const v = asView((await ctx.call(token, 'GET', '/api/game')).body).version;
      expect(v).toBe(version + 1);
      const hex = nextHex(ctx.sql);
      const [a, b] = await Promise.all([
        ctx.call(token, 'POST', '/api/game/move', { version: v, path: [{ kind: 'hex', hex }] }),
        ctx.call(token, 'POST', '/api/game/act', {
          version: v,
          action: { kind: 'build', unlock: 'grappling-hook' },
        }),
      ]);
      const statuses = [a.status, b.status].sort();
      expect(statuses).toEqual([200, 409]);
      expect([a.body, b.body]).toContainEqual({ error: 'stale' });
    });
  });
});

describe('the event log', () => {
  /** Puts a hidden iron deposit on the next hex and walks there: three events (explore, reveal). */
  async function walk(ctx: GameContext, token: string) {
    const hex = nextHex(ctx.sql);
    edit(ctx.sql, (s) => ({
      ...s,
      features: {
        ...s.features,
        [hexKey(hex)]: { type: 'iron-deposit', revealed: false, left: 3 },
      },
    }));
    const version = asView((await ctx.call(token, 'GET', '/api/game')).body).version;
    const res = await ctx.call(token, 'POST', '/api/game/move', {
      version,
      path: [{ kind: 'hex', hex }],
    });
    expect(res.status).toBe(200);
    return { hex, before: version, after: version + 1, events: asView(res.body).events ?? [] };
  }

  it('gives other players the events after their version, stamped with it', async () => {
    await runGame(async (ctx) => {
      const robin = await ctx.signIn(ROBIN);
      const { token } = await joined(ctx);
      const walked = await walk(ctx, token);
      expect(walked.events.length).toBeGreaterThan(0);
      const res = await ctx.call(robin, 'GET', `/api/game?since=${String(walked.before)}`);
      const view = res.body as PlayerView & {
        events: { version: number }[];
        eventsTruncated: boolean;
      };
      expect(view.events).toEqual(walked.events);
      expect(view.events.every((e) => e.version === walked.after)).toBe(true);
      expect(view.eventsTruncated).toBe(false);
      // Nothing after the newest version; a first load replays nothing.
      expect(
        (await ctx.call(robin, 'GET', `/api/game?since=${String(walked.after)}`)).body,
      ).toEqual({
        unchanged: true,
      });
      const first = (await ctx.call(robin, 'GET', '/api/game')).body as { events: unknown[] };
      expect(first.events).toEqual([]);
    });
  });

  it('keeps only the last events and says when a client missed some', async () => {
    await runGame(async (ctx) => {
      const { token } = await joined(ctx);
      const start = asView((await ctx.call(token, 'GET', '/api/game')).body).version;
      // Fill the log past its size with the stored game unchanged (events only).
      ctx.sql.exec(
        `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ?)
         INSERT INTO events (version, event) SELECT ?, '{"kind":"explore","hex":{"q":0,"r":0}}' FROM n`,
        SERVER_CONFIG.eventLogSize + 5,
        start,
      );
      const walked = await walk(ctx, token);
      const kept = ctx.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM events').one().n;
      expect(kept).toBeLessThanOrEqual(SERVER_CONFIG.eventLogSize);
      const late = (await ctx.call(token, 'GET', `/api/game?since=${String(start - 1)}`)).body as {
        events: { version: number }[];
        eventsTruncated: boolean;
      };
      expect(late.eventsTruncated).toBe(true);
      expect(late.events.every((e) => e.version === walked.after)).toBe(true);
      const recent = (await ctx.call(token, 'GET', `/api/game?since=${String(walked.before)}`))
        .body as { eventsTruncated: boolean };
      expect(recent.eventsTruncated).toBe(false);
    });
  });

  it('logs nothing for a refused action, and starts over with a replaced game', async () => {
    await runGame(async (ctx) => {
      const { token, version } = await joined(ctx);
      await walk(ctx, token);
      const count = () => ctx.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM events').one().n;
      const before = count();
      expect(
        (await ctx.call(token, 'POST', '/api/game/act', { version: 1, action: { kind: 'gather' } }))
          .status,
      ).toBe(409);
      expect(count()).toBe(before);
      ctx.sql.exec(
        'UPDATE game SET state = ? WHERE id = 1',
        JSON.stringify({ ...storedState(ctx.sql), contentVersion: CONTENT_VERSION - 1 }),
      );
      ctx.game.migrate();
      expect(count()).toBe(0);
      const after = (await ctx.call(token, 'GET', `/api/game?since=${String(version)}`)).body as {
        eventsTruncated: boolean;
      };
      expect(after.eventsTruncated).toBe(true);
    });
  });
});
