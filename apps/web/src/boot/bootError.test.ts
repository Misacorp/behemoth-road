/** Which boot step failed, as the short code staging shows under the retry button. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiClient, type Fetch } from '../api/client.ts';
import { CONFIG, joined, SESSION } from '../api/fixtures.ts';
import { failureCode } from '../App.tsx';
import { boot, BootError, type DiscordLike, SDK_READY_MS } from './boot.ts';

type Answer = { status: number; body: unknown };

function server(over: Record<string, Answer> = {}, config: unknown = CONFIG): Fetch {
  const answers: Record<string, Answer> = {
    '/api/config': { status: 200, body: config },
    '/api/auth/session': { status: 200, body: SESSION },
    '/api/game': { status: 200, body: joined() },
    ...over,
  };
  return (path) => {
    const a = answers[path]!;
    return Promise.resolve(new Response(JSON.stringify(a.body), { status: a.status }));
  };
}

function sdk(
  over: Partial<{ ready: () => Promise<void>; authorize: () => Promise<{ code: string }> }> = {},
): DiscordLike {
  return {
    instanceId: 'i-1',
    ready: over.ready ?? (() => Promise.resolve()),
    commands: {
      authorize: over.authorize ?? (() => Promise.resolve({ code: 'c' })),
      authenticate: () => Promise.resolve({}),
    },
  };
}

async function failing(fetch: Fetch, discord: DiscordLike = sdk()): Promise<BootError> {
  const err = await boot({
    api: createApiClient(fetch),
    search: '?frame_id=f',
    discord: () => Promise.resolve(discord),
    devSession: null,
  }).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(BootError);
  return err as BootError;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('boot failure codes', () => {
  it('names the config step with its HTTP status', async () => {
    const err = await failing(server({ '/api/config': { status: 502, body: {} } }));
    expect(err.code).toBe('config: 502');
    expect(err.devTools).toBeNull();
  });

  it('names an SDK that never becomes ready', async () => {
    vi.useFakeTimers();
    const pending = failing(server(), sdk({ ready: () => new Promise(() => undefined) }));
    await vi.advanceTimersByTimeAsync(SDK_READY_MS + 1);
    expect((await pending).code).toBe('sdk.ready: timeout');
  });

  it("names Discord's authorize refusal by its SDK error code", async () => {
    const refused = sdk({
      authorize: () => Promise.reject(Object.assign(new Error('nope'), { code: 5000 })),
    });
    expect((await failing(server(), refused)).code).toBe('authorize: sdk 5000');
  });

  it("names the server's sign-in refusal by status and error code", async () => {
    const err = await failing(
      server({ '/api/auth/session': { status: 401, body: { error: 'discord_auth_failed' } } }),
    );
    expect(err.code).toBe('auth: 401 discord_auth_failed');
    expect(err.devTools).toBe(true);
  });

  it('names the first view and a response of the wrong shape', async () => {
    expect(
      (await failing(server({ '/api/game': { status: 409, body: { error: 'stale' } } }))).code,
    ).toBe('game: 409 stale');
    expect(
      (await failing(server({ '/api/game': { status: 200, body: { version: 'x' } } }))).code,
    ).toBe('game: bad response');
  });

  it('keeps a code under about 60 characters', async () => {
    const long = 'x'.repeat(90);
    const err = await failing(
      server({ '/api/auth/session': { status: 401, body: { error: long } } }),
    );
    expect(err.code.length).toBeLessThanOrEqual(60);
    expect(err.code.startsWith('auth: 401 x')).toBe(true);
  });

  it('shows the code with dev tools on, and nothing in production', async () => {
    const staging = await failing(
      server({ '/api/auth/session': { status: 401, body: { error: 'discord_auth_failed' } } }),
    );
    expect(failureCode(staging)).toBe('auth: 401 discord_auth_failed');
    const production = await failing(
      server(
        { '/api/auth/session': { status: 401, body: { error: 'discord_auth_failed' } } },
        {
          ...CONFIG,
          environment: 'production',
          devTools: false,
        },
      ),
    );
    expect(failureCode(production)).toBeNull();
    expect(failureCode(new Error('not a boot error'))).toBeNull();
  });
});
