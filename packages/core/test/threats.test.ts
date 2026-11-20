import { describe, expect, it } from 'vitest';
import {
  type GameEvent,
  type GameState,
  hex,
  hexDistance,
  nextDayWithEvents,
  stepToward,
  terrainOf,
  threatOutlook,
  threatStrength,
  THREAT_TYPES,
  toPlayerView,
} from '../src/index.ts';
import { fieldGame, lingering, placeCharacter, QUIET, withThreat } from './helpers.ts';

const type = (id: string) => THREAT_TYPES.find((t) => t.id === id)!;
const kinds = (events: readonly GameEvent[]) => events.map((e) => e.kind);
const ofKind = <K extends GameEvent['kind']>(events: readonly GameEvent[], kind: K) =>
  events.filter((e): e is Extract<GameEvent, { kind: K }> => e.kind === kind);

/** Walks straight north (heading n) every tick. */
const STRAIGHT = { ...QUIET, veerWeights: { left: 0, right: 0 } };

describe('threat movement', () => {
  it('steps to the neighbour closest to the target, ties going to the first direction', () => {
    expect(stepToward(hex(0, 5), hex(0, 0))).toEqual(hex(0, 4));
    // From (2, 2) north (2, 1) and north-west (1, 2) are both 3 away: north comes first.
    expect(stepToward(hex(2, 2), hex(0, 0))).toEqual(hex(2, 1));
  });

  it('closes in at its speed and strikes the creature at contact, three ticks from behind', () => {
    let state = withThreat(fieldGame(['rider'], STRAIGHT), 'captors', hex(0, 5), 3);
    const moves: [number, number][] = [];
    for (let i = 0; i < 2; i++) {
      const next = nextDayWithEvents(state);
      const t = next.state.threats[0]!;
      moves.push([t.hex.q, t.hex.r]);
      expect(hexDistance(t.hex, next.state.creature.centre)).toBeGreaterThan(2);
      state = next.state;
    }
    expect(moves).toEqual([
      [0, 3],
      [0, 1],
    ]);
    const third = nextDayWithEvents(state);
    expect(third.state.threats).toEqual([]);
    expect(ofKind(third.events, 'threat-moves')).toEqual([
      { kind: 'threat-moves', id: 'xcaptors', from: hex(0, 1), to: hex(0, -1) },
    ]);
    expect(ofKind(third.events, 'threat-strikes')).toEqual([
      { kind: 'threat-strikes', id: 'xcaptors', damage: 3 },
    ]);
    expect(third.state.peril).toBe(3);
    expect(ofKind(third.events, 'peril')).toEqual([{ kind: 'peril', from: 0, to: 3 }]);
  });

  it('never moves a threat with no speed; it goes once out of the window', () => {
    let state = withThreat(fieldGame(['rider'], STRAIGHT), 'rockslide', hex(0, 4), 3);
    let next = nextDayWithEvents(state);
    expect(next.state.threats[0]?.hex).toEqual(hex(0, 4));
    expect(kinds(next.events)).not.toContain('threat-moves');
    state = next.state;
    next = nextDayWithEvents(state);
    expect(next.state.threats).toEqual([]);
    expect(ofKind(next.events, 'threat-gone')).toEqual([{ kind: 'threat-gone', id: 'xrockslide' }]);
  });

  it('strikes a creature that walks into it', () => {
    const state = withThreat(fieldGame(['rider'], STRAIGHT), 'rockslide', hex(0, -3), 3);
    const next = nextDayWithEvents(state);
    expect(ofKind(next.events, 'threat-strikes')).toEqual([
      { kind: 'threat-strikes', id: 'xrockslide', damage: 3 },
    ]);
  });
});

describe('defence', () => {
  const atContact = (defenders: string[], riding = true) => {
    let state = withThreat(lingering(fieldGame(['g1', 'g2'])), 'captors', hex(0, 3), 3);
    state = { ...state, creature: { ...state.creature, defenders } };
    if (!riding) state = placeCharacter(state, 'g1', hex(3, -1));
    return nextDayWithEvents(state);
  };

  it('takes defendReduction off each strike per defending guardian still riding', () => {
    expect(ofKind(atContact([]).events, 'threat-strikes')[0]?.damage).toBe(3);
    expect(ofKind(atContact(['g1']).events, 'threat-strikes')[0]?.damage).toBe(1);
    const held = atContact(['g1', 'g2']);
    expect(ofKind(held.events, 'threat-strikes')[0]?.damage).toBe(0);
    expect(held.state.peril).toBe(0);
    // A defender who stepped off counts for nothing.
    expect(ofKind(atContact(['g1'], false).events, 'threat-strikes')[0]?.damage).toBe(3);
  });

  it('clears the defenders at the tick', () => {
    expect(atContact(['g1', 'g2']).state.creature.defenders).toEqual([]);
  });
});

describe('striking characters', () => {
  // A rockslide 4 hexes east-north-east, which never moves: (3, -1) and (4, -1) are next to it.
  const SLIDE = hex(4, -2);
  const near = (roles: string[], places: Record<string, ReturnType<typeof hex>>) => {
    let state = withThreat(lingering(fieldGame(roles)), 'rockslide', SLIDE, 3);
    for (const [id, h] of Object.entries(places)) state = placeCharacter(state, id, h);
    return nextDayWithEvents(state);
  };

  it('strikes everyone within 1; they start the next day with struckActions', () => {
    const next = near(['scout', 'scholar', 'keeper'], { scout: hex(3, -1), scholar: hex(4, -2) });
    expect(ofKind(next.events, 'struck')).toEqual([
      { kind: 'struck', characterId: 'scout', threat: 'xrockslide' },
      { kind: 'struck', characterId: 'scholar', threat: 'xrockslide' },
    ]);
    const actions = Object.fromEntries(next.state.characters.map((c) => [c.id, c.actionsLeft]));
    // The keeper rode: riders are never struck.
    expect(actions).toEqual({ scout: 1, scholar: 1, keeper: 3 });
    // The threat goes on.
    expect(next.state.threats).toHaveLength(1);
  });

  it('spares guardians and anyone they escort', () => {
    const next = near(['guardian', 'scout', 'scholar'], {
      guardian: hex(3, -1),
      scout: hex(3, 0),
      scholar: hex(5, -2),
    });
    // The scout stands beside the guardian; the scholar, beside the slide, is out of escort.
    expect(ofKind(next.events, 'struck').map((e) => e.characterId)).toEqual(['scholar']);
  });

  it('is not escorted by a guardian who rides', () => {
    const next = near(['guardian', 'scout'], { scout: hex(3, -1) });
    expect(ofKind(next.events, 'struck').map((e) => e.characterId)).toEqual(['scout']);
  });
});

describe('a new threat', () => {
  const ROLL = {
    threatsFromDay: 2,
    threatChanceBase: 1,
    threatChanceMax: 1,
    settlementFirst: 100_000,
  };

  it('appears from threatsFromDay, while fewer than threatsMax are on the map', () => {
    const state = fieldGame(['a'], { ...ROLL, threatsFromDay: 3 });
    const day2 = nextDayWithEvents(state);
    expect(day2.state.threats).toEqual([]);
    const day3 = nextDayWithEvents(day2.state);
    expect(day3.state.threats).toHaveLength(1);
    const t = day3.state.threats[0]!;
    expect(t).toMatchObject({ id: 't3', appearedDay: 3 });
    expect(ofKind(day3.events, 'threat-appears')).toEqual([
      { kind: 'threat-appears', id: 't3', type: t.type, hex: t.hex },
    ]);
    let full = fieldGame(['a'], { ...ROLL, threatsMax: 1 });
    full = withThreat(full, 'rockslide', hex(4, -2));
    full = lingering(full);
    expect(nextDayWithEvents(full).state.threats).toHaveLength(1);
  });

  it("rolls against the day's chance", () => {
    const never = { ...ROLL, threatChanceBase: 0, threatChancePerPlayer: 0, threatChancePerDay: 0 };
    for (let seed = 1; seed <= 20; seed++) {
      expect(nextDayWithEvents(fieldGame(['a'], never, seed)).state.threats).toEqual([]);
    }
  });

  it('appears where its approach says, and never rolls a sent threat', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const next = nextDayWithEvents(fieldGame(['a'], ROLL, seed)).state;
      const t = next.threats[0]!;
      seen.add(t.type);
      const { centre } = next.creature;
      const d = hexDistance(t.hex, centre);
      const terrain = terrainOf(next, t.hex)!;
      if (t.type === 'rockslide') {
        // Straight ahead (north), 4 hexes out or further.
        expect(t.hex.q).toBe(centre.q);
        expect(t.hex.r).toBeLessThanOrEqual(centre.r - 4);
      } else {
        expect(d).toBe(next.config.windowRadius);
        const ahead = 2 * (centre.r - t.hex.r) + (centre.q - t.hex.q);
        if (t.type === 'captors') expect(ahead).toBeLessThan(0);
        if (t.type === 'swarm') expect(ahead).toBeGreaterThan(0);
      }
      if (type(t.type).tags.includes('ground')) expect(terrain.tags).not.toContain('water');
      expect(t.strength).toBe(threatStrength(next, type(t.type), 2));
    }
    expect([...seen].sort()).toEqual(['captors', 'rockslide', 'swarm']);
  });

  it('leaves pursuers out while a mislead lasts', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const state: GameState = { ...fieldGame(['a'], ROLL, seed), misleadUntilDay: 2 };
      const next = nextDayWithEvents(state).state;
      expect(next.threats[0]?.type).not.toBe('captors');
      expect(next.misleadUntilDay).toBeNull();
    }
  });

  it('grows stronger with more players and later days', () => {
    const one = fieldGame(['a']);
    const four = fieldGame(['a', 'b', 'c', 'd']);
    expect(threatStrength(one, type('captors'), 1)).toBe(3);
    expect(threatStrength(four, type('captors'), 1)).toBe(4);
    expect(threatStrength(four, type('swarm'), 11)).toBe(4);
    expect(threatStrength(one, type('swarm'), 10)).toBe(2);
  });
});

describe('the threat outlook', () => {
  it('says whether each threat arrives tomorrow, later or never if the creature walks straight on', () => {
    let state = fieldGame(['a']);
    state = withThreat(state, 'captors', hex(0, 5), 3, 'behind');
    state = withThreat(state, 'swarm', hex(0, 3), 2, 'close');
    state = withThreat(state, 'rockslide', hex(0, -4), 3, 'ahead');
    state = withThreat(state, 'rockslide', hex(4, -2), 3, 'aside');
    expect(threatOutlook(toPlayerView(state))).toEqual([
      { id: 'behind', arrives: 'later', next: hex(0, 4) },
      { id: 'close', arrives: 'tomorrow', next: hex(0, 2) },
      { id: 'ahead', arrives: 'later', next: null },
      { id: 'aside', arrives: 'never', next: null },
    ]);
  });

  it('knows a lingering creature stays put', () => {
    const state = withThreat(fieldGame(['a']), 'captors', hex(0, 4), 3, 'c');
    expect(threatOutlook(state)[0]?.arrives).toBe('later');
    expect(threatOutlook(lingering(state))[0]?.arrives).toBe('tomorrow');
  });
});
