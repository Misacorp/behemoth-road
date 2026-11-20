import { env } from 'cloudflare:workers';
import { listDurableObjectIds } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { allowedGuilds } from '../src/allowlist.ts';
import { createHandler } from '../src/handler.ts';
import {
  GUILD_ID,
  ORIGIN,
  STRANGER_GUILD_ID,
  USER_ID,
  callHandler,
  fakeDiscord,
} from './helpers.ts';

describe('allowedGuilds', () => {
  it('reads comma-separated guild ids', () => {
    expect([...allowedGuilds('215386000132669440')]).toEqual(['215386000132669440']);
    expect([...allowedGuilds(' 215386000132669440 , 333333333333333333')]).toEqual([
      '215386000132669440',
      '333333333333333333',
    ]);
  });

  it('fails closed on an empty, malformed or oversized list', () => {
    for (const raw of [
      '',
      ' ',
      ',',
      '215386000132669440,',
      'abc',
      '215386000132669440,x',
      '*',
      undefined,
      5,
    ]) {
      expect(allowedGuilds(raw).size, String(raw)).toBe(0);
    }
    expect(allowedGuilds(Array.from({ length: 201 }, () => GUILD_ID).join(',')).size).toBe(0);
  });
});

describe('sign-in from a server not on the list', () => {
  const signIn = (guildId: string, allowed?: string) => {
    const discord = fakeDiscord({
      instance: { location: { guild_id: guildId }, users: [USER_ID] },
    });
    const handler = createHandler({ createDiscord: () => discord });
    return callHandler(
      handler,
      new Request(`${ORIGIN}/api/auth/session`, {
        method: 'POST',
        body: JSON.stringify({ code: 'c', instanceId: 'i' }),
      }),
      allowed === undefined ? {} : { ALLOWED_GUILDS: allowed },
    );
  };

  it('works for an allowed server', async () => {
    expect((await signIn(GUILD_ID)).status).toBe(200);
  });

  it('is refused with 403 before any Durable Object exists for it', async () => {
    const before = await listDurableObjectIds(env.GUILD_WORLD);
    const res = await signIn(STRANGER_GUILD_ID);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'guild_not_allowed' });
    expect((await listDurableObjectIds(env.GUILD_WORLD)).length).toBe(before.length);
  });

  it('is refused for every server when the list is empty or invalid', async () => {
    for (const list of ['', 'nonsense', `${GUILD_ID},`]) {
      expect((await signIn(GUILD_ID, list)).status).toBe(403);
    }
  });
});
