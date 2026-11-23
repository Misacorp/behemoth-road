import { describe, expect, it } from 'vitest';
import type { GameState } from '../src/game-core.ts';
import type { PlayerView } from '../src/guild-game.ts';
import { MISA, ROBIN, USER_ID, runGame, type GameContext } from './helpers.ts';

const asView = (body: unknown) => body as PlayerView & { events?: unknown[] };
const ME = `${USER_ID}.0`;

const fastTickAt = (ctx: GameContext): number | null =>
  ctx.sql.exec<{ fast_tick_at: number | null }>('SELECT fast_tick_at FROM game WHERE id = 1').one()
    .fast_tick_at;

async function join(ctx: GameContext, user = MISA, role = 'scout') {
  const token = await ctx.signIn(user);
  const res = await ctx.call(token, 'POST', '/api/game/join', { role, offer: 0 });
  expect(res.status).toBe(200);
  return token;
}

const versionOf = async (ctx: GameContext, token: string) =>
  asView((await ctx.call(token, 'GET', '/api/game')).body).version;

describe('stances over the API', () => {
  it('takes set-stance with a stance id from the content list and wait with nothing else', async () => {
    await runGame(async (ctx) => {
      const token = await join(ctx);
      const version = await versionOf(ctx, token);
      for (const action of [
        { kind: 'set-stance' },
        { kind: 'set-stance', stance: 'nap' },
        { kind: 'set-stance', stance: 7 },
        { kind: 'set-stance', stance: 'x'.repeat(65) },
        { kind: 'set-stance', stance: 'watch', extra: true },
        { kind: 'wait', extra: true },
        { kind: 'wait', stance: 'watch' },
      ]) {
        const res = await ctx.call(token, 'POST', '/api/game/act', { version, action });
        expect(res, JSON.stringify(action)).toEqual({
          status: 400,
          body: { error: 'invalid_body' },
        });
      }
    });
  });

  it('sets a stance for the player’s own character and shows it to everyone', async () => {
    await runGame(async (ctx) => {
      const token = await join(ctx);
      const robin = await join(ctx, ROBIN, 'keeper');
      const res = await ctx.call(token, 'POST', '/api/game/act', {
        version: await versionOf(ctx, token),
        action: { kind: 'set-stance', stance: 'help-aboard' },
      });
      expect(res.status).toBe(200);
      expect(asView(res.body).events).toMatchObject([
        { kind: 'stance', characterId: ME, stance: 'help-aboard' },
      ]);
      const seen = asView((await ctx.call(robin, 'GET', '/api/game')).body);
      const mine = seen.game.characters.find((c) => c.id === ME);
      expect(mine).toMatchObject({ stance: 'help-aboard', waiting: false });
    });
  });

  it('ends the day with wait: refused a second time, and the rest of the day with it', async () => {
    await runGame(async (ctx) => {
      const token = await join(ctx);
      const wait = async () =>
        ctx.call(token, 'POST', '/api/game/act', {
          version: await versionOf(ctx, token),
          action: { kind: 'wait' },
        });
      const first = await wait();
      expect(first.status).toBe(200);
      expect(asView(first.body).game.characters.find((c) => c.id === ME)).toMatchObject({
        waiting: true,
        actionsLeft: 3,
      });
      expect((await wait()).body).toEqual({ error: 'waiting' });
    });
  });

  it('clears waiting at the tick', async () => {
    await runGame(
      async (ctx) => {
        const token = await join(ctx);
        await ctx.call(token, 'POST', '/api/game/act', {
          version: await versionOf(ctx, token),
          action: { kind: 'wait' },
        });
        expect((await ctx.call(token, 'POST', '/api/dev/next-day', {})).status).toBe(200);
        const view = asView((await ctx.call(token, 'GET', '/api/game')).body);
        expect(view.game.characters.find((c) => c.id === ME)?.waiting).toBe(false);
      },
      { everyoneIsAdmin: true },
    );
  });
});

describe('fast pace and waiting', () => {
  const readState = (ctx: GameContext) =>
    JSON.parse(
      ctx.sql.exec<{ state: string }>('SELECT state FROM game WHERE id = 1').one().state,
    ) as GameState;

  it('counts a waiting character as spent, so the countdown can start', async () => {
    await runGame(
      async (ctx) => {
        const misa = await join(ctx);
        const robin = await join(ctx, ROBIN, 'keeper');
        expect((await ctx.call(misa, 'POST', '/api/dev/pace', { pace: 'fast' })).status).toBe(200);
        expect(fastTickAt(ctx)).toBeNull();
        const act = async (token: string, action: unknown) =>
          ctx.call(token, 'POST', '/api/game/act', {
            version: await versionOf(ctx, token),
            action,
          });
        // One waits: the other has actions left, so no countdown yet.
        expect((await act(misa, { kind: 'wait' })).status).toBe(200);
        expect(fastTickAt(ctx)).toBeNull();
        // The other waits too: everyone is done.
        expect((await act(robin, { kind: 'wait' })).status).toBe(200);
        expect(fastTickAt(ctx)).toBe(ctx.clock.t + 6000);
        expect(readState(ctx).characters.every((c) => c.waiting && c.actionsLeft === 3)).toBe(true);
      },
      { everyoneIsAdmin: true },
    );
  });
});
