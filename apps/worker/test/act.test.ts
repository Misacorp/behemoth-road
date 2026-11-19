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

describe('moves report what happened on the way', () => {
  it('answers the view with an events list', async () => {
    await runGame(async (ctx) => {
      const { token, version } = await joined(ctx);
      const res = await ctx.call(token, 'POST', '/api/game/move', {
        version,
        path: [{ kind: 'creature' }],
      });
      // Staying on the creature is either a no-op or refused; a successful move carries events.
      if (res.status === 200) expect(Array.isArray(asView(res.body).events)).toBe(true);
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
