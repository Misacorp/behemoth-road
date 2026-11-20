import { describe, expect, it } from 'vitest';
import { joined } from './fixtures.ts';
import type { GameResponse, PlayerView } from './schema.ts';
import { POLL_MS, Sync } from './sync.ts';

function setup(answers: GameResponse[]) {
  const asked: (number | undefined)[] = [];
  const seen: PlayerView[] = [];
  const timers = new Map<number, { fn: () => void; ms: number }>();
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
  });
  return { sync, asked, seen, timers };
}

const at = (version: number): PlayerView => ({ ...joined(), version });

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
