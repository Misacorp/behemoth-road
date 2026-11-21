/**
 * The live sockets of a guild (`docs/design/live.md`), adapted from the creatures app's `live-socket.ts` and
 * `live-ticket.ts`. They only tell clients that the game changed: `{ type: 'changed', version }`. A push
 * carries nothing per viewer; the client then asks `GET /api/game?since=` for its own view, the same safe
 * path as polling. Server to client only: the one thing a client may send is the text `ping`, which the
 * runtime answers with `pong` without waking the object (`setWebSocketAutoResponse`); anything else closes
 * the socket. Intents stay on the HTTP routes, so every rule, schema and rate limit stays where it was.
 *
 * The sockets live in the guild's own Durable Object and use the WebSocket Hibernation API, so an idle
 * guild costs nothing. No timers: stale sockets are pruned when someone connects and when a push goes out.
 *
 * A browser WebSocket cannot send an `Authorization` header, so the client first asks
 * `POST /api/live/ticket` (a normal authenticated request) and opens the socket with `?t=<ticket>`. A
 * ticket lives 30 seconds, works once, and is worth nothing else. The session token never goes in a URL.
 *
 * Ticket format: `t1.<guildId>.<secret>.<mac>`. The MAC (HMAC-SHA256, its own HKDF key from the Discord
 * client secret, a different label from the session token's) lets the Worker reject a forged guild id
 * before any Durable Object is addressed. The object keeps only the hash of the secret, in memory.
 */
import { errorResponse } from './http.ts';
import { derivedHmacKey, toHex } from './keys.ts';
import { SNOWFLAKE_RE } from './schemas.ts';
import { SERVER_CONFIG } from './server-config.ts';
import { base64Url, base64UrlDecode, generateSessionSecret } from './session.ts';

export const LIVE_PATH = '/api/live';
export const TICKET_PATH = '/api/live/ticket';

const { ticketTtlMs, ticketMaxPending, maxSocketsPerUser, maxSocketsPerGuild, staleMs, maxAgeMs } =
  SERVER_CONFIG.live;

/** The only text a client may send, and the runtime's answer. */
export const PING = 'ping';
export const PONG = 'pong';

/** Close codes (3000 to 4999 are free for applications). */
export const CLOSE_REPLACED = 4000;
export const CLOSE_STALE = 4001;
export const CLOSE_PROTOCOL = 4002;

/** What the server pushes. */
export type LiveMessage =
  { v: 1; type: 'hello'; version: number } | { v: 1; type: 'changed'; version: number };

// --- Tickets ---

const TICKET_RE = /^t1\.(\d{17,20})\.([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})$/;
const encoder = new TextEncoder();

const ticketKey = derivedHmacKey({
  salt: 'behemoth-road/live',
  info: 'live-ticket-v1',
  usages: ['sign', 'verify'],
});

export interface ParsedTicket {
  guildId: string;
  secret: string;
  mac: string;
}

export function parseTicket(value: string | null): ParsedTicket | null {
  if (value === null || value.length > 160) return null;
  const match = TICKET_RE.exec(value);
  if (match === null) return null;
  const [, guildId, secret, mac] = match;
  if (guildId === undefined || secret === undefined || mac === undefined) return null;
  return { guildId, secret, mac };
}

const macInput = (guildId: string, secret: string): Uint8Array =>
  encoder.encode(`t1.${guildId}.${secret}`);

/** Constant-time MAC check. Call before addressing any Durable Object. */
export async function verifyTicketMac(
  clientSecret: string,
  ticket: ParsedTicket,
): Promise<boolean> {
  const mac = base64UrlDecode(ticket.mac);
  if (mac === null) return false;
  return crypto.subtle.verify(
    'HMAC',
    await ticketKey(clientSecret),
    mac,
    macInput(ticket.guildId, ticket.secret),
  );
}

/** The `t` query parameter, if it is the only parameter and appears exactly once. */
export function ticketParam(request: Request): string | null {
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].length !== 1) return null;
  const all = params.getAll('t');
  return all.length === 1 ? (all[0] ?? null) : null;
}

async function hashSecret(secret: string): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(secret))));
}

interface Pending {
  userId: string;
  expiresAt: number;
}

/** The tickets of one guild, in memory: lost when the object restarts, which only costs a reconnect. */
export class TicketBook {
  private readonly pending = new Map<string, Pending>();

  constructor(
    private readonly clientSecret: string,
    private readonly now: () => number,
  ) {}

  /** Makes a ticket for `userId`, who comes from the verified session. */
  async mint(guildId: string, userId: string): Promise<string> {
    if (!SNOWFLAKE_RE.test(guildId)) throw new Error('invalid guild id');
    const secret = generateSessionSecret();
    const mac = new Uint8Array(
      await crypto.subtle.sign(
        'HMAC',
        await ticketKey(this.clientSecret),
        macInput(guildId, secret),
      ),
    );
    const hash = await hashSecret(secret);
    const t = this.now();
    for (const [key, p] of this.pending) if (p.expiresAt <= t) this.pending.delete(key);
    this.pending.set(hash, { userId, expiresAt: t + ticketTtlMs });
    // A Map keeps insertion order, so the first key is the oldest.
    while (this.pending.size > ticketMaxPending) {
      const oldest = this.pending.keys().next();
      if (oldest.done === true) break;
      this.pending.delete(oldest.value);
    }
    return `t1.${guildId}.${secret}.${base64Url(mac)}`;
  }

  /** Who a ticket was made for, once: it is gone after this call. Null if unknown or expired. */
  async redeem(secret: string): Promise<string | null> {
    const hash = await hashSecret(secret);
    const found = this.pending.get(hash);
    this.pending.delete(hash);
    if (found === undefined || found.expiresAt <= this.now()) return null;
    return found.userId;
  }

  size(): number {
    return this.pending.size;
  }
}

// --- Sockets ---

/** What the game needs from the live sockets. */
export interface LiveHooks {
  /** The `LIVE` flag: off, the ticket route and the upgrade answer 404. */
  readonly enabled: boolean;
  mintTicket(guildId: string, userId: string): Promise<string>;
  /** The game changed (one call per write transaction): every socket of the guild is told. Never throws. */
  changed(version: number): void;
}

interface Attachment {
  userId: string;
  connectedAt: number;
}

const userTag = (userId: string): string => `u:${userId}`;

function readAttachment(ws: WebSocket): Attachment | null {
  const raw: unknown = ws.deserializeAttachment();
  if (typeof raw !== 'object' || raw === null) return null;
  const { userId, connectedAt } = raw as Record<string, unknown>;
  return typeof userId === 'string' && typeof connectedAt === 'number'
    ? { userId, connectedAt }
    : null;
}

export function closeQuietly(ws: WebSocket, code: number, reason: string): void {
  try {
    ws.close(code, reason);
  } catch {
    // Already closed.
  }
}

/** A code a server may send in a close frame; reserved ones (1005, 1006, 1015) become a normal close. */
const safeCode = (code: number): number =>
  code === 1000 || (code >= 3000 && code <= 4999) || code === 1011 ? code : 1000;

export interface LiveSocketsDeps {
  ctx: DurableObjectState;
  enabled: boolean;
  clientSecret: string;
  /** The guild this object serves, or null before the first sign-in. */
  guildId: () => string | null;
  /** The game's current version (for `hello`), or null when there is no readable game. */
  version: () => number | null;
  /** True while the player has a live session (from memory, or one row on a miss). */
  hasSession: (userId: string) => boolean;
  now: () => number;
}

export class LiveSockets implements LiveHooks {
  private readonly tickets: TicketBook;

  constructor(private readonly deps: LiveSocketsDeps) {
    this.tickets = new TicketBook(deps.clientSecret, deps.now);
    deps.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
  }

  get enabled(): boolean {
    return this.deps.enabled;
  }

  mintTicket(guildId: string, userId: string): Promise<string> {
    return this.tickets.mint(guildId, userId);
  }

  /** Open sockets of the guild, stale ones closed first. */
  openSockets(): WebSocket[] {
    this.pruneStale();
    return this.deps.ctx.getWebSockets();
  }

  /** Closes sockets with no ping for `staleMs` or older than `maxAgeMs`; returns how many. */
  pruneStale(): number {
    const now = this.deps.now();
    let closed = 0;
    for (const ws of this.deps.ctx.getWebSockets()) {
      const att = readAttachment(ws);
      const lastPing = this.deps.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? 0;
      const lastAlive = Math.max(lastPing, att?.connectedAt ?? 0);
      if (att === null || now - lastAlive > staleMs || now - att.connectedAt > maxAgeMs) {
        closeQuietly(ws, CLOSE_STALE, 'stale');
        closed++;
      }
    }
    return closed;
  }

  /** Tells every socket the game is now at `version`. One frame, built once. Never throws. */
  changed(version: number): void {
    try {
      const frame = JSON.stringify({ v: 1, type: 'changed', version } satisfies LiveMessage);
      for (const ws of this.openSockets()) this.send(ws, frame);
    } catch (err) {
      console.error('live push failed', err instanceof Error ? err.name : 'unknown');
    }
  }

  /** The upgrade request: the Worker has checked the ticket's MAC; the object redeems it. */
  async upgrade(request: Request): Promise<Response> {
    if (!this.deps.enabled) return errorResponse('not_found', 404);
    if (request.method !== 'GET' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return errorResponse('upgrade_required', 426, { Upgrade: 'websocket' });
    }
    const ticket = parseTicket(ticketParam(request));
    if (ticket === null || ticket.guildId !== this.deps.guildId()) {
      return errorResponse('invalid_ticket', 401);
    }
    const userId = await this.tickets.redeem(ticket.secret);
    if (userId === null) return errorResponse('invalid_ticket', 401);

    if (!this.deps.hasSession(userId)) return errorResponse('invalid_session', 401);

    this.pruneStale();
    // This player's oldest sockets go first, so a reconnecting player is not refused at the guild cap
    // by their own dead sockets.
    const mine = this.deps.ctx
      .getWebSockets(userTag(userId))
      .map((ws) => ({ ws, at: readAttachment(ws)?.connectedAt ?? 0 }))
      .sort((a, b) => a.at - b.at);
    let evicted = 0;
    while (mine.length >= maxSocketsPerUser) {
      const oldest = mine.shift();
      if (oldest !== undefined) {
        closeQuietly(oldest.ws, CLOSE_REPLACED, 'replaced');
        evicted++;
      }
    }
    if (this.deps.ctx.getWebSockets().length - evicted >= maxSocketsPerGuild) {
      return errorResponse('live_full', 503);
    }

    const version = this.deps.version();
    if (version === null) return errorResponse('no_game', 409);
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.deps.ctx.acceptWebSocket(server, [userTag(userId)]);
    server.serializeAttachment({
      userId,
      connectedAt: this.deps.now(),
    } satisfies Attachment);
    server.send(JSON.stringify({ v: 1, type: 'hello', version } satisfies LiveMessage));
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Sends one frame; a socket that cannot take it is closed. Never throws. */
  private send(ws: WebSocket, frame: string): void {
    try {
      ws.send(frame);
    } catch {
      closeQuietly(ws, CLOSE_STALE, 'send failed');
    }
  }

  // --- Hibernation handlers (the Durable Object class forwards its own) ---

  /** The auto-response takes `ping`; anything that arrives here is not allowed. */
  webSocketMessage(ws: WebSocket): void {
    closeQuietly(ws, CLOSE_PROTOCOL, 'unexpected message');
  }

  webSocketClose(ws: WebSocket, code: number): void {
    closeQuietly(ws, safeCode(code), 'closed');
  }

  webSocketError(ws: WebSocket): void {
    closeQuietly(ws, 1011, 'error');
  }
}
