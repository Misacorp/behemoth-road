import { describe, expect, it } from 'vitest';
import {
  act,
  type Condition,
  createGame,
  emptyStory,
  fireStory,
  type GameEvent,
  type GameState,
  hex,
  nextDay,
  nextDayWithEvents,
  STORYLETS,
  storyletHolds,
  toPlayerView,
} from '../src/index.ts';
import { DEV_SEASON, playSeason } from '../scripts/balance.ts';
import { fieldGame, QUIET, withSettlement, withTerrain, withThreat } from './helpers.ts';

const stories = (events: readonly GameEvent[]) =>
  events.flatMap((e) => (e.kind === 'story' ? [e] : []));
const steps = (s: GameState, n: number): GameState => ({
  ...s,
  creature: { ...s.creature, steps: n },
});
/** A game whose story is fresh, so everything already true is queued at the next call. */
const fresh = (config = { ...QUIET, routeLength: 100 }): GameState => ({
  ...fieldGame(['a'], config),
  story: emptyStory(),
});
const byId = (id: string) => STORYLETS.find((s) => s.id === id)!;

describe('the storylets', () => {
  it('are the twelve season one beats, audience all, once, with unique ids', () => {
    expect(STORYLETS).toHaveLength(12);
    expect(new Set(STORYLETS.map((s) => s.id)).size).toBe(12);
    for (const s of STORYLETS) {
      expect(s).toMatchObject({ kind: 'beat', audience: 'all', once: true });
      expect(s.when.length).toBeGreaterThan(0);
    }
    const fractions = STORYLETS.flatMap((s) =>
      s.when.flatMap((c) => (c.kind === 'route' ? [c.fraction] : [])),
    );
    expect(fractions).toEqual([0, 0.25, 0.5, 0.75, 0.9]);
    const tags = STORYLETS.flatMap((s) =>
      s.when.flatMap((c) => (c.kind === 'footprint-touches' ? [c.tag] : [])),
    );
    expect(tags).toEqual(['wooded', 'dry', 'steep', 'water', 'boggy']);
  });
});

describe('conditions', () => {
  it('setting out holds from the start and fires with the new game', () => {
    const game = createGame(1, { characterIds: ['a'], config: QUIET });
    expect(game.story.fired).toContain('beat.setting-out');
  });

  it('route fractions hold from the step that reaches them', () => {
    const s = fresh();
    const holds = (n: number, id: string) => storyletHolds(steps(s, n), byId(id)) !== null;
    expect(holds(24, 'beat.waymark.quarter')).toBe(false);
    expect(holds(25, 'beat.waymark.quarter')).toBe(true);
    expect(holds(49, 'beat.waymark.half')).toBe(false);
    expect(holds(50, 'beat.waymark.half')).toBe(true);
    expect(holds(75, 'beat.waymark.three-quarters')).toBe(true);
    expect(holds(89, 'beat.greyfold')).toBe(false);
    expect(holds(90, 'beat.greyfold')).toBe(true);
  });

  it('the footprint touching a terrain tag holds, anchored to that hex', () => {
    const s = fresh();
    const none = storyletHolds(s, byId('beat.terrain.boggy'));
    expect(none).toBeNull();
    // A hex of the footprint (radius 1 round the centre) turns to swamp.
    const touching = withTerrain(s, hex(1, 0), 'swamp');
    expect(storyletHolds(touching, byId('beat.terrain.boggy'))).toEqual({
      hex: hex(1, 0),
      when: 'footprint-touches:boggy',
    });
    // Just outside it does not touch.
    expect(
      storyletHolds(withTerrain(s, hex(2, 0), 'swamp'), byId('beat.terrain.boggy')),
    ).toBeNull();
  });

  it('a threat with an ending of pursuer holds, anchored to it; other threats do not', () => {
    const s = fresh();
    expect(storyletHolds(withThreat(s, 'swarm', hex(4, 0)), byId('beat.first.captors'))).toBeNull();
    expect(storyletHolds(withThreat(s, 'captors', hex(4, 0)), byId('beat.first.captors'))).toEqual({
      hex: hex(4, 0),
      when: 'threat-ending:pursuer',
    });
  });

  it('a settlement in view holds, anchored to it', () => {
    const s = fresh();
    expect(storyletHolds(s, byId('beat.first.settlement'))).toBeNull();
    expect(storyletHolds(withSettlement(s, hex(3, -1)), byId('beat.first.settlement'))).toEqual({
      hex: hex(3, -1),
      when: 'settlement-in-view',
    });
  });

  it('read public facts only: the same on the player view, and no hidden field is touched', () => {
    const state = withSettlement(
      withThreat(withTerrain(fresh(), hex(1, 0), 'swamp'), 'captors', hex(4, 0)),
      hex(3, -1),
    );
    const view = toPlayerView(steps(state, 95));
    const guard = (hidden: string[]) =>
      new Proxy(view, {
        get(target, key, receiver) {
          if (typeof key === 'string' && hidden.includes(key)) throw new Error(`read ${key}`);
          return Reflect.get(target, key, receiver) as unknown;
        },
      });
    const guarded = guard(['seed', 'nature', 'care', 'features']);
    for (const s of STORYLETS) {
      expect(storyletHolds(guarded, s)).toEqual(storyletHolds(steps(state, 95), s));
    }
    // Firing copies the view's fields (features included), so it is guarded for the hidden three.
    expect(fireStory(guard(['seed', 'nature', 'care'])).events.length).toBeGreaterThan(0);
  });

  it('are a closed union over public facts (a new kind is a type error in `holds`)', () => {
    const kinds: Condition['kind'][] = [
      'route',
      'footprint-touches',
      'threat-ending',
      'settlement-in-view',
    ];
    expect(new Set(STORYLETS.flatMap((s) => s.when.map((c) => c.kind)))).toEqual(new Set(kinds));
  });
});

describe('firing', () => {
  it('fires on the act that makes a condition true, once, with a public event naming it', () => {
    const s = withSettlement(fresh(), hex(3, -1));
    const set = act(s, 'a', { kind: 'set-stance', stance: 'rest' });
    if (!set.ok) throw new Error(set.reason);
    expect(stories(set.events)).toEqual([
      {
        kind: 'story',
        id: 'beat.setting-out',
        step: 0,
        anchor: { kind: 'creature' },
        when: 'route:0',
      },
      {
        kind: 'story',
        id: 'beat.first.settlement',
        step: 0,
        anchor: { kind: 'hex', hex: hex(3, -1) },
        when: 'settlement-in-view',
      },
    ]);
    expect(set.state.story.fired).toEqual(['beat.setting-out', 'beat.first.settlement']);
    // Never again.
    const again = act(set.state, 'a', { kind: 'set-stance', stance: 'rest' });
    if (!again.ok) throw new Error(again.reason);
    expect(stories(again.events)).toEqual([]);
  });

  it('is deterministic: the same game and inputs give the same story', () => {
    const run = () => {
      let state = createGame(7, { characterIds: ['a'], config: { ...DEV_SEASON } });
      const events: GameEvent[] = [];
      for (let i = 0; i < 6 && state.season.status === 'on'; i++) {
        const next = nextDayWithEvents(state);
        events.push(...stories(next.events));
        state = next.state;
      }
      return { story: state.story, events };
    };
    expect(run()).toEqual(run());
  });

  it('fires each beat at most once over a whole season', () => {
    for (let seed = 1; seed <= 4; seed++) {
      let state = createGame(seed, { characterIds: ['a'], config: { ...DEV_SEASON } });
      const ids: string[] = [];
      for (let i = 0; i < 40 && state.season.status === 'on'; i++) {
        const next = nextDayWithEvents(state);
        ids.push(...stories(next.events).map((e) => e.id));
        state = next.state;
      }
      expect(new Set(ids).size).toBe(ids.length);
      expect(state.story.fired.slice(-ids.length)).toEqual(ids);
      expect(new Set(state.story.fired).size).toBe(state.story.fired.length);
    }
  });

  it('fires at most two a day and queues the rest in content order, never dropping one', () => {
    // 95 of 100 steps: setting out and the four route beats are all true at once.
    const s = steps(fresh(), 95);
    const day1 = nextDayWithEvents(s);
    expect(stories(day1.events).map((e) => e.id)).toEqual([
      'beat.setting-out',
      'beat.waymark.quarter',
    ]);
    expect(day1.state.story.queue.map((q) => q.id)).toEqual([
      'beat.waymark.half',
      'beat.waymark.three-quarters',
      'beat.greyfold',
    ]);
    // The day's cap is spent: an act the same day fires nothing more.
    const same = act(day1.state, 'a', { kind: 'set-stance', stance: 'rest' });
    if (!same.ok) throw new Error(same.reason);
    expect(stories(same.events)).toEqual([]);
    expect(same.state.story.queue).toHaveLength(3);
    // The next days release the rest, in order.
    const day2 = nextDayWithEvents(same.state);
    expect(stories(day2.events).map((e) => e.id)).toEqual([
      'beat.waymark.half',
      'beat.waymark.three-quarters',
    ]);
    const day3 = nextDayWithEvents(day2.state);
    expect(stories(day3.events).map((e) => e.id)).toEqual(['beat.greyfold']);
    expect(day3.state.story.queue).toEqual([]);
    expect([...day3.state.story.fired]).toEqual([
      'beat.setting-out',
      'beat.waymark.quarter',
      'beat.waymark.half',
      'beat.waymark.three-quarters',
      'beat.greyfold',
    ]);
  });

  it('puts story events in a tick before the day event', () => {
    const { events } = nextDayWithEvents(steps(fresh(), 95));
    const kinds = events.map((e) => e.kind);
    expect(kinds.at(-1)).toBe('day');
    expect(kinds.lastIndexOf('story')).toBeLessThan(kinds.length - 1);
  });

  it('fires nothing once the season is over', () => {
    const over = nextDay({
      ...fresh({
        ...QUIET,
        routeLength: 1,
        veerWeights: { left: 0, right: 0 },
        destinationRowsPerStep: 1,
      }),
    });
    expect(over.season.status).toBe('over');
    expect(over.story.queue).toEqual([]);
    expect(over.story.fired).toEqual([]);
  });

  it('does not run with the story off', () => {
    const off = createGame(1, { characterIds: ['a'], config: { ...QUIET, storyOn: false } });
    expect(off.story).toEqual(emptyStory());
    expect(nextDay(off).traces).toEqual([]);
  });
});

describe('the story changes nothing else', () => {
  const strip = (s: GameState) => ({
    ...s,
    story: null,
    traces: null,
    config: { ...s.config, storyOn: null },
  });

  it('plays the same seasons with the story on and off, but for story, traces and story events', () => {
    for (const policy of ['careful', 'careless'] as const) {
      for (const seed of [1, 2, 3, 4]) {
        const record = (storyOn: boolean) => {
          const days: unknown[] = [];
          const result = playSeason(
            seed,
            policy,
            3,
            { ...DEV_SEASON, storyOn },
            (planned, events) =>
              days.push([strip(planned), events.filter((e) => e.kind !== 'story')]),
          );
          return { result, days };
        };
        expect(record(true)).toEqual(record(false));
      }
    }
  }, 60_000);
});
