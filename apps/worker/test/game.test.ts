import { legalMoves, type GameState } from '@behemoth-road/core';
import { describe, expect, it } from 'vitest';
import type { PlayerView } from '../src/guild-game.ts';
import { SERVER_CONFIG } from '../src/server-config.ts';
import {
  DiscordError,
  MISA,
  ROBIN,
  SEED,
  T0,
  USER_ID,
  fakeGuildApi,
  runGame,
  type GameContext,
} from './helpers.ts';

const storedState = (sql: SqlStorage): GameState =>
  JSON.parse(
    sql.exec<{ state: string }>('SELECT state FROM game WHERE id = 1').one().state,
  ) as GameState;

const asView = (body: unknown) => body as PlayerView;

/** A season that cannot end soon: no peril from hunger, no threats, the default route. */
const CALM = { gameConfig: { perilHungry: 0, threatsMax: 0 } };

async function joined(ctx: GameContext, user = MISA, role = 'scout') {
  const token = await ctx.signIn(user);
  const res = await ctx.call(token, 'POST', '/api/game/join', { role, offer: 0 });
  expect(res.status).toBe(200);
  return { token, view: asView(res.body) };
}

describe('the game on first sign-in', () => {
  it('is created with a server-only seed and shows a view without it', async () => {
    await runGame(async (ctx) => {
      const token = await ctx.signIn(MISA);
      expect(storedState(ctx.sql).seed).toEqual(SEED);
      const { status, body } = await ctx.call(token, 'GET', '/api/game');
      expect(status).toBe(200);
      const view = asView(body);
      expect(view.version).toBe(1);
      expect(view.day).toBe(1);
      expect(view.you).toEqual({
        userId: USER_ID,
        characterId: null,
        admin: false,
        seen: [],
        lastDay: null,
        lastVersion: null,
        storyRead: [],
      });
      expect(view.players).toEqual([]);
      // Two or three rolled characters, then the plain one.
      expect(view.offers?.length).toBeGreaterThanOrEqual(3);
      expect(view.offers?.at(-1)).toMatchObject({ trait: null, quirk: null });
      expect(view.devTools).toBe(true);
      expect(view.game).not.toHaveProperty('seed');
      // Every known tile carries its terrain, so the client can draw and plan without the seed.
      const tiles = Object.values(view.game.tiles);
      expect(tiles.length).toBeGreaterThan(0);
      for (const tile of tiles) expect(typeof tile.terrain).toBe('string');
    });
  });

  it('keeps one game when more players sign in', async () => {
    await runGame(async (ctx) => {
      await ctx.signIn(MISA);
      await ctx.signIn(ROBIN);
      expect(ctx.sql.exec('SELECT COUNT(*) AS n FROM game').one().n).toBe(1);
    });
  });
});

describe('POST /api/game/join', () => {
  it('creates the character riding the creature, once', async () => {
    await runGame(async (ctx) => {
      const { token, view } = await joined(ctx);
      expect(view.version).toBe(2);
      expect(view.you.characterId).toBe(`${USER_ID}.0`);
      expect(view.offers).toBeNull();
      expect(view.players).toEqual([
        { userId: USER_ID, name: 'Misa', characterId: `${USER_ID}.0`, role: 'scout', joinedDay: 1 },
      ]);
      expect(view.game.characters).toEqual([
        {
          id: `${USER_ID}.0`,
          userId: USER_ID,
          name: expect.any(String) as string,
          trait: expect.any(String) as string,
          quirk: expect.any(String) as string,
          lookSeed: expect.any(Number) as number,
          role: 'scout',
          joinedDay: 1,
          at: { kind: 'creature' },
          actionsLeft: 3,
          pack: {},
          status: 'active',
          struckDay: null,
          stance: 'rest',
          waiting: false,
          skills: { xp: 0, taken: [] },
        },
      ]);
      // A second join changes nothing and answers the same view.
      const again = await ctx.call(token, 'POST', '/api/game/join', { role: 'warden', offer: 1 });
      expect(again.status).toBe(200);
      expect(asView(again.body).version).toBe(2);
      expect(asView(again.body).players[0]?.role).toBe('scout');
    });
  });

  it('rejects unknown keys, unknown roles and out-of-range choices', async () => {
    await runGame(async (ctx) => {
      const token = await ctx.signIn(MISA);
      for (const body of [
        { role: 'scout', offer: 0, userId: ROBIN.id },
        { role: 'pathfinder', offer: 0 },
        { role: 'scout' },
        { role: 'scout', offer: -1 },
        { role: 'scout', offer: 4 },
        { role: 'scout', offer: 0.5 },
        { role: 'scout', offer: '0' },
        [],
        'not json',
      ]) {
        const res = await ctx.call(token, 'POST', '/api/game/join', body);
        expect(res.status, JSON.stringify(body)).toBe(400);
      }
      // In the schema's range but past this player's offers (3 or 4 of them), unless all 4 are offered.
      const count = asView((await ctx.call(token, 'GET', '/api/game')).body).offers?.length ?? 0;
      const unoffered = await ctx.call(token, 'POST', '/api/game/join', {
        role: 'scout',
        offer: count,
      });
      expect(unoffered).toEqual(
        count < SERVER_CONFIG.limits.maxOffers
          ? { status: 409, body: { error: 'invalid-offer' } }
          : { status: 400, body: { error: 'invalid_body' } },
      );
    });
  });

  it('refuses a character past the player cap', async () => {
    await runGame(async (ctx) => {
      const misa = await ctx.signIn(MISA);
      const cap = storedState(ctx.sql).config.playerCap;
      for (let i = 0; i < cap; i++) {
        await joined(ctx, {
          id: `5000000000000000${String(i).padStart(2, '0')}`,
          displayName: `P${String(i)}`,
        });
      }
      const res = await ctx.call(misa, 'POST', '/api/game/join', { role: 'scout', offer: 0 });
      expect(res).toEqual({ status: 409, body: { error: 'cap-reached' } });
    });
  });
});

describe('POST /api/game/move', () => {
  it('moves the player own character and bumps the version', async () => {
    await runGame(async (ctx) => {
      const { token, view } = await joined(ctx);
      const target = legalMoves(storedState(ctx.sql), `${USER_ID}.0`)[0];
      if (target === undefined) throw new Error('no legal move from the creature');
      const res = await ctx.call(token, 'POST', '/api/game/move', {
        version: view.version,
        path: [target],
      });
      expect(res.status).toBe(200);
      const moved = asView(res.body);
      expect(moved.version).toBe(view.version + 1);
      expect(moved.game.characters[0]?.at).toEqual(target);
      expect(moved.game.characters[0]?.actionsLeft).toBeLessThan(3);
    });
  });

  it('refuses a stale version, a player without a character and an illegal move', async () => {
    await runGame(async (ctx) => {
      const robin = await ctx.signIn(ROBIN);
      const { token, view } = await joined(ctx);
      const far = { kind: 'hex', hex: { q: 50, r: 50 } };
      expect(
        await ctx.call(token, 'POST', '/api/game/move', { version: view.version - 1, path: [far] }),
      ).toEqual({
        status: 409,
        body: { error: 'stale' },
      });
      expect(
        await ctx.call(robin, 'POST', '/api/game/move', { version: view.version, path: [far] }),
      ).toEqual({
        status: 409,
        body: { error: 'no-character' },
      });
      const refused = await ctx.call(token, 'POST', '/api/game/move', {
        version: view.version,
        path: [far],
      });
      expect(refused.status).toBe(409);
      expect(refused.body).toEqual({ error: 'not-adjacent' });
      // Nothing changed.
      expect(asView((await ctx.call(token, 'GET', '/api/game')).body).version).toBe(view.version);
    });
  });

  it('checks every place strictly', async () => {
    await runGame(async (ctx) => {
      const { token, view } = await joined(ctx);
      const { maxCoordinate, maxPathLength } = SERVER_CONFIG.limits;
      const hex = (q: unknown, r: unknown) => ({ kind: 'hex', hex: { q, r } });
      for (const path of [
        [],
        [hex(maxCoordinate + 1, 0)],
        [hex(0, -maxCoordinate - 1)],
        [hex(0.5, 0)],
        [hex('0', 0)],
        [{ kind: 'hex', hex: { q: 0, r: 0, s: 0 } }],
        [{ kind: 'creature', hex: { q: 0, r: 0 } }],
        [{ kind: 'river' }],
        Array.from({ length: maxPathLength + 1 }, () => ({ kind: 'creature' })),
      ]) {
        const res = await ctx.call(token, 'POST', '/api/game/move', {
          version: view.version,
          path,
        });
        expect(res.status, JSON.stringify(path).slice(0, 80)).toBe(400);
      }
      for (const body of [
        { version: view.version, path: [{ kind: 'creature' }], characterId: `${ROBIN.id}.1` },
        { version: -1, path: [{ kind: 'creature' }] },
        { version: 1.5, path: [{ kind: 'creature' }] },
        { path: [{ kind: 'creature' }] },
      ]) {
        expect((await ctx.call(token, 'POST', '/api/game/move', body)).status).toBe(400);
      }
      const huge = JSON.stringify({
        version: view.version,
        path: [{ kind: 'creature' }],
        pad: 'x'.repeat(3000),
      });
      expect((await ctx.call(token, 'POST', '/api/game/move', huge)).status).toBe(400);
    });
  });
});

/** Marks a stored character lost, as the tick would when it is left behind. */
function lose(sql: SqlStorage, id: string): void {
  const state = storedState(sql);
  const next = {
    ...state,
    characters: state.characters.map((c) => (c.id === id ? { ...c, status: 'lost' } : c)),
  };
  sql.exec('UPDATE game SET state = ?, version = version + 1 WHERE id = 1', JSON.stringify(next));
}

describe('POST /api/game/replace', () => {
  it('only replaces a lost character, with a new one riding the creature', async () => {
    await runGame(async (ctx) => {
      const { token } = await joined(ctx);
      expect(
        await ctx.call(token, 'POST', '/api/game/replace', { role: 'keeper', offer: 0 }),
      ).toEqual({
        status: 409,
        body: { error: 'not-lost' },
      });
      lose(ctx.sql, `${USER_ID}.0`);
      const lostView = asView((await ctx.call(token, 'GET', '/api/game')).body);
      expect(lostView.offers?.length).toBeGreaterThanOrEqual(3);
      // Join does not replace: it answers the view unchanged.
      expect(
        asView((await ctx.call(token, 'POST', '/api/game/join', { role: 'keeper', offer: 0 })).body)
          .you.characterId,
      ).toBe(`${USER_ID}.0`);
      const res = await ctx.call(token, 'POST', '/api/game/replace', { role: 'keeper', offer: 1 });
      expect(res.status).toBe(200);
      const view = asView(res.body);
      expect(view.you.characterId).toBe(`${USER_ID}.1`);
      expect(view.players).toEqual([
        {
          userId: USER_ID,
          name: 'Misa',
          characterId: `${USER_ID}.1`,
          role: 'keeper',
          joinedDay: 1,
        },
      ]);
      expect(view.game.characters.map((c) => [c.id, c.status])).toEqual([
        [`${USER_ID}.0`, 'lost'],
        [`${USER_ID}.1`, 'active'],
      ]);
      expect(view.offers).toBeNull();
    });
  });

  it('refuses a player who never joined', async () => {
    await runGame(async (ctx) => {
      const token = await ctx.signIn(MISA);
      expect(
        (await ctx.call(token, 'POST', '/api/game/replace', { role: 'keeper', offer: 0 })).status,
      ).toBe(409);
    });
  });
});

describe('GET /api/game?since', () => {
  it('answers unchanged for the current version and the view otherwise', async () => {
    await runGame(async (ctx) => {
      const { token, view } = await joined(ctx);
      // Created at sign-in (1), then the join (2).
      expect(view.version).toBe(2);
      expect(await ctx.call(token, 'GET', `/api/game?since=${String(view.version)}`)).toEqual({
        status: 200,
        body: { unchanged: true },
      });
      expect(asView((await ctx.call(token, 'GET', '/api/game?since=1')).body).version).toBe(
        view.version,
      );
      for (const bad of ['abc', '-1', '1.5', '12345678901', '']) {
        expect((await ctx.call(token, 'GET', `/api/game?since=${bad}`)).status).toBe(400);
      }
    });
  });

  it('bumps the version when a player on the map changes their name', async () => {
    await runGame(async (ctx) => {
      const { view } = await joined(ctx);
      const token = await ctx.signIn({ ...MISA, displayName: 'Misa J' });
      const after = asView((await ctx.call(token, 'GET', '/api/game')).body);
      expect(after.version).toBe(view.version + 1);
      expect(after.players[0]?.name).toBe('Misa J');
    });
  });
});

describe('sessions and limits in the Durable Object', () => {
  it('expires a session after an hour idle', async () => {
    await runGame(async (ctx) => {
      const token = await ctx.signIn(MISA);
      ctx.clock.t += SERVER_CONFIG.sessions.idleMs;
      expect(await ctx.call(token, 'GET', '/api/game')).toEqual({
        status: 401,
        body: { error: 'invalid_session' },
      });
    });
  });

  it('rate limits each player', async () => {
    await runGame(async (ctx) => {
      const token = await ctx.signIn(MISA);
      const other = await ctx.signIn(ROBIN);
      const { capacity } = SERVER_CONFIG.rateLimits.game;
      for (let i = 0; i < capacity; i++)
        expect((await ctx.call(token, 'GET', '/api/game')).status).toBe(200);
      expect((await ctx.call(token, 'GET', '/api/game')).status).toBe(429);
      expect((await ctx.call(other, 'GET', '/api/game')).status).toBe(200);
    });
  });

  it('answers unknown routes with 404', async () => {
    await runGame(async (ctx) => {
      const token = await ctx.signIn(MISA);
      expect((await ctx.call(token, 'GET', '/api/game/join')).status).toBe(404);
      expect((await ctx.call(token, 'POST', '/api/constructor')).status).toBe(404);
    });
  });
});

describe('POST /api/dev/next-day', () => {
  const owner = (guildId: string) => fakeGuildApi(guildId, { ownerId: USER_ID });

  it('runs the tick for a server admin and leaves the schedule alone', async () => {
    const guildId = '600000000000000001';
    await runGame(
      async (ctx) => {
        const { token, view } = await joined(ctx);
        expect(view.devTools).toBe(true);
        expect(view.you.admin).toBe(true);
        const alarm = await ctx.storage.getAlarm();
        const res = await ctx.call(token, 'POST', '/api/dev/next-day', {});
        expect(res.status).toBe(200);
        expect(asView(res.body).day).toBe(2);
        expect(asView(res.body).version).toBe(view.version + 1);
        expect(await ctx.storage.getAlarm()).toBe(alarm);
        expect((await ctx.call(token, 'POST', '/api/dev/next-day', { day: 3 })).status).toBe(400);
      },
      { guildId, guildApi: owner(guildId) },
    );
  });

  it('refuses a player who may not manage the server, and says so when Discord is down', async () => {
    await runGame(
      async (ctx) => {
        const token = await ctx.signIn(ROBIN);
        expect(await ctx.call(token, 'POST', '/api/dev/next-day', {})).toEqual({
          status: 403,
          body: { error: 'forbidden' },
        });
        expect(asView((await ctx.call(token, 'GET', '/api/game')).body).you.admin).toBe(false);
      },
      { guildApi: fakeGuildApi('600000000000000002', { ownerId: USER_ID }) },
    );
    await runGame(
      async (ctx) => {
        const token = await ctx.signIn(MISA);
        expect((await ctx.call(token, 'POST', '/api/dev/next-day', {})).status).toBe(503);
      },
      {
        guildApi: fakeGuildApi('600000000000000003', { failure: new DiscordError('unavailable') }),
      },
    );
  });

  it('does not exist with the dev tools off, even for an admin', async () => {
    const guildId = '600000000000000004';
    await runGame(
      async (ctx) => {
        const token = await ctx.signIn(MISA);
        expect(await ctx.call(token, 'POST', '/api/dev/next-day', {})).toEqual({
          status: 404,
          body: { error: 'not_found' },
        });
        const view = asView((await ctx.call(token, 'GET', '/api/game')).body);
        expect(view.devTools).toBe(false);
        expect(view.you.admin).toBe(false);
      },
      { guildId, devTools: false, guildApi: owner(guildId) },
    );
  });
});

describe('the day tick', () => {
  const tickAt = (iso: string) => Date.parse(iso);

  it('arms the alarm for 06:00 Helsinki and runs the tick when it fires', async () => {
    await runGame(async (ctx) => {
      await joined(ctx);
      // T0 is 15:00 in Helsinki (UTC+3 in summer): the next tick is tomorrow at 06:00, 03:00Z.
      expect(await ctx.storage.getAlarm()).toBe(tickAt('2030-06-02T03:00:00Z'));
      ctx.clock.t = tickAt('2030-06-02T03:00:00Z');
      await ctx.game.alarm();
      expect(storedState(ctx.sql).day).toBe(2);
      expect(await ctx.storage.getAlarm()).toBe(tickAt('2030-06-03T03:00:00Z'));
      // A repeated alarm runs nothing more.
      await ctx.game.alarm();
      expect(storedState(ctx.sql).day).toBe(2);
    });
  });

  it('keeps 06:00 local across the autumn and spring clock changes', async () => {
    await runGame(
      async (ctx) => {
        await ctx.signIn(MISA);
        // Clocks go back on 2030-10-27: 06:00 is 03:00Z on the 26th (UTC+3) and 04:00Z from the 27th.
        expect(await ctx.storage.getAlarm()).toBe(tickAt('2030-10-27T04:00:00Z'));
        ctx.clock.t = tickAt('2030-10-27T04:00:00Z');
        await ctx.game.alarm();
        expect(await ctx.storage.getAlarm()).toBe(tickAt('2030-10-28T04:00:00Z'));
      },
      { now: () => tickAt('2030-10-26T12:00:00Z') },
    );
    await runGame(
      async (ctx) => {
        await ctx.signIn(MISA);
        // Clocks go forward on 2030-03-31: 06:00 is 04:00Z on the 30th (UTC+2) and 03:00Z from the 31st.
        expect(await ctx.storage.getAlarm()).toBe(tickAt('2030-03-31T03:00:00Z'));
        ctx.clock.t = tickAt('2030-03-31T03:00:00Z');
        await ctx.game.alarm();
        expect(await ctx.storage.getAlarm()).toBe(tickAt('2030-04-01T03:00:00Z'));
      },
      { now: () => tickAt('2030-03-30T12:00:00Z') },
    );
  });

  it('catches up missed ticks on the next request, up to the limit', async () => {
    // A calm season (no hunger peril, no threats, the full route), so it cannot end within the jump.
    await runGame(async (ctx) => {
      await joined(ctx);
      // Sessions idle out after an hour, so each look after a jump signs in again.
      ctx.clock.t = T0 + 2 * 24 * 3600_000;
      const first = await ctx.signIn(MISA);
      expect(asView((await ctx.call(first, 'GET', '/api/game')).body).day).toBe(3);
      ctx.clock.t = T0 + 30 * 24 * 3600_000;
      const second = await ctx.signIn(MISA);
      const view = asView((await ctx.call(second, 'GET', '/api/game')).body);
      expect(view.day).toBe(3 + SERVER_CONFIG.maxCatchUpTicks);
      const alarm = await ctx.storage.getAlarm();
      expect(alarm).toBeGreaterThan(ctx.clock.t);
      expect(alarm).toBeLessThanOrEqual(ctx.clock.t + 24 * 3600_000);
    }, CALM);
  });
});
