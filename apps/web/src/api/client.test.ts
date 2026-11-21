import { describe, expect, it } from 'vitest';
import { ApiError, createApiClient, type Fetch, ShapeError } from './client.ts';
import { CONFIG, joined, lost, notJoined, SESSION } from './fixtures.ts';

interface Call {
  path: string;
  init: RequestInit;
}

/** A fetch that answers from a queue and records each call. */
function fake(...answers: { status?: number; body: unknown }[]): { fetch: Fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl: Fetch = (path, init = {}) => {
    calls.push({ path, init });
    const a = answers.shift();
    if (!a) throw new Error(`unexpected request ${path}`);
    return Promise.resolve(new Response(JSON.stringify(a.body), { status: a.status ?? 200 }));
  };
  return { fetch: fetchImpl, calls };
}

const auth = (c: Call): string | null => new Headers(c.init.headers).get('Authorization');
const bodyOf = (c: Call): unknown =>
  typeof c.init.body === 'string' ? JSON.parse(c.init.body) : null;

describe('API client', () => {
  it('parses the config and the session, then sends the token as a bearer', async () => {
    const f = fake({ body: CONFIG }, { body: SESSION }, { body: joined() });
    const api = createApiClient(f.fetch);
    expect(await api.config()).toEqual(CONFIG);
    await api.signIn('code', 'instance');
    expect(bodyOf(f.calls[1]!)).toEqual({ code: 'code', instanceId: 'instance' });
    const game = await api.game();
    expect('unchanged' in game).toBe(false);
    expect(auth(f.calls[2]!)).toBe(`Bearer ${SESSION.token}`);
    expect(f.calls[2]!.init.cache).toBe('no-store');
  });

  it('asks with since and accepts an unchanged answer', async () => {
    const f = fake({ body: { unchanged: true } });
    const api = createApiClient(f.fetch);
    api.useSession(SESSION);
    expect(await api.game(7)).toEqual({ unchanged: true });
    expect(f.calls[0]!.path).toBe('/api/game?since=7');
  });

  it('parses every fixture view', async () => {
    for (const view of [notJoined(), joined(), lost()]) {
      const api = createApiClient(fake({ body: view }).fetch);
      api.useSession(SESSION);
      expect(await api.game()).toEqual(view);
    }
  });

  it('drops keys it does not know, but refuses wrong types', async () => {
    const extra = { ...joined(), somethingNew: 1 };
    const ok = createApiClient(fake({ body: extra }).fetch);
    ok.useSession(SESSION);
    expect(await ok.game()).not.toHaveProperty('somethingNew');

    const broken = { ...joined(), version: 'seven' };
    const bad = createApiClient(fake({ body: broken }).fetch);
    bad.useSession(SESSION);
    await expect(bad.game()).rejects.toBeInstanceOf(ShapeError);

    const seeded = {
      ...joined(),
      game: { ...joined().game, tiles: { '0,0': { visibility: 'odd' } } },
    };
    const odd = createApiClient(fake({ body: seeded }).fetch);
    odd.useSession(SESSION);
    await expect(odd.game()).rejects.toBeInstanceOf(ShapeError);
  });

  it('posts actions with their bodies and reports a refusal with its reason', async () => {
    const f = fake({ body: joined() }, { status: 409, body: { error: 'not-enough-actions' } });
    const api = createApiClient(f.fetch);
    api.useSession(SESSION);
    await api.join('scout', 1);
    expect(f.calls[0]!.path).toBe('/api/game/join');
    expect(bodyOf(f.calls[0]!)).toEqual({ role: 'scout', offer: 1 });
    const err = await api.move(7, [{ kind: 'creature' }]).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(409);
    expect((err as ApiError).code).toBe('not-enough-actions');
    expect(bodyOf(f.calls[1]!)).toEqual({
      version: 7,
      path: [{ kind: 'creature' }],
    });
  });

  it('signs in again once when the session has expired, then retries', async () => {
    const f = fake(
      { status: 401, body: { error: 'invalid_session' } },
      { body: SESSION },
      { body: { unchanged: true } },
    );
    const api = createApiClient(f.fetch);
    api.useSession({ ...SESSION, token: 'old' });
    api.setReauthenticator(async () => {
      await api.signIn('fresh', 'instance');
    });
    expect(await api.game(3)).toEqual({ unchanged: true });
    expect(auth(f.calls[0]!)).toBe('Bearer old');
    expect(auth(f.calls[2]!)).toBe(`Bearer ${SESSION.token}`);
  });

  it('refuses to call the game API before signing in', async () => {
    const api = createApiClient(fake().fetch);
    await expect(api.game()).rejects.toBeInstanceOf(ApiError);
  });

  it("sends Milestone 5's actions as act bodies, and a new season as an empty POST", async () => {
    const actions = [
      { kind: 'strike', threat: 't1' },
      { kind: 'defend' },
      { kind: 'parley' },
      { kind: 'offer', material: 'old-coin' },
      { kind: 'ask-boon', boon: 'shelter' },
    ] as const;
    const f = fake(...actions.map(() => ({ body: joined() })), { body: { ok: true } });
    const api = createApiClient(f.fetch);
    api.useSession(SESSION);
    for (const action of actions) await api.act(5, action);
    actions.forEach((action, i) => {
      expect(f.calls[i]!.path).toBe('/api/game/act');
      expect(bodyOf(f.calls[i]!)).toEqual({ version: 5, action });
    });
    await api.newSeason();
    const last = f.calls[actions.length]!;
    expect(last.path).toBe('/api/dev/new-season');
    expect(last.init.method).toBe('POST');
    expect(bodyOf(last)).toEqual({});
    expect(auth(last)).toBe(`Bearer ${SESSION.token}`);
  });
});

describe('live ticket', () => {
  it('posts an empty body with the bearer and returns the ticket', async () => {
    const f = fake({ body: SESSION }, { body: { ticket: 't1.x' } });
    const api = createApiClient(f.fetch);
    await api.signIn('code', 'instance');
    expect(await api.liveTicket()).toBe('t1.x');
    const call = f.calls[1];
    expect(call?.path).toBe('/api/live/ticket');
    expect(call?.init.method).toBe('POST');
    expect(call === undefined ? null : bodyOf(call)).toEqual({});
    expect(call === undefined ? null : auth(call)).toMatch(/^Bearer /);
  });

  it('surfaces a 404 (the flag is off) as an ApiError', async () => {
    const f = fake({ body: SESSION }, { status: 404, body: { error: 'not_found' } });
    const api = createApiClient(f.fetch);
    await api.signIn('code', 'instance');
    await expect(api.liveTicket()).rejects.toMatchObject({ status: 404 });
  });
});
