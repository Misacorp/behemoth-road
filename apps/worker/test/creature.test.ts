import { checkAction, creatureSigns, legalMoves } from '@behemoth-road/core';
import { describe, expect, it } from 'vitest';
import { CONTENT_VERSION, type GameState } from '../src/game-core.ts';
import type { PlayerView } from '../src/guild-game.ts';
import { MISA, OTHER_USER_ID, ROBIN, USER_ID, runGame, type GameContext } from './helpers.ts';

/** Milestone 4 through the API: the care actions, the per-viewer signs, and the creature's secrets. */

type Answer = PlayerView & { events: { kind: string }[]; stopped: unknown };

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

async function versionOf(ctx: GameContext, token: string): Promise<number> {
  return ((await ctx.call(token, 'GET', '/api/game')).body as PlayerView).version;
}

/** Misa joins in `role`, Robin as a scout; both start riding. */
async function team(ctx: GameContext, role: string) {
  const misa = await ctx.signIn(MISA);
  const robin = await ctx.signIn(ROBIN);
  expect((await ctx.call(misa, 'POST', '/api/game/join', { role, offer: 0 })).status).toBe(200);
  expect(
    (await ctx.call(robin, 'POST', '/api/game/join', { role: 'scout', offer: 0 })).status,
  ).toBe(200);
  return { misa, robin };
}

/** Puts Misa beside the creature on a hex that burns, with timber in the pack. */
function besideWithTimber(ctx: GameContext): void {
  const state = storedState(ctx.sql);
  const placed = (hex: { q: number; r: number }) =>
    withCharacter(state, ME, { at: { kind: 'hex', hex }, pack: { timber: 1 } });
  const hex = legalMoves(state, ME)
    .flatMap((p) => (p.kind === 'hex' ? [p.hex] : []))
    .find((h) => checkAction(placed(h), ME, { kind: 'light-fire' }).ok);
  if (hex === undefined) throw new Error('no hex to light a fire on');
  edit(ctx.sql, () => placed(hex));
}

const act = async (ctx: GameContext, token: string, action: unknown) =>
  ctx.call(token, 'POST', '/api/game/act', { version: await versionOf(ctx, token), action });

describe('POST /api/game/act: the care actions', () => {
  it('takes light-fire, feed and linger with no other keys', async () => {
    await runGame(async (ctx) => {
      const { misa } = await team(ctx, 'keeper');
      const version = await versionOf(ctx, misa);
      for (const action of [
        { kind: 'light-fire', hex: { q: 0, r: 0 } },
        { kind: 'light-fire', fuel: 'timber' },
        { kind: 'feed', material: 'forage' },
        { kind: 'feed', amount: 1 },
        { kind: 'linger', characterId: ROBIN_ID },
        { kind: 'linger', days: 2 },
        { kind: 'Linger' },
      ]) {
        const res = await ctx.call(misa, 'POST', '/api/game/act', { version, action });
        expect(res, JSON.stringify(action)).toEqual({
          status: 400,
          body: { error: 'invalid_body' },
        });
      }
      // The bare shapes pass the schema and reach the rules (here refused: riding, no food, ok).
      for (const kind of ['light-fire', 'feed', 'linger']) {
        const res = await ctx.call(misa, 'POST', '/api/game/act', {
          version: await versionOf(ctx, misa),
          action: { kind },
        });
        expect(res.status, kind).not.toBe(400);
      }
    });
  });

  it("answers the core's new refusals as 409 { error }", async () => {
    await runGame(async (ctx) => {
      const { misa, robin } = await team(ctx, 'keeper');
      expect(await act(ctx, robin, { kind: 'linger' })).toEqual({
        status: 409,
        body: { error: 'needs-keeper' },
      });
      expect(await act(ctx, misa, { kind: 'feed' })).toEqual({
        status: 409,
        body: { error: 'no-food' },
      });
      expect(await act(ctx, misa, { kind: 'light-fire' })).toEqual({
        status: 409,
        body: { error: 'on-creature' },
      });
      edit(ctx.sql, (s) => withCharacter(s, ME, { at: { kind: 'creature' }, pack: {} }));
      besideWithTimber(ctx);
      edit(ctx.sql, (s) => withCharacter(s, ME, { pack: {} }));
      expect(await act(ctx, misa, { kind: 'light-fire' })).toEqual({
        status: 409,
        body: { error: 'no-fuel' },
      });
    });
  });

  it('answers fed and linger as events, with the creature lingering in the view', async () => {
    await runGame(async (ctx) => {
      const { misa } = await team(ctx, 'keeper');
      edit(ctx.sql, (s) => ({ ...s, stores: { forage: 1 } }));
      const fed = await act(ctx, misa, { kind: 'feed' });
      expect(fed.status).toBe(200);
      expect((fed.body as Answer).events).toEqual([
        { kind: 'fed', characterId: ME, material: 'forage', version: (fed.body as Answer).version },
      ]);
      expect((fed.body as Answer).game.stores['forage'] ?? 0).toBe(0);
      const lingered = await act(ctx, misa, { kind: 'linger' });
      expect(lingered.status).toBe(200);
      expect((lingered.body as Answer).events).toEqual([
        { kind: 'linger', characterId: ME, version: (lingered.body as Answer).version },
      ]);
      expect((lingered.body as Answer).game.creature.lingering).toBe(true);
    });
  });
});

describe('the done criterion through the API', () => {
  it("the tick's care events reach the event log: a linger, a fire going out, a meal", async () => {
    await runGame(
      async (ctx) => {
        const { misa, robin } = await team(ctx, 'keeper');
        besideWithTimber(ctx);
        expect((await act(ctx, misa, { kind: 'light-fire' })).status).toBe(200);
        edit(ctx.sql, (s) => ({
          ...withCharacter(s, ME, {
            at: { kind: 'creature' },
            actionsLeft: s.config.actionsPerDay,
          }),
          // Starving after the drain, with forage in the stores: it eats one.
          stores: { forage: 1 },
          care: { ...s.care, satiety: 2 },
        }));
        const lingered = await act(ctx, misa, { kind: 'linger' });
        expect(lingered.status).toBe(200);
        const seen = (lingered.body as Answer).version;
        const centre = storedState(ctx.sql).creature.centre;

        const next = (await ctx.call(misa, 'POST', '/api/dev/next-day', {})).body as PlayerView;
        const since = await ctx.call(robin, 'GET', `/api/game?since=${String(seen)}`);
        expect(since.status).toBe(200);
        const events = (since.body as { events: { kind: string; version: number }[] }).events;
        expect(events).toEqual(
          expect.arrayContaining([
            { kind: 'creature-step', from: centre, to: centre, version: next.version },
            {
              kind: 'fire-out',
              hex: expect.anything() as unknown,
              stimulus: 'fire',
              version: next.version,
            },
            { kind: 'creature-ate', material: 'forage', version: next.version },
          ]),
        );
        // ctx.call has walked these logged events for the creature's secrets too.
      },
      { everyoneIsAdmin: true },
    );
  });

  it('a keeper lights a fire; after the next day the keeper sees a cue and a non-keeper does not', async () => {
    await runGame(
      async (ctx) => {
        const { misa, robin } = await team(ctx, 'keeper');
        besideWithTimber(ctx);
        const lit = await act(ctx, misa, { kind: 'light-fire' });
        expect(lit.status).toBe(200);
        const answer = lit.body as Answer;
        expect(answer.events.map((e) => e.kind)).toEqual(['fire-lit']);
        expect(answer.game.stimuli).toHaveLength(1);
        expect(answer.game.characters.find((c) => c.id === ME)?.pack['timber'] ?? 0).toBe(0);
        const fire = answer.game.stimuli[0];

        const next = await ctx.call(misa, 'POST', '/api/dev/next-day', {});
        expect(next.status).toBe(200);
        expect((next.body as PlayerView).signs.cues).toEqual([
          { hex: fire?.hex, stimulus: 'fire', reaction: expect.any(String) as string },
        ]);
        const other = (await ctx.call(robin, 'GET', '/api/game')).body as PlayerView;
        expect(other.version).toBe((next.body as PlayerView).version);
        expect(other.signs.cues).toEqual([]);
      },
      { everyoneIsAdmin: true },
    );
  });
});

describe('signs in the player view', () => {
  it("each player's own session gets their own signs: a keeper's cue, a scout's faint appetite", async () => {
    await runGame(
      async (ctx) => {
        const { misa, robin } = await team(ctx, 'keeper');
        besideWithTimber(ctx);
        expect((await act(ctx, misa, { kind: 'light-fire' })).status).toBe(200);
        expect((await ctx.call(misa, 'POST', '/api/dev/next-day', {})).status).toBe(200);
        // Underfed at level 2: a keeper sees it clearly, anyone else faintly.
        edit(ctx.sql, (s) => ({ ...s, care: { ...s.care, satiety: 4 } }));

        // Expected from the stored state and the known character ids, not from any response.
        const stored = storedState(ctx.sql);
        expect(stored.care.cues.list.length).toBeGreaterThan(0);
        const keeperSigns = creatureSigns(stored, ME);
        const scoutSigns = creatureSigns(stored, ROBIN_ID);
        expect(keeperSigns.appetite).toEqual({ kind: 'underfed', level: 2, faint: false });
        expect(keeperSigns.cues).toEqual(
          stored.care.cues.list.map((c) => ({
            hex: c.hex,
            stimulus: 'fire',
            reaction: expect.stringMatching(/^(toward|away|unmoved)$/) as string,
          })),
        );
        expect(scoutSigns).toEqual({
          appetite: { kind: 'underfed', level: 1, faint: true },
          cues: [],
        });

        const keeper = (await ctx.call(misa, 'GET', '/api/game')).body as PlayerView;
        const scout = (await ctx.call(robin, 'GET', '/api/game')).body as PlayerView;
        expect(keeper.you.characterId).toBe(ME);
        expect(scout.you.characterId).toBe(ROBIN_ID);
        expect(keeper.version).toBe(scout.version);
        expect(keeper.signs).toEqual(keeperSigns);
        expect(scout.signs).toEqual(scoutSigns);
      },
      { everyoneIsAdmin: true },
    );
  });

  it('are in every view response: game, join, move, act, replace and next day', async () => {
    await runGame(
      async (ctx) => {
        const misa = await ctx.signIn(MISA);
        const views: [string, unknown][] = [];
        const keep = (route: string, res: { status: number; body: unknown }) => {
          expect(res.status, route).toBe(200);
          views.push([route, res.body]);
        };
        keep('game', await ctx.call(misa, 'GET', '/api/game'));
        keep('join', await ctx.call(misa, 'POST', '/api/game/join', { role: 'keeper', offer: 0 }));
        const target = legalMoves(storedState(ctx.sql), ME)[0];
        keep(
          'move',
          await ctx.call(misa, 'POST', '/api/game/move', {
            version: await versionOf(ctx, misa),
            path: [target],
          }),
        );
        edit(ctx.sql, (s) => withCharacter(s, ME, { at: { kind: 'creature' } }));
        edit(ctx.sql, (s) => ({ ...s, stores: { forage: 1 } }));
        keep('act', await act(ctx, misa, { kind: 'feed' }));
        keep('next-day', await ctx.call(misa, 'POST', '/api/dev/next-day', {}));
        edit(ctx.sql, (s) => withCharacter(s, ME, { status: 'lost' }));
        keep(
          'replace',
          await ctx.call(misa, 'POST', '/api/game/replace', { role: 'scout', offer: 0 }),
        );
        for (const [route, body] of views) {
          const signs = (body as PlayerView).signs;
          expect(Object.keys(signs).sort(), route).toEqual(['appetite', 'cues']);
          const text = JSON.stringify(body);
          for (const key of ['nature', 'care', 'satiety', 'reactions']) {
            expect(text, `${route}: ${key}`).not.toContain(`"${key}"`);
          }
        }
        // ctx.call has also checked each against the core's signs for this viewer.
      },
      { everyoneIsAdmin: true },
    );
  });

  it('change only with the version: becoming a keeper by replacing bumps it', async () => {
    await runGame(
      async (ctx) => {
        const { misa } = await team(ctx, 'engineer');
        // A fire beside the creature: the tick leaves a cue only a keeper can read.
        edit(ctx.sql, (s) => withCharacter(s, ME, { pack: { timber: 1 } }));
        besideWithTimber(ctx);
        expect((await act(ctx, misa, { kind: 'light-fire' })).status).toBe(200);
        const next = (await ctx.call(misa, 'POST', '/api/dev/next-day', {})).body as PlayerView;
        expect(next.signs.cues).toEqual([]);
        expect(storedState(ctx.sql).care.cues.list.length).toBeGreaterThan(0);
        expect(await ctx.call(misa, 'GET', `/api/game?since=${String(next.version)}`)).toEqual({
          status: 200,
          body: { unchanged: true },
        });

        edit(ctx.sql, (s) => withCharacter(s, ME, { status: 'lost' }));
        const replaced = await ctx.call(misa, 'POST', '/api/game/replace', {
          role: 'keeper',
          offer: 0,
        });
        expect(replaced.status).toBe(200);
        const view = replaced.body as PlayerView;
        expect(view.version).toBeGreaterThan(next.version);
        expect(view.signs.cues.length).toBeGreaterThan(0);
        const since = await ctx.call(misa, 'GET', `/api/game?since=${String(next.version)}`);
        expect((since.body as PlayerView).signs).toEqual(view.signs);
      },
      { everyoneIsAdmin: true },
    );
  });

  it('a player without a character reads only what anyone may: no cues', async () => {
    await runGame(async (ctx) => {
      const { misa } = await team(ctx, 'keeper');
      edit(ctx.sql, (s) => ({ ...s, care: { ...s.care, satiety: 1 } }));
      const keeper = (await ctx.call(misa, 'GET', '/api/game')).body as PlayerView;
      expect(keeper.signs.appetite).toEqual({ kind: 'underfed', level: 3, faint: false });
      edit(ctx.sql, (s) => withCharacter(s, ME, { status: 'lost' }));
      const lost = (await ctx.call(misa, 'GET', '/api/game')).body as PlayerView;
      expect(lost.signs).toEqual({
        appetite: { kind: 'underfed', level: 1, faint: true },
        cues: [],
      });
    });
  });
});

describe('a stored game from before the living creature', () => {
  it('(content version 4, no nature or care) is replaced by a new game', async () => {
    await runGame(async (ctx) => {
      const misa = await ctx.signIn(MISA);
      // The shape a version-4 game was stored in: none of the creature's new fields.
      const old: Record<string, unknown> = { ...storedState(ctx.sql), contentVersion: 4, day: 6 };
      for (const key of ['nature', 'care', 'stimuli']) delete old[key];
      const creature: Record<string, unknown> = { ...storedState(ctx.sql).creature };
      delete creature['lingering'];
      delete creature['lingeredDay'];
      ctx.sql.exec(
        'UPDATE game SET state = ?, version = 20 WHERE id = 1',
        JSON.stringify({ ...old, creature }),
      );
      ctx.game.migrate();
      const fresh = storedState(ctx.sql);
      expect(fresh.contentVersion).toBe(CONTENT_VERSION);
      expect(fresh.day).toBe(1);
      expect(fresh.nature).toBeDefined();
      const view = (await ctx.call(misa, 'GET', '/api/game')).body as PlayerView;
      expect(view.version).toBe(21);
      expect(view.signs.cues).toEqual([]);
    });
  });
});
