import { describe, expect, it } from 'vitest';
import {
  act,
  type ActResult,
  checkAction,
  type ConfigOverrides,
  createGame,
  creatureEdge,
  type GameEvent,
  type GameState,
  hex,
  move,
  moveAlong,
  nextDay,
  nextDayWithEvents,
  planPath,
  reachablePlaces,
  toPlayerView,
} from '../src/index.ts';
import { fieldGame, lingering, placeCharacter, plain, QUIET, withThreat } from './helpers.ts';

const ok = (r: ActResult) => {
  if (!r.ok) throw new Error(r.reason);
  return r;
};
const ofKind = <K extends GameEvent['kind']>(events: readonly GameEvent[], kind: K) =>
  events.filter((e): e is Extract<GameEvent, { kind: K }> => e.kind === kind);

describe('strike', () => {
  const near = (role: string, strength = 3) =>
    placeCharacter(
      withThreat(fieldGame([role]), 'captors', hex(4, -2), strength, 'c'),
      role,
      hex(3, -1),
    );

  it('lowers a threat by clearPowerWarden for a warden, clearPowerOther for anyone else', () => {
    const g = ok(act(near('warden'), 'warden', { kind: 'strike', threat: 'c' }));
    expect(g.state.threats[0]?.strength).toBe(1);
    expect(plain(g.events)).toEqual([
      { kind: 'threat-hit', id: 'c', characterId: 'warden', strength: 1 },
    ]);
    const s = ok(act(near('scout'), 'scout', { kind: 'strike', threat: 'c' }));
    expect(s.state.threats[0]?.strength).toBe(2);
    expect(s.state.characters[0]?.actionsLeft).toBe(2);
  });

  it('clears a threat at 0', () => {
    const r = ok(act(near('warden', 2), 'warden', { kind: 'strike', threat: 'c' }));
    expect(r.state.threats).toEqual([]);
    expect(r.events).toEqual([
      { kind: 'threat-hit', id: 'c', characterId: 'warden', strength: 0 },
      { kind: 'threat-cleared', id: 'c', characterId: 'warden' },
    ]);
  });

  it('needs the threat on or next to your hex', () => {
    const state = near('scout');
    expect(checkAction(state, 'scout', { kind: 'strike', threat: 'nope' })).toEqual({
      ok: false,
      reason: 'no-threat',
      cost: 1,
    });
    const far = placeCharacter(state, 'scout', hex(2, 1));
    expect(checkAction(far, 'scout', { kind: 'strike', threat: 'c' })).toMatchObject({
      reason: 'not-near',
    });
    const riding = withThreat(fieldGame(['scout']), 'captors', hex(0, 3), 3, 'c');
    expect(checkAction(riding, 'scout', { kind: 'strike', threat: 'c' })).toMatchObject({
      reason: 'not-near',
    });
  });
});

describe('defend', () => {
  it('is for wardens riding, once a day', () => {
    const state = fieldGame(['warden', 'scout']);
    expect(checkAction(state, 'scout', { kind: 'defend' })).toMatchObject({
      reason: 'needs-warden',
    });
    const off = placeCharacter(state, 'warden', hex(3, -1));
    expect(checkAction(off, 'warden', { kind: 'defend' })).toMatchObject({
      reason: 'not-riding',
    });
    const r = ok(act(state, 'warden', { kind: 'defend' }));
    expect(r.state.creature.defenders).toEqual(['warden']);
    expect(r.events).toEqual([{ kind: 'defend', characterId: 'warden' }]);
    expect(checkAction(r.state, 'warden', { kind: 'defend' })).toMatchObject({
      reason: 'already-have',
    });
  });
});

describe('peril', () => {
  const HUNGRY = { ...QUIET, perilHungry: 1 };
  const withSatiety = (state: GameState, satiety: number): GameState => ({
    ...state,
    care: { ...state.care, satiety },
  });

  it('rises with hunger at underfed level 2 or more, else falls by perilCalm', () => {
    // Satiety 6 drains to 5: underfed level 2.
    const hungry = nextDayWithEvents({ ...withSatiety(fieldGame(['a'], HUNGRY), 6), peril: 4 });
    expect(hungry.state.peril).toBe(5);
    // Satiety 7 drains to 6: level 1, no rise, so it calms.
    const calm = nextDayWithEvents({ ...withSatiety(fieldGame(['a'], HUNGRY), 7), peril: 4 });
    expect(calm.state.peril).toBe(3);
    expect(ofKind(calm.events, 'peril')).toEqual([
      { kind: 'peril', from: 4, to: 3, sources: [{ source: 'calm', amount: -1 }] },
    ]);
    expect(nextDay(fieldGame(['a'], HUNGRY)).peril).toBe(0);
  });

  it('adds strikes and hunger together, and never passes perilMax', () => {
    let state = withSatiety(fieldGame(['a'], HUNGRY), 6);
    state = withThreat(lingering(state), 'captors', hex(0, 3), 3);
    expect(nextDay({ ...state, peril: 1 }).peril).toBe(5);
    expect(nextDay({ ...state, peril: 8 }).peril).toBe(10);
  });
});

describe('the season', () => {
  const ends = (config: ConfigOverrides, peril: number, threat = false) => {
    const straight = { veerWeights: { left: 0, right: 0 } };
    let state: GameState = { ...fieldGame(['a'], { ...QUIET, ...straight, ...config }), peril };
    if (threat) state = withThreat(state, 'rockslide', hex(0, -2), 3);
    return nextDayWithEvents(state);
  };

  it('counts steps, but not lingering', () => {
    const state = fieldGame(['a']);
    expect(state.creature.steps).toBe(0);
    expect(nextDay(state).creature.steps).toBe(1);
    expect(nextDay(lingering(state)).creature.steps).toBe(0);
  });

  it('ends home when the steps reach routeLength: safe below perilWoundedAt, wounded otherwise', () => {
    const safe = ends({ routeLength: 1 }, 5);
    // 5 calms to 4: safe.
    expect(safe.state.season).toEqual({ status: 'over', outcome: 'safe', day: 2 });
    expect(safe.events.slice(-2)).toEqual([
      { kind: 'season-over', outcome: 'safe' },
      { kind: 'day', day: 2 },
    ]);
    expect(ends({ routeLength: 1 }, 6).state.season).toMatchObject({ outcome: 'wounded' });
    expect(ends({ routeLength: 2 }, 0).state.season).toEqual({ status: 'on' });
  });

  it('is lost at perilMax, checked before the route', () => {
    const lost = ends({ routeLength: 1 }, 8, true);
    expect(lost.state.peril).toBe(10);
    expect(lost.state.season).toEqual({ status: 'over', outcome: 'lost', day: 2 });
    expect(ends({ routeLength: 99 }, 7, true).state.season).toMatchObject({ outcome: 'lost' });
  });

  it('once over, refuses every action and move, and the tick changes nothing', () => {
    let state = fieldGame(['warden'], { ...QUIET, routeLength: 1 });
    state = nextDay(state);
    expect(state.season.status).toBe('over');
    expect(nextDayWithEvents(state)).toEqual({ state, events: [] });
    expect(checkAction(state, 'warden', { kind: 'defend' })).toEqual({
      ok: false,
      reason: 'season-over',
    });
    expect(act(state, 'warden', { kind: 'feed' })).toEqual({ ok: false, reason: 'season-over' });
    const edge = creatureEdge(state)[0]!;
    expect(move(state, 'warden', edge)).toEqual({ ok: false, reason: 'season-over' });
    expect(move(toPlayerView(state), 'warden', edge)).toEqual({
      ok: false,
      reason: 'season-over',
    });
    expect(planPath(state, 'warden', edge)).toEqual({ ok: false, reason: 'season-over' });
    expect(reachablePlaces(state, 'warden')).toEqual([]);
    for (const path of [[], [edge]]) {
      expect(moveAlong(state, 'warden', path)).toEqual({
        ok: false,
        reason: 'season-over',
        step: 0,
      });
    }
  });

  it('starts on, with no peril, threats or settlements', () => {
    const state = createGame(1);
    expect(state).toMatchObject({
      season: { status: 'on' },
      peril: 0,
      threats: [],
      settlements: [],
      misleadUntilDay: null,
      creature: { steps: 0, defenders: [] },
    });
  });
});

/**
 * Milestone 5's done criterion: full short seasons played through the core to
 * each outcome. The short season of staging and local play (12 steps); the
 * team rides: two wardens and a keeper. Threats roll as they would in play.
 */
const SHORT: ConfigOverrides = {
  routeLength: 12,
  settlementFirst: 3,
  settlementEvery: 6,
  threatsFromDay: 2,
};

const season = (
  seed: number,
  plan: { feed: boolean; defend: boolean; config?: ConfigOverrides },
) => {
  let state = createGame(seed, {
    characterIds: ['g1', 'g2', 'keeper'],
    artSeed: 0,
    config: { ...SHORT, ...plan.config },
  });
  state = {
    ...state,
    stores: plan.feed ? { forage: 20 } : {},
    characters: state.characters.map((c) => ({
      ...c,
      role: c.id === 'keeper' ? 'keeper' : 'warden',
    })),
  };
  const events: GameEvent[] = [];
  for (let i = 0; i < 60 && state.season.status === 'on'; i++) {
    if (plan.feed && state.day % 4 === 0) state = ok(act(state, 'keeper', { kind: 'feed' })).state;
    if (plan.defend) {
      for (const g of ['g1', 'g2']) state = ok(act(state, g, { kind: 'defend' })).state;
    }
    const next = nextDayWithEvents(state);
    expect(next.state.peril).toBeGreaterThanOrEqual(0);
    expect(next.state.peril).toBeLessThanOrEqual(state.config.perilMax);
    expect(next.state.threats.length).toBeLessThanOrEqual(state.config.threatsMax);
    events.push(...next.events);
    state = next.state;
  }
  return { state, events };
};

describe('a short season, played through', () => {
  it('comes home safe when the team feeds and defends the creature', () => {
    const { state, events } = season(3, { feed: true, defend: true });
    expect(state.season).toEqual({ status: 'over', outcome: 'safe', day: 13 });
    expect(state.creature.steps).toBe(12);
    expect(state.peril).toBe(0);
    // Threats came, struck and were held off; a settlement appeared on the route.
    expect(ofKind(events, 'threat-appears').length).toBeGreaterThan(0);
    expect(ofKind(events, 'threat-strikes').length).toBeGreaterThan(0);
    expect(ofKind(events, 'threat-strikes').every((e) => e.damage === 0)).toBe(true);
    expect(ofKind(events, 'settlement-appears')).toHaveLength(2);
  });

  it('comes home wounded when the creature goes hungry', () => {
    const { state } = season(3, { feed: false, defend: true });
    expect(state.season).toEqual({ status: 'over', outcome: 'wounded', day: 13 });
    // Hunger drains 1 a day (of 20, two a level), so an unfed creature is underfed at level 2 from day 7: peril 6.
    expect(state.peril).toBe(6);
  });

  it('is lost to peril when the creature goes hungry and undefended', () => {
    const { state, events } = season(3, {
      feed: false,
      defend: false,
      config: { routeLength: 40 },
    });
    expect(state.season).toMatchObject({ status: 'over', outcome: 'lost' });
    expect(state.peril).toBe(10);
    expect(state.creature.steps).toBeLessThan(40);
    expect(ofKind(events, 'threat-strikes').some((e) => e.damage > 0)).toBe(true);
    expect(events.at(-2)).toEqual({ kind: 'season-over', outcome: 'lost' });
    // Over: the next day never comes.
    expect(nextDay(state)).toBe(state);
  });

  it('plays the same season from the same seed', () => {
    expect(season(5, { feed: true, defend: false })).toEqual(
      season(5, { feed: true, defend: false }),
    );
  });
});
