import { describe, expect, it } from 'vitest';
import {
  act,
  actionsHere,
  brazierPlan,
  checkAction,
  createGame,
  type GameState,
  type Hex,
  hex,
  hexDistance,
  keyToHex,
  move,
  nextDayWithEvents,
  nightsLeft,
  threatOutlook,
  THREAT_TYPES,
  toPlayerView,
  fallChance,
  terrainAt,
  featureType,
  type ActResult,
} from '../src/index.ts';
import { settlementSpots } from '../src/settlements.ts';
import {
  fieldGame,
  lingering,
  placeCharacter,
  plain,
  QUIET,
  withCharacter,
  withFeature,
  withThreat,
} from './helpers.ts';

const ok = (r: ActResult): GameState => {
  if (!r.ok) throw new Error(r.reason);
  return r.state;
};
const me = (s: GameState, id: string) => s.characters.find((c) => c.id === id)!;
const giveTimber = (s: GameState, id: string): GameState =>
  withCharacter(s, { ...me(s, id), pack: { timber: 1 } });
const key = (h: Hex) => `${h.q},${h.r}`;

/** The creature feels nothing about fire: only the rules under test move anything. */
const calm = (s: GameState): GameState => ({ ...s, nature: { ...s.nature, reactions: {} } });

const BRAZIER = hex(3, -1);

/** A keeper standing at a brazier with timber, creature indifferent to fire. */
const atBrazier = (roles: readonly string[] = ['keeper']): GameState => {
  let s = calm(fieldGame(roles));
  s = withFeature(s, BRAZIER, 'brazier', true);
  s = placeCharacter(s, roles[0] as string, BRAZIER);
  return giveTimber(s, roles[0] as string);
};

describe('a stocked brazier', () => {
  const stocked = (): GameState => {
    const s = atBrazier();
    const bare = withCharacter(s, { ...me(s, 'keeper'), pack: {} });
    return {
      ...bare,
      features: {
        ...bare.features,
        [key(BRAZIER)]: { type: 'brazier', revealed: true, left: 1, stocked: true },
      },
    };
  };

  it('is generated stocked, and shown so in the player view', () => {
    const g = createGame(2);
    const first = g.brazierPlan[0] as Hex;
    expect(g.features[key(first)]?.stocked).toBe(true);
    expect(toPlayerView(g).features[key(first)]?.stocked).toBe(true);
    expect(featureType('brazier').stockedFuel).toBe(true);
  });

  it('is lit the first time with no wood, which clears the flag; a relight needs wood', () => {
    const s = stocked();
    expect(checkAction(s, 'keeper', { kind: 'light-fire' })).toEqual({
      ok: true,
      cost: 1,
      uses: [],
      chance: 1,
    });
    const lit = ok(act(s, 'keeper', { kind: 'light-fire' }));
    expect(me(lit, 'keeper').actionsLeft).toBe(2);
    expect(lit.features[key(BRAZIER)]?.stocked).toBeUndefined();
    expect(lit.stimuli[0]?.type).toBe('brazier-fire');
    let after = lit;
    for (let i = 0; i < 4; i++) after = nextDayWithEvents(after).state;
    expect(checkAction(after, 'keeper', { kind: 'light-fire' })).toMatchObject({
      ok: false,
      reason: 'no-fuel',
    });
    expect(checkAction(giveTimber(after, 'keeper'), 'keeper', { kind: 'light-fire' }).ok).toBe(
      true,
    );
  });

  it('no-fuel only when unstocked; actions are still needed', () => {
    const unstocked = withCharacter(atBrazier(), { ...me(atBrazier(), 'keeper'), pack: {} });
    expect(checkAction(unstocked, 'keeper', { kind: 'light-fire' })).toMatchObject({
      reason: 'no-fuel',
    });
    const s = stocked();
    const tired = withCharacter(s, { ...me(s, 'keeper'), actionsLeft: 0 });
    expect(checkAction(tired, 'keeper', { kind: 'light-fire' })).toMatchObject({
      reason: 'not-enough-actions',
    });
  });
});

describe('lighting a brazier', () => {
  it('burns for brazierNights ticks, then can be lit again', () => {
    const lit = ok(act(atBrazier(), 'keeper', { kind: 'light-fire' }));
    expect(lit.stimuli).toEqual([
      { type: 'brazier-fire', hex: BRAZIER, litDay: 1, range: 5, nights: 4, reveal: 2 },
    ]);
    // The brazier stays where it is; wood and one action are spent.
    expect(lit.features[key(BRAZIER)]?.type).toBe('brazier');
    expect(me(lit, 'keeper').pack).toEqual({});
    expect(me(lit, 'keeper').actionsLeft).toBe(2);
    expect(nightsLeft(lit, lit.stimuli[0]!)).toBe(4);

    let s = lit;
    const out: number[] = [];
    for (let i = 0; i < 4; i++) {
      const next = nextDayWithEvents(s);
      s = next.state;
      if (plain(next.events).some((e) => e.kind === 'fire-out')) out.push(s.day);
      // Two more ticks after the first: still burning until the third.
      expect(s.stimuli.length).toBe(i < 3 ? 1 : 0);
    }
    expect(out).toEqual([5]);
    // Burnt out: lit again (a new action day, new wood).
    s = giveTimber(s, 'keeper');
    expect(checkAction(s, 'keeper', { kind: 'light-fire' }).ok).toBe(true);
    const again = ok(act(s, 'keeper', { kind: 'light-fire' }));
    expect(again.stimuli[0]).toMatchObject({ litDay: 5, nights: 4 });
  });

  it('is refused while it burns', () => {
    const lit = ok(act(atBrazier(), 'keeper', { kind: 'light-fire' }));
    expect(checkAction(giveTimber(lit, 'keeper'), 'keeper', { kind: 'light-fire' })).toMatchObject({
      ok: false,
      reason: 'fire-here',
    });
  });

  it('is refused on plain ground, where there is nothing to burn', () => {
    const s = giveTimber(placeCharacter(calm(fieldGame(['keeper'])), 'keeper', BRAZIER), 'keeper');
    expect(checkAction(s, 'keeper', { kind: 'light-fire' })).toEqual({
      ok: false,
      reason: 'nothing-to-burn',
      cost: 1,
    });
    // A feature that does not burn is not enough either.
    const ore = withFeature(s, BRAZIER, 'iron-deposit', true);
    expect(checkAction(ore, 'keeper', { kind: 'light-fire' })).toMatchObject({
      reason: 'nothing-to-burn',
    });
  });

  it('shows the hexes within the reveal radius as explored, and no further', () => {
    let s = atBrazier();
    const near = hex(3, -3); // 2 from the brazier
    const far = hex(3, -4); // 3 from the brazier
    s = withFeature(withFeature(s, near, 'iron-deposit'), far, 'iron-deposit');
    expect(s.tiles[key(near)]?.explored).toBe(false);
    const r = act(s, 'keeper', { kind: 'light-fire' });
    const lit = ok(r);
    expect(lit.tiles[key(near)]?.explored).toBe(true);
    expect(lit.features[key(near)]?.revealed).toBe(true);
    expect(lit.tiles[key(far)]?.explored).toBe(false);
    expect(lit.features[key(far)]?.revealed).toBe(false);
    expect(
      r.ok && r.events.some((e) => e.kind === 'reveal' && hexDistance(e.hex, near) === 0),
    ).toBe(true);
    // Hexes that come under its light while it burns are shown at the tick too.
    const later = withFeature(lit, hex(4, -1), 'iron-deposit');
    expect(nextDayWithEvents(later).state.features[key(hex(4, -1))]?.revealed).toBe(true);
  });

  it('a Beacon widens the reach and push and adds a night, in the skill data', () => {
    let s = atBrazier();
    s = withCharacter(s, {
      ...me(s, 'keeper'),
      skills: { xp: 0, taken: ['keeper-b1', 'keeper-b2', 'keeper-b3'] },
    });
    const lit = ok(act(s, 'keeper', { kind: 'light-fire' }));
    expect(lit.stimuli[0]).toMatchObject({ range: 5, push: 2, nights: 5, reveal: 2 });
  });
});

describe('burnable features', () => {
  it.each(['deadfall', 'snare'])('a %s burns away for good as a one-night fire', (type) => {
    expect(featureType(type).tags).toContain('burnable');
    let s = giveTimber(placeCharacter(calm(fieldGame(['keeper'])), 'keeper', BRAZIER), 'keeper');
    s = withFeature(s, BRAZIER, type, true);
    const r = act(s, 'keeper', { kind: 'light-fire' });
    const lit = ok(r);
    expect(lit.features[key(BRAZIER)]).toBeUndefined();
    expect(lit.stimuli).toEqual([{ type: 'fire', hex: BRAZIER, litDay: 1 }]);
    expect(r.ok && r.events.map((e) => e.kind)).toEqual(['fire-lit', 'feature-burnt']);
    const next = nextDayWithEvents(lit);
    expect(next.state.stimuli).toEqual([]);
    expect(next.state.features[key(BRAZIER)]).toBeUndefined();
  });

  it.each(['deadfall', 'snare'])(
    'keeps what burnt, with its burnt look, public where seen',
    (type) => {
      let s = giveTimber(placeCharacter(calm(fieldGame(['keeper'])), 'keeper', BRAZIER), 'keeper');
      s = withFeature(s, BRAZIER, type, true);
      const lit = ok(act(s, 'keeper', { kind: 'light-fire' }));
      expect(lit.burnt).toEqual([{ hex: BRAZIER, feature: type }]);
      expect(featureType(type).burntLook).toBe(type);
      // It outlasts the fire, and the view carries it for a hex that is seen.
      const next = nextDayWithEvents(lit).state;
      expect(next.burnt).toEqual(lit.burnt);
      const tile = next.tiles[key(BRAZIER)]!;
      const withTile = (t: typeof tile): typeof next => ({
        ...next,
        tiles: { ...next.tiles, [key(BRAZIER)]: t },
      });
      expect(
        toPlayerView(withTile({ ...tile, visibility: 'seen', leftWindowOnDay: null })).burnt,
      ).toEqual(lit.burnt);
      const gone = withTile({ visibility: 'lost', terrain: tile.terrain, explored: true });
      expect(toPlayerView(gone).burnt).toEqual([]);
    },
  );
});

describe('threats that fear fire', () => {
  it('has the tag on the beasts and not on the people', () => {
    const feared = THREAT_TYPES.filter((t) => t.tags.includes('fears-fire')).map((t) => t.id);
    expect(feared.sort()).toEqual(['stampede', 'swarm']);
    expect(
      THREAT_TYPES.filter((t) => t.tags.includes('people')).every((t) => !feared.includes(t.id)),
    ).toBe(true);
  });

  const FIRE = hex(0, 2);
  const SPOT = hex(0, 4); // outside the ring; its next step (0, 3) is inside it
  const burning = (s: GameState): GameState => ({
    ...s,
    stimuli: [...s.stimuli, { type: 'fire', hex: FIRE, litDay: s.day }],
  });
  const stage = (type: string): GameState =>
    burning(withThreat(lingering(calm(fieldGame(['rider']))), type, SPOT, 2, 'x'));

  it('holds outside the ring instead of striking the creature; one that does not fear fire strikes', () => {
    const held = nextDayWithEvents(stage('swarm'));
    expect(held.state.threats.map((t) => t.hex)).toEqual([SPOT]);
    expect(held.state.peril).toBe(0);
    expect(plain(held.events).some((e) => e.kind === 'threat-strikes')).toBe(false);
    // No fire: it comes in and strikes.
    const free = nextDayWithEvents({ ...stage('swarm'), stimuli: [] });
    expect(plain(free.events).some((e) => e.kind === 'threat-strikes')).toBe(true);
    // The same fire, a threat without the tag (people): it strikes.
    const people = nextDayWithEvents(stage('captors'));
    expect(plain(people.events).some((e) => e.kind === 'threat-strikes')).toBe(true);
  });

  it('does not strike characters standing in the ring', () => {
    const s = placeCharacter(stage('swarm'), 'rider', hex(0, 3));
    const next = nextDayWithEvents(s);
    expect(plain(next.events).filter((e) => e.kind === 'struck')).toEqual([]);
    expect(me(next.state, 'rider').actionsLeft).toBe(3);
  });

  it('shows in the public outlook: it holds tomorrow while the fire burns, and no longer once it is out', () => {
    const held = threatOutlook(stage('swarm'))[0];
    expect(held?.next).toBeNull();
    expect(held?.arrives).not.toBe('tomorrow');
    expect(threatOutlook(stage('captors'))[0]).toMatchObject({ arrives: 'tomorrow' });
  });

  it('a fire that has burnt out no longer holds it', () => {
    const s = stage('swarm');
    const spent = { ...s, stimuli: [{ type: 'fire', hex: FIRE, litDay: s.day - 1 }] };
    expect(threatOutlook(spent)[0]?.next).not.toBeNull();
  });
});

describe('the rockslide falls on its striker', () => {
  const SLIDE = hex(4, -2);
  const NEXT = hex(3, -1);
  const falling = (chance: number, roles: readonly string[] = ['scout', 'warden']): GameState =>
    placeCharacter(
      withThreat(
        lingering(calm(fieldGame(roles, { ...QUIET, slideFallChance: chance }))),
        'rockslide',
        SLIDE,
        6,
        'slide',
      ),
      roles[0] as string,
      NEXT,
    );

  it('with a sure fall: the blow lands, then the striker is pinned and loses the day', () => {
    const r = act(falling(1), 'scout', { kind: 'strike', threat: 'slide' });
    const s = ok(r);
    expect(s.threats[0]?.strength).toBe(5);
    expect(me(s, 'scout')).toMatchObject({ actionsLeft: 0, pinnedDay: 1 });
    expect(r.ok && plain(r.events).map((e) => e.kind)).toEqual(['threat-hit', 'pinned']);
    expect(toPlayerView(s).characters.find((c) => c.id === 'scout')?.pinnedDay).toBe(1);
  });

  it('with no chance it never falls', () => {
    const s = ok(act(falling(0), 'scout', { kind: 'strike', threat: 'slide' }));
    expect(me(s, 'scout').pinnedDay).toBeUndefined();
    expect(me(s, 'scout').actionsLeft).toBe(2);
  });

  it('a threat without the falls tag never falls on its striker', () => {
    const s = withThreat(
      placeCharacter(fieldGame(['scout'], { ...QUIET, slideFallChance: 1 }), 'scout', NEXT),
      'captors',
      SLIDE,
      3,
      'c',
    );
    expect(
      me(ok(act(s, 'scout', { kind: 'strike', threat: 'c' })), 'scout').pinnedDay,
    ).toBeUndefined();
  });

  it('the engineer is half as likely, and with the upgraded node never', () => {
    const s = falling(0.4, ['engineer', 'scout']);
    const tags = ['terrain', 'stone', 'falls'];
    expect(fallChance(s, me(s, 'scout'), tags)).toBeCloseTo(0.4);
    expect(fallChance(s, me(s, 'engineer'), tags)).toBeCloseTo(0.2);
    const upgraded = withCharacter(s, {
      ...me(s, 'engineer'),
      skills: { xp: 0, taken: ['engineer-a1', 'engineer-a2'] },
    });
    expect(fallChance(upgraded, me(upgraded, 'engineer'), tags)).toBe(0);
    // Even when it would otherwise be certain.
    const sure = { ...upgraded, config: { ...upgraded.config, slideFallChance: 1 } };
    expect(fallChance(sure, me(sure, 'engineer'), tags)).toBe(0);
    const struck = ok(act(sure, 'engineer', { kind: 'strike', threat: 'slide' }));
    expect(me(struck, 'engineer').pinnedDay).toBeUndefined();
    expect(fallChance(s, me(s, 'scout'), ['flying'])).toBe(0);
  });

  it('the roll is seeded: the same state gives the same result', () => {
    const s = falling(0.5);
    const a = act(s, 'scout', { kind: 'strike', threat: 'slide' });
    expect(act(s, 'scout', { kind: 'strike', threat: 'slide' })).toEqual(a);
  });
});

describe('pinned characters', () => {
  const SLIDE = hex(4, -2);
  const pinned = (): GameState => {
    let s = fieldGame(['scout', 'keeper', 'warden'], { ...QUIET, slideFallChance: 1 });
    s = lingering(calm(withThreat(s, 'rockslide', SLIDE, 9, 'slide')));
    s = placeCharacter(s, 'scout', hex(3, -1));
    s = placeCharacter(s, 'keeper', hex(2, -1)); // next to the scout
    s = placeCharacter(s, 'warden', hex(-2, 2)); // far from the scout
    return ok(act(s, 'scout', { kind: 'strike', threat: 'slide' }));
  };

  it('cannot move or act, but can set a stance and pick', () => {
    const s = pinned();
    expect(move(s, 'scout', hex(3, -2))).toMatchObject({ ok: false, reason: 'pinned' });
    expect(checkAction(s, 'scout', { kind: 'strike', threat: 'slide' })).toEqual({
      ok: false,
      reason: 'pinned',
    });
    expect(checkAction(s, 'scout', { kind: 'set-stance', stance: 'rest' }).ok).toBe(true);
  });

  it('is dug out by a character on a neighbouring hex, for digOutCost actions', () => {
    const s = pinned();
    expect(actionsHere(s, 'keeper').some((a) => a.action.kind === 'dig-out')).toBe(true);
    const r = act(s, 'keeper', { kind: 'dig-out', target: 'scout' });
    const freed = ok(r);
    expect(me(freed, 'scout').pinnedDay).toBeUndefined();
    expect(me(freed, 'keeper').actionsLeft).toBe(2);
    expect(r.ok && plain(r.events)).toEqual([
      { kind: 'dug-out', characterId: 'scout', by: 'keeper' },
    ]);
  });

  it('is refused for someone far away, for a free character, and for the pinned themselves', () => {
    const s = pinned();
    expect(checkAction(s, 'warden', { kind: 'dig-out', target: 'scout' })).toMatchObject({
      ok: false,
      reason: 'not-near',
    });
    expect(checkAction(s, 'keeper', { kind: 'dig-out', target: 'warden' })).toMatchObject({
      reason: 'not-pinned',
    });
    expect(checkAction(s, 'scout', { kind: 'dig-out', target: 'scout' })).toMatchObject({
      reason: 'pinned',
    });
    expect(checkAction(s, 'keeper', { kind: 'dig-out', target: 'nobody' })).toMatchObject({
      reason: 'unknown-character',
    });
  });

  it('frees itself at the end of the next tick: the rest of today and all of tomorrow are lost', () => {
    let s = pinned();
    const first = nextDayWithEvents(s);
    s = lingering(first.state);
    expect(s.day).toBe(2);
    expect(me(s, 'scout')).toMatchObject({ pinnedDay: 1, actionsLeft: 0 });
    expect(plain(first.events).some((e) => e.kind === 'dug-out')).toBe(false);
    const second = nextDayWithEvents(s);
    expect(me(second.state, 'scout').pinnedDay).toBeUndefined();
    expect(me(second.state, 'scout').actionsLeft).toBe(3);
    expect(plain(second.events)).toContainEqual({
      kind: 'dug-out',
      characterId: 'scout',
      by: null,
    });
  });

  it('dug out the day after, they get that day back; dug out the same day, nothing is left of it', () => {
    const same = ok(act(pinned(), 'keeper', { kind: 'dig-out', target: 'scout' }));
    expect(me(same, 'scout').actionsLeft).toBe(0);
    const first = lingering(nextDayWithEvents(pinned()).state);
    expect(me(first, 'scout').actionsLeft).toBe(0);
    const freed = ok(act(first, 'keeper', { kind: 'dig-out', target: 'scout' }));
    expect(me(freed, 'scout')).toMatchObject({ actionsLeft: 3 });
    expect(me(freed, 'scout').pinnedDay).toBeUndefined();
  });

  it('offers dig-out only for active pinned characters within reach', () => {
    const s = pinned();
    const kinds = (id: string) => actionsHere(s, id).filter((a) => a.action.kind === 'dig-out');
    expect(kinds('keeper')).toHaveLength(1);
    expect(kinds('warden')).toHaveLength(0);
    const lost = withCharacter(s, { ...me(s, 'scout'), status: 'lost' });
    expect(actionsHere(lost, 'keeper').some((a) => a.action.kind === 'dig-out')).toBe(false);
  });

  it('a pinned character who is lost loses the pin and gets no dug-out event', () => {
    let s = lingering(pinned());
    s = { ...s, creature: { ...s.creature, lingering: false, heading: 's' } };
    s = placeCharacter(s, 'scout', hex(0, -20));
    s = {
      ...s,
      tiles: {
        ...s.tiles,
        '0,-20': {
          visibility: 'seen',
          terrain: 'plains',
          explored: false,
          leftWindowOnDay: s.day - 5,
        },
      },
    };
    const next = nextDayWithEvents(s);
    const scout = me(next.state, 'scout');
    expect(scout.status).toBe('lost');
    expect(scout.pinnedDay).toBeUndefined();
    expect(plain(next.events).some((e) => e.kind === 'dug-out')).toBe(false);
    expect(plain(next.events).some((e) => e.kind === 'lost')).toBe(true);
  });
});

describe('map generation places braziers along the route', () => {
  const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);

  it('puts the first within the first few hexes and keeps the spacing roughly', () => {
    for (const seed of SEEDS) {
      const g = createGame(seed);
      const plan = g.brazierPlan;
      expect(plan.length).toBeGreaterThan(4);
      const { brazierFirstWithin, brazierSpacing } = g.config;
      expect(hexDistance(g.creature.centre, plan[0] as Hex)).toBeLessThanOrEqual(
        brazierFirstWithin + 3,
      );
      // Distances from the start grow along the route, about `brazierSpacing` apart.
      const gaps = plan.slice(1).map((h, i) => hexDistance(plan[i] as Hex, h));
      const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      expect(mean).toBeGreaterThanOrEqual(brazierSpacing - 2);
      expect(mean).toBeLessThanOrEqual(brazierSpacing + 2);
      // Never on water, never on an unwalkable hex, never the same hex twice.
      expect(new Set(plan.map(key)).size).toBe(plan.length);
      for (const h of plan) {
        const t = terrainAt(g.seed, h);
        expect(t.tags).not.toContain('water');
        expect(t.passable).toBe(true);
      }
    }
  });

  it('is a pure function of the seed, the start and the heading', () => {
    const g = createGame(3);
    expect(brazierPlan(g.seed, g.creature.centre, g.creature.heading, g.config)).toEqual(
      g.brazierPlan,
    );
    expect(createGame(3).brazierPlan).toEqual(g.brazierPlan);
    expect(createGame(4).brazierPlan).not.toEqual(g.brazierPlan);
  });

  it('shows the first brazier from the start, and the others as their hexes come into view', () => {
    // No hazards or lures on the way: a long walk would end the season on peril, or turn the creature aside.
    const g = createGame(2, { config: { hazardFirst: 100_000, lureFirstWithin: 100_000 } });
    const first = g.brazierPlan[0] as Hex;
    expect(g.features[key(first)]).toMatchObject({ type: 'brazier', revealed: true });
    expect(toPlayerView(g).features[key(first)]?.type).toBe('brazier');
    // Walk the creature on: every brazier that comes into view is there and revealed.
    let s: GameState = { ...g, config: { ...g.config, threatsFromDay: 100_000 } };
    for (let i = 0; i < 25; i++) s = nextDayWithEvents(s).state;
    for (const h of g.brazierPlan) {
      const f = s.features[key(h)];
      if (f) expect(f).toMatchObject({ type: 'brazier', revealed: true });
    }
    expect(
      Object.keys(s.features).filter((k) => s.features[k]?.type === 'brazier').length,
    ).toBeGreaterThan(1);
  });
});

describe('braziers and the rest of the map', () => {
  it('a settlement never lands on a brazier hex', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const g = createGame(seed);
      for (const h of g.brazierPlan) {
        if (g.features[key(h)])
          expect(settlementSpots(g).some((x) => key(x) === key(h))).toBe(false);
      }
    }
  });

  it('a brazier shows its hexes through its last night', () => {
    let s = atBrazier();
    s = { ...s, config: { ...s.config, brazierNights: 1 } };
    s = ok(act(s, 'keeper', { kind: 'light-fire' }));
    const late = withFeature(s, hex(4, -1), 'iron-deposit');
    const next = nextDayWithEvents(late).state;
    expect(next.stimuli).toEqual([]);
    expect(next.features[key(hex(4, -1))]?.revealed).toBe(true);
  });
});

describe('what the player view holds', () => {
  it('carries lit braziers with their nights, pinned state and no plan', () => {
    const lit = ok(act(atBrazier(), 'keeper', { kind: 'light-fire' }));
    const view = toPlayerView(lit);
    expect(view.stimuli[0]).toMatchObject({ nights: 4, litDay: 1, hex: BRAZIER });
    expect(nightsLeft(view, view.stimuli[0]!)).toBe(4);
    expect(view.features[key(BRAZIER)]).toMatchObject({ type: 'brazier', revealed: true });
    expect('brazierPlan' in view).toBe(false);
    expect('seed' in view).toBe(false);
    // A hidden feature stays hidden.
    const hidden = withFeature(lit, hex(-3, 0), 'iron-deposit');
    expect(toPlayerView(hidden).features[key(hex(-3, 0))]).toBeUndefined();
    expect(keyToHex(key(BRAZIER))).toEqual(BRAZIER);
  });
});
