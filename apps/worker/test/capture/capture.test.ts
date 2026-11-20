import {
  checkAction,
  hexDistance,
  hexKey,
  legalMoves,
  neighbours,
  planPath,
  reachablePlaces,
  threatOutlook,
  type Action,
  type GameState,
  type Hex,
  type Place,
  type SeasonOutcome,
} from '@behemoth-road/core';
import { describe, expect, it } from 'vitest';
import { createHandler } from '../../src/handler.ts';
import type { PlayerView, SessionUser } from '../../src/guild-game.ts';
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
  type Called,
} from '../helpers.ts';

/**
 * Plays the contract scenario against the real Worker code (the Worker's routes for config and sign-in,
 * the guild's GuildGame with a fixed seed and clock for the game) and prints one `FIXTURE <json>` line.
 * `scripts/capture-fixtures.mjs` (`pnpm fixtures:capture`) runs it with `vitest.capture.config.ts` and
 * writes the files of `apps/web/src/api/fixtures`. It asserts only that each step answered as planned.
 */

const KAI: SessionUser = { id: '555555555555555555', displayName: 'Kai' };
const ASH: SessionUser = { id: '666666666666666666', displayName: 'Ash' };

interface SeasonPlan {
  /** The keeper feeds on days divisible by this (0: never); the stores are stocked for it. */
  feedEvery: number;
  /** Misa, a guardian, defends from the creature every day. */
  defend: boolean;
  /** Ash, a guardian, walks to the nearest threat and strikes it. */
  strike: boolean;
  /** Robin, an envoy, walks to the settlement, offers a coin, parleys and asks for a gift. */
  envoy: boolean;
  /** Ash parleys with the settlement instead (a guardian: it may anger them). */
  parley: boolean;
  /** Robin walks to where the nearest threat steps next (unescorted, so it strikes them). */
  bait: boolean;
}

type Captured = {
  responses: Record<string, unknown>;
  errors: { route: string; status: number; body: unknown }[];
  requests: Record<string, { method: string; path: string; body: unknown }>;
};

/** Session tokens and access tokens are random: the fixtures carry a fixed stand-in of the same shape. */
const TOKEN = `s1.333333333333333333.${'A'.repeat(43)}.${'B'.repeat(43)}`;

describe('capture', () => {
  it('capture game', async () => {
    const responses: Captured['responses'] = {};
    const errors: Captured['errors'] = [];
    const requests: Captured['requests'] = {};
    const playSeason = (outcome: SeasonOutcome, plan: SeasonPlan) =>
      season(outcome, plan, { responses, errors, requests });

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

        // Starving (level 3 whether or not this tick drains) with forage in the stores: the next tick it eats from them.
        const before = await versionNow();
        const hungry = read();
        write({ ...hungry, stores: { forage: 1 }, care: { ...hungry.care, satiety: 1 } });
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
    // Milestone 5: three short dev seasons from the same seed, played through the API, one to each
    // outcome. The plays were picked through the core so that each shows what its fixtures name.
    await playSeason('safe', {
      feedEvery: 2,
      defend: true,
      strike: true,
      envoy: true,
      parley: false,
      bait: false,
    });
    await playSeason('wounded', {
      feedEvery: 8,
      defend: false,
      strike: true,
      envoy: false,
      parley: false,
      bait: false,
    });
    await playSeason('lost', {
      feedEvery: 0,
      defend: false,
      strike: false,
      envoy: false,
      parley: true,
      bait: true,
    });

    console.log('FIXTURE ' + JSON.stringify({ set: 'game', responses, errors, requests }));
  });
});

/**
 * One short dev season to `outcome`, played through the API with Misa (guardian), Robin (envoy), Kai
 * (keeper) and Ash (guardian). Each day the plan's actions run, then an admin's next day. Two things are
 * placed as setup, as in the scenarios above: forage in the stores for the keeper, and a coin in the
 * envoy's pack when they reach the settlement. Everything else is the core's play from the seed.
 */
async function season(outcome: SeasonOutcome, plan: SeasonPlan, out: Captured): Promise<void> {
  await runGame(
    async (ctx) => {
      const tokens = new Map<string, string>();
      for (const user of [MISA, ROBIN, KAI, ASH]) tokens.set(user.id, await ctx.signIn(user));
      const token = (user: SessionUser) => tokens.get(user.id) ?? '';
      const read = () =>
        JSON.parse(
          ctx.sql.exec<{ state: string }>('SELECT state FROM game').one().state,
        ) as GameState;
      const write = (state: GameState) =>
        ctx.sql.exec('UPDATE game SET state = ?, version = version + 1', JSON.stringify(state));
      const version = () =>
        ctx.sql.exec<{ version: number }>('SELECT version FROM game').one().version;
      const idOf = (user: SessionUser) => `${user.id}.0`;
      /** Keeps a response under `name` the first time one is asked for. */
      const keep = (
        name: string | undefined,
        method: string,
        path: string,
        body: unknown,
        res: Called,
      ) => {
        if (name === undefined || name in out.responses) return;
        if (body !== undefined) out.requests[name] = { method, path, body };
        out.responses[name] = res.body;
      };
      /** An action; its answer is kept under `name`, or the name chosen from the answer's events. */
      const act = async (
        user: SessionUser,
        action: Action,
        name?: string | ((kinds: string[]) => string),
      ) => {
        const body = { version: version(), action };
        const res = await ctx.call(token(user), 'POST', '/api/game/act', body);
        if (res.status !== 200) return false;
        const kinds = (res.body as { events: { kind: string }[] }).events.map((e) => e.kind);
        keep(typeof name === 'function' ? name(kinds) : name, 'POST', '/api/game/act', body, res);
        return true;
      };
      /** Walks toward a hex (or onto the creature) as far as today's actions allow, keeping `spare`. */
      const walk = async (user: SessionUser, to: Hex | 'creature', spare = 0) => {
        const state = read();
        const me = state.characters.find((c) => c.id === idOf(user));
        if (me === undefined) return;
        const far = (p: Place) =>
          to === 'creature'
            ? p.kind === 'creature'
              ? 0
              : 99
            : hexDistance(p.kind === 'hex' ? p.hex : state.creature.centre, to);
        const best = reachablePlaces(state, me.id)
          .filter((o) => o.cost <= me.actionsLeft - spare)
          .sort((a, b) => far(a.place) - far(b.place) || a.cost - b.cost)[0];
        if (best === undefined || far(best.place) >= far(me.at)) return;
        const route = planPath(state, me.id, best.place);
        if (!route.ok) return;
        const body = { version: version(), path: route.steps.map((step) => step.place) };
        const res = await ctx.call(token(user), 'POST', '/api/game/move', body);
        expect(res.status, 'walk').toBe(200);
      };

      for (const [user, role] of [
        [MISA, 'guardian'],
        [ROBIN, 'envoy'],
        [KAI, 'keeper'],
        [ASH, 'guardian'],
      ] as const) {
        const res = await ctx.call(token(user), 'POST', '/api/game/join', { role, offer: 0 });
        expect(res.status).toBe(200);
      }
      if (plan.feedEvery > 0) write({ ...read(), stores: { forage: 12 } });

      let coined = false;
      for (let i = 0; i < 40 && read().season.status === 'on'; i++) {
        const day = read().day;
        if (plan.defend) await act(MISA, { kind: 'defend' }, 'view-defend');
        if (plan.feedEvery > 0 && day % plan.feedEvery === 0) await act(KAI, { kind: 'feed' });
        if (plan.strike) {
          const centre = read().creature.centre;
          const threat = [...read().threats].sort(
            (a, b) => hexDistance(a.hex, centre) - hexDistance(b.hex, centre),
          )[0];
          if (threat === undefined) {
            await walk(ASH, 'creature');
          } else {
            await walk(ASH, threat.hex, 1);
            for (let k = 0; k < 3; k++) {
              if (!read().threats.some((t) => t.id === threat.id)) break;
              if (!(await act(ASH, { kind: 'strike', threat: threat.id }, 'view-strike'))) break;
            }
          }
        }
        if (plan.bait) {
          const state = read();
          const centre = state.creature.centre;
          const threat = [...state.threats].sort(
            (a, b) => hexDistance(a.hex, centre) - hexDistance(b.hex, centre),
          )[0];
          if (threat !== undefined) {
            const next = threatOutlook(state).find((o) => o.id === threat.id)?.next;
            await walk(ROBIN, next ?? threat.hex);
          }
        }
        const settlement = read().settlements.find((s) => s.attitude !== 'angry');
        if (plan.envoy && settlement !== undefined) {
          await walk(ROBIN, settlement.hex);
          const robin = read().characters.find((c) => c.id === idOf(ROBIN));
          if (
            !coined &&
            robin?.at.kind === 'hex' &&
            hexDistance(robin.at.hex, settlement.hex) === 0
          ) {
            coined = true;
            const state = read();
            write({
              ...state,
              characters: state.characters.map((c) =>
                c.id === robin.id ? { ...c, pack: { ...c.pack, 'old-coin': 1 } } : c,
              ),
            });
          }
          await act(ROBIN, { kind: 'offer', material: 'old-coin' }, 'view-offer');
          await act(ROBIN, { kind: 'parley' }, 'view-befriended');
          await act(ROBIN, { kind: 'ask-boon', boon: 'gift' }, 'view-boon');
        }
        if (plan.parley && settlement !== undefined) {
          await walk(ASH, settlement.hex);
          await act(ASH, { kind: 'parley' }, (kinds) =>
            kinds.includes('angered') ? 'view-angered' : 'view-parley',
          );
        }
        if (read().threats.length > 0) {
          keep(
            'view-threat',
            'GET',
            '/api/game',
            undefined,
            await ctx.call(token(KAI), 'GET', '/api/game'),
          );
        }
        const before = version();
        // A minute between days, so no player runs out of requests (the rate limit runs on this clock).
        ctx.clock.t += 60_000;
        expect((await ctx.call(token(MISA), 'POST', '/api/dev/next-day', {})).status).toBe(200);
        const since = await ctx.call(token(KAI), 'GET', `/api/game?since=${String(before)}`);
        const kinds = (since.body as { events: { kind: string }[] }).events.map((e) => e.kind);
        if (kinds.includes('struck'))
          keep('view-struck-since', 'GET', '/api/game?since', undefined, since);
        if (kinds.includes('peril'))
          keep('view-peril-since', 'GET', '/api/game?since', undefined, since);
        if (kinds.includes('season-over'))
          keep(`view-season-${outcome}`, 'GET', '/api/game?since', undefined, since);
      }
      expect(read().season).toMatchObject({ status: 'over', outcome });

      const res = await ctx.call(token(ASH), 'POST', '/api/game/act', {
        version: version(),
        action: { kind: 'defend' },
      });
      expect(res.status).toBe(409);
      if (outcome === 'lost') {
        out.errors.push({ route: 'POST /api/game/act', status: res.status, body: res.body });
        // A new season on staging: a new game; every character is gone, so players join again.
        const fresh = await ctx.call(token(MISA), 'POST', '/api/dev/new-season', {});
        expect(fresh.status).toBe(200);
        keep('view-new-season', 'POST', '/api/dev/new-season', {}, fresh);
      }
    },
    { everyoneIsAdmin: true },
  );
}
