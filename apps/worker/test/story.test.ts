import { describe, expect, it } from 'vitest';
import { STORY_IDS } from '../src/game-core.ts';
import type { PlayerView } from '../src/guild-game.ts';
import { MISA, ROBIN, runGame, type GameContext } from './helpers.ts';

const asView = (body: unknown) => body as PlayerView & { events?: { kind: string }[] };
const ADMIN = { everyoneIsAdmin: true };

const read = async (ctx: GameContext, token: string, ids: unknown) =>
  ctx.call(token, 'POST', '/api/me/story-read', ids === undefined ? undefined : { ids });

describe('the story in the view', () => {
  it('carries the public traces and story, and no ending while the season goes on', async () => {
    await runGame(async (ctx) => {
      const token = await ctx.signIn(MISA);
      const view = asView((await ctx.call(token, 'GET', '/api/game')).body);
      expect(view.game.traces).toEqual([]);
      // Setting out fired with the new game.
      expect(view.game.story.fired).toContain('beat.setting-out');
      expect(view.game.creature.kind).toBe('mossback');
      expect(view.ending).toBeNull();
      expect(view.you.storyRead).toEqual([]);
    });
  });

  it('logs a story event for what fires at the tick, readable with `since`', async () => {
    await runGame(async (ctx) => {
      const token = await ctx.signIn(MISA);
      await ctx.call(token, 'POST', '/api/game/join', { role: 'warden', offer: 0 });
      const first = asView((await ctx.call(token, 'GET', '/api/game')).body);
      let story = 0;
      for (let i = 0; i < 12 && story === 0; i++) {
        const next = asView((await ctx.call(token, 'POST', '/api/dev/next-day', {})).body);
        const since = asView(
          (await ctx.call(token, 'GET', `/api/game?since=${String(first.version)}`)).body,
        );
        story = (since.events ?? []).filter((e) => e.kind === 'story').length;
        expect(next.game.story.fired.length).toBeGreaterThanOrEqual(1);
      }
      expect(story).toBeGreaterThan(0);
    }, ADMIN);
  });

  it('carries the ending when the season is over', async () => {
    await runGame(async (ctx) => {
      const token = await ctx.signIn(MISA);
      await ctx.call(token, 'POST', '/api/game/join', { role: 'warden', offer: 0 });
      let view = asView((await ctx.call(token, 'GET', '/api/game')).body);
      for (let i = 0; i < 60 && view.game.season.status === 'on'; i++) {
        view = asView((await ctx.call(token, 'POST', '/api/dev/next-day', {})).body);
      }
      expect(view.game.season.status).toBe('over');
      expect(view.ending).toMatchObject({ creature: 'mossback', fate: 'stays' });
      expect(['Arrived', 'Arrived, wounded', 'Lost']).toContain(view.ending?.title);
    }, ADMIN);
  });
});

describe('what a player has read (POST /api/me/story-read)', () => {
  it('starts empty; a mark follows the player into every later view, in content order', async () => {
    await runGame(async (ctx) => {
      const token = await ctx.signIn(MISA);
      const res = await read(ctx, token, ['beat.greyfold', 'beat.setting-out']);
      expect(res).toEqual({
        status: 200,
        body: { storyRead: ['beat.setting-out', 'beat.greyfold'] },
      });
      const view = asView((await ctx.call(token, 'GET', '/api/game')).body);
      expect(view.you.storyRead).toEqual(['beat.setting-out', 'beat.greyfold']);
      // Another device: a new session of the same Discord user.
      const again = await ctx.signIn(MISA);
      expect(asView((await ctx.call(again, 'GET', '/api/game')).body).you.storyRead).toEqual([
        'beat.setting-out',
        'beat.greyfold',
      ]);
    });
  });

  it('is a union: repeats change nothing and nothing is removed', async () => {
    await runGame(async (ctx) => {
      const token = await ctx.signIn(MISA);
      await read(ctx, token, ['beat.first.settlement']);
      const res = await read(ctx, token, ['beat.setting-out', 'beat.first.settlement']);
      expect(res.body).toEqual({ storyRead: ['beat.setting-out', 'beat.first.settlement'] });
      const rows = ctx.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM story_read').one().n;
      expect(rows).toBe(2);
    });
  });

  it('is per player: the session decides whose record it is, never the body', async () => {
    await runGame(async (ctx) => {
      const misa = await ctx.signIn(MISA);
      const robin = await ctx.signIn(ROBIN);
      await read(ctx, misa, ['beat.setting-out']);
      expect(asView((await ctx.call(robin, 'GET', '/api/game')).body).you.storyRead).toEqual([]);
      const res = await ctx.call(robin, 'POST', '/api/me/story-read', {
        ids: ['beat.setting-out'],
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
        { ids: 'beat.setting-out' },
        { ids: [3] },
        { ids: ['intro'] },
        { ids: ['beat.setting-out'], extra: 1 },
        { ids: Array.from({ length: STORY_IDS.length + 1 }, () => 'beat.setting-out') },
        'beat.setting-out',
        null,
        '{"ids":["beat.setting-out"]',
      ];
      for (const body of bad) {
        const res = await ctx.call(token, 'POST', '/api/me/story-read', body);
        expect(res.status, JSON.stringify(body)).toBe(400);
      }
      expect(asView((await ctx.call(token, 'GET', '/api/game')).body).you.storyRead).toEqual([]);
    });
  });

  it('needs a session, and is not a game change', async () => {
    await runGame(async (ctx) => {
      const token = await ctx.signIn(MISA);
      const before = asView((await ctx.call(token, 'GET', '/api/game')).body).version;
      await read(ctx, token, ['beat.setting-out']);
      expect(asView((await ctx.call(token, 'GET', '/api/game')).body).version).toBe(before);
      expect((await read(ctx, 'not-a-token', ['beat.setting-out'])).status).toBe(401);
    });
  });

  it('is cleared with a new season, whose beats fire afresh', async () => {
    await runGame(async (ctx) => {
      const token = await ctx.signIn(MISA);
      await read(ctx, token, ['beat.setting-out']);
      const next = asView((await ctx.call(token, 'POST', '/api/dev/new-season', {})).body);
      expect(next.you.storyRead).toEqual([]);
      expect(asView((await ctx.call(token, 'GET', '/api/game')).body).you.storyRead).toEqual([]);
    }, ADMIN);
  });

  it('reads no rows for an unchanged poll, and none for a changed one once the reads are in memory', async () => {
    await runGame(async (ctx) => {
      const token = await ctx.signIn(MISA);
      await read(ctx, token, ['beat.setting-out', 'beat.greyfold']);
      const version = asView((await ctx.call(token, 'GET', '/api/game')).body).version;
      ctx.reads.reset();
      const res = await ctx.call(token, 'GET', `/api/game?since=${String(version)}`);
      expect(res.body).toEqual({ unchanged: true });
      expect(ctx.reads.sql).toBe(0);
    });
  });
});
