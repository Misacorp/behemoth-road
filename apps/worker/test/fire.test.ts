import { legalMoves } from '@behemoth-road/core';
import { describe, expect, it } from 'vitest';
import type { GameState } from '../src/game-core.ts';
import type { PlayerView } from '../src/guild-game.ts';
import { MISA, OTHER_USER_ID, ROBIN, USER_ID, runGame, type GameContext } from './helpers.ts';

/** Fire and falling slides through the API: dig-out, pinned in the view, a lit brazier. */

type Answer = PlayerView & { events: { kind: string }[] };

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
const ROBIN_ID = `${OTHER_USER_ID}.0`;

const withCharacter = (
  state: GameState,
  id: string,
  change: Partial<GameState['characters'][number]>,
): GameState => ({
  ...state,
  characters: state.characters.map((c) => (c.id === id ? { ...c, ...change } : c)),
});

const versionOf = async (ctx: GameContext, token: string): Promise<number> =>
  ((await ctx.call(token, 'GET', '/api/game')).body as PlayerView).version;

const act = async (ctx: GameContext, token: string, action: unknown) =>
  ctx.call(token, 'POST', '/api/game/act', { version: await versionOf(ctx, token), action });

async function team(ctx: GameContext) {
  const misa = await ctx.signIn(MISA);
  const robin = await ctx.signIn(ROBIN);
  expect(
    (await ctx.call(misa, 'POST', '/api/game/join', { role: 'keeper', offer: 0 })).status,
  ).toBe(200);
  expect(
    (await ctx.call(robin, 'POST', '/api/game/join', { role: 'scout', offer: 0 })).status,
  ).toBe(200);
  return { misa, robin };
}

const besideCreature = (ctx: GameContext) =>
  legalMoves(storedState(ctx.sql), ME).flatMap((p) => (p.kind === 'hex' ? [p.hex] : []))[0]!;

describe('fire and slides through the API', () => {
  it('takes dig-out with a target id only, and answers its refusals by name', async () => {
    await runGame(async (ctx) => {
      const { misa } = await team(ctx);
      const version = await versionOf(ctx, misa);
      for (const action of [
        { kind: 'dig-out' },
        { kind: 'dig-out', target: '' },
        { kind: 'dig-out', target: 7 },
        { kind: 'dig-out', target: 'x'.repeat(65) },
        { kind: 'dig-out', target: ROBIN_ID, hex: { q: 0, r: 0 } },
      ]) {
        const res = await ctx.call(misa, 'POST', '/api/game/act', { version, action });
        expect(res, JSON.stringify(action)).toEqual({
          status: 400,
          body: { error: 'invalid_body' },
        });
      }
      expect(await act(ctx, misa, { kind: 'dig-out', target: ROBIN_ID })).toEqual({
        status: 409,
        body: { error: 'not-pinned' },
      });
    });
  });

  it('shows a pinned character to everyone, stops them acting, and frees them when dug out', async () => {
    await runGame(async (ctx) => {
      const { misa, robin } = await team(ctx);
      const beside = besideCreature(ctx);
      edit(ctx.sql, (s) =>
        withCharacter(s, ROBIN_ID, { at: { kind: 'hex', hex: beside }, pinnedDay: 1 }),
      );
      const view = (await ctx.call(misa, 'GET', '/api/game')).body as PlayerView;
      expect(view.game.characters.find((c) => c.id === ROBIN_ID)?.pinnedDay).toBe(1);
      expect(await act(ctx, robin, { kind: 'linger' })).toEqual({
        status: 409,
        body: { error: 'pinned' },
      });
      // Misa rides the creature, next to Robin's hex: digging out is allowed and frees them.
      const dug = await act(ctx, misa, { kind: 'dig-out', target: ROBIN_ID });
      expect(dug.status).toBe(200);
      const body = dug.body as Answer;
      expect(body.events).toEqual([
        { kind: 'dug-out', characterId: ROBIN_ID, by: ME, version: body.version },
      ]);
      expect(body.game.characters.find((c) => c.id === ROBIN_ID)?.pinnedDay).toBeUndefined();
    });
  });

  it('lights a brazier: nights and reveal in the public view, no plan or hidden feature out', async () => {
    await runGame(async (ctx) => {
      const { misa } = await team(ctx);
      const spot = besideCreature(ctx);
      edit(ctx.sql, (s) => ({
        ...withCharacter(s, ME, { at: { kind: 'hex', hex: spot }, pack: { timber: 1 } }),
        features: {
          ...s.features,
          [`${spot.q},${spot.r}`]: { type: 'brazier', revealed: true, left: 1 },
        },
      }));
      const lit = await act(ctx, misa, { kind: 'light-fire' });
      expect(lit.status).toBe(200);
      const body = lit.body as Answer;
      expect(body.game.stimuli.at(-1)).toMatchObject({ hex: spot, nights: 3, reveal: 2 });
      expect(JSON.stringify(body)).not.toContain('brazierPlan');
      expect(body.events.map((e) => e.kind)).toContain('fire-lit');
    });
  });
});
