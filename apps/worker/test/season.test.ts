import { describe, expect, it } from 'vitest';
import { CONTENT_VERSION, type GameState, type Seed } from '../src/game-core.ts';
import { seasonConfig, type PlayerView } from '../src/guild-game.ts';
import { SERVER_CONFIG } from '../src/server-config.ts';
import { DEV_SEASON } from '../../../packages/core/scripts/balance.ts';
import {
  DiscordError,
  MISA,
  ROBIN,
  SEED,
  USER_ID,
  expectNoSeed,
  fakeGuildApi,
  runGame,
  type GameContext,
} from './helpers.ts';

/** Milestone 5 through the API: the new actions' bodies, the dev season, its end and a new season. */

type Answer = PlayerView & { events?: { kind: string }[]; eventsTruncated?: boolean };
const asView = (body: unknown) => body as Answer;

const storedState = (sql: SqlStorage): GameState =>
  JSON.parse(
    sql.exec<{ state: string }>('SELECT state FROM game WHERE id = 1').one().state,
  ) as GameState;

async function joined(ctx: GameContext, role = 'guardian') {
  const token = await ctx.signIn(MISA);
  const res = await ctx.call(token, 'POST', '/api/game/join', { role, offer: 0 });
  expect(res.status).toBe(200);
  return { token, version: asView(res.body).version };
}

/** Every player counts as a server admin (as locally), so the dev routes answer. */
const ADMIN = { everyoneIsAdmin: true };

/** Runs next day until the season is over (the dev season is short); returns the last view. */
async function playToTheEnd(ctx: GameContext, token: string): Promise<Answer> {
  for (let i = 0; i < 60; i++) {
    const res = await ctx.call(token, 'POST', '/api/dev/next-day', {});
    if (res.status !== 200)
      throw new Error(`next day: ${String(res.status)} ${JSON.stringify(res.body)}`);
    const view = asView(res.body);
    if (view.game.season.status === 'over') return view;
  }
  throw new Error('the season did not end');
}

describe('the five Milestone 5 actions', () => {
  it('reach the core, which answers their refusals', async () => {
    await runGame(async (ctx) => {
      const { token, version } = await joined(ctx);
      // Day 1: no threat and no settlement yet, so each is a core refusal with nothing changed.
      for (const [action, reason] of [
        [{ kind: 'strike', threat: 't1' }, 'no-threat'],
        [{ kind: 'parley' }, 'no-settlement'],
        [{ kind: 'offer', material: 'forage' }, 'no-settlement'],
        [{ kind: 'ask-boon', boon: 'gift' }, 'no-settlement'],
      ] as const) {
        const res = await ctx.call(token, 'POST', '/api/game/act', { version, action });
        expect(res, JSON.stringify(action)).toEqual({ status: 409, body: { error: reason } });
      }
      // A guardian riding the creature defends; a second defence the same day is refused.
      const defended = await ctx.call(token, 'POST', '/api/game/act', {
        version,
        action: { kind: 'defend' },
      });
      expect(defended.status).toBe(200);
      expect(asView(defended.body).events).toEqual([
        { kind: 'defend', characterId: `${USER_ID}.0`, version: version + 1 },
      ]);
      const again = await ctx.call(token, 'POST', '/api/game/act', {
        version: version + 1,
        action: { kind: 'defend' },
      });
      expect(again).toEqual({ status: 409, body: { error: 'already-have' } });
    });
  });

  it('take only their own shape: unknown keys, missing or bad strings are refused', async () => {
    await runGame(async (ctx) => {
      const { token, version } = await joined(ctx);
      for (const action of [
        { kind: 'strike' },
        { kind: 'strike', threat: '' },
        { kind: 'strike', threat: 't'.repeat(65) },
        { kind: 'strike', threat: 7 },
        { kind: 'strike', threat: 'T1<script>' },
        { kind: 'strike', threat: 't1', damage: 9 },
        { kind: 'defend', threat: 't1' },
        { kind: 'parley', id: 's3' },
        { kind: 'offer' },
        { kind: 'offer', material: 'x'.repeat(65) },
        { kind: 'offer', material: 'forage', amount: 2 },
        { kind: 'ask-boon' },
        { kind: 'ask-boon', boon: 'gift', settlement: 's3' },
        { kind: 'ask-boon', boon: ['gift'] },
      ]) {
        const res = await ctx.call(token, 'POST', '/api/game/act', { version, action });
        expect(res, JSON.stringify(action)).toEqual({
          status: 400,
          body: { error: 'invalid_body' },
        });
      }
    });
  });

  it('passes an unknown boon to the core by name', async () => {
    await runGame(async (ctx) => {
      const { token, version } = await joined(ctx);
      const res = await ctx.call(token, 'POST', '/api/game/act', {
        version,
        action: { kind: 'ask-boon', boon: 'wishes' },
      });
      expect(res.status).toBe(409);
    });
  });
});

describe('the season config', () => {
  it('is the short dev season only with the dev tools on', async () => {
    expect(seasonConfig(true)).toEqual(SERVER_CONFIG.devSeason);
    expect(seasonConfig(false)).toEqual({});
    // The core's balance simulation plays the same dev season.
    expect(DEV_SEASON).toEqual(SERVER_CONFIG.devSeason);
    await runGame(async (ctx) => {
      const view = asView((await ctx.call(await ctx.signIn(MISA), 'GET', '/api/game')).body);
      expect(view.game.config).toMatchObject(SERVER_CONFIG.devSeason);
    });
    await runGame(
      async (ctx) => {
        const view = asView((await ctx.call(await ctx.signIn(MISA), 'GET', '/api/game')).body);
        expect(view.game.config.routeLength).toBe(40);
        expect(view.game.config.threatsFromDay).toBe(3);
      },
      { devTools: false },
    );
  });

  it('applies to a game that replaces an outdated one', async () => {
    await runGame(async (ctx) => {
      await ctx.signIn(MISA);
      ctx.sql.exec(
        'UPDATE game SET state = ? WHERE id = 1',
        JSON.stringify({ ...storedState(ctx.sql), contentVersion: 5 }),
      );
      ctx.game.migrate();
      const fresh = storedState(ctx.sql);
      expect(fresh.contentVersion).toBe(CONTENT_VERSION);
      expect(fresh.config).toMatchObject(SERVER_CONFIG.devSeason);
    });
  });

  it('schedules the replacing game from now: an old missed schedule runs no ticks on it', async () => {
    await runGame(async (ctx) => {
      await ctx.signIn(MISA);
      ctx.sql.exec(
        'UPDATE game SET state = ?, next_tick_at = ? WHERE id = 1',
        JSON.stringify({ ...storedState(ctx.sql), contentVersion: 5 }),
        ctx.clock.t - 30 * 24 * 3600_000,
      );
      ctx.game.migrate();
      const view = asView((await ctx.call(await ctx.signIn(MISA), 'GET', '/api/game')).body);
      expect(view.day).toBe(1);
      const alarm = await ctx.storage.getAlarm();
      expect(alarm).toBeGreaterThan(ctx.clock.t);
      expect(alarm).toBeLessThanOrEqual(ctx.clock.t + 24 * 3600_000);
    });
  });
});

describe('the end of a season', () => {
  it('stops the schedule: no alarm, no catch-up, and next day changes nothing', async () => {
    await runGame(async (ctx) => {
      const { token } = await joined(ctx);
      const ended = await playToTheEnd(ctx, token);
      // The next request after the season ended takes the alarm away.
      await ctx.call(token, 'GET', '/api/game');
      expect(await ctx.storage.getAlarm()).toBeNull();
      const same = await ctx.call(token, 'POST', '/api/dev/next-day', {});
      expect(same.status).toBe(200);
      expect(asView(same.body).version).toBe(ended.version);
      // Weeks later: still the same game, nothing run.
      ctx.clock.t += 30 * 24 * 3600_000;
      // Sessions idle out after an hour, so the look after the jump signs in again.
      const fresh = await ctx.signIn(MISA);
      const later = asView((await ctx.call(fresh, 'GET', '/api/game')).body);
      expect(later.version).toBe(ended.version);
      expect(later.day).toBe(ended.day);
      expect(await ctx.storage.getAlarm()).toBeNull();
      await ctx.game.alarm();
      expect(await ctx.storage.getAlarm()).toBeNull();
      // Every move and action is refused by the core.
      const act = await ctx.call(fresh, 'POST', '/api/game/act', {
        version: ended.version,
        action: { kind: 'defend' },
      });
      expect(act).toEqual({ status: 409, body: { error: 'season-over' } });
    }, ADMIN);
  });
});

describe('POST /api/dev/new-season', () => {
  const owner = (guildId: string) => fakeGuildApi(guildId, { ownerId: USER_ID });

  it('replaces the game with a new seed; players stay signed in and join again', async () => {
    const guildId = '600000000000000011';
    const next: Seed = [2718000001, 2718000002, 2718000003, 2718000004];
    const seeds: Seed[] = [SEED, next];
    let made = 0;
    await runGame(
      async (ctx) => {
        const { token } = await joined(ctx);
        const ended = await playToTheEnd(ctx, token);
        const res = await ctx.call(token, 'POST', '/api/dev/new-season', {});
        expect(res.status).toBe(200);
        expectNoSeed(res.body, next);
        const view = asView(res.body);
        expect(view.version).toBeGreaterThan(ended.version);
        expect(view.day).toBe(1);
        expect(view.game.season).toEqual({ status: 'on' });
        expect(view.game.characters).toEqual([]);
        expect(view.you.characterId).toBeNull();
        expect(view.offers?.length).toBeGreaterThan(0);
        expect(view.players).toEqual([]);
        expect(storedState(ctx.sql).seed).toEqual(next);
        expect(storedState(ctx.sql).config).toMatchObject(SERVER_CONFIG.devSeason);
        // The old game's events are gone: a client that saw it is told to reload.
        const since = asView(
          (await ctx.call(token, 'GET', `/api/game?since=${String(ended.version)}`)).body,
        );
        expect(since.eventsTruncated).toBe(true);
        expect(since.events).toEqual([]);
        // The schedule starts again.
        const alarm = await ctx.storage.getAlarm();
        expect(alarm).toBeGreaterThan(ctx.clock.t);
        expect(alarm).toBeLessThanOrEqual(ctx.clock.t + 24 * 3600_000);
        const rejoined = await ctx.call(token, 'POST', '/api/game/join', {
          role: 'envoy',
          offer: 0,
        });
        expect(rejoined.status).toBe(200);
        expect(asView((await ctx.call(token, 'POST', '/api/dev/next-day', {})).body).game.day).toBe(
          2,
        );
      },
      {
        guildId,
        guildApi: owner(guildId),
        newSeed: () => seeds[Math.min(made++, 1)] ?? next,
      },
    );
  });

  it('refuses a non-admin, says when Discord is down, and takes only an empty body', async () => {
    const guildId = '600000000000000012';
    await runGame(
      async (ctx) => {
        const robin = await ctx.signIn(ROBIN);
        const before = storedState(ctx.sql);
        expect(await ctx.call(robin, 'POST', '/api/dev/new-season', {})).toEqual({
          status: 403,
          body: { error: 'forbidden' },
        });
        const misa = await ctx.signIn(MISA);
        expect((await ctx.call(misa, 'POST', '/api/dev/new-season', { seed: 1 })).status).toBe(400);
        expect(storedState(ctx.sql)).toEqual(before);
      },
      { guildId, guildApi: owner(guildId) },
    );
    await runGame(
      async (ctx) => {
        const token = await ctx.signIn(MISA);
        expect((await ctx.call(token, 'POST', '/api/dev/new-season', {})).status).toBe(503);
      },
      {
        guildApi: fakeGuildApi('600000000000000013', { failure: new DiscordError('unavailable') }),
      },
    );
  });

  it('does not exist with the dev tools off, even for an admin', async () => {
    const guildId = '600000000000000014';
    await runGame(
      async (ctx) => {
        const token = await ctx.signIn(MISA);
        expect(await ctx.call(token, 'POST', '/api/dev/new-season', {})).toEqual({
          status: 404,
          body: { error: 'not_found' },
        });
      },
      { guildId, devTools: false, guildApi: owner(guildId) },
    );
  });
});
