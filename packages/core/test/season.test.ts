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
  nextDay,
  nextDayWithEvents,
  planPath,
  reachablePlaces,
  toPlayerView,
} from '../src/index.ts';
import { fieldGame, lingering, placeCharacter, QUIET, withThreat } from './helpers.ts';

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

  it('lowers a threat by clearPowerGuardian for a guardian, clearPowerOther for anyone else', () => {
    const g = ok(act(near('guardian'), 'guardian', { kind: 'strike', threat: 'c' }));
    expect(g.state.threats[0]?.strength).toBe(1);
    expect(g.events).toEqual([
      { kind: 'threat-hit', id: 'c', characterId: 'guardian', strength: 1 },
    ]);
    const s = ok(act(near('scout'), 'scout', { kind: 'strike', threat: 'c' }));
    expect(s.state.threats[0]?.strength).toBe(2);
    expect(s.state.characters[0]?.actionsLeft).toBe(2);
  });

  it('clears a threat at 0', () => {
    const r = ok(act(near('guardian', 2), 'guardian', { kind: 'strike', threat: 'c' }));
    expect(r.state.threats).toEqual([]);
    expect(r.events).toEqual([
      { kind: 'threat-hit', id: 'c', characterId: 'guardian', strength: 0 },
      { kind: 'threat-cleared', id: 'c', characterId: 'guardian' },
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
  it('is for guardians riding, once a day', () => {
    const state = fieldGame(['guardian', 'scout']);
    expect(checkAction(state, 'scout', { kind: 'defend' })).toMatchObject({
      reason: 'needs-guardian',
    });
    const off = placeCharacter(state, 'guardian', hex(3, -1));
    expect(checkAction(off, 'guardian', { kind: 'defend' })).toMatchObject({
      reason: 'not-riding',
    });
    const r = ok(act(state, 'guardian', { kind: 'defend' }));
    expect(r.state.creature.defenders).toEqual(['guardian']);
    expect(r.events).toEqual([{ kind: 'defend', characterId: 'guardian' }]);
    expect(checkAction(r.state, 'guardian', { kind: 'defend' })).toMatchObject({
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
    // Satiety 3 drains to 2: underfed level 2.
    const hungry = nextDayWithEvents({ ...withSatiety(fieldGame(['a'], HUNGRY), 3), peril: 4 });
    expect(hungry.state.peril).toBe(5);
    // Satiety 4 drains to 3: level 1, no rise, so it calms.
    const calm = nextDayWithEvents({ ...withSatiety(fieldGame(['a'], HUNGRY), 4), peril: 4 });
    expect(calm.state.peril).toBe(3);
    expect(ofKind(calm.events, 'peril')).toEqual([{ kind: 'peril', from: 4, to: 3 }]);
    expect(nextDay(fieldGame(['a'], HUNGRY)).peril).toBe(0);
  });

  it('adds strikes and hunger together, and never passes perilMax', () => {
    let state = withSatiety(fieldGame(['a'], HUNGRY), 3);
    state = withThreat(lingering(state), 'captors', hex(0, 3), 3);
    expect(nextDay({ ...state, peril: 1 }).peril).toBe(5);
    expect(nextDay({ ...state, peril: 8 }).peril).toBe(10);
  });
});

describe('the season', () => {
  const ends = (config: ConfigOverrides, peril: number, threat = false) => {
    const straight = { veerWeights: { left: 0, right: 0 } };
    let state: GameState = { ...fieldGame(['a'], { ...QUIET, ...straight, ...config }), peril };
    if (threat) state = withThreat(state, 'rockslide', hex(0, -3), 3);
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
    let state = fieldGame(['guardian'], { ...QUIET, routeLength: 1 });
    state = nextDay(state);
    expect(state.season.status).toBe('over');
    expect(nextDayWithEvents(state)).toEqual({ state, events: [] });
    expect(checkAction(state, 'guardian', { kind: 'defend' })).toEqual({
      ok: false,
      reason: 'season-over',
    });
    expect(act(state, 'guardian', { kind: 'feed' })).toEqual({ ok: false, reason: 'season-over' });
    const edge = creatureEdge(state)[0]!;
    expect(move(state, 'guardian', edge)).toEqual({ ok: false, reason: 'season-over' });
    expect(move(toPlayerView(state), 'guardian', edge)).toEqual({
      ok: false,
      reason: 'season-over',
    });
    expect(planPath(state, 'guardian', edge)).toEqual({ ok: false, reason: 'season-over' });
    expect(reachablePlaces(state, 'guardian')).toEqual([]);
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
 * team rides: two guardians and a keeper. Threats roll as they would in play.
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
      role: c.id === 'keeper' ? 'keeper' : 'guardian',
    })),
  };
  const events: GameEvent[] = [];
  for (let i = 0; i < 60 && state.season.status === 'on'; i++) {
    if (plan.feed && state.day % 2 === 0) state = ok(act(state, 'keeper', { kind: 'feed' })).state;
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
    // Underfed at level 2 from the fourth tick: nine ticks of hunger.
    expect(state.peril).toBe(9);
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
