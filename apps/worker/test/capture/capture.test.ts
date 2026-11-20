import { checkAction, hexKey, legalMoves, neighbours, type GameState } from '@behemoth-road/core';
import { describe, expect, it } from 'vitest';
import { createHandler } from '../../src/handler.ts';
import type { PlayerView } from '../../src/guild-game.ts';
import {
  MISA,
  ORIGIN,
  ROBIN,
  STRANGER_GUILD_ID,
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

    const guildId = freshGuildId();
    const handler = createHandler({
      createDiscord: () =>
        fakeDiscord({ instance: { location: { guild_id: guildId }, users: [USER_ID] } }),
    });
    responses['config'] = await (
      await callHandler(handler, new Request(`${ORIGIN}/api/config`))
    ).json();
    const authBody = { code: 'oauth-code', instanceId: 'instance-1' };
    requests['auth-session'] = { method: 'POST', path: '/api/auth/session', body: authBody };
    const signedIn = await postAuth(handler, authBody);
    expect(signedIn.status).toBe(200);
    const auth = await signedIn.json<Record<string, unknown>>();
    responses['auth-session'] = { ...auth, token: TOKEN };
    const stranger = createHandler({
      createDiscord: () =>
        fakeDiscord({ instance: { location: { guild_id: STRANGER_GUILD_ID }, users: [USER_ID] } }),
    });
    const refusedSignIn = await postAuth(stranger, authBody);
    errors.push({
      route: 'POST /api/auth/session',
      status: refusedSignIn.status,
      body: await refusedSignIn.json(),
    });

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
        const read = () =>
          JSON.parse(
            ctx.sql.exec<{ state: string }>('SELECT state FROM game').one().state,
          ) as GameState;
        const versionNow = async () =>
          ((await ctx.call(misa, 'GET', '/api/game')).body as PlayerView).version;
        const me = `${USER_ID}.0`;

        await ok('view-joined', 'POST', '/api/game/join', { role: 'engineer', offer: 1 });
        expect(
          (await ctx.call(robin, 'POST', '/api/game/join', { role: 'scout', offer: 0 })).status,
        ).toBe(200);
        // The team stores hold a grappling hook's cost: the engineer, riding, starts building it.
        ctx.sql.exec(
          'UPDATE game SET state = ?, version = version + 1',
          JSON.stringify({ ...read(), stores: { iron: 2, timber: 1 } }),
        );
        await ok('view-built', 'POST', '/api/game/act', {
          version: await versionNow(),
          action: { kind: 'build', unlock: 'grappling-hook' },
        });
        const target = legalMoves(read(), me)[0];
        const moved = await ok('view-moved', 'POST', '/api/game/move', {
          version: await versionNow(),
          path: [target],
        });
        // Robin catches up on Misa's walk: the view and the walk's events.
        const since = await ctx.call(robin, 'GET', `/api/game?since=${String(moved.version - 1)}`);
        expect(since.status).toBe(200);
        responses['view-since'] = since.body;
        responses['unchanged'] = (
          await ctx.call(misa, 'GET', `/api/game?since=${String(moved.version)}`)
        ).body;
        await ok('view-next-day', 'POST', '/api/dev/next-day', {});
        // Survey the first neighbouring hex the rules allow.
        const here = read().characters.find((c) => c.id === me)?.at;
        const surveyable =
          here?.kind === 'hex'
            ? neighbours(here.hex).find(
                (hex) => checkAction(read(), me, { kind: 'survey', hex }).ok,
              )
            : undefined;
        if (surveyable === undefined) throw new Error('the scenario has no hex to survey');
        await ok('view-surveyed', 'POST', '/api/game/act', {
          version: await versionNow(),
          action: { kind: 'survey', hex: surveyable },
        });
        await refused(misa, 'POST', '/api/game/act', {
          version: await versionNow(),
          action: { kind: 'build', unlock: 'lantern' },
        });

        await refused(misa, 'POST', '/api/game/move', { version: 1, path: [target] });
        await refused(misa, 'POST', '/api/game/move', {
          version: await versionNow(),
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

    // Milestone 4: a keeper forages, lights a fire, feeds and lingers the creature; after the tick the
    // keeper reads a cue and a clear appetite, a non-keeper only a faint one.
    await runGame(
      async (ctx) => {
        const misa = await ctx.signIn(MISA);
        const robin = await ctx.signIn(ROBIN);
        const read = () =>
          JSON.parse(
            ctx.sql.exec<{ state: string }>('SELECT state FROM game').one().state,
          ) as GameState;
        const write = (state: GameState) =>
          ctx.sql.exec('UPDATE game SET state = ?, version = version + 1', JSON.stringify(state));
        const versionNow = async () =>
          ((await ctx.call(misa, 'GET', '/api/game')).body as PlayerView).version;
        const ok = async (
          name: string,
          token: string,
          method: string,
          path: string,
          body?: unknown,
        ) => {
          if (body !== undefined) requests[name] = { method, path, body };
          const res = await ctx.call(token, method, path, body);
          expect(res.status, name).toBe(200);
          responses[name] = res.body;
          return res.body as PlayerView;
        };
        const refused = async (token: string, body: unknown) => {
          const res = await ctx.call(token, 'POST', '/api/game/act', body);
          expect(res.status).toBe(409);
          errors.push({ route: 'POST /api/game/act', status: res.status, body: res.body });
        };
        const me = `${USER_ID}.0`;
        const withMe = (state: GameState, change: Partial<GameState['characters'][number]>) => ({
          ...state,
          characters: state.characters.map((c) => (c.id === me ? { ...c, ...change } : c)),
        });

        expect(
          (await ctx.call(misa, 'POST', '/api/game/join', { role: 'keeper', offer: 0 })).status,
        ).toBe(200);
        expect(
          (await ctx.call(robin, 'POST', '/api/game/join', { role: 'scout', offer: 0 })).status,
        ).toBe(200);
        await refused(robin, { version: await versionNow(), action: { kind: 'linger' } });

        // Place the keeper beside the creature, on a hex that burns, with timber and a berry bush.
        const start = read();
        const hex = legalMoves(start, me)
          .flatMap((p) => (p.kind === 'hex' ? [p.hex] : []))
          .find(
            (h) =>
              checkAction(withMe(start, { at: { kind: 'hex', hex: h }, pack: { timber: 1 } }), me, {
                kind: 'light-fire',
              }).ok,
          );
        if (hex === undefined) throw new Error('the scenario has no hex to light a fire on');
        write({
          ...withMe(start, { at: { kind: 'hex', hex }, pack: { timber: 1 } }),
          features: {
            ...start.features,
            [hexKey(hex)]: { type: 'berry-bushes', revealed: true, left: 2 },
          },
        });
        await ok('view-foraged', misa, 'POST', '/api/game/act', {
          version: await versionNow(),
          action: { kind: 'gather' },
        });
        await ok('view-fire-lit', misa, 'POST', '/api/game/act', {
          version: await versionNow(),
          action: { kind: 'light-fire' },
        });

        // Back on the creature with the forage in the stores and fresh actions.
        const lit = read();
        const actions = lit.config.actionsPerDay;
        write({
          ...withMe(lit, { at: { kind: 'creature' }, pack: {}, actionsLeft: actions }),
          stores: { forage: 1 },
        });
        await ok('view-fed', misa, 'POST', '/api/game/act', {
          version: await versionNow(),
          action: { kind: 'feed' },
        });
        await refused(misa, { version: await versionNow(), action: { kind: 'feed' } });
        const lingered = await ok('view-lingered', misa, 'POST', '/api/game/act', {
          version: await versionNow(),
          action: { kind: 'linger' },
        });

        // Hungry enough that the tick leaves it underfed at level 2: the non-keeper sees it faintly.
        const fed = read();
        write({ ...fed, care: { ...fed.care, satiety: 3 } });
        const cue = await ok('view-keeper-cue', misa, 'POST', '/api/dev/next-day', {});
        expect(cue.signs.cues.length).toBeGreaterThan(0);
        expect(cue.signs.appetite).toMatchObject({ kind: 'underfed', faint: false });
        const other = await ok('view-not-keeper', robin, 'GET', '/api/game');
        expect(other.signs).toMatchObject({ cues: [], appetite: { level: 1, faint: true } });
        // The tick's events from the log, as a client that saw the linger asks for them: the creature
        // stays (a step from its centre to the same centre) and the fire goes out.
        const tickEvents = await ok(
          'view-care-since',
          robin,
          'GET',
          `/api/game?since=${String(lingered.version)}`,
        );
        const kinds = (tickEvents as unknown as { events: { kind: string }[] }).events.map(
          (e) => e.kind,
        );
        expect(kinds).toEqual(expect.arrayContaining(['creature-step', 'fire-out']));
        await refused(misa, { version: await versionNow(), action: { kind: 'linger' } });

        // Starving with forage in the stores: the next tick it eats from them.
        const before = await versionNow();
        const hungry = read();
        write({ ...hungry, stores: { forage: 1 }, care: { ...hungry.care, satiety: 2 } });
        expect((await ctx.call(misa, 'POST', '/api/dev/next-day', {})).status).toBe(200);
        const ate = await ok(
          'view-creature-ate',
          robin,
          'GET',
          `/api/game?since=${String(before)}`,
        );
        expect(
          (ate as unknown as { events: { kind: string }[] }).events.map((e) => e.kind),
        ).toContain('creature-ate');
      },
      { everyoneIsAdmin: true },
    );
    console.log('FIXTURE ' + JSON.stringify({ set: 'game', responses, errors, requests }));
  });
});
