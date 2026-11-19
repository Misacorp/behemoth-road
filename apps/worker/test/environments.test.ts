import { describe, expect, it } from 'vitest';
import wranglerText from '../wrangler.jsonc?raw';
import { DEV_GUILD_ID, createHandler } from '../src/index.ts';
import { parseSessionToken } from '../src/session.ts';
import { ORIGIN, callHandler } from './helpers.ts';

/** wrangler.jsonc without its comments (none of its strings contain `//`). */
const wrangler = JSON.parse(wranglerText.replace(/^\s*\/\/.*$/gm, '')) as {
  name: string;
  routes?: unknown;
  vars: Record<string, string>;
  env: Record<
    string,
    {
      name: string;
      vars: Record<string, string>;
      durable_objects: { bindings: { name: string }[] };
    }
  >;
};

describe('wrangler.jsonc', () => {
  it('gives the local top level its own name and no routes, so a deploy without --env never lands on a real host', () => {
    const deployed = Object.values(wrangler.env).map((e) => e.name);
    expect(deployed).not.toContain(wrangler.name);
    expect(wrangler.routes).toBeUndefined();
    for (const [name, environment] of Object.entries(wrangler.env)) {
      expect(environment.vars['ENVIRONMENT'], name).not.toBe('local');
    }
    expect(wrangler.env['production']?.vars['DEV_TOOLS']).not.toBe('on');
  });

  it('keeps the dev tools off in production and on in staging', () => {
    expect(wrangler.env['production']?.vars['DEV_TOOLS']).toBe('off');
    expect(wrangler.env['staging']?.vars['DEV_TOOLS']).toBe('on');
  });

  it('gives every deployed environment its own real Discord client id', () => {
    const ids = Object.values(wrangler.env).map((e) => e.vars['DISCORD_CLIENT_ID']);
    for (const id of ids) {
      expect(id).toMatch(/^\d{17,20}$/);
      expect(id).not.toMatch(/^0+$/);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('names every deployed environment, so the local-only dev login never runs there', () => {
    expect(wrangler.vars['ENVIRONMENT']).toBe('local');
    expect(wrangler.env['production']?.vars['ENVIRONMENT']).toBe('production');
    expect(wrangler.env['staging']?.vars['ENVIRONMENT']).toBe('staging');
  });

  it('gives every environment the same vars and the game binding', () => {
    const keys = Object.keys(wrangler.vars).sort();
    for (const name of ['production', 'staging']) {
      expect(Object.keys(wrangler.env[name]?.vars ?? {}).sort()).toEqual(keys);
      expect(wrangler.env[name]?.durable_objects.bindings.map((b) => b.name)).toEqual([
        'GUILD_WORLD',
      ]);
    }
  });
});

const handler = createHandler();
const post = (path: string, body: unknown, env: Partial<Env> = {}, token?: string) =>
  callHandler(
    handler,
    new Request(`${ORIGIN}${path}`, {
      method: 'POST',
      headers: token === undefined ? {} : { Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }),
    env,
  );

describe('the local dev login', () => {
  it('signs in a fake player of a fake server, who may run the next day', async () => {
    const res = await post('/api/dev/login', { player: 7 });
    expect(res.status).toBe(200);
    const body = await res.json<{ token: string; user: { id: string; name: string } }>();
    expect(body.user).toEqual({ id: '200000000000000007', name: 'Player 7' });
    expect(parseSessionToken(body.token)?.guildId).toBe(DEV_GUILD_ID);
    const next = await post('/api/dev/next-day', {}, {}, body.token);
    expect(next.status).toBe(200);
    expect(JSON.stringify(await next.json())).not.toMatch(/"seed"/);
  });

  it('checks its body', async () => {
    for (const body of [{}, { player: 0 }, { player: 10 }, { player: 1, guild: '1' }]) {
      expect((await post('/api/dev/login', body)).status).toBe(400);
    }
  });

  it('does not exist in a deployed environment or with the dev tools off', async () => {
    expect((await post('/api/dev/login', { player: 1 }, { ENVIRONMENT: 'staging' })).status).toBe(
      404,
    );
    expect(
      (await post('/api/dev/login', { player: 1 }, { ENVIRONMENT: 'production', DEV_TOOLS: 'off' }))
        .status,
    ).toBe(404);
    const { token } = await (await post('/api/dev/login', { player: 2 })).json<{ token: string }>();
    expect((await post('/api/dev/next-day', {}, { DEV_TOOLS: 'off' }, token)).status).toBe(404);
  });
});
