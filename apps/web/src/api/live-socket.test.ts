import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './client.ts';
import {
  BACKOFF_MAX_MS,
  CLOSE_REPLACED,
  DEAD_AFTER_MS,
  HEARTBEAT_MS,
  HELLO_TIMEOUT_MS,
  MAX_FAILURES,
  STABLE_AFTER_MS,
  backoffDelay,
  createLiveSocket,
  liveUrl,
  type SocketLike,
} from './live-socket.ts';

class FakeSocket implements SocketLike {
  sent: string[] = [];
  closedWith: number | null | undefined = undefined;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) {}
  send(text: string): void {
    this.sent.push(text);
  }
  close(code?: number): void {
    this.closedWith = code ?? null;
  }
  /** What the server does. */
  push(data: unknown): void {
    this.onmessage?.({ data });
  }
  hello(version = 1): void {
    this.push(JSON.stringify({ v: 1, type: 'hello', version }));
  }
  changed(version: number): void {
    this.push(JSON.stringify({ v: 1, type: 'changed', version }));
  }
  drop(code = 1006): void {
    this.onclose?.({ code });
  }
}

function setup(options: { tickets?: () => Promise<string>; supported?: boolean } = {}) {
  const sockets: FakeSocket[] = [];
  const events: string[] = [];
  const versions: number[] = [];
  const socket = createLiveSocket({
    getTicket: options.tickets ?? (() => Promise.resolve('ticket')),
    url: (ticket) => `wss://host/api/live?t=${ticket}`,
    createSocket: (url) => {
      if (options.supported === false) return null;
      const s = new FakeSocket(url);
      sockets.push(s);
      return s;
    },
    onLive: (live) => events.push(live ? 'live' : 'down'),
    onChanged: (version) => versions.push(version),
    random: () => 1,
  });
  return { socket, sockets, events, versions };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

/** Lets the controller try again until the `n`th socket exists (a second at a time). */
async function reach(sockets: readonly FakeSocket[], n: number): Promise<FakeSocket> {
  for (let i = 0; i < 40 && sockets.length < n; i++) await vi.advanceTimersByTimeAsync(1000);
  const found = sockets[n - 1];
  if (found === undefined) throw new Error(`socket ${String(n)} never opened`);
  return found;
}

describe('address', () => {
  it('is relative to the page host, wss on https', () => {
    expect(liveUrl({ protocol: 'https:', host: 'app.discordsays.com' }, 'a.b')).toBe(
      'wss://app.discordsays.com/api/live?t=a.b',
    );
    expect(liveUrl({ protocol: 'http:', host: 'localhost:5173' }, 'x')).toBe(
      'ws://localhost:5173/api/live?t=x',
    );
  });
});

describe('connecting', () => {
  it('is live only after the hello, and reports the version in it', async () => {
    const { socket, sockets, events, versions } = setup();
    socket.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(sockets[0]?.url).toBe('wss://host/api/live?t=ticket');
    expect(socket.state()).toBe('connecting');
    expect(events).toEqual([]);
    sockets[0]?.hello(7);
    expect(socket.state()).toBe('live');
    expect(events).toEqual(['live']);
    expect(versions).toEqual([7]);
  });

  it('hands changed pushes on, and ignores junk and a push before the hello', async () => {
    const { socket, sockets, versions } = setup();
    socket.start();
    await vi.advanceTimersByTimeAsync(0);
    const s = sockets[0];
    s?.changed(2);
    expect(versions).toEqual([]);
    s?.hello(1);
    s?.push('{nope');
    s?.push(42);
    s?.push('pong');
    s?.push(JSON.stringify({ v: 1, type: 'changed', version: -1 }));
    s?.push(JSON.stringify({ v: 1, type: 'other', version: 3 }));
    s?.changed(3);
    expect(versions).toEqual([1, 3]);
  });

  it('is unsupported without a WebSocket, and stop returns it to idle', async () => {
    const { socket } = setup({ supported: false });
    socket.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(socket.state()).toBe('unsupported');
    const live = setup();
    live.socket.start();
    await vi.advanceTimersByTimeAsync(0);
    live.sockets[0]?.hello();
    live.socket.stop();
    expect(live.socket.state()).toBe('idle');
    expect(live.events).toEqual(['live', 'down']);
    expect(live.sockets[0]?.closedWith).toBe(1000);
  });
});

describe('failing', () => {
  it('backs off 1, 2, 4 ... capped at 30 s with jitter', () => {
    expect(backoffDelay(0, 1)).toBe(1000);
    expect(backoffDelay(1, 1)).toBe(2000);
    expect(backoffDelay(2, 1)).toBe(4000);
    expect(backoffDelay(20, 1)).toBe(BACKOFF_MAX_MS);
    expect(backoffDelay(0, 0)).toBe(500);
  });

  it('retries after a drop and is live again at the next hello', async () => {
    const { socket, sockets, events } = setup();
    socket.start();
    await vi.advanceTimersByTimeAsync(0);
    sockets[0]?.hello();
    sockets[0]?.drop();
    expect(socket.state()).toBe('backoff');
    const second = await reach(sockets, 2);
    second.hello();
    expect(events).toEqual(['live', 'down', 'live']);
  });

  it('gives up after 6 tries that never reached hello', async () => {
    const { socket, sockets } = setup();
    socket.start();
    for (let i = 0; i < MAX_FAILURES; i++) {
      await vi.advanceTimersByTimeAsync(BACKOFF_MAX_MS);
      sockets[i]?.drop();
    }
    expect(socket.state()).toBe('failed');
    expect(sockets).toHaveLength(MAX_FAILURES);
  });

  it('backs off and gives up when the server accepts, says hello and closes at once, every time', async () => {
    const { socket, sockets } = setup();
    socket.start();
    for (let i = 0; i < MAX_FAILURES; i++) {
      const s = await reach(sockets, i + 1);
      s.hello();
      s.drop();
    }
    expect(socket.state()).toBe('failed');
    await vi.advanceTimersByTimeAsync(BACKOFF_MAX_MS * 2);
    expect(sockets).toHaveLength(MAX_FAILURES);
  });

  it('forgives earlier failures only after the socket stayed open for 30 s', async () => {
    const { socket, sockets } = setup();
    socket.start();
    for (let i = 0; i < MAX_FAILURES - 1; i++) {
      const s = await reach(sockets, i + 1);
      s.hello();
      s.drop();
    }
    const stable = await reach(sockets, MAX_FAILURES);
    stable.hello();
    await vi.advanceTimersByTimeAsync(STABLE_AFTER_MS);
    stable.drop();
    expect(socket.state()).toBe('backoff');
    const next = await reach(sockets, MAX_FAILURES + 1);
    next.hello();
    next.drop();
    expect(socket.state()).toBe('backoff');
  });

  it('gives up at once on a ticket 404 (flag off) and on close 4000 (replaced)', async () => {
    const off = setup({ tickets: () => Promise.reject(new ApiError(404, null)) });
    off.socket.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(off.socket.state()).toBe('failed');
    const other = setup({ tickets: () => Promise.reject(new ApiError(500, null)) });
    other.socket.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(other.socket.state()).toBe('backoff');
    const replaced = setup();
    replaced.socket.start();
    await vi.advanceTimersByTimeAsync(0);
    replaced.sockets[0]?.hello();
    replaced.sockets[0]?.drop(CLOSE_REPLACED);
    expect(replaced.socket.state()).toBe('failed');
  });

  it('fails a socket with no hello within 15 s', async () => {
    const { socket, sockets } = setup();
    socket.start();
    await vi.advanceTimersByTimeAsync(HELLO_TIMEOUT_MS);
    expect(socket.state()).toBe('backoff');
    expect(sockets[0]?.closedWith).toBe(1000);
  });
});

describe('health', () => {
  it('pings every 60 s, also while pushes arrive', async () => {
    const { socket, sockets } = setup();
    socket.start();
    await vi.advanceTimersByTimeAsync(0);
    sockets[0]?.hello();
    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(HEARTBEAT_MS / 2);
      sockets[0]?.push('pong');
      sockets[0]?.changed(i + 2);
      await vi.advanceTimersByTimeAsync(HEARTBEAT_MS / 2);
      sockets[0]?.push('pong');
    }
    expect(sockets[0]?.sent.length).toBeGreaterThanOrEqual(2);
    expect(new Set(sockets[0]?.sent)).toEqual(new Set(['ping']));
  });

  it('treats 150 s of silence as dead and reconnects', async () => {
    const { socket, sockets, events } = setup();
    socket.start();
    await vi.advanceTimersByTimeAsync(0);
    sockets[0]?.hello();
    await vi.advanceTimersByTimeAsync(DEAD_AFTER_MS + 20_000);
    expect(events).toContain('down');
    expect(sockets.length).toBeGreaterThanOrEqual(2);
  });
});
