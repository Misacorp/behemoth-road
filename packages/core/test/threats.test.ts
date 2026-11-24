import { describe, expect, it } from 'vitest';
import {
  act,
  type GameEvent,
  type GameState,
  hex,
  hexDistance,
  hexesInRange,
  moveAlong,
  nextDayWithEvents,
  stepToward,
  terrainOf,
  threatNextPath,
  threatOutlook,
  threatStrength,
  THREAT_TYPES,
  toPlayerView,
} from '../src/index.ts';
import { fieldGame, lingering, placeCharacter, QUIET, withTerrain, withThreat } from './helpers.ts';

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
      { kind: 'threat-strikes', id: 'xcaptors', type: 'captors', damage: 3, held: 0 },
    ]);
    expect(third.state.peril).toBe(3);
    expect(ofKind(third.events, 'peril')).toEqual([
      { kind: 'peril', from: 0, to: 3, sources: [{ source: 'threat:captors', amount: 3 }] },
    ]);
  });

  it('never moves a threat with no speed; it goes once out of the window', () => {
    let state = withThreat(fieldGame(['rider'], STRAIGHT), 'rockslide', hex(0, 5), 3);
    let next = nextDayWithEvents(state);
    expect(next.state.threats[0]?.hex).toEqual(hex(0, 5));
    expect(kinds(next.events)).not.toContain('threat-moves');
    state = next.state;
    next = nextDayWithEvents(state);
    expect(next.state.threats).toEqual([]);
    expect(ofKind(next.events, 'threat-gone')).toEqual([{ kind: 'threat-gone', id: 'xrockslide' }]);
  });

  it('strikes a creature that walks into it', () => {
    const state = withThreat(fieldGame(['rider'], STRAIGHT), 'rockslide', hex(0, -2), 3);
    const next = nextDayWithEvents(state);
    expect(ofKind(next.events, 'threat-strikes')).toEqual([
      { kind: 'threat-strikes', id: 'xrockslide', type: 'rockslide', damage: 3, held: 0 },
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

  it('takes defendReduction off each strike per defending warden still riding', () => {
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
  // An ambush (reach 1) at (0, 4) steps to (0, 3) and strikes everyone within 1 of it.
  const AMBUSH = hex(0, 4);
  const near = (roles: string[], places: Record<string, ReturnType<typeof hex>>) => {
    let state = withThreat(lingering(fieldGame(roles)), 'ambush', AMBUSH, 3);
    for (const [id, h] of Object.entries(places)) state = placeCharacter(state, id, h);
    return nextDayWithEvents(state);
  };

  it('strikes everyone within its reach; they start the next day with struckActions', () => {
    const next = near(['scout', 'scholar', 'keeper'], { scout: hex(-1, 4), scholar: hex(0, 3) });
    expect(ofKind(next.events, 'struck')).toEqual([
      { kind: 'struck', characterId: 'scout', threat: 'xambush' },
      { kind: 'struck', characterId: 'scholar', threat: 'xambush' },
    ]);
    const actions = Object.fromEntries(next.state.characters.map((c) => [c.id, c.actionsLeft]));
    // The keeper rode: riders are never struck.
    expect(actions).toEqual({ scout: 1, scholar: 1, keeper: 3 });
    const struckDays = Object.fromEntries(next.state.characters.map((c) => [c.id, c.struckDay]));
    expect(struckDays).toEqual({ scout: 2, scholar: 2, keeper: null });
    // The threat goes on.
    expect(next.state.threats).toHaveLength(1);
  });

  it('spares wardens and anyone they escort', () => {
    const next = near(['warden', 'scout', 'scholar'], {
      warden: hex(-1, 4),
      scout: hex(-1, 5),
      scholar: hex(1, 3),
    });
    // The scout stands beside the warden; the scholar, beside the ambush, is out of escort.
    expect(ofKind(next.events, 'struck').map((e) => e.characterId)).toEqual(['scholar']);
  });

  it('is not escorted by a warden who rides', () => {
    const next = near(['warden', 'scout'], { scout: hex(-1, 4) });
    expect(ofKind(next.events, 'struck').map((e) => e.characterId)).toEqual(['scout']);
  });

  it('strikes with a reach of 0 only a character on its own hex, never its neighbours', () => {
    expect(type('rockslide').reach).toBe(0);
    const SLIDE = hex(4, -2);
    let state = withThreat(
      lingering(fieldGame(['scout', 'scholar', 'keeper'])),
      'rockslide',
      SLIDE,
      3,
    );
    state = placeCharacter(state, 'scout', hex(3, -1));
    state = placeCharacter(state, 'scholar', SLIDE);
    const next = nextDayWithEvents(state);
    expect(ofKind(next.events, 'struck')).toEqual([
      { kind: 'struck', characterId: 'scholar', threat: 'xrockslide' },
    ]);
    expect(next.state.characters.find((c) => c.id === 'scout')?.actionsLeft).toBe(3);
  });

  it('does not strike the creature from beside a rockslide, only when its footprint reaches it', () => {
    const { creatureRadius } = fieldGame(['a']).config;
    // Walking north the creature's centre ends at (0, -1): a slide at distance radius is on its footprint.
    const onIt = withThreat(
      fieldGame(['rider'], STRAIGHT),
      'rockslide',
      hex(0, -1 - creatureRadius),
      3,
    );
    expect(ofKind(nextDayWithEvents(onIt).events, 'threat-strikes')).toHaveLength(1);
    const beside = withThreat(
      fieldGame(['rider'], STRAIGHT),
      'rockslide',
      hex(0, -2 - creatureRadius),
      3,
    );
    expect(ofKind(nextDayWithEvents(beside).events, 'threat-strikes')).toEqual([]);
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
      // An ambush rolled with no forest on the edge brings nothing.
      const t = next.threats[0];
      if (!t) continue;
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
        if (t.type === 'captors' || t.type === 'stampede') expect(ahead).toBeLessThan(0);
        if (t.type === 'swarm') expect(ahead).toBeGreaterThan(0);
      }
      expect(terrain.tags).not.toContain('water');
      expect(t.strength).toBe(threatStrength(next, type(t.type), 2));
    }
    expect([...seen].sort()).toEqual(['ambush', 'captors', 'rockslide', 'stampede', 'swarm']);
  });

  it('never loses a threat day to an ambush with no forest to hide in', () => {
    // All plains, and the new edge hexes are walked into plains too: only open-ground types fit.
    for (let seed = 1; seed <= 60; seed++) {
      let state = fieldGame(['a'], { ...ROLL, threatChanceBase: 1, threatChanceMax: 1 }, seed);
      for (const h of hexesInRange(state.creature.centre, state.config.windowRadius + 3)) {
        state = withTerrain(state, h, 'plains');
      }
      const day = state.day + 1;
      const rolled = nextDayWithEvents(state).state;
      expect(rolled.threats.length, `seed ${seed} day ${day}`).toBeGreaterThan(0);
      expect(rolled.threats[0]!.type).not.toBe('ambush');
    }
  });

  it('keeps a threat to the terrain its type names: an ambush in the forest, a stampede on open ground', () => {
    const forested = (state: GameState): GameState => {
      let s = state;
      for (const h of hexesInRange(s.creature.centre, s.config.windowRadius)) {
        if (h.q % 2 === 0) s = withTerrain(s, h, 'forest');
      }
      return s;
    };
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const next = nextDayWithEvents(forested(fieldGame(['a'], ROLL, seed))).state;
      const t = next.threats[0];
      if (!t) continue;
      kinds.add(t.type);
      const tags = terrainOf(next, t.hex)!.tags;
      if (t.type === 'ambush') expect(tags).toContain('wooded');
      if (t.type === 'stampede') expect(tags).toContain('open');
    }
    expect(kinds.has('ambush') && kinds.has('stampede')).toBe(true);
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
    expect(threatStrength(four, type('swarm'), 15)).toBe(4);
    expect(threatStrength(one, type('swarm'), 14)).toBe(2);
    expect(threatStrength(one, type('swarm'), 15)).toBe(3);
  });
});

describe('the threat outlook', () => {
  it('says whether each threat arrives tomorrow, later or never if the creature walks straight on', () => {
    let state = fieldGame(['a']);
    state = withThreat(state, 'captors', hex(0, 5), 3, 'behind');
    state = withThreat(state, 'swarm', hex(0, 3), 2, 'close');
    state = withThreat(state, 'rockslide', hex(0, -3), 3, 'ahead');
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

describe("the threat's next path", () => {
  it('lists the hexes it crosses at the next tick, end hex last, if the creature walks straight on', () => {
    let state = fieldGame(['a'], STRAIGHT);
    state = withThreat(state, 'captors', hex(0, 5), 3, 'behind');
    state = withThreat(state, 'swarm', hex(0, 3), 2, 'close');
    state = withThreat(state, 'rockslide', hex(0, -4), 3, 'still');
    const view = toPlayerView(state);
    expect(threatNextPath(view, 'behind')).toEqual([hex(0, 4), hex(0, 3)]);
    // It stops at contact, next to the footprint of the creature's next centre (0, -1).
    expect(threatNextPath(view, 'close')).toEqual([hex(0, 2), hex(0, 1)]);
    expect(threatNextPath(view, 'still')).toEqual([]);
    expect(threatNextPath(view, 'nobody')).toEqual([]);
  });

  it('assumes a lingering creature stays put', () => {
    const state = lingering(withThreat(fieldGame(['a']), 'captors', hex(0, 3), 3, 'c'));
    expect(threatNextPath(toPlayerView(state), 'c')).toEqual([hex(0, 2)]);
  });

  it('matches the tick and the outlook for every threat type from every hex of the window', () => {
    const base = fieldGame(['a'], STRAIGHT);
    const contact = base.config.creatureRadius + 1;
    let checked = 0;
    for (const t of THREAT_TYPES) {
      for (const h of hexesInRange(base.creature.centre, base.config.windowRadius)) {
        if (hexDistance(h, base.creature.centre) <= contact) continue;
        const state = withThreat(base, t.id, h, 9, 'x');
        const view = toPlayerView(state);
        const path = threatNextPath(view, 'x');
        const outlook = threatOutlook(view)[0]!;
        const next = nextDayWithEvents(state);
        const move = ofKind(next.events, 'threat-moves')[0];
        expect(move?.to ?? null).toEqual(path.at(-1) ?? null);
        expect(outlook.next).toEqual(path[0] ?? null);
        expect(path.length).toBeLessThanOrEqual(t.speed);
        // 'tomorrow' is exactly the threats that strike at the next tick.
        const strikes = ofKind(next.events, 'threat-strikes').length > 0;
        expect(strikes).toBe(outlook.arrives === 'tomorrow');
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });
});

describe('intercepting a threat', () => {
  /** Plays one action, failing the test if it is refused. */
  const ok = (
    result: { ok: true; state: GameState } | { ok: false; reason: string },
  ): GameState => {
    if (!result.ok) throw new Error(`refused: ${result.reason}`);
    return result.state;
  };

  it('lets a warden near a threat from behind clear it before it reaches the creature', () => {
    // Day d: captors appear on the window's edge straight behind; the warden stands just behind the footprint.
    let state = withThreat(fieldGame(['warden'], STRAIGHT), 'captors', hex(0, 6), 3, 'c');
    state = placeCharacter(state, 'warden', hex(0, 2));
    expect(threatOutlook(toPlayerView(state))[0]?.arrives).toBe('later');
    // The guardian walks one hex toward it and waits; the captors close in next to them (and do not strike them).
    state = ok(moveAlong(state, 'warden', [hex(0, 3)]));
    let next = nextDayWithEvents(state);
    expect(next.state.threats[0]?.hex).toEqual(hex(0, 4));
    expect(ofKind(next.events, 'struck')).toEqual([]);
    state = next.state;
    // Day d + 1: two strikes clear it.
    state = ok(act(state, 'warden', { kind: 'strike', threat: 'c' }));
    state = ok(act(state, 'warden', { kind: 'strike', threat: 'c' }));
    expect(state.threats).toEqual([]);
    for (let i = 0; i < 3; i++) {
      next = nextDayWithEvents(state);
      expect(ofKind(next.events, 'threat-strikes')).toEqual([]);
      state = next.state;
    }
    expect(state.peril).toBe(0);
  });

  it('strikes the creature on the fourth tick when no one meets it', () => {
    let state = withThreat(fieldGame(['rider'], STRAIGHT), 'captors', hex(0, 6), 3, 'c');
    const struckOn: number[] = [];
    for (let i = 1; i <= 4; i++) {
      const next = nextDayWithEvents(state);
      if (ofKind(next.events, 'threat-strikes').length > 0) struckOn.push(i);
      state = next.state;
    }
    expect(struckOn).toEqual([4]);
  });
});

describe('walking into a hazard', () => {
  const SLIDE = hex(4, -2);
  const setup = (roles: string[]) => {
    let state = withThreat(lingering(fieldGame(roles)), 'rockslide', SLIDE, 3);
    state = placeCharacter(state, roles[0]!, hex(3, -2));
    return state;
  };

  it('ends the day at once, then the tick strikes whoever stands there', () => {
    const state = setup(['scout']);
    const result = moveAlong(state, 'scout', [SLIDE]);
    if (!result.ok) throw new Error(result.reason);
    expect(result.stopped).toEqual({ step: 0, reason: 'trap' });
    expect(result.state.characters[0]?.actionsLeft).toBe(0);
    const next = nextDayWithEvents(result.state);
    expect(ofKind(next.events, 'struck').map((e) => e.characterId)).toEqual(['scout']);
    expect(next.state.characters[0]?.actionsLeft).toBe(1);
  });

  it('does not stop a walk beside it, nor a warden', () => {
    const beside = moveAlong(setup(['scout']), 'scout', [hex(3, -1)]);
    if (!beside.ok) throw new Error(beside.reason);
    expect(beside.stopped).toBeNull();
    const warden = moveAlong(setup(['warden']), 'warden', [SLIDE]);
    if (!warden.ok) throw new Error(warden.reason);
    expect(warden.stopped).toBeNull();
  });
});
