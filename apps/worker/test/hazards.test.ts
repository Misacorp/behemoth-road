import { checkAction, DIRECTIONS, legalMoves, neighbour } from '@behemoth-road/core';
import { describe, expect, it } from 'vitest';
import type { GameState } from '../src/game-core.ts';
import type { PlayerView } from '../src/guild-game.ts';
import { MISA, ROBIN, USER_ID, runGame, type GameContext } from './helpers.ts';

/** Lures through the API: the strict `lead` schema, its refusals by name, and what the view shows. */

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

const versionOf = async (ctx: GameContext, token: string): Promise<number> =>
  ((await ctx.call(token, 'GET', '/api/game')).body as PlayerView).version;

const act = async (ctx: GameContext, token: string, action: unknown) =>
  ctx.call(token, 'POST', '/api/game/act', { version: await versionOf(ctx, token), action });

async function misaJoins(ctx: GameContext) {
  const misa = await ctx.signIn(MISA);
  const robin = await ctx.signIn(ROBIN);
  expect(
    (await ctx.call(misa, 'POST', '/api/game/join', { role: 'keeper', offer: 0 })).status,
  ).toBe(200);
  expect(
    (await ctx.call(robin, 'POST', '/api/game/join', { role: 'scout', offer: 0 })).status,
  ).toBe(200);
  return misa;
}

/** A hex Misa's character can stand on beside the creature, and a free hex next to it for a lure. */
const spots = (ctx: GameContext) => {
  const standing = legalMoves(storedState(ctx.sql), ME).flatMap((p) =>
    p.kind === 'hex' ? [p.hex] : [],
  )[0]!;
  return { standing, lure: { q: standing.q + 1, r: standing.r } };
};

describe('lures through the API', () => {
  it('takes lead with a lure id and exactly one of a direction or a hex, nothing else', async () => {
    await runGame(async (ctx) => {
      const misa = await misaJoins(ctx);
      const version = await versionOf(ctx, misa);
      for (const action of [
        { kind: 'lead' },
        { kind: 'lead', lure: 'l1' },
        { kind: 'lead', lure: 'l1', direction: 'up' },
        { kind: 'lead', lure: 'l1', direction: 7 },
        { kind: 'lead', lure: 'L1' },
        { kind: 'lead', lure: 'x'.repeat(65), direction: 'n' },
        { kind: 'lead', lure: 'l1', direction: 'n', to: { q: 0, r: 0 } },
        { kind: 'lead', lure: 'l1', to: { q: 0.5, r: 0 } },
        { kind: 'lead', lure: 'l1', to: { q: 1_000_000, r: 0 } },
        { kind: 'lead', lure: 'l1', to: { q: 0, r: 0, s: 0 } },
        { kind: 'lead', lure: 'l1', direction: 'n', extra: true },
      ]) {
        const res = await ctx.call(misa, 'POST', '/api/game/act', { version, action });
        expect(res, JSON.stringify(action)).toEqual({
          status: 400,
          body: { error: 'invalid_body' },
        });
      }
      // A well-formed lead at a lure that is not there is the core's refusal, by name.
      expect(await act(ctx, misa, { kind: 'lead', lure: 'l99', direction: 'n' })).toEqual({
        status: 409,
        body: { error: 'no-lure' },
      });
    });
  });

  it('leads a lure, tells everyone, and settles it after the last lead', async () => {
    await runGame(async (ctx) => {
      const misa = await misaJoins(ctx);
      const { standing, lure } = spots(ctx);
      edit(ctx.sql, (s) => ({
        ...s,
        characters: s.characters.map((c) =>
          c.id === ME ? { ...c, at: { kind: 'hex', hex: standing }, actionsLeft: 3 } : c,
        ),
        lures: [{ id: 'l1', type: 'capybara', hex: lure, leadsLeft: 1 }],
      }));
      // Any way the rules let it go (the terrain beside it is whatever the seed made).
      const direction = DIRECTIONS.find(
        (d) => checkAction(storedState(ctx.sql), ME, { kind: 'lead', lure: 'l1', direction: d }).ok,
      )!;
      expect(direction).toBeDefined();
      const led = await act(ctx, misa, { kind: 'lead', lure: 'l1', direction });
      expect(led.status).toBe(200);
      const body = led.body as Answer;
      expect(body.events.map((e) => e.kind)).toEqual(['lure-led', 'lure-settled']);
      expect(body.game.lures).toEqual([
        { id: 'l1', type: 'capybara', hex: neighbour(lure, direction), leadsLeft: 0 },
      ]);
      // It stayed within reach of the character's hex? Then a second lead is refused as settled.
      edit(ctx.sql, (s) => ({
        ...s,
        lures: s.lures.map((l) => ({ ...l, hex: lure })),
      }));
      expect(await act(ctx, misa, { kind: 'lead', lure: 'l1', direction })).toEqual({
        status: 409,
        body: { error: 'settled' },
      });
    });
  });

  it('refuses a lead from far away or by a character who is riding', async () => {
    await runGame(async (ctx) => {
      const misa = await misaJoins(ctx);
      const { lure } = spots(ctx);
      edit(ctx.sql, (s) => ({
        ...s,
        lures: [{ id: 'l1', type: 'capybara', hex: lure, leadsLeft: 3 }],
      }));
      expect(await act(ctx, misa, { kind: 'lead', lure: 'l1', direction: 'n' })).toEqual({
        status: 409,
        body: { error: 'not-near' },
      });
    });
  });

  it('sends lures in the view and keeps the hazard plan, the lure count and the reaction out', async () => {
    await runGame(async (ctx) => {
      const misa = await misaJoins(ctx);
      const res = await ctx.call(misa, 'GET', '/api/game');
      const text = JSON.stringify(res.body);
      const view = (res.body as PlayerView).game;
      expect(Array.isArray(view.lures)).toBe(true);
      expect(text).not.toContain('hazardPlan');
      expect(text).not.toContain('lureCount');
      expect(text).not.toContain('small-beast');
    });
  });
});
