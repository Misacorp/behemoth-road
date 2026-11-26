import { describe, expect, it } from 'vitest';
import {
  act,
  type ActResult,
  actionsHere,
  checkAction,
  createGame,
  creatureSigns,
  type GameState,
  type Hex,
  hex,
  hexKey,
  LURE_TYPES,
  nextDayWithEvents,
  reactionToLure,
  stepWeights,
  TERRAIN_TYPES,
  toPlayerView,
} from '../src/index.ts';
import { fieldGame, placeCharacter, QUIET, withCharacter, withTerrain } from './helpers.ts';

/** A creature that walks straight north, with no hazards, threats or settlements. */
const STRAIGHT = {
  ...QUIET,
  routeLength: 100_000,
  veerWeights: { left: 0, right: 0 },
  perilMax: 1000,
  perilWoundedAt: 5,
  hazardFirst: 100_000,
  lureFirstWithin: 100_000,
  lureSpacing: 100_000,
};

const me = (s: GameState, id: string) => s.characters.find((c) => c.id === id)!;
const ok = (r: ActResult): GameState => {
  if (!r.ok) throw new Error(r.reason);
  return r.state;
};
const lureAt = (s: GameState, h: Hex, leadsLeft = 3, id = 'l1'): GameState => ({
  ...s,
  lures: [...s.lures, { id, type: 'capybara', hex: h, leadsLeft }],
});
const feels = (s: GameState, reaction: 'attracted' | 'repelled' | 'indifferent'): GameState => ({
  ...s,
  nature: { ...s.nature, reactions: reaction === 'indifferent' ? {} : { 'small-beast': reaction } },
});
const game = (roles: readonly string[] = ['keeper', 'rider']) => fieldGame(roles, STRAIGHT);
/** The same with the creature's usual weights, for the tests of how a lure bends them. */
const weighted = (roles: readonly string[] = ['keeper', 'rider']) =>
  fieldGame(roles, { ...STRAIGHT, veerWeights: { left: 1, straight: 2, right: 1 } });

/** The creature heads north: a lower q is its left. */
const LEFT = hex(-2, -1);
const RIGHT = hex(2, -2);

describe('the lure', () => {
  it('is a small beast, data with tags, a push and a range', () => {
    const capybara = LURE_TYPES.find((t) => t.id === 'capybara');
    expect(capybara?.tags).toEqual(expect.arrayContaining(['small-beast', 'lure']));
    expect(capybara?.push).toBeGreaterThan(0);
    expect(capybara?.range).toBeGreaterThan(0);
    expect(capybara?.notOn).toContain('water');
  });

  it('is never indifferent to the first creature, and which way it goes is hidden and varies', () => {
    const reactions = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const g = createGame(seed);
      const reaction = g.nature.reactions['small-beast'];
      expect(['attracted', 'repelled']).toContain(reaction);
      reactions.add(reaction as string);
      expect(JSON.stringify(toPlayerView(g))).not.toContain('small-beast');
    }
    expect(reactions.size).toBe(2);
  });
});

describe('placing lures along the route', () => {
  it('puts the first within a few hexes of the start, beside the line and never on water', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const g = createGame(seed);
      const lure = g.lures[0];
      expect(lure).toBeDefined();
      expect(lure?.leadsLeft).toBe(g.config.lureLeads);
      const h = lure?.hex as Hex;
      const tags = TERRAIN_TYPES.find((t) => t.id === g.tiles[hexKey(h)]?.terrain)?.tags ?? [];
      expect(tags).not.toContain('water');
      expect(Math.abs(h.q)).toBeLessThanOrEqual(4);
      expect(Math.abs(h.r)).toBeLessThanOrEqual(g.config.windowRadius);
    }
  });

  it('brings one about every lureSpacing hexes as the creature walks, never on water', () => {
    for (let seed = 1; seed <= 8; seed++) {
      let s = createGame(seed, {
        config: { ...STRAIGHT, lureFirstWithin: 4, lureSpacing: 7 },
      });
      for (let i = 0; i < 30; i++) {
        s = nextDayWithEvents(s).state;
        for (const l of s.lures) {
          const tags = TERRAIN_TYPES.find((t) => t.id === s.tiles[hexKey(l.hex)]?.terrain)?.tags;
          expect(tags).not.toContain('water');
        }
      }
      // Positions 4, 11, 18, 25 and 32 (laid five hexes ahead): about five by step 30.
      expect(s.lureCount).toBeGreaterThanOrEqual(4);
      expect(s.lureCount).toBeLessThanOrEqual(6);
    }
  });

  it('is a pure function of the seed', () => {
    expect(createGame(9).lures).toEqual(createGame(9).lures);
    expect(createGame(10).lures).not.toEqual(createGame(9).lures);
  });

  it('shows in the player view with its id, type, hex and leads left', () => {
    const g = createGame(3);
    expect(toPlayerView(g).lures).toEqual(g.lures);
    expect(Object.keys(g.lures[0] as object).sort()).toEqual(['hex', 'id', 'leadsLeft', 'type']);
  });
});

describe('a lure steers the creature like a fire', () => {
  it('pulls an attracted creature toward its side and pushes a repelled one away', () => {
    const near = lureAt(weighted(), LEFT);
    const toward = stepWeights(feels(near, 'attracted'));
    expect(toward.left).toBeGreaterThan(toward.straight);
    expect(toward.right).toBeLessThan(toward.straight);
    const away = stepWeights(feels(near, 'repelled'));
    expect(away.right).toBeGreaterThan(away.left);
    // The mirror: a lure on the right.
    const right = stepWeights(feels(lureAt(weighted(), RIGHT), 'attracted'));
    expect(right.right).toBeGreaterThan(right.left);
  });

  it('does nothing to an indifferent creature, out of range, or on the line ahead', () => {
    const base = stepWeights(feels(weighted(), 'indifferent'));
    expect(stepWeights(feels(lureAt(weighted(), LEFT), 'indifferent'))).toEqual(base);
    expect(stepWeights(feels(lureAt(weighted(), hex(-7, 1)), 'attracted'))).toEqual(base);
    expect(stepWeights(feels(lureAt(weighted(), hex(0, -3)), 'attracted'))).toEqual(base);
  });

  it('is read by the lure type push and range, not by id', () => {
    const type = LURE_TYPES[0];
    expect(type).toBeDefined();
    const s = feels(lureAt(weighted(), LEFT), 'attracted');
    const w = stepWeights(s);
    // The pull to the power of the type's push.
    expect(w.left / w.right).toBeCloseTo(s.config.stimulusPull ** (2 * (type?.push ?? 0)));
  });

  it('keeps acting once settled, with no leads left', () => {
    const settled = feels(lureAt(weighted(), LEFT, 0), 'attracted');
    expect(stepWeights(settled).left).toBeGreaterThan(stepWeights(settled).right);
  });

  it('shows the keeper (only) how the creature took it, after the tick', () => {
    for (const [reaction, gesture] of [
      ['attracted', 'toward'],
      ['repelled', 'away'],
    ] as const) {
      const s = nextDayWithEvents(feels(lureAt(weighted(), LEFT), reaction)).state;
      expect(creatureSigns(s, 'keeper').cues).toEqual([
        { hex: LEFT, stimulus: 'capybara', reaction: gesture },
      ]);
      expect(creatureSigns(s, 'rider').cues).toEqual([]);
    }
  });

  it('is felt by the creature type through the lure tag: the nature says how, per reaction key', () => {
    const s = lureAt(weighted(), LEFT);
    expect(reactionToLure(feels(s, 'repelled').nature, s.lures[0]!)).toBe('repelled');
    expect(reactionToLure(feels(s, 'indifferent').nature, s.lures[0]!)).toBe('indifferent');
  });
});

describe('leading a lure', () => {
  const near = (): GameState => {
    const s = lureAt(game(), hex(4, -2));
    return placeCharacter(s, 'keeper', hex(5, -2));
  };

  it('moves it one hex the way the character chooses, for leadCost actions, using up a lead', () => {
    const s = near();
    const before = me(s, 'keeper').actionsLeft;
    const r = act(s, 'keeper', { kind: 'lead', lure: 'l1', direction: 'n' });
    const led = ok(r);
    expect(led.lures[0]).toEqual({ id: 'l1', type: 'capybara', hex: hex(4, -3), leadsLeft: 2 });
    expect(me(led, 'keeper').actionsLeft).toBe(before - s.config.leadCost);
    expect(r.ok && r.events).toContainEqual({
      kind: 'lure-led',
      id: 'l1',
      characterId: 'keeper',
      from: hex(4, -2),
      to: hex(4, -3),
      leadsLeft: 2,
    });
    // The character stays where they are.
    expect(me(led, 'keeper').at).toEqual(me(s, 'keeper').at);
  });

  it('can name the target hex instead of a direction', () => {
    const led = ok(act(near(), 'keeper', { kind: 'lead', lure: 'l1', to: hex(3, -1) }));
    expect(led.lures[0]?.hex).toEqual(hex(3, -1));
  });

  it('works from the lure hex itself', () => {
    const s = placeCharacter(near(), 'keeper', hex(4, -2));
    expect(act(s, 'keeper', { kind: 'lead', lure: 'l1', direction: 's' }).ok).toBe(true);
  });

  it('settles after its last lead: it stays put, still steers, and cannot be led again', () => {
    const s = lureAt(placeCharacter(game(), 'keeper', hex(5, -2)), hex(4, -2), 1);
    const r = act(s, 'keeper', { kind: 'lead', lure: 'l1', direction: 's' });
    expect(r.ok && r.events.map((e) => e.kind)).toEqual(['lure-led', 'lure-settled']);
    const led = ok(r);
    expect(led.lures[0]?.leadsLeft).toBe(0);
    const again = act(led, 'keeper', { kind: 'lead', lure: 'l1', direction: 's' });
    expect(again).toMatchObject({ ok: false, reason: 'settled' });
    expect(checkAction(led, 'keeper', { kind: 'lead', lure: 'l1', direction: 's' })).toMatchObject({
      ok: false,
      reason: 'settled',
    });
  });

  it('is refused for these reasons', () => {
    const s = near();
    const lead = (state: GameState, action: Record<string, unknown> = {}) =>
      checkAction(state, 'keeper', {
        kind: 'lead',
        lure: 'l1',
        direction: 'n',
        ...action,
      } as never);
    expect(lead(placeCharacter(s, 'keeper', hex(1, 3)))).toMatchObject({
      ok: false,
      reason: 'not-near',
    });
    // Riding is not standing beside it.
    expect(
      lead({ ...s, characters: s.characters.map((c) => ({ ...c, at: { kind: 'creature' } })) }),
    ).toMatchObject({ ok: false, reason: 'not-near' });
    expect(lead(s, { lure: 'nope' })).toMatchObject({ ok: false, reason: 'no-lure' });
    expect(lead(withCharacter(s, { ...me(s, 'keeper'), actionsLeft: 0 }))).toMatchObject({
      ok: false,
      reason: 'not-enough-actions',
    });
    expect(lead(withCharacter(s, { ...me(s, 'keeper'), pinnedDay: s.day }))).toMatchObject({
      ok: false,
      reason: 'pinned',
    });
    // Blocked: water, a cliff, another lure, the creature's footprint, an unseen hex.
    expect(lead(withTerrain(s, hex(4, -3), 'shallows'))).toMatchObject({ reason: 'blocked' });
    expect(lead(withTerrain(s, hex(4, -3), 'lake'))).toMatchObject({ reason: 'blocked' });
    expect(lead(withTerrain(s, hex(4, -3), 'cliff'))).toMatchObject({ reason: 'blocked' });
    expect(lead(lureAt(s, hex(4, -3), 3, 'l2'))).toMatchObject({ reason: 'blocked' });
    expect(lead(lureAt(s, hex(4, -3), 3, 'l2'), { direction: 's' })).toMatchObject({ ok: true });
    const beside = lureAt(placeCharacter(game(), 'keeper', hex(3, -1)), hex(2, -1));
    expect(lead(beside, { direction: 'sw' })).toMatchObject({ reason: 'blocked' });
    const edge = lureAt(placeCharacter(game(), 'keeper', hex(7, -4)), hex(6, -3));
    expect(lead(edge, { direction: 'ne', lure: 'l1' })).toMatchObject({ reason: 'blocked' });
  });

  it('wants exactly one of a direction or a target, a neighbouring one', () => {
    const s = near();
    const check = (action: Record<string, unknown>) =>
      checkAction(s, 'keeper', { kind: 'lead', lure: 'l1', ...action } as never);
    expect(check({})).toMatchObject({ ok: false, reason: 'invalid-action' });
    expect(check({ direction: 'n', to: hex(4, -3) })).toMatchObject({ reason: 'invalid-action' });
    expect(check({ direction: 'up' })).toMatchObject({ reason: 'invalid-action' });
    expect(check({ to: hex(4, -4) })).toMatchObject({ reason: 'not-adjacent' });
    expect(check({ to: { q: 1.5, r: 0 } })).toMatchObject({ reason: 'invalid-hex' });
  });

  it('is listed among the actions a character beside a lure could take', () => {
    const s = near();
    const leads = actionsHere(toPlayerView(s), 'keeper').filter((a) => a.action.kind === 'lead');
    expect(leads).toHaveLength(6);
    expect(leads.some((a) => a.check.ok)).toBe(true);
    const far = placeCharacter(s, 'keeper', hex(1, 3));
    expect(actionsHere(far, 'keeper').filter((a) => a.action.kind === 'lead')).toEqual([]);
  });

  it('can steer the creature: led to the other side, an attracted creature turns the other way', () => {
    let s = feels(
      placeCharacter(lureAt(weighted(), hex(-2, -2)), 'keeper', hex(-3, -2)),
      'attracted',
    );
    expect(stepWeights(s).left).toBeGreaterThan(stepWeights(s).right);
    // Two leads east, across to the line (the keeper steps along to stay beside it).
    s = ok(act(s, 'keeper', { kind: 'lead', lure: 'l1', direction: 'se' }));
    s = placeCharacter(s, 'keeper', hex(-1, -1));
    s = ok(act(s, 'keeper', { kind: 'lead', lure: 'l1', direction: 'se' }));
    expect(s.lures[0]?.hex).toEqual(hex(0, -2));
    // On the line it pushes neither way (a lead is not enough on its own: one more takes it across).
    expect(stepWeights(s).left).toBe(stepWeights(s).right);
  });
});

describe('a lure and the creature', () => {
  it('flees when the creature reaches it: it is gone, with an event', () => {
    const s = lureAt(game(), hex(0, -2));
    const { state, events } = nextDayWithEvents(s);
    expect(state.lures).toEqual([]);
    expect(events).toContainEqual({ kind: 'lure-fled', id: 'l1', hex: hex(0, -2) });
  });

  it('is left behind quietly once it is out of the window', () => {
    const s = lureAt(game(), hex(0, 6));
    const { state, events } = nextDayWithEvents(s);
    expect(state.lures).toEqual([]);
    expect(events.some((e) => e.kind === 'lure-fled')).toBe(false);
  });

  it('stays while it is still in the window and clear of the footprint', () => {
    const s = lureAt(game(), hex(3, -2));
    expect(nextDayWithEvents(s).state.lures).toHaveLength(1);
  });
});
