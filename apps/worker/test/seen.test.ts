import { describe, expect, it } from 'vitest';
import type { PlayerView } from '../src/guild-game.ts';
import { MISA, ROBIN, runGame } from './helpers.ts';

const asView = (body: unknown) => body as PlayerView;

describe('the seen record (POST /api/me/seen)', () => {
  it('starts empty, and a mark follows the player into every later view', async () => {
    await runGame(async (ctx) => {
      const token = await ctx.signIn(MISA);
      expect(asView((await ctx.call(token, 'GET', '/api/game')).body).you.seen).toEqual([]);
      const res = await ctx.call(token, 'POST', '/api/me/seen', { ids: ['intro', 'hint:fog'] });
      expect(res).toEqual({ status: 200, body: { seen: ['intro', 'hint:fog'] } });
      expect(asView((await ctx.call(token, 'GET', '/api/game')).body).you.seen).toEqual([
        'intro',
        'hint:fog',
      ]);
      // Another device: a new session of the same Discord user sees the same record.
      const again = await ctx.signIn(MISA);
      expect(asView((await ctx.call(again, 'GET', '/api/game')).body).you.seen).toEqual([
        'intro',
        'hint:fog',
      ]);
    });
  });

  it('is a union: repeats change nothing and nothing is ever removed', async () => {
    await runGame(async (ctx) => {
      const token = await ctx.signIn(MISA);
      await ctx.call(token, 'POST', '/api/me/seen', { ids: ['practice'] });
      const res = await ctx.call(token, 'POST', '/api/me/seen', {
        ids: ['intro', 'intro', 'practice'],
      });
      expect(res.body).toEqual({ seen: ['intro', 'practice'] });
    });
  });

  it('is per player: the session decides whose record it is', async () => {
    await runGame(async (ctx) => {
      const misa = await ctx.signIn(MISA);
      const robin = await ctx.signIn(ROBIN);
      await ctx.call(misa, 'POST', '/api/me/seen', { ids: ['intro'] });
      expect(asView((await ctx.call(robin, 'GET', '/api/game')).body).you.seen).toEqual([]);
      // A body cannot name another player.
      const res = await ctx.call(robin, 'POST', '/api/me/seen', {
        ids: ['intro'],
        userId: MISA.id,
      });
      expect(res.status).toBe(400);
    });
  });

  it('rejects unknown ids, extra keys, empty and oversized lists, and other shapes', async () => {
    await runGame(async (ctx) => {
      const token = await ctx.signIn(MISA);
      const bad: unknown[] = [
        {},
        { ids: [] },
        { ids: ['nope'] },
        { ids: 'intro' },
        { ids: [3] },
        { ids: ['intro'], extra: 1 },
        { ids: Array.from({ length: 40 }, () => 'intro') },
        'intro',
        null,
        '{"ids":["intro"]',
      ];
      for (const body of bad) {
        const res = await ctx.call(token, 'POST', '/api/me/seen', body);
        expect(res.status, JSON.stringify(body)).toBe(400);
      }
      expect(asView((await ctx.call(token, 'GET', '/api/game')).body).you.seen).toEqual([]);
    });
  });

  it('needs a session, and is not a game change', async () => {
    await runGame(async (ctx) => {
      const token = await ctx.signIn(MISA);
      const before = asView((await ctx.call(token, 'GET', '/api/game')).body).version;
      await ctx.call(token, 'POST', '/api/me/seen', { ids: ['intro'] });
      expect(asView((await ctx.call(token, 'GET', '/api/game')).body).version).toBe(before);
      const res = await ctx.call('not-a-token', 'POST', '/api/me/seen', { ids: ['intro'] });
      expect(res.status).toBe(401);
    });
  });
});

describe('the last visit (POST /api/me/visit, for the recap)', () => {
  it('is null on a first visit; a read changes nothing; a visit records the day and version', async () => {
    await runGame(async (ctx) => {
      const token = await ctx.signIn(MISA);
      const first = asView((await ctx.call(token, 'GET', '/api/game')).body);
      expect(first.you.lastDay).toBeNull();
      expect(first.you.lastVersion).toBeNull();
      // Reading again moves nothing on.
      expect(asView((await ctx.call(token, 'GET', '/api/game')).body).you.lastDay).toBeNull();
      expect((await ctx.call(token, 'POST', '/api/me/visit', {})).status).toBe(200);
      const second = asView((await ctx.call(token, 'GET', '/api/game')).body);
      expect(second.you.lastDay).toBe(first.day);
      expect(second.you.lastVersion).toBe(first.version);
    });
  });

  it('keeps the previous visit until the next one, across a day change', async () => {
    await runGame(async (ctx) => {
      const token = await ctx.signIn(MISA);
      const first = asView((await ctx.call(token, 'GET', '/api/game')).body);
      await ctx.call(token, 'POST', '/api/me/visit', {});
      // The daily alarm turns the day (06:00 Helsinki; the fake clock starts at 15:00 the day before).
      ctx.clock.t = Date.parse('2030-06-02T03:00:00Z');
      await ctx.game.alarm();
      // The next morning, on a new session.
      const morning = await ctx.signIn(MISA);
      const reopened = asView((await ctx.call(morning, 'GET', '/api/game')).body);
      expect(reopened.day).toBe(first.day + 1);
      expect(reopened.you.lastDay).toBe(first.day);
      expect(reopened.you.lastVersion).toBe(first.version);
      await ctx.call(morning, 'POST', '/api/me/visit', {});
      expect(asView((await ctx.call(morning, 'GET', '/api/game')).body).you.lastDay).toBe(
        reopened.day,
      );
    });
  });

  it('takes an empty body only, and a session', async () => {
    await runGame(async (ctx) => {
      const token = await ctx.signIn(MISA);
      expect((await ctx.call(token, 'POST', '/api/me/visit', { day: 9 })).status).toBe(400);
      expect((await ctx.call('not-a-token', 'POST', '/api/me/visit', {})).status).toBe(401);
    });
  });
});
