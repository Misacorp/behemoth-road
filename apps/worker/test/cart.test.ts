import { legalMoves } from '@behemoth-road/core';
import { describe, expect, it } from 'vitest';
import type { GameState } from '../src/game-core.ts';
import type { PlayerView } from '../src/guild-game.ts';
import { MISA, ROBIN, USER_ID, runGame, type GameContext } from './helpers.ts';

/** The cart through the API: strict action shapes, refusals by name, the public view and events. */

type Answer = PlayerView & { events: { kind: string }[] };

const storedState = (sql: SqlStorage): GameState =>
  JSON.parse(
    sql.exec<{ state: string }>('SELECT state FROM game WHERE id = 1').one().state,
  ) as GameState;

function edit(sql: SqlStorage, change: (state: GameState) => GameState): void {
  sql.exec(
    'UPDATE game SET state = ?, version = version + 1 WHERE id = 1',
    JSON.stringify(change(storedState(sql))),
  );
}

const ME = `${USER_ID}.0`;

const versionOf = async (ctx: GameContext, token: string): Promise<number> =>
  ((await ctx.call(token, 'GET', '/api/game')).body as PlayerView).version;

const act = async (ctx: GameContext, token: string, action: unknown) =>
  ctx.call(token, 'POST', '/api/game/act', { version: await versionOf(ctx, token), action });

async function team(ctx: GameContext) {
  const misa = await ctx.signIn(MISA);
  const robin = await ctx.signIn(ROBIN);
  await ctx.call(misa, 'POST', '/api/game/join', { role: 'scout', offer: 0 });
  await ctx.call(robin, 'POST', '/api/game/join', { role: 'keeper', offer: 0 });
  return { misa, robin };
}

const besideCreature = (ctx: GameContext) =>
  legalMoves(storedState(ctx.sql), ME).flatMap((p) => (p.kind === 'hex' ? [p.hex] : []))[0]!;

/** Misa on a hex beside the creature, plains under it, a cart there. */
function parked(ctx: GameContext) {
  const spot = besideCreature(ctx);
  edit(ctx.sql, (s) => ({
    ...s,
    tiles: {
      ...s.tiles,
      [`${spot.q},${spot.r}`]: {
        visibility: 'seen',
        terrain: 'plains',
        explored: true,
        leftWindowOnDay: null,
      },
    },
    characters: s.characters.map((c) =>
      c.id === ME ? { ...c, at: { kind: 'hex' as const, hex: spot }, pack: { timber: 2 } } : c,
    ),
    carts: [{ id: 'cart1', hex: spot, cargo: {}, puller: null, rider: null }],
  }));
  return spot;
}

describe('the cart through the API', () => {
  it('takes only the exact shapes: no extra keys, whole positive counts, a material id', async () => {
    await runGame(async (ctx) => {
      const { misa } = await team(ctx);
      const version = await versionOf(ctx, misa);
      for (const action of [
        { kind: 'hitch', cart: 'cart1' },
        { kind: 'unhitch', hex: { q: 0, r: 0 } },
        { kind: 'board-cart', character: ME },
        { kind: 'leave-cart', x: 1 },
        { kind: 'load' },
        { kind: 'load', material: 'timber' },
        { kind: 'load', material: 'timber', amount: 0 },
        { kind: 'load', material: 'timber', amount: 1.5 },
        { kind: 'load', material: 'timber', amount: 100 },
        { kind: 'load', material: 'Timber!', amount: 1 },
        { kind: 'unload', material: 'timber', amount: '2' },
        { kind: 'unload', material: 'timber', amount: 1, cart: 'cart1' },
      ]) {
        const res = await ctx.call(misa, 'POST', '/api/game/act', { version, action });
        expect(res, JSON.stringify(action)).toEqual({
          status: 400,
          body: { error: 'invalid_body' },
        });
      }
    });
  });

  it('answers refusals by name when there is no cart', async () => {
    await runGame(async (ctx) => {
      const { misa } = await team(ctx);
      for (const [action, error] of [
        [{ kind: 'hitch' }, 'no-cart'],
        [{ kind: 'unhitch' }, 'not-hitched'],
        [{ kind: 'board-cart' }, 'no-cart'],
        [{ kind: 'leave-cart' }, 'not-aboard'],
        [{ kind: 'load', material: 'timber', amount: 1 }, 'no-cart'],
        [{ kind: 'unload', material: 'timber', amount: 1 }, 'no-cart'],
      ] as const) {
        expect(await act(ctx, misa, action), JSON.stringify(action)).toEqual({
          status: 409,
          body: { error },
        });
      }
    });
  });

  it('hitches, loads, rides and lets go: events and a public cart in every view', async () => {
    await runGame(async (ctx) => {
      const { misa, robin } = await team(ctx);
      parked(ctx);

      const loaded = await act(ctx, misa, { kind: 'load', material: 'timber', amount: 2 });
      expect(loaded.status).toBe(200);
      const body = loaded.body as Answer;
      expect(body.events.map((e) => e.kind)).toEqual(['loaded']);
      expect(body.game.carts[0]).toMatchObject({ id: 'cart1', cargo: { timber: 2 } });
      // Another player sees the same cart.
      const other = (await ctx.call(robin, 'GET', '/api/game')).body as PlayerView;
      expect(other.game.carts).toEqual(body.game.carts);

      const hitched = (await act(ctx, misa, { kind: 'hitch' })).body as Answer;
      expect(hitched.events.map((e) => e.kind)).toEqual(['hitched']);
      expect(hitched.game.carts[0]?.puller).toBe(ME);
      expect(hitched.game.characters.find((c) => c.id === ME)?.actionsLeft).toBe(2);

      const freed = (await act(ctx, misa, { kind: 'unhitch' })).body as Answer;
      expect(freed.events.map((e) => e.kind)).toEqual(['unhitched']);

      const boarded = (await act(ctx, misa, { kind: 'board-cart' })).body as Answer;
      expect(boarded.game.carts[0]?.rider).toBe(ME);
      // Aboard, a hitch is refused by name.
      expect(await act(ctx, misa, { kind: 'hitch' })).toEqual({
        status: 409,
        body: { error: 'aboard' },
      });
      const left = (await act(ctx, misa, { kind: 'leave-cart' })).body as Answer;
      expect(left.game.carts[0]?.rider).toBeNull();
      expect(left.events.map((e) => e.kind)).toEqual(['left-cart']);
    });
  });

  it('refuses a move the hitched cart cannot make, by name', async () => {
    await runGame(async (ctx) => {
      const { misa } = await team(ctx);
      const spot = parked(ctx);
      await act(ctx, misa, { kind: 'hitch' });
      // Back onto the creature (a step away): the cart cannot board it.
      const version = await versionOf(ctx, misa);
      const res = await ctx.call(misa, 'POST', '/api/game/move', {
        version,
        path: [{ kind: 'creature' }],
      });
      expect(res).toEqual({ status: 409, body: { error: 'cart-terrain' } });
      expect(storedState(ctx.sql).carts[0]?.hex).toEqual(spot);
    });
  });
});
