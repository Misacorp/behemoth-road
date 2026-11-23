import { describe, expect, it } from 'vitest';
import type { PlayerView } from '../src/guild-game.ts';
import { MISA, ROBIN, runGame, type GameContext } from './helpers.ts';

/** What the Durable Object reads from storage per request type (SQL statements run, alarm lookups). */

const asView = (body: unknown) => body as PlayerView;

async function joined(ctx: GameContext) {
  const token = await ctx.signIn(MISA);
  const res = await ctx.call(token, 'POST', '/api/game/join', { role: 'warden', offer: 0 });
  return { token, version: asView(res.body).version };
}

const log: unknown[] = [];

describe('storage reads per request', () => {
  it('an unchanged poll reads nothing', async () => {
    await runGame(async (ctx) => {
      const { token, version } = await joined(ctx);
      await ctx.call(token, 'GET', `/api/game?since=${String(version)}`); // warms the object's memory
      ctx.reads.reset();
      const res = await ctx.call(token, 'GET', `/api/game?since=${String(version)}`);
      expect(res.body).toEqual({ unchanged: true });
      expect(ctx.reads).toMatchObject({ sql: 0, alarm: 0 });
    });
  });

  it('reports a changed poll and an action, which do read', async () => {
    await runGame(async (ctx) => {
      const { token, version } = await joined(ctx);
      const robin = await ctx.signIn(ROBIN);
      await ctx.call(robin, 'GET', '/api/game');
      ctx.reads.reset();
      await ctx.call(robin, 'GET', `/api/game?since=${String(version - 1)}`);
      log.push(
        'changed poll reads',
        JSON.stringify({ sql: ctx.reads.sql, alarm: ctx.reads.alarm }),
      );
      ctx.reads.reset();
      await ctx.call(token, 'POST', '/api/game/act', { version, action: { kind: 'defend' } });
      log.push('act reads', JSON.stringify({ sql: ctx.reads.sql, alarm: ctx.reads.alarm }));
    });
  });

  it('stays correct when another change arrives (the memory follows the writes)', async () => {
    await runGame(async (ctx) => {
      const { token, version } = await joined(ctx);
      await ctx.call(token, 'GET', `/api/game?since=${String(version)}`);
      const robin = await ctx.signIn(ROBIN);
      const joinedRobin = await ctx.call(robin, 'POST', '/api/game/join', {
        role: 'scout',
        offer: 0,
      });
      const v2 = asView(joinedRobin.body).version;
      expect(v2).toBeGreaterThan(version);
      const seen = await ctx.call(token, 'GET', `/api/game?since=${String(version)}`);
      expect(asView(seen.body).version).toBe(v2);
      expect(asView(seen.body).players).toHaveLength(2);
      expect((await ctx.call(token, 'GET', `/api/game?since=${String(v2)}`)).body).toEqual({
        unchanged: true,
      });
    });
  });

  it('is recorded: a changed poll and an action stay cheap', () => {
    // Before the object kept the game in memory: unchanged 6 statements and 1 alarm lookup, changed poll
    // 10 and 1, act 15 and 2.
    expect(log).toEqual([
      'changed poll reads',
      '{"sql":3,"alarm":0}',
      'act reads',
      '{"sql":9,"alarm":0}',
    ]);
  });
});
