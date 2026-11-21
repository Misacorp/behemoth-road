/**
 * The client end of the live socket (`docs/design/live.md`), adapted from the creatures app's
 * `live-socket.ts`. Framework-free, with the socket, the clock, the timers and the dice injected, so the
 * tests drive it deterministically.
 *
 * It asks for a one-time ticket, opens the socket, reports `live` once the server's `hello` arrives, hands
 * `changed` pushes on, pings every 60 s (the runtime answers without waking the object; the ping is the
 * server's only sign that this player is still here), and reconnects after a drop with a jittered
 * exponential backoff (1 s up to 30 s). While it is not live the owner polls every 10 s, as before; that is
 * the fallback for an unsupported browser, a proxy that refuses the upgrade, a full guild, a server with the
 * flag off. After 6 failed tries in a row, a ticket 404 or the close code 4000 it stops until started again.
 */
import * as v from 'valibot';
import { ApiError } from './client.ts';
import { LiveMessageSchema, type LiveMessage } from './schema.ts';

export const HEARTBEAT_MS = 60_000;
/** How often the socket looks at its own health. */
const TICK_MS = 20_000;
/** Nothing at all (not even a pong) for this long: the connection is dead. */
export const DEAD_AFTER_MS = 150_000;
/** The server's `hello` must arrive this soon after the socket opens. */
export const HELLO_TIMEOUT_MS = 15_000;
export const BACKOFF_FIRST_MS = 1000;
export const BACKOFF_MAX_MS = 30_000;
/** Tries in a row that never reached `hello` before it gives up. */
export const MAX_FAILURES = 6;
/** A socket must stay open this long after `hello` before the failure count resets (a server that accepts, then closes, must still back off). */
export const STABLE_AFTER_MS = 30_000;
/** The server closes the older socket of a player's 4th with this code: do not fight for it. */
export const CLOSE_REPLACED = 4000;

/** The part of a browser `WebSocket` that is used. */
export interface SocketLike {
  send(text: string): void;
  close(code?: number): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number }) => void) | null;
  onerror: (() => void) | null;
}

export type SocketState = 'idle' | 'connecting' | 'live' | 'backoff' | 'failed' | 'unsupported';

export interface LiveSocketDeps {
  getTicket: () => Promise<string>;
  url: (ticket: string) => string;
  /** Null when the browser has no WebSocket. */
  createSocket: (url: string) => SocketLike | null;
  /** True while the socket delivers: the owner slows its poll. False again when it drops. */
  onLive: (live: boolean) => void;
  /** The game is now at `version` (a push, or the greeting). */
  onChanged: (version: number) => void;
  now?: () => number;
  /** A number in [0, 1) for the backoff's jitter. */
  random?: () => number;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface LiveSocket {
  start(): void;
  stop(): void;
  state(): SocketState;
}

/** The wait before try number `attempt` (0 for the first retry): doubling, capped, half to full jitter. */
export function backoffDelay(attempt: number, random: number): number {
  const base = Math.min(BACKOFF_MAX_MS, BACKOFF_FIRST_MS * 2 ** Math.min(attempt, 10));
  return Math.round(base * (0.5 + 0.5 * random));
}

/** A random number from the browser's crypto. */
function cryptoRandom(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return (buffer[0] ?? 0) / 2 ** 32;
}

export function browserSocket(url: string): SocketLike | null {
  return typeof WebSocket === 'undefined' ? null : (new WebSocket(url) as unknown as SocketLike);
}

/** `wss://<page host>/api/live?t=<ticket>`: relative to the page's own host, so the Discord proxy carries it. */
export function liveUrl(location: { protocol: string; host: string }, ticket: string): string {
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${location.host}/api/live?t=${encodeURIComponent(ticket)}`;
}

export function parseLiveMessage(text: string): LiveMessage | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = v.safeParse(LiveMessageSchema, raw);
  return parsed.success ? parsed.output : null;
}

export function createLiveSocket(deps: LiveSocketDeps): LiveSocket {
  const now = deps.now ?? Date.now;
  const random = deps.random ?? cryptoRandom;
  const setTimer = deps.setTimer ?? ((cb, ms) => setTimeout(cb, ms));
  const clearTimer = deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));

  let state: SocketState = 'idle';
  /** Bumped by every start and stop: a late answer from an older run is dropped. */
  let run = 0;
  let socket: SocketLike | null = null;
  let retryTimer: unknown = null;
  let tickTimer: unknown = null;
  let helloTimer: unknown = null;
  let failures = 0;
  let lastHeardAt = 0;
  let lastPingAt = 0;
  let announcedLive = false;
  /** When the current socket said `hello`, or null. */
  let liveSince: number | null = null;

  const clearTimers = (): void => {
    for (const t of [retryTimer, tickTimer, helloTimer]) if (t !== null) clearTimer(t);
    retryTimer = null;
    tickTimer = null;
    helloTimer = null;
  };

  function setLive(live: boolean): void {
    if (announcedLive === live) return;
    announcedLive = live;
    deps.onLive(live);
  }

  function dropSocket(): void {
    const old = socket;
    socket = null;
    if (old !== null) {
      old.onopen = null;
      old.onmessage = null;
      old.onclose = null;
      old.onerror = null;
      try {
        old.close(1000);
      } catch {
        // Already closed.
      }
    }
  }

  /** A try ended without a working socket (or a working one dropped): wait, then try again. */
  function fail(thisRun: number, giveUp = false): void {
    if (thisRun !== run) return;
    clearTimers();
    dropSocket();
    setLive(false);
    // Only a socket that stayed up for a while counts as a success.
    if (liveSince !== null && now() - liveSince >= STABLE_AFTER_MS) failures = 0;
    liveSince = null;
    failures++;
    if (giveUp || failures >= MAX_FAILURES) {
      state = 'failed';
      return;
    }
    state = 'backoff';
    retryTimer = setTimer(
      () => {
        retryTimer = null;
        void connect(thisRun);
      },
      backoffDelay(failures - 1, random()),
    );
  }

  function onFrame(thisRun: number, data: unknown): void {
    if (thisRun !== run) return;
    lastHeardAt = now();
    if (typeof data !== 'string' || data === 'pong') return;
    const message = parseLiveMessage(data);
    if (message === null) return;
    if (message.type === 'hello') {
      if (helloTimer !== null) clearTimer(helloTimer);
      helloTimer = null;
      state = 'live';
      liveSince = now();
      setLive(true);
      deps.onChanged(message.version);
      return;
    }
    if (state === 'live') deps.onChanged(message.version);
  }

  function tick(thisRun: number): void {
    if (thisRun !== run || socket === null) return;
    const t = now();
    if (t - lastHeardAt >= DEAD_AFTER_MS) {
      fail(thisRun);
      return;
    }
    if (t - lastPingAt >= HEARTBEAT_MS) {
      lastPingAt = t;
      try {
        socket.send('ping');
      } catch {
        fail(thisRun);
        return;
      }
    }
    tickTimer = setTimer(() => {
      tick(thisRun);
    }, TICK_MS);
  }

  async function connect(thisRun: number): Promise<void> {
    if (thisRun !== run) return;
    state = 'connecting';
    liveSince = null;
    let ticket: string;
    try {
      ticket = await deps.getTicket();
    } catch (err) {
      // A 404 means the server has the flag off: never try again this run.
      fail(thisRun, err instanceof ApiError && err.status === 404);
      return;
    }
    if (thisRun !== run) return;
    let opened: SocketLike | null;
    try {
      opened = deps.createSocket(deps.url(ticket));
    } catch {
      fail(thisRun);
      return;
    }
    if (opened === null) {
      state = 'unsupported';
      return;
    }
    socket = opened;
    lastHeardAt = now();
    lastPingAt = lastHeardAt;
    opened.onmessage = (event) => {
      onFrame(thisRun, event.data);
    };
    opened.onerror = () => {
      // A close follows; nothing to do here.
    };
    opened.onclose = (event) => {
      if (thisRun !== run) return;
      fail(thisRun, event.code === CLOSE_REPLACED);
    };
    helloTimer = setTimer(() => {
      helloTimer = null;
      fail(thisRun);
    }, HELLO_TIMEOUT_MS);
    tickTimer = setTimer(() => {
      tick(thisRun);
    }, TICK_MS);
  }

  return {
    start() {
      if (state !== 'idle') return;
      run++;
      failures = 0;
      void connect(run);
    },
    stop() {
      run++;
      clearTimers();
      dropSocket();
      setLive(false);
      if (state !== 'unsupported') state = 'idle';
    },
    state: () => state,
  };
}
