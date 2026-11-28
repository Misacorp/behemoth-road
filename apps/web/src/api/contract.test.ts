/**
 * The client against the Worker's captured contract fixtures (`fixtures/*.json`, written by the Worker's
 * capture test and never edited by hand): every answer parses, every error reaches the caller with its
 * code, and every request body the client sends is the one the Worker was captured accepting.
 */
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { ApiError, createApiClient, type Fetch } from './client.ts';
import { momentsFromEvents } from '../game/moments.ts';
import { toGameState } from '../game/viewState.ts';
import { characterArts } from '../map/cells.ts';
import {
  ActionAnswerSchema,
  ConfigSchema,
  type GameAction,
  GameResponseSchema,
  PlayerViewSchema,
  SessionSchema,
} from './schema.ts';

const files = import.meta.glob<unknown>('./fixtures/*.json', { eager: true, import: 'default' });
const fixture = (name: string): unknown => {
  const f = files[`./fixtures/${name}.json`];
  if (f === undefined) throw new Error(`missing fixture ${name}`);
  return f;
};

interface CapturedRequest {
  method: string;
  path: string;
  body: unknown;
}
const requests = fixture('requests') as Record<string, CapturedRequest>;
const errors = fixture('errors') as { route: string; status: number; body: unknown }[];

const views = Object.keys(files)
  .map((p) => /\.\/fixtures\/(view-[\w-]+)\.json$/.exec(p)?.[1])
  .filter((n): n is string => n !== undefined);

/** A fetch that answers every call with one fixture and records the request. */
function answering(status: number, body: unknown): { fetch: Fetch; sent: RequestInit[] } {
  const sent: RequestInit[] = [];
  return {
    sent,
    fetch: (_path, init = {}) => {
      sent.push(init);
      return Promise.resolve(new Response(JSON.stringify(body), { status }));
    },
  };
}

const bodyOf = (init: RequestInit | undefined): unknown =>
  typeof init?.body === 'string' ? JSON.parse(init.body) : null;

describe('captured contract fixtures', () => {
  it('include the views the client reads', () => {
    expect(views).toEqual(
      expect.arrayContaining([
        'view-new',
        'view-joined',
        'view-moved',
        'view-lost',
        'view-fire-lit',
        'view-fed',
        'view-lingered',
        'view-keeper-cue',
        'view-not-keeper',
        'view-care-since',
        'view-creature-ate',
      ]),
    );
  });

  it.each(views)('%s parses as a player view', (name) => {
    expect(v.safeParse(PlayerViewSchema, fixture(name)).success).toBe(true);
    expect(v.safeParse(GameResponseSchema, fixture(name)).success).toBe(true);
  });

  it('config, session and unchanged answers parse', () => {
    expect(v.safeParse(ConfigSchema, fixture('config')).success).toBe(true);
    expect(v.safeParse(SessionSchema, fixture('auth-session')).success).toBe(true);
    expect(v.parse(GameResponseSchema, fixture('unchanged'))).toEqual({ unchanged: true });
  });

  it('a new player has offers and no character; a joined one has a character and no offers', () => {
    const fresh = v.parse(PlayerViewSchema, fixture('view-new'));
    expect(fresh.you.characterId).toBeNull();
    expect(fresh.offers?.length).toBeGreaterThanOrEqual(3);
    expect(fresh.offers?.at(-1)).toMatchObject({ trait: null, quirk: null });
    const joined = v.parse(PlayerViewSchema, fixture('view-joined'));
    expect(joined.you.characterId).not.toBeNull();
    expect(joined.offers).toBeNull();
  });

  it('a keeper reads the appetite and the cues; anyone else only a faint sign', () => {
    const keeper = v.parse(PlayerViewSchema, fixture('view-keeper-cue'));
    expect(keeper.signs.appetite?.faint).toBe(false);
    expect(keeper.signs.cues.length).toBeGreaterThan(0);
    const other = v.parse(PlayerViewSchema, fixture('view-not-keeper'));
    expect(other.signs.appetite?.faint).toBe(true);
    expect(other.signs.cues).toEqual([]);
  });

  it('fire, feed and linger answers carry their events and moments', () => {
    const kinds = ['view-fire-lit', 'view-fed', 'view-lingered'].map((name) => {
      const a = v.parse(ActionAnswerSchema, fixture(name));
      return momentsFromEvents(a.events, a.game.creature.centre, '').map((m) => m.kind);
    });
    expect(kinds).toEqual([['fire'], ['feed'], ['linger']]);
    const lit = v.parse(PlayerViewSchema, fixture('view-fire-lit'));
    expect(lit.game.stimuli.length).toBe(1);
    expect(v.parse(PlayerViewSchema, fixture('view-lingered')).game.creature.lingering).toBe(true);
  });

  it("the tick's step (stayed after a linger), a fire going out and the creature eating play", () => {
    const kinds = ['view-care-since', 'view-creature-ate'].map((name) => {
      const view = v.parse(PlayerViewSchema, fixture(name));
      return momentsFromEvents(view.events, view.game.creature.centre, '').map((m) => m.kind);
    });
    // Staging plays the full season, whose threats come from day 3: the first since-log is too early for one,
    // the second (the creature eating, later) carries a threat appearing.
    expect(kinds).toEqual([
      // The starved creature (the scenario lets it go hungry) raises peril: hunger is the cause shown.
      ['stayed', 'fire-out', 'hungry'],
      ['step', 'ate', 'relieved', 'threat'],
    ]);
  });

  it("Milestone 5's captured answers play their moments, placed on the view's own things", () => {
    const moments = (name: string) => {
      const view = v.parse(PlayerViewSchema, fixture(name));
      const g = view.game;
      return momentsFromEvents(view.events, g.creature.centre, view.you.characterId ?? '', {
        threat: (id) => g.threats.find((t) => t.id === id)?.hex ?? null,
        settlement: (id) => g.settlements.find((x) => x.id === id)?.hex ?? null,
        character: (id) => {
          const c = g.characters.find((x) => x.id === id);
          return c?.at.kind === 'hex' ? c.at.hex : null;
        },
      }).map((m) => m.kind);
    };
    expect(moments('view-strike')).toEqual(['hit']);
    expect(moments('view-defend')).toEqual(['defend']);
    expect(moments('view-befriended')).toEqual(['befriended']);
    expect(moments('view-boon')).toEqual(['boon']);
    expect(moments('view-angered')).toEqual(['angered', 'threat']);
    expect(moments('view-peril-since')).toEqual(['step', 'strike', 'strike', 'threat']);
    expect(moments('view-season-lost')).toEqual(['step', 'hungry', 'season-over']);
    expect(moments('view-season-safe')).toEqual(['step', 'relieved', 'season-over']);
    expect(moments('view-struck-since')).toEqual(['step', 'struck', 'threat']);
  });

  it('bandages the captured struck character for the day it was struck', () => {
    const view = v.parse(PlayerViewSchema, fixture('view-struck-since'));
    const game = toGameState(view.game);
    const struck = game.characters.filter((c) => c.struckDay === game.day).map((c) => c.id);
    expect(struck).toHaveLength(1);
    const marked = characterArts(game)
      .filter((f) => f.marks?.struck)
      .map((f) => f.id);
    expect(marked).toEqual(struck);
  });

  it('reads each ending from the captured season views', () => {
    for (const outcome of ['safe', 'wounded', 'lost'] as const) {
      const view = v.parse(PlayerViewSchema, fixture(`view-season-${outcome}`));
      expect(view.game.season).toMatchObject({ status: 'over', outcome });
    }
  });

  it.each(errors.map((e) => [e.route, e.status, e.body] as const))(
    '%s %s reaches the caller as an ApiError with its code',
    async (route, status, body) => {
      const api = createApiClient(answering(status, body).fetch);
      api.useSession({ token: 't', accessToken: '', user: { id: '1', name: 'x' } });
      const call = route.startsWith('GET')
        ? api.game()
        : route.endsWith('/replace')
          ? api.replace('scout', 0)
          : route.endsWith('/act')
            ? api.act(1, { kind: 'feed' })
            : api.move(1, [{ kind: 'creature' }]);
      const err = await call.catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(status);
      expect((err as ApiError).code).toBe((body as { error: string }).error);
    },
  );

  it('sends the request bodies the Worker was captured accepting', async () => {
    const session = { token: 't', accessToken: '', user: { id: '1', name: 'x' } };
    const cases: [string, (api: ReturnType<typeof createApiClient>) => Promise<unknown>][] = [];
    for (const [name, req] of Object.entries(requests)) {
      const b = req.body as Record<string, unknown>;
      if (req.path === '/api/game/join')
        cases.push([name, (a) => a.join(b.role as string, b.offer as number)]);
      if (req.path === '/api/game/replace')
        cases.push([name, (a) => a.replace(b.role as string, b.offer as number)]);
      if (req.path === '/api/game/move')
        cases.push([name, (a) => a.move(b.version as number, b.path as never)]);
      if (req.path === '/api/game/act')
        cases.push([name, (a) => a.act(b.version as number, b.action as GameAction)]);
      if (req.path === '/api/dev/next-day') cases.push([name, (a) => a.nextDay()]);
      if (req.path === '/api/dev/pace')
        cases.push([name, (a) => a.setPace(b.pace as 'daily' | 'fast')]);
      if (req.path === '/api/auth/session')
        cases.push([name, (a) => a.signIn(b.code as string, b.instanceId as string)]);
    }
    expect(cases.length).toBeGreaterThanOrEqual(4);
    for (const [name, call] of cases) {
      const reply = name === 'auth-session' ? fixture('auth-session') : fixture('view-joined');
      const f = answering(200, reply);
      const api = createApiClient(f.fetch);
      api.useSession(session);
      await call(api);
      expect(f.sent[0]?.method, name).toBe(requests[name]!.method);
      expect(bodyOf(f.sent[0]), name).toEqual(requests[name]!.body);
    }
  });
});
