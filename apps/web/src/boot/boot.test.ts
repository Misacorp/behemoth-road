import { describe, expect, it } from 'vitest';
import { createApiClient, type Fetch } from '../api/client.ts';
import { CONFIG, joined, SESSION } from '../api/fixtures.ts';
import { boot, type DiscordLike, isInsideDiscord } from './boot.ts';

function server(): { fetch: Fetch; paths: string[] } {
  const paths: string[] = [];
  const answers: Record<string, unknown> = {
    '/api/config': CONFIG,
    '/api/auth/session': SESSION,
    '/api/game': joined(),
  };
  return {
    paths,
    fetch: (path) => {
      paths.push(path);
      return Promise.resolve(new Response(JSON.stringify(answers[path]), { status: 200 }));
    },
  };
}

function fakeDiscord(log: string[]): DiscordLike {
  return {
    instanceId: 'i-1',
    ready: () => {
      log.push('ready');
      return Promise.resolve();
    },
    commands: {
      authorize: (args) => {
        log.push(`authorize:${args.client_id}:${args.scope.join(',')}`);
        return Promise.resolve({ code: 'the-code' });
      },
      authenticate: (args) => {
        log.push(`authenticate:${args.access_token}`);
        return Promise.resolve({});
      },
    },
  };
}

describe('boot', () => {
  it('knows Discord by the frame_id it adds to the URL', () => {
    expect(isInsideDiscord('?frame_id=1&instance_id=2')).toBe(true);
    expect(isInsideDiscord('')).toBe(false);
  });

  it('outside Discord, a deployed build only reports where it is (no sign-in)', async () => {
    const s = server();
    const b = await boot({
      api: createApiClient(s.fetch),
      search: '',
      discord: () => Promise.reject(new Error('never')),
      devSession: null,
    });
    expect(b.kind).toBe('outside');
    expect(s.paths).toEqual(['/api/config']);
  });

  it('inside Discord, a server that may not play gets the not-allowed state and no game', async () => {
    const paths: string[] = [];
    const fetch: Fetch = (path) => {
      paths.push(path);
      if (path === '/api/config') return Promise.resolve(new Response(JSON.stringify(CONFIG)));
      return Promise.resolve(
        new Response(JSON.stringify({ error: 'guild_not_allowed' }), { status: 403 }),
      );
    };
    const b = await boot({
      api: createApiClient(fetch),
      search: '?frame_id=f',
      discord: () => Promise.resolve(fakeDiscord([])),
      devSession: null,
    });
    expect(b.kind).toBe('not-allowed');
    expect(paths).toEqual(['/api/config', '/api/auth/session']);
  });

  it('inside Discord: ready, authorise, exchange the code, authenticate, then load the view', async () => {
    const s = server();
    const log: string[] = [];
    const b = await boot({
      api: createApiClient(s.fetch),
      search: '?frame_id=f',
      discord: (id) => {
        log.push(`sdk:${id}`);
        return Promise.resolve(fakeDiscord(log));
      },
      devSession: null,
    });
    expect(log).toEqual([
      `sdk:${CONFIG.discordClientId}`,
      'ready',
      `authorize:${CONFIG.discordClientId}:identify`,
      `authenticate:${SESSION.accessToken}`,
    ]);
    expect(s.paths).toEqual(['/api/config', '/api/auth/session', '/api/game']);
    expect(b.kind === 'ready' && b.view.version).toBe(joined().version);
  });

  it('in local development, a fake session stands in for Discord', async () => {
    const s = server();
    const b = await boot({
      api: createApiClient(s.fetch),
      search: '',
      discord: () => Promise.reject(new Error('never')),
      devSession: () => Promise.resolve(SESSION),
    });
    expect(b.kind).toBe('ready');
    expect(s.paths).toEqual(['/api/config', '/api/game']);
  });
});
