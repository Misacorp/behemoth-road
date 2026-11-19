import { hexKey, hiddenFeatureKeys, legalMoves } from '@behemoth-road/core';
import { describe, expect, it } from 'vitest';
import { CONTENT_VERSION, type GameState } from '../src/game-core.ts';
import type { PlayerView } from '../src/guild-game.ts';
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
        { version, action: { kind: 'craft' } },
        { version, action: { kind: 'craft', recipe: 'warp-drive' } },
        { version, action: { kind: 'craft', recipe: 'x'.repeat(65) } },
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
  it('crafts from the team inventory and answers the craft event', async () => {
    await runGame(async (ctx) => {
      const { token } = await joined(ctx);
      edit(ctx.sql, (s) => ({ ...s, inventory: { materials: { iron: 2, timber: 1 }, items: {} } }));
      const version = asView((await ctx.call(token, 'GET', '/api/game')).body).version;
      const res = await ctx.call(token, 'POST', '/api/game/act', {
        version,
        action: { kind: 'craft', recipe: 'grappling-hook' },
      });
      expect(res.status).toBe(200);
      const view = asView(res.body) as PlayerView & { events: unknown[]; stopped: unknown };
      expect(view.events).toEqual([{ kind: 'craft', item: 'grappling-hook' }]);
      expect(view.stopped).toBeNull();
      expect(view.game.inventory.items['grappling-hook']).toBe(1);
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
        { kind: 'gather', hex, material: 'iron', amount: expect.any(Number) as number },
      ]);
      expect(view.game.inventory.materials['iron']).toBeGreaterThan(0);
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
      expect(view.events).toContainEqual({ kind: 'trap', hex, characterId: ME });
      expect(view.game.characters.find((c) => c.id === ME)?.actionsLeft).toBe(0);
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
      edit(ctx.sql, (s) => ({ ...s, inventory: { materials: { iron: 3, timber: 2 }, items: {} } }));
      const v = asView((await ctx.call(token, 'GET', '/api/game')).body).version;
      expect(v).toBe(version + 1);
      const hex = nextHex(ctx.sql);
      const [a, b] = await Promise.all([
        ctx.call(token, 'POST', '/api/game/move', { version: v, path: [{ kind: 'hex', hex }] }),
        ctx.call(token, 'POST', '/api/game/act', {
          version: v,
          action: { kind: 'craft', recipe: 'grappling-hook' },
        }),
      ]);
      const statuses = [a.status, b.status].sort();
      expect(statuses).toEqual([200, 409]);
      expect([a.body, b.body]).toContainEqual({ error: 'stale' });
    });
  });
});
