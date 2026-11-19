import { hexKey, hiddenFeatureKeys, legalMoves } from '@behemoth-road/core';
import { describe, expect, it } from 'vitest';
import { CONTENT_VERSION, type GameState } from '../src/game-core.ts';
import type { PlayerView } from '../src/guild-game.ts';
import v2Game from './fixtures/game-v2.json';
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

describe('a stored game from older content', () => {
  it('is brought up to this content version on load, keeping its characters, day and map', async () => {
    await runGame(async (ctx) => {
      const token = await ctx.signIn(MISA);
      ctx.sql.exec('UPDATE game SET state = ?, version = 5 WHERE id = 1', JSON.stringify(v2Game));
      ctx.game.migrate();
      const stored = storedState(ctx.sql);
      expect(stored.contentVersion).toBe(CONTENT_VERSION);
      expect(stored.day).toBe(v2Game.day);
      expect(stored.seed).toEqual(v2Game.seed);
      expect(stored.characters.map((c) => c.id)).toEqual(v2Game.characters.map((c) => c.id));
      for (const key of Object.keys(v2Game.tiles)) expect(stored.tiles).toHaveProperty([key]);
      const version = ctx.sql.exec<{ version: number }>('SELECT version FROM game').one().version;
      expect(version).toBe(CONTENT_VERSION > v2Game.contentVersion ? 6 : 5);
      // Running again changes nothing.
      ctx.game.migrate();
      expect(ctx.sql.exec<{ version: number }>('SELECT version FROM game').one().version).toBe(
        version,
      );
      const view = asView((await ctx.call(token, 'GET', '/api/game')).body);
      expect(view.you.characterId).toBe(`${USER_ID}.0`);
      expect(view.day).toBe(v2Game.day);
    });
  });
});
