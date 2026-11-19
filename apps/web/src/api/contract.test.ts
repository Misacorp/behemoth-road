/**
 * The client against the Worker's captured contract fixtures (`fixtures/*.json`, written by the Worker's
 * capture test and never edited by hand): every answer parses, every error reaches the caller with its
 * code, and every request body the client sends is the one the Worker was captured accepting.
 */
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { ApiError, createApiClient, type Fetch } from './client.ts';
import { ConfigSchema, GameResponseSchema, PlayerViewSchema, SessionSchema } from './schema.ts';

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
      expect.arrayContaining(['view-new', 'view-joined', 'view-moved', 'view-lost']),
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

  it.each(errors.map((e) => [e.route, e.status, e.body] as const))(
    '%s %s reaches the caller as an ApiError with its code',
    async (route, status, body) => {
      const api = createApiClient(answering(status, body).fetch);
      api.useSession({ token: 't', accessToken: '', user: { id: '1', name: 'x' } });
      const call = route.startsWith('GET')
        ? api.game()
        : route.endsWith('/replace')
          ? api.replace('scout', 0)
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
      if (req.path === '/api/dev/next-day') cases.push([name, (a) => a.nextDay()]);
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
