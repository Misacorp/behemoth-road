import { legalMoves, type GameState } from '@behemoth-road/core';
import { describe, expect, it } from 'vitest';
import { createHandler } from '../../src/index.ts';
import type { PlayerView } from '../../src/guild-game.ts';
import {
  MISA,
  ORIGIN,
  ROBIN,
  USER_ID,
  callHandler,
  fakeDiscord,
  freshGuildId,
  postAuth,
  runGame,
} from '../helpers.ts';

/**
 * Plays the contract scenario against the real Worker code (the Worker's routes for config and sign-in,
 * the guild's GuildGame with a fixed seed and clock for the game) and prints one `FIXTURE <json>` line.
 * `scripts/capture-fixtures.mjs` (`pnpm fixtures:capture`) runs it with `vitest.capture.config.ts` and
 * writes the files of `apps/web/src/api/fixtures`. It asserts only that each step answered as planned.
 */

/** Session tokens and access tokens are random: the fixtures carry a fixed stand-in of the same shape. */
const TOKEN = `s1.333333333333333333.${'A'.repeat(43)}.${'B'.repeat(43)}`;

describe('capture', () => {
  it('capture game', async () => {
    const responses: Record<string, unknown> = {};
    const errors: { route: string; status: number; body: unknown }[] = [];
    const requests: Record<string, { method: string; path: string; body: unknown }> = {};

    const handler = createHandler({
      createDiscord: () =>
        fakeDiscord({ instance: { location: { guild_id: freshGuildId() }, users: [USER_ID] } }),
    });
    responses['config'] = await (
      await callHandler(handler, new Request(`${ORIGIN}/api/config`))
    ).json();
    const authBody = { code: 'oauth-code', instanceId: 'instance-1' };
    requests['auth-session'] = { method: 'POST', path: '/api/auth/session', body: authBody };
    const auth = await (await postAuth(handler, authBody)).json<Record<string, unknown>>();
    responses['auth-session'] = { ...auth, token: TOKEN };

    await runGame(
      async (ctx) => {
        const misa = await ctx.signIn(MISA);
        const robin = await ctx.signIn(ROBIN);
        const ok = async (name: string, method: string, path: string, body?: unknown) => {
          if (body !== undefined) requests[name] = { method, path, body };
          const res = await ctx.call(misa, method, path, body);
          expect(res.status, name).toBe(200);
          responses[name] = res.body;
          return res.body as PlayerView;
        };
        const refused = async (token: string, method: string, path: string, body?: unknown) => {
          const res = await ctx.call(token, method, path, body);
          expect(res.status).toBeGreaterThanOrEqual(400);
          errors.push({ route: `${method} ${path}`, status: res.status, body: res.body });
        };

        await ok('view-new', 'GET', '/api/game');
        await ok('view-joined', 'POST', '/api/game/join', { role: 'scout', offer: 1 });
        expect(
          (await ctx.call(robin, 'POST', '/api/game/join', { role: 'keeper', offer: 0 })).status,
        ).toBe(200);
        const state = JSON.parse(
          ctx.sql.exec<{ state: string }>('SELECT state FROM game').one().state,
        ) as GameState;
        const target = legalMoves(state, `${USER_ID}.0`)[0];
        const { version } = (await ctx.call(misa, 'GET', '/api/game')).body as PlayerView;
        const moved = await ok('view-moved', 'POST', '/api/game/move', { version, path: [target] });
        responses['unchanged'] = (
          await ctx.call(misa, 'GET', `/api/game?since=${String(moved.version)}`)
        ).body;
        await ok('view-next-day', 'POST', '/api/dev/next-day', {});

        await refused(misa, 'POST', '/api/game/move', { version: 1, path: [target] });
        await refused(misa, 'POST', '/api/game/move', {
          version: moved.version + 1,
          path: [{ kind: 'hex', hex: { q: 40, r: 40 } }],
        });
        await refused(misa, 'POST', '/api/game/move', { version: 0, path: [], extra: true });
        await refused(misa, 'POST', '/api/game/replace', { role: 'keeper', offer: 0 });
        await refused('not-a-token', 'GET', '/api/game');

        // Lose Misa's character as the tick would, then replace it.
        const now = JSON.parse(
          ctx.sql.exec<{ state: string }>('SELECT state FROM game').one().state,
        ) as GameState;
        const lost = {
          ...now,
          characters: now.characters.map((c) =>
            c.id === `${USER_ID}.0` ? { ...c, status: 'lost' } : c,
          ),
        };
        ctx.sql.exec('UPDATE game SET state = ?, version = version + 1', JSON.stringify(lost));
        await ok('view-lost', 'GET', '/api/game');
        await ok('view-replaced', 'POST', '/api/game/replace', { role: 'envoy', offer: 2 });
      },
      { everyoneIsAdmin: true },
    );
    console.log('FIXTURE ' + JSON.stringify({ set: 'game', responses, errors, requests }));
  });
});
