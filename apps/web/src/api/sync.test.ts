import { describe, expect, it } from 'vitest';
import { joined } from './fixtures.ts';
import type { GameResponse, PlayerView } from './schema.ts';
import {
  LIVE_POLL_MS,
  POLL_MS,
  PUSH_DEBOUNCE_MS,
  Sync,
  TICK_GRACE_MS,
  TICK_RETRY_MS,
} from './sync.ts';

function setup(answers: GameResponse[], live?: { start(): void; stop(): void }) {
  const asked: (number | undefined)[] = [];
  const seen: PlayerView[] = [];
  const timers = new Map<number, { fn: () => void; ms: number }>();
  const timeouts = new Map<number, { fn: () => void; ms: number }>();
  const clock = { t: 1_000_000 };
  let next = 1;
  const sync = new Sync({
    api: {
      game: (since) => {
        asked.push(since);
        const a = answers.shift() ?? { unchanged: true };
        return Promise.resolve(a);
      },
    },
    onView: (v) => seen.push(v),
    setInterval: (fn, ms) => {
      timers.set(next, { fn, ms });
      return next++;
    },
    clearInterval: (h) => timers.delete(h),
    setTimeout: (fn, ms) => {
      timeouts.set(next, { fn, ms });
      return next++;
    },
    clearTimeout: (h) => timeouts.delete(h),
    now: () => clock.t,
    ...(live ? { live } : {}),
  });
  return { sync, asked, seen, timers, timeouts, clock };
}

const at = (version: number): PlayerView => ({ ...joined(), version, now: 1_000_000 });

describe('view sync', () => {
  it('fetches the view, then asks with since and ignores unchanged answers', async () => {
    const s = setup([at(4), { unchanged: true }, at(5)]);
    await s.sync.refresh();
    await s.sync.refresh();
    await s.sync.refresh();
    expect(s.asked).toEqual([undefined, 4, 4]);
    expect(s.seen.map((v) => v.version)).toEqual([4, 5]);
  });

  it('polls every 10 seconds only while visible', async () => {
    const s = setup([at(1)]);
    s.sync.visible();
    await Promise.resolve();
    expect([...s.timers.values()].map((t) => t.ms)).toEqual([POLL_MS]);
    s.sync.visible();
    expect(s.timers.size).toBe(1);
    s.sync.hidden();
    expect(s.timers.size).toBe(0);
  });

  it('refreshes once just after fastTickAt, retries if the day has not turned, and keeps the slow poll', async () => {
    const s = setup([at(2), at(3)]);
    s.sync.visible();
    await new Promise((r) => setTimeout(r, 0));
    expect([...s.timers.values()].map((t) => t.ms)).toEqual([POLL_MS]);
    const fastTickAt = s.clock.t + 6000;
    s.sync.accept({ ...at(4), pace: 'fast', fastTickAt });
    expect([...s.timeouts.values()].map((t) => t.ms)).toEqual([6000 + TICK_GRACE_MS]);
    // The same countdown again changes nothing.
    s.sync.accept({ ...at(5), pace: 'fast', fastTickAt });
    expect(s.timeouts.size).toBe(1);
    expect([...s.timers.values()].map((t) => t.ms)).toEqual([POLL_MS]);

    // It fires: one refresh; the answer still shows the countdown, so one retry two seconds later.
    const [first] = [...s.timeouts.keys()];
    s.asked.length = 0;
    const fire = s.timeouts.get(first!)!.fn;
    s.timeouts.delete(first!);
    fire();
    await new Promise((r) => setTimeout(r, 0));
    expect(s.asked).toEqual([5]);
    expect([...s.timeouts.values()].map((t) => t.ms)).toEqual([TICK_RETRY_MS]);
  });

  it('does not retry when the day has turned, and a cleared countdown cancels the refresh', async () => {
    const s = setup([{ ...at(7), fastTickAt: null }]);
    s.sync.accept({ ...at(6), fastTickAt: s.clock.t + 1000 });
    expect(s.timeouts.size).toBe(1);
    const [key, pending] = [...s.timeouts.entries()][0]!;
    s.timeouts.delete(key);
    pending.fn();
    await new Promise((r) => setTimeout(r, 0));
    expect(s.timeouts.size).toBe(0);

    s.sync.accept({ ...at(8), fastTickAt: s.clock.t + 1000 });
    expect(s.timeouts.size).toBe(1);
    s.sync.accept({ ...at(9), fastTickAt: null });
    expect(s.timeouts.size).toBe(0);
  });

  it("takes an action's answer as the new view, and never goes back to an older one", async () => {
    const s = setup([at(3)]);
    s.sync.accept(at(5));
    await s.sync.refresh();
    expect(s.asked).toEqual([5]);
    expect(s.sync.current?.version).toBe(5);
  });

  it('shares one request between overlapping refreshes', async () => {
    const s = setup([at(2)]);
    await Promise.all([s.sync.refresh(), s.sync.refresh()]);
    expect(s.asked).toHaveLength(1);
  });

  it('a new season replaces the view whatever its version, and later refreshes ask from it', async () => {
    const s = setup([{ unchanged: true }]);
    s.sync.accept(at(40));
    s.sync.restart(at(2));
    expect(s.sync.current?.version).toBe(2);
    expect(s.seen.map((v) => v.version)).toEqual([40, 2]);
    await s.sync.refresh();
    expect(s.asked).toEqual([2]);
  });

  it('catches up from the view before an action, accepting the same version with its events', async () => {
    const reveal = { kind: 'reveal', hex: { q: 0, r: 1 }, version: 7 };
    const { sync, asked, seen } = setup([{ ...at(7), events: [reveal] }]);
    sync.accept(at(7));
    await sync.catchUp(5);
    expect(asked).toEqual([5]);
    expect(seen.at(-1)?.events).toEqual([reveal]);
  });

  it('after a new season, drops answers to polls and actions started in the old game', async () => {
    let answer: (a: GameResponse) => void = () => {};
    const seen: PlayerView[] = [];
    const sync = new Sync({
      api: { game: () => new Promise<GameResponse>((ok) => (answer = ok)) },
      onView: (v) => seen.push(v),
      setInterval: () => 1,
      clearInterval: () => {},
      setTimeout: () => 1,
      clearTimeout: () => {},
      now: () => 0,
    });
    sync.accept(at(40));
    const old = sync.generation;
    const poll = sync.refresh();
    sync.restart(at(2));
    // The old game's poll answers after the restart, with a higher version: it must not come back.
    answer(at(41));
    await poll;
    // So must an action's answer to a request made before the restart.
    sync.accept(at(42), old);
    expect(sync.current?.version).toBe(2);
    expect(seen.map((v) => v.version)).toEqual([40, 2]);
    // A poll made after the restart is taken.
    const next = sync.refresh();
    answer(at(3));
    await next;
    expect(sync.current?.version).toBe(3);
  });
});

describe('clock skew and hiding', () => {
  it("times the tick refresh by the server's clock, not the device's", () => {
    // The device clock is 5 minutes ahead of the server's.
    const s = setup([]);
    const server = s.clock.t - 300_000;
    s.sync.accept({ ...at(1), now: server, pace: 'fast', fastTickAt: server + 6000 });
    expect([...s.timeouts.values()].map((t) => t.ms)).toEqual([6000 + TICK_GRACE_MS]);
    expect(s.sync.serverNow()).toBe(server);
    s.clock.t += 2000;
    expect(s.sync.serverNow()).toBe(server + 2000);
    // And a device clock behind the server's.
    const behind = setup([]);
    const ahead = behind.clock.t + 120_000;
    behind.sync.accept({ ...at(1), now: ahead, pace: 'fast', fastTickAt: ahead + 4000 });
    expect([...behind.timeouts.values()].map((t) => t.ms)).toEqual([4000 + TICK_GRACE_MS]);
  });

  it('hidden() clears the pending tick refresh, and visible() schedules it again', async () => {
    const s = setup([{ ...at(1), pace: 'fast', fastTickAt: 1_006_000 }]);
    s.sync.accept({ ...at(1), pace: 'fast', fastTickAt: 1_006_000 });
    expect(s.timeouts.size).toBe(1);
    s.sync.hidden();
    expect(s.timeouts.size).toBe(0);
    s.sync.visible();
    await new Promise((r) => setTimeout(r, 0));
    expect(s.timeouts.size).toBe(1);
  });
});

describe('live socket', () => {
  function withLive(answers: GameResponse[]) {
    const events: string[] = [];
    const s = setup(answers, {
      start: () => events.push('start'),
      stop: () => events.push('stop'),
    });
    return { ...s, events };
  }

  it('opens the socket on visible and closes it on hidden', () => {
    const s = withLive([]);
    s.sync.visible();
    s.sync.hidden();
    expect(s.events).toEqual(['start', 'stop']);
  });

  it('polls every 60 s while live and every 10 s when not', async () => {
    const s = withLive([at(1)]);
    s.sync.visible();
    await Promise.resolve();
    expect([...s.timers.values()].map((t) => t.ms)).toEqual([POLL_MS]);
    s.sync.setLive(true);
    expect([...s.timers.values()].map((t) => t.ms)).toEqual([LIVE_POLL_MS]);
    s.sync.setLive(false);
    expect([...s.timers.values()].map((t) => t.ms)).toEqual([POLL_MS]);
  });

  it('refreshes once when the socket comes up', async () => {
    const s = withLive([at(1), at(2)]);
    s.sync.visible();
    await new Promise((r) => setTimeout(r, 0));
    s.asked.length = 0;
    s.sync.setLive(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(s.asked).toEqual([1]);
  });

  it('refreshes once, debounced, on a push with a newer version, and ignores an old one', async () => {
    const s = withLive([at(5), at(6)]);
    await s.sync.refresh();
    s.asked.length = 0;
    s.sync.changed(5);
    expect(s.timeouts.size).toBe(0);
    s.sync.changed(6);
    s.sync.changed(7);
    expect([...s.timeouts.values()].map((t) => t.ms)).toEqual([PUSH_DEBOUNCE_MS]);
    [...s.timeouts.values()][0]?.fn();
    await new Promise((r) => setTimeout(r, 0));
    expect(s.asked).toEqual([5]);
  });
});
