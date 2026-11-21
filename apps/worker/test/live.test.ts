import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import wranglerText from '../wrangler.jsonc?raw';
import type { SessionUser } from '../src/guild-game.ts';
import { createHandler } from '../src/handler.ts';
import {
  CLOSE_PROTOCOL,
  CLOSE_REPLACED,
  LiveSockets,
  TicketBook,
  parseTicket,
} from '../src/live.ts';
import { SERVER_CONFIG } from '../src/server-config.ts';
import {
  MISA,
  ORIGIN,
  ROBIN,
  callHandler,
  freshGuildId,
  tokenFor,
  type Handler,
} from './helpers.ts';

const wrangler = JSON.parse(wranglerText.replace(/^\s*\/\/.*$/gm, '')) as {
  vars: Record<string, string>;
  env: Record<string, { vars: Record<string, string> }>;
};

const handler: Handler = createHandler();

async function signIn(guildId: string, user: SessionUser): Promise<string> {
  const stub = env.GUILD_WORLD.get(env.GUILD_WORLD.idFromName(guildId));
  return tokenFor(guildId, await stub.createSession(guildId, user));
}

const authed = (token: string, path: string, method = 'GET', body?: unknown) =>
  callHandler(
    handler,
    new Request(`${ORIGIN}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );

async function ticketFor(token: string): Promise<string> {
  const res = await authed(token, '/api/live/ticket', 'POST', {});
  expect(res.status).toBe(200);
  return (await res.json<{ ticket: string }>()).ticket;
}

const upgrade = (query: string, headers: Record<string, string> = { Upgrade: 'websocket' }) =>
  callHandler(handler, new Request(`${ORIGIN}/api/live${query}`, { headers }));

interface Client {
  ws: WebSocket;
  messages: unknown[];
  closed: { code: number } | null;
}

async function connect(token: string): Promise<Client> {
  const res = await upgrade(`?t=${await ticketFor(token)}`);
  expect(res.status).toBe(101);
  const ws = res.webSocket;
  if (ws === null) throw new Error('no socket');
  const client: Client = { ws, messages: [], closed: null };
  ws.addEventListener('message', (e) => {
    // The runtime's auto-response `pong` is not JSON.
    if (e.data === 'pong') return;
    client.messages.push(JSON.parse(e.data as string));
  });
  ws.addEventListener('close', (e) => {
    client.closed = { code: e.code };
  });
  ws.accept();
  return client;
}

const until = async (cond: () => boolean): Promise<void> => {
  for (let i = 0; i < 300 && !cond(); i++) await new Promise((r) => setTimeout(r, 10));
  expect(cond()).toBe(true);
};

describe('the LIVE flag', () => {
  it('is on in staging and local, off in production (pinned)', () => {
    expect(wrangler.vars['LIVE']).toBe('on');
    expect(wrangler.env['staging']?.vars['LIVE']).toBe('on');
    expect(wrangler.env['production']?.vars['LIVE']).toBe('off');
  });

  it('makes the ticket route and the upgrade 404 when off', async () => {
    const guildId = freshGuildId();
    const token = await signIn(guildId, MISA);
    const off = { LIVE: 'off' };
    const t = await callHandler(
      handler,
      new Request(`${ORIGIN}/api/live/ticket`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: '{}',
      }),
      off,
    );
    expect(t.status).toBe(404);
    const u = await callHandler(
      handler,
      new Request(`${ORIGIN}/api/live?t=x`, { headers: { Upgrade: 'websocket' } }),
      off,
    );
    expect(u.status).toBe(404);
  });
});

describe('the config', () => {
  it('tells the client whether sockets are offered, so it never asks when they are off', async () => {
    const get = async (extra: Record<string, string>) =>
      (await callHandler(handler, new Request(`${ORIGIN}/api/config`), extra)).json<{
        live: boolean;
      }>();
    expect((await get({})).live).toBe(true);
    expect((await get({ LIVE: 'off' })).live).toBe(false);
  });
});

describe('tickets and the upgrade', () => {
  it('needs a session to get a ticket and a strict body', async () => {
    const guildId = freshGuildId();
    const res = await callHandler(
      handler,
      new Request(`${ORIGIN}/api/live/ticket`, { method: 'POST', body: '{}' }),
    );
    expect(res.status).toBe(401);
    const token = await signIn(guildId, MISA);
    expect((await authed(token, '/api/live/ticket', 'POST', { extra: 1 })).status).toBe(400);
  });

  it('refuses a plain request, junk, a forged guild, extra parameters and a replay', async () => {
    const guildId = freshGuildId();
    const token = await signIn(guildId, MISA);
    expect((await upgrade('?t=x', {})).status).toBe(426);
    expect((await upgrade('?t=x')).status).toBe(401);
    expect((await upgrade('')).status).toBe(401);
    const ticket = await ticketFor(token);
    const parsed = parseTicket(ticket);
    if (parsed === null) throw new Error('bad ticket');
    const forged = ticket.replace(parsed.guildId, '555555555555555555');
    expect((await upgrade(`?t=${forged}`)).status).toBe(401);
    expect((await upgrade(`?t=${ticket}&x=1`)).status).toBe(401);
    expect((await upgrade(`?t=${ticket}&t=${ticket}`)).status).toBe(401);
    // A session token is not a ticket.
    expect((await upgrade(`?t=${token}`)).status).toBe(401);
    const first = await upgrade(`?t=${ticket}`);
    expect(first.status).toBe(101);
    first.webSocket?.accept();
    first.webSocket?.close();
    expect((await upgrade(`?t=${ticket}`)).status).toBe(401);
  });

  it('greets with the current version', async () => {
    const guildId = freshGuildId();
    const token = await signIn(guildId, MISA);
    const view = await (await authed(token, '/api/game')).json<{ version: number }>();
    const client = await connect(token);
    await until(() => client.messages.length > 0);
    expect(client.messages[0]).toEqual({ v: 1, type: 'hello', version: view.version });
    client.ws.close();
  });

  it('closes a socket that sends anything but ping', async () => {
    const token = await signIn(freshGuildId(), MISA);
    const client = await connect(token);
    await until(() => client.messages.length > 0);
    client.ws.send('{"type":"act"}');
    await until(() => client.closed !== null);
    expect(client.closed?.code).toBe(CLOSE_PROTOCOL);
  });

  it('answers ping with pong', async () => {
    const token = await signIn(freshGuildId(), MISA);
    const client = await connect(token);
    const raw: unknown[] = [];
    client.ws.addEventListener('message', (e) => {
      raw.push(e.data);
    });
    client.ws.send('ping');
    await until(() => raw.includes('pong'));
    client.ws.close();
  });
});

describe('pushes', () => {
  it('tells every socket of the guild once per change, and no other guild', async () => {
    const guildId = freshGuildId();
    const misa = await signIn(guildId, MISA);
    const robin = await signIn(guildId, ROBIN);
    const other = await signIn(freshGuildId(), MISA);
    const a = await connect(misa);
    const b = await connect(robin);
    const c = await connect(other);
    await until(() => a.messages.length > 0 && b.messages.length > 0 && c.messages.length > 0);
    const joined = await authed(misa, '/api/game/join', 'POST', { role: 'guardian', offer: 0 });
    const { version } = await joined.json<{ version: number }>();
    await until(() => a.messages.length > 1 && b.messages.length > 1);
    expect(a.messages[1]).toEqual({ v: 1, type: 'changed', version });
    expect(b.messages[1]).toEqual({ v: 1, type: 'changed', version });
    // A read pushes nothing, and neither does a refused write or a ticket.
    await authed(robin, `/api/game?since=${String(version)}`);
    await authed(misa, '/api/game/act', 'POST', {
      version: version - 1,
      action: { kind: 'defend' },
    });
    await authed(robin, '/api/live/ticket', 'POST', {});
    await new Promise((r) => setTimeout(r, 50));
    expect(a.messages).toHaveLength(2);
    expect(c.messages).toHaveLength(1);
    // A push has no per-viewer data.
    expect(Object.keys(a.messages[1] as object).sort()).toEqual(['type', 'v', 'version']);
    for (const x of [a, b, c]) x.ws.close();
  });

  it('pushes for a day tick (the dev next-day) and the pace switch', async () => {
    const guildId = freshGuildId();
    const misa = await signIn(guildId, MISA);
    const a = await connect(misa);
    await until(() => a.messages.length > 0);
    expect((await authed(misa, '/api/dev/next-day', 'POST', {})).status).toBe(200);
    await until(() => a.messages.length > 1);
    expect((await authed(misa, '/api/dev/pace', 'POST', { pace: 'fast' })).status).toBe(200);
    await until(() => a.messages.length > 2);
    a.ws.close();
  });
});

describe('caps', () => {
  it('closes the oldest of a fourth socket of one player with 4000', async () => {
    const token = await signIn(freshGuildId(), MISA);
    const clients: Client[] = [];
    for (let i = 0; i < SERVER_CONFIG.live.maxSocketsPerUser; i++) {
      clients.push(await connect(token));
      await new Promise((r) => setTimeout(r, 5));
    }
    const fourth = await connect(token);
    const [first] = clients;
    await until(() => first?.closed !== null);
    expect(first?.closed?.code).toBe(CLOSE_REPLACED);
    expect(clients[1]?.closed).toBeNull();
    for (const x of [...clients, fourth]) x.ws.close();
  });

  it('answers 503 live_full past the per-guild cap', async () => {
    const guildId = freshGuildId();
    const clients: Client[] = [];
    const cap = SERVER_CONFIG.live.maxSocketsPerGuild;
    for (let i = 0; i < cap; i++) {
      // Distinct players, so the per-player cap does not apply.
      const user = { id: `3${String(i).padStart(17, '0')}`, displayName: `P${String(i)}` };
      clients.push(await connect(await signIn(guildId, user)));
    }
    const extra = await signIn(guildId, { id: '399999999999999999', displayName: 'Extra' });
    const res = await upgrade(`?t=${await ticketFor(extra)}`);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'live_full' });
    for (const x of clients) x.ws.close();
  });
});

describe('caps and sessions on upgrade', () => {
  it("evicts a reconnecting player's oldest socket before the guild cap applies", async () => {
    const guildId = freshGuildId();
    const cap = SERVER_CONFIG.live.maxSocketsPerGuild;
    const perUser = SERVER_CONFIG.live.maxSocketsPerUser;
    const clients: Client[] = [];
    const mineToken = await signIn(guildId, MISA);
    for (let i = 0; i < perUser; i++) {
      clients.push(await connect(mineToken));
      await new Promise((r) => setTimeout(r, 5));
    }
    for (let i = 0; i < cap - perUser; i++) {
      const user = { id: `4${String(i).padStart(17, '0')}`, displayName: `P${String(i)}` };
      clients.push(await connect(await signIn(guildId, user)));
    }
    // The guild is full, yet this player's reconnect is not refused.
    const again = await connect(mineToken);
    await until(() => clients[0]?.closed !== null);
    expect(clients[0]?.closed?.code).toBe(CLOSE_REPLACED);
    for (const x of [...clients, again]) x.ws.close();
  });

  it('refuses an upgrade when the player no longer has a session', async () => {
    const guildId = freshGuildId();
    const token = await signIn(guildId, MISA);
    const ticket = await ticketFor(token);
    const stub = env.GUILD_WORLD.get(env.GUILD_WORLD.idFromName(guildId));
    await runInDurableObject(stub, (instance, state) => {
      state.storage.sql.exec('DELETE FROM sessions');
      (instance as unknown as { game: { dropMemory(): void } }).game.dropMemory();
    });
    const res = await upgrade(`?t=${ticket}`);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'invalid_session' });
  });
});

describe('TicketBook', () => {
  const guild = '333333333333333333';
  it('expires after 30 s, works once and keeps at most 200', async () => {
    const clock = { t: 1000 };
    const book = new TicketBook('secret', () => clock.t);
    const secretOf = (ticket: string) => parseTicket(ticket)?.secret ?? '';
    expect(await book.redeem(secretOf(await book.mint(guild, 'u1')))).toBe('u1');
    const t2 = await book.mint(guild, 'u2');
    expect(await book.redeem(secretOf(t2))).toBe('u2');
    expect(await book.redeem(secretOf(t2))).toBeNull();
    const t3 = await book.mint(guild, 'u3');
    clock.t += SERVER_CONFIG.live.ticketTtlMs;
    expect(await book.redeem(secretOf(t3))).toBeNull();
    const first = await book.mint(guild, 'first');
    for (let i = 0; i < 250; i++) await book.mint(guild, `u${String(i)}`);
    expect(book.size()).toBe(SERVER_CONFIG.live.ticketMaxPending);
    expect(await book.redeem(secretOf(first))).toBeNull();
  });
});

describe('stale pruning', () => {
  it('closes sockets with no ping for 150 s, by the runtime timestamp, with no timer', () => {
    const closed: string[] = [];
    const mk = (name: string, connectedAt: number) =>
      ({
        deserializeAttachment: () => ({ userId: name, connectedAt }),
        close: () => closed.push(name),
      }) as unknown as WebSocket;
    const now = 10_000_000;
    const sockets = [
      mk('fresh', now - 1000),
      mk('silent', now - 200_000),
      mk('pinged', now - 200_000),
    ];
    const ctx = {
      setWebSocketAutoResponse: () => undefined,
      getWebSockets: () => sockets,
      getWebSocketAutoResponseTimestamp: (ws: WebSocket) =>
        ws === sockets[2] ? new Date(now - 30_000) : null,
    } as unknown as DurableObjectState;
    const live = new LiveSockets({
      ctx,
      enabled: true,
      clientSecret: 's',
      guildId: () => null,
      version: () => 1,
      now: () => now,
    });
    expect(live.pruneStale()).toBe(1);
    expect(closed).toEqual(['silent']);
  });
});
