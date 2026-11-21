import { env } from 'cloudflare:workers';
import { listDurableObjectIds } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';
import { createHandler } from '../src/handler.ts';
import { SERVER_CONFIG } from '../src/server-config.ts';
import { parseSessionToken } from '../src/session.ts';
import {
  ACCESS_TOKEN,
  DiscordError,
  ORIGIN,
  USER_ID,
  callHandler,
  expectApiHeaders,
  expectNoSeed,
  fakeDiscord,
  freshGuildId,
  postAuth,
  tokenFor,
  type FakeDiscordOptions,
} from './helpers.ts';

function setup(options: FakeDiscordOptions = {}) {
  const discord = fakeDiscord(options);
  return { discord, handler: createHandler({ createDiscord: () => discord }) };
}

const validBody = { code: 'oauth-code', instanceId: 'instance-1' };

interface AuthBody {
  token: string;
  accessToken: string;
  user: { id: string; name: string };
}

const getGame = (handler: ReturnType<typeof createHandler>, token: string) =>
  callHandler(
    handler,
    new Request(`${ORIGIN}/api/game`, { headers: { Authorization: `Bearer ${token}` } }),
  );

describe('POST /api/auth/session', () => {
  it('signs in with the guild from Discord and the token opens the game', async () => {
    const guildId = freshGuildId();
    const { handler, discord } = setup({
      instance: { location: { guild_id: guildId }, users: [USER_ID] },
    });
    const res = await postAuth(handler, validBody);
    expect(res.status).toBe(200);
    expectApiHeaders(res);
    const body = await res.json<AuthBody>();
    expect(body.accessToken).toBe(ACCESS_TOKEN);
    expect(body.user).toEqual({ id: USER_ID, name: 'Misa' });
    expect(parseSessionToken(body.token)?.guildId).toBe(guildId);
    expect(discord.calls).toEqual({
      exchangeCode: ['oauth-code'],
      getCurrentUser: [ACCESS_TOKEN],
      getActivityInstance: ['instance-1'],
    });
    const game = await getGame(handler, body.token);
    expect(game.status).toBe(200);
    const view = await game.json<{ you: { userId: string }; day: number }>();
    expect(view.you.userId).toBe(USER_ID);
    expect(view.day).toBe(1);
    // The seed is real randomness here, so only the key can be checked.
    expect(JSON.stringify(view)).not.toMatch(/"seed"/);
  });

  it('rejects unknown keys, a client-supplied guild included, and bad shapes', async () => {
    const { handler, discord } = setup();
    for (const body of [
      { ...validBody, guildId: '444444444444444444' },
      { code: 'x' },
      { code: '', instanceId: 'i' },
      { code: 'x'.repeat(513), instanceId: 'i' },
      { code: 'x', instanceId: 'i'.repeat(129) },
      { code: 1, instanceId: 'i' },
      [],
    ]) {
      expect((await postAuth(handler, body)).status).toBe(400);
    }
    expect((await postAuth(handler, '{not json', true)).status).toBe(400);
    expect(
      (await postAuth(handler, JSON.stringify({ ...validBody, pad: 'x'.repeat(5000) }), true))
        .status,
    ).toBe(400);
    expect(discord.calls.exchangeCode).toEqual([]);
  });

  it('answers a bad code with 401 and Discord trouble with 503', async () => {
    const bad = setup({ exchangeError: new DiscordError('auth_failed') });
    const res = await postAuth(bad.handler, validBody);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'discord_auth_failed' });
    const down = setup({ instanceError: new DiscordError('unavailable') });
    expect((await postAuth(down.handler, validBody)).status).toBe(503);
  });

  it('logs one line per failure with the step and Discord status, never a token, code or id', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      await postAuth(
        setup({ exchangeError: new DiscordError('auth_failed', '401') }).handler,
        validBody,
      );
      await postAuth(
        setup({ userError: new DiscordError('unavailable', '502') }).handler,
        validBody,
      );
      await postAuth(
        setup({ instanceError: new DiscordError('unavailable', '403') }).handler,
        validBody,
      );
      await postAuth(setup({ instance: null }).handler, validBody);
      const lines = warn.mock.calls.map((c) => c.join(' '));
      expect(lines).toEqual([
        'auth: token exchange 401',
        'auth: user lookup 502',
        'auth: instance lookup 403',
        'auth: instance lookup 404',
      ]);
      for (const line of lines) {
        for (const secret of ['oauth-code', 'instance-1', ACCESS_TOKEN, USER_ID]) {
          expect(line).not.toContain(secret);
        }
      }
    } finally {
      warn.mockRestore();
    }
  });

  it('refuses an unknown instance, a DM launch and a user outside the instance', async () => {
    const unknown = setup({ instance: null });
    expect(await (await postAuth(unknown.handler, validBody)).json()).toEqual({
      error: 'instance_not_found',
    });
    // A DM or group DM has no guild: there is no server game to join.
    const dm = setup({
      instance: {
        location: { guild_id: null, channel_id: '555555555555555555' },
        users: [USER_ID],
      },
    });
    const dmRes = await postAuth(dm.handler, validBody);
    expect(dmRes.status).toBe(400);
    expect(await dmRes.json()).toEqual({ error: 'guild_required' });
    const malformed = setup({
      instance: { location: { guild_id: 'not-a-guild' }, users: [USER_ID] },
    });
    expect((await postAuth(malformed.handler, validBody)).status).toBe(400);
    const outside = setup({
      instance: { location: { guild_id: freshGuildId() }, users: ['999999999999999999'] },
    });
    expect(await (await postAuth(outside.handler, validBody)).json()).toEqual({
      error: 'not_in_instance',
    });
  });

  it('sanitises the display name and falls back to the username', async () => {
    const guildId = freshGuildId();
    const instance = { location: { guild_id: guildId }, users: [USER_ID] };
    const spaced = setup({
      instance,
      user: { id: USER_ID, username: 'misa', global_name: ' Mi​sa\n\tJ ' },
    });
    expect((await (await postAuth(spaced.handler, validBody)).json<AuthBody>()).user.name).toBe(
      'Misa J',
    );
    const plain = setup({ instance, user: { id: USER_ID, username: 'misa', global_name: null } });
    expect((await (await postAuth(plain.handler, validBody)).json<AuthBody>()).user.name).toBe(
      'misa',
    );
  });

  it('rate limits sign-in per IP however the instance id is rotated, and overall', async () => {
    const { handler } = setup({
      instance: { location: { guild_id: freshGuildId() }, users: [USER_ID] },
    });
    const from = (ip: string, i: number) =>
      callHandler(
        handler,
        new Request(`${ORIGIN}/api/auth/session`, {
          method: 'POST',
          headers: { 'CF-Connecting-IP': ip },
          body: JSON.stringify({ code: 'c', instanceId: `rotated-${String(i)}` }),
        }),
      );
    const { authIp, authGlobal } = SERVER_CONFIG.rateLimits;
    for (let i = 0; i < authIp.capacity; i++)
      expect((await from('203.0.113.7', i)).status).toBe(200);
    expect((await from('203.0.113.7', 999)).status).toBe(429);
    // A fresh IP still gets in; then fresh IPs, each used once, meet the shared ceiling.
    expect((await from('198.51.100.1', 500)).status).toBe(200);
    const statuses: number[] = [];
    for (let i = 0; i < authGlobal.capacity; i++) {
      statuses.push((await from(`192.0.2.${String(i)}`, 1000 + i)).status);
    }
    expect(statuses).toContain(429);
  });

  it('rate limits sign-in per instance', async () => {
    const { handler } = setup({
      instance: { location: { guild_id: freshGuildId() }, users: [USER_ID] },
    });
    const body = { code: 'c', instanceId: 'busy-instance' };
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await postAuth(handler, body)).status);
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});

describe('session tokens', () => {
  async function signedIn() {
    const guildId = freshGuildId();
    const { handler } = setup({ instance: { location: { guild_id: guildId }, users: [USER_ID] } });
    const { token } = await (await postAuth(handler, validBody)).json<AuthBody>();
    return { handler, token, guildId };
  }

  it('refuses a missing, malformed or tampered token before any Durable Object', async () => {
    const { handler, token } = await signedIn();
    const parsed = parseSessionToken(token);
    if (parsed === null) throw new Error('token did not parse');
    const flip = (s: string) => (s[0] === 'A' ? 'B' : 'A') + s.slice(1);
    for (const bad of [
      '',
      'nonsense',
      token.slice(0, -1),
      `s1.${parsed.guildId}.${parsed.secret}.${flip(parsed.mac)}`,
      `s1.${parsed.guildId}.${flip(parsed.secret)}.${parsed.mac}`,
      // Another guild's id with this token's MAC: the MAC covers the guild.
      `s1.555555555555555555.${parsed.secret}.${parsed.mac}`,
    ]) {
      const res = await getGame(handler, bad);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'invalid_session' });
    }
    expect((await callHandler(handler, new Request(`${ORIGIN}/api/game`))).status).toBe(401);
  });

  it('refuses a correctly signed token whose secret belongs to another guild', async () => {
    const { handler, token } = await signedIn();
    const parsed = parseSessionToken(token);
    if (parsed === null) throw new Error('token did not parse');
    const elsewhere = await tokenFor(freshGuildId(), parsed.secret);
    expect((await getGame(handler, elsewhere)).status).toBe(401);
  });
});

describe('the Worker refuses bad tokens before any game route', () => {
  it('never addresses the Durable Object of a guild named only in a forged token', async () => {
    const { handler, token } = await (async () => {
      const guildId = freshGuildId();
      const h = setup({ instance: { location: { guild_id: guildId }, users: [USER_ID] } }).handler;
      return { handler: h, token: (await (await postAuth(h, validBody)).json<AuthBody>()).token };
    })();
    const parsed = parseSessionToken(token);
    if (parsed === null) throw new Error('token did not parse');
    const forgedGuild = freshGuildId();
    const before = (await listDurableObjectIds(env.GUILD_WORLD)).length;
    for (const [method, path] of [
      ['GET', '/api/game'],
      ['POST', '/api/game/move'],
      ['POST', '/api/game/join'],
      ['POST', '/api/dev/next-day'],
      ['POST', '/api/dev/new-season'],
    ] as const) {
      // A tampered MAC, and this token's MAC on another guild's id.
      for (const bad of [
        `s1.${parsed.guildId}.${parsed.secret}.${'A'.repeat(43)}`,
        `s1.${forgedGuild}.${parsed.secret}.${parsed.mac}`,
      ]) {
        const res = await callHandler(
          handler,
          new Request(`${ORIGIN}${path}`, {
            method,
            headers: { Authorization: `Bearer ${bad}` },
            ...(method === 'POST' ? { body: '{}' } : {}),
          }),
        );
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ error: 'invalid_session' });
      }
    }
    expect((await listDurableObjectIds(env.GUILD_WORLD)).length).toBe(before);
  });

  it("refuses a valid MAC for another guild in that guild's object, where the secret is unknown", async () => {
    const guildId = freshGuildId();
    const h = setup({ instance: { location: { guild_id: guildId }, users: [USER_ID] } }).handler;
    const { token } = await (await postAuth(h, validBody)).json<AuthBody>();
    const parsed = parseSessionToken(token);
    if (parsed === null) throw new Error('token did not parse');
    const other = await tokenFor(freshGuildId(), parsed.secret);
    for (const path of ['/api/game', '/api/game/move']) {
      const res = await callHandler(
        h,
        new Request(`${ORIGIN}${path}`, {
          method: path === '/api/game' ? 'GET' : 'POST',
          headers: { Authorization: `Bearer ${other}` },
          ...(path === '/api/game' ? {} : { body: '{"version":1,"path":[{"kind":"creature"}]}' }),
        }),
      );
      expect(res.status).toBe(401);
    }
  });
});

describe('GET /api/config', () => {
  it('is public and reports the build, the client id and the dev tools and live flags', async () => {
    const { handler } = setup();
    const res = await callHandler(handler, new Request(`${ORIGIN}/api/config`));
    expect(res.status).toBe(200);
    expectApiHeaders(res);
    const body = await res.json();
    expect(body).toEqual({
      environment: 'local',
      version: 'dev',
      branch: 'dev',
      discordClientId: env.DISCORD_CLIENT_ID,
      devTools: true,
      live: true,
    });
    expectNoSeed(body);
  });

  it('leaves out a branch CI could not have set', async () => {
    const { handler } = setup();
    const res = await callHandler(handler, new Request(`${ORIGIN}/api/config`), {
      BRANCH: 'a b;c',
    });
    expect(await res.json()).not.toHaveProperty('branch');
  });

  it('answers unknown routes with 404 and wrong methods with 405', async () => {
    const { handler } = setup();
    expect(
      (await callHandler(handler, new Request(`${ORIGIN}/api/config`, { method: 'POST' }))).status,
    ).toBe(405);
    // Unknown routes need a session first, so junk never wakes a Durable Object.
    expect((await callHandler(handler, new Request(`${ORIGIN}/api/nope`))).status).toBe(401);
  });

  it('leaves everything outside /api to the assets', async () => {
    const { handler } = setup();
    const assets = { fetch: () => Promise.resolve(new Response('asset')) } as unknown as Fetcher;
    const res = await callHandler(handler, new Request(`${ORIGIN}/`), { ASSETS: assets });
    expect(await res.text()).toBe('asset');
  });
});
