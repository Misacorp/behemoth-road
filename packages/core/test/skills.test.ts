import { describe, expect, it } from 'vitest';
import {
  act,
  type Action,
  checkAction,
  createGame,
  defence,
  type GameState,
  glintsFor,
  hex,
  move,
  nextDay,
  nextDayWithEvents,
  ON_CREATURE,
  picksAvailable,
  pickRefusal,
  ROLES,
  SKILL_NODES,
  skillNode,
  type Skills,
  toPlayerView,
  WORK_TAGS,
  workRole,
} from '../src/index.ts';
import { exploreHex } from '../src/features.ts';
import {
  CALM,
  chainGame,
  placeCharacter,
  withCharacter,
  withFeature,
  withSettlement,
  withThreat,
} from './helpers.ts';

const P = hex(3, -1);
const N = hex(3, -2);

const skilled = (state: GameState, id: string, skills: Partial<Skills>): GameState => {
  const c = state.characters.find((x) => x.id === id)!;
  return withCharacter(state, { ...c, skills: { notches: {}, taken: [], ...skills } });
};

const take = (state: GameState, id: string, ...taken: string[]): GameState =>
  skilled(state, id, { taken });

const ok = (state: GameState, id: string, action: Action) => {
  const result = act(state, id, action);
  if (!result.ok) throw new Error(result.reason);
  return result;
};

const me = (state: GameState, id: string) => state.characters.find((c) => c.id === id)!;
const notches = (state: GameState, id: string) => me(state, id).skills.notches;

describe('skill content', () => {
  it('has two branches of three tiers for each of the six roles, with unique ids', () => {
    expect(new Set(SKILL_NODES.map((n) => n.id)).size).toBe(SKILL_NODES.length);
    for (const role of ROLES) {
      const nodes = SKILL_NODES.filter((n) => n.role === role.id);
      expect(nodes.map((n) => `${n.branch}${n.tier}`)).toEqual([
        'a1',
        'a2',
        'a3',
        'b1',
        'b2',
        'b3',
      ]);
    }
    expect(SKILL_NODES).toHaveLength(36);
  });

  it('names nodes <role>-<branch><tier> with the icon skill:<id>', () => {
    for (const n of SKILL_NODES) {
      expect(n.id).toBe(`${n.role}-${n.branch}${n.tier}`);
      expect(n.icon).toBe(`skill:${n.id}`);
    }
  });

  it('activates tier 1 only, and gives only tier 1 a working effect', () => {
    for (const n of SKILL_NODES) {
      expect(n.active).toBe(n.tier === 1);
      expect(n.effect.kind === 'veiled').toBe(n.tier !== 1);
    }
  });

  it('maps every kind of work to a role through role tags', () => {
    expect(workRole('survey', false)).toBe('scout');
    expect(workRole('gather', false)).toBe('engineer');
    expect(workRole('gather', true)).toBe('keeper');
    expect(workRole('build', false)).toBe('engineer');
    expect(workRole('work-site', false)).toBe('scholar');
    for (const k of ['feed', 'linger', 'light-fire']) expect(workRole(k, false)).toBe('keeper');
    for (const k of ['strike', 'defend']) expect(workRole(k, false)).toBe('guardian');
    for (const k of ['parley', 'offer', 'ask-boon']) expect(workRole(k, false)).toBe('envoy');
    expect(workRole('pick-skill', false)).toBeNull();
    expect(workRole('move', false)).toBeNull();
    for (const tag of Object.values(WORK_TAGS)) {
      expect(ROLES.some((r) => r.tags.includes(tag))).toBe(true);
    }
  });
});

describe('notches', () => {
  it('goes to the role that owns the work, whoever does it', () => {
    // A scout surveys (scout), gathers timber (engineer), works a tomb (scholar badly), strikes (guardian).
    let state = placeCharacter(chainGame(['scout']), 'scout', P);
    state = withFeature(state, P, 'timber-stand', true);
    state = ok(state, 'scout', { kind: 'survey', hex: N }).state;
    expect(notches(state, 'scout')).toEqual({ scout: 1 });
    state = ok(state, 'scout', { kind: 'gather' }).state;
    expect(notches(state, 'scout')).toEqual({ scout: 1, engineer: 1 });
  });

  it('counts food gathering for the keeper, a site for the scholar, a build for the engineer', () => {
    let state = placeCharacter(chainGame(['engineer']), 'engineer', P);
    state = withFeature(state, P, 'berry-bushes', true);
    state = ok(state, 'engineer', { kind: 'gather' }).state;
    expect(notches(state, 'engineer')).toEqual({ keeper: 1 });

    let site = placeCharacter(chainGame(['scout']), 'scout', P);
    site = withFeature(site, P, 'tomb', true);
    site = ok(site, 'scout', { kind: 'work-site' }).state;
    expect(notches(site, 'scout')).toEqual({ scholar: 1 });

    let build = chainGame(['engineer']);
    build = { ...build, stores: { stone: 1, timber: 1 } };
    build = ok(build, 'engineer', { kind: 'build', unlock: 'lantern' }).state;
    expect(notches(build, 'engineer')).toEqual({ engineer: 1 });
  });

  it('counts a failed site, feeding, lingering, striking, defending and parleying', () => {
    let state = chainGame(['keeper', 'guardian', 'envoy']);
    state = { ...state, stores: { forage: 2 } };
    state = ok(state, 'keeper', { kind: 'feed' }).state;
    state = ok(state, 'keeper', { kind: 'linger' }).state;
    expect(notches(state, 'keeper')).toEqual({ keeper: 2 });
    state = ok(state, 'guardian', { kind: 'defend' }).state;
    expect(notches(state, 'guardian')).toEqual({ guardian: 1 });
    state = placeCharacter(state, 'envoy', P);
    state = withSettlement(state, P);
    state = ok(state, 'envoy', { kind: 'parley' }).state;
    expect(notches(state, 'envoy')).toEqual({ envoy: 1 });
  });

  it('earns nothing for moving, a refused action, or picking a skill', () => {
    let state = placeCharacter(chainGame(['scout']), 'scout', P);
    state = move(state, 'scout', N).ok
      ? (move(state, 'scout', N) as { state: GameState }).state
      : state;
    expect(notches(state, 'scout')).toEqual({});
    expect(act(state, 'scout', { kind: 'gather' }).ok).toBe(false);
    expect(notches(state, 'scout')).toEqual({});
    state = skilled(state, 'scout', { notches: { scout: 10 } });
    state = ok(state, 'scout', { kind: 'pick-skill', node: 'scout-a1' }).state;
    expect(notches(state, 'scout')).toEqual({ scout: 10 });
  });

  it('gives everyone active a notch in their own role when the route steps reach a multiple of 10', () => {
    let state = chainGame(['scout', 'keeper', 'guardian']);
    state = { ...state, creature: { ...state.creature, steps: 9 } };
    state = withCharacter(state, { ...me(state, 'guardian'), status: 'lost' });
    const next = nextDay(state);
    expect(next.creature.steps).toBe(10);
    expect(notches(next, 'scout')).toEqual({ scout: 1 });
    expect(notches(next, 'keeper')).toEqual({ keeper: 1 });
    expect(notches(next, 'guardian')).toEqual({});
    // Not on other steps...
    expect(notches(nextDay(next), 'scout')).toEqual({ scout: 1 });
    // ...and a stay at step 10 adds no step, so no second notch.
    const staying = { ...next, creature: { ...next.creature, lingering: true } };
    expect(nextDay(staying).creature.steps).toBe(10);
    expect(notches(nextDay(staying), 'scout')).toEqual({ scout: 1 });
  });

  it('follows catchUpEverySteps from the config', () => {
    let state = createGame(1, { characterIds: ['a'], config: { ...CALM, catchUpEverySteps: 2 } });
    state = nextDay(state);
    expect(notches(state, 'a')).toEqual({});
    state = nextDay(state);
    expect(notches(state, 'a')).toEqual({ scout: 1 });
  });
});

describe('picking a skill', () => {
  const pick = (node: string): Action => ({ kind: 'pick-skill', node });
  const scout = (skills: Partial<Skills>) =>
    skilled(chainGame(['scout', 'guardian']), 'scout', skills);

  it('has a pick per notchesPerPick notches of the role, less the nodes taken in it', () => {
    const state = scout({ notches: { scout: 19, guardian: 10 } });
    const c = me(state, 'scout');
    expect(picksAvailable(state, c, 'scout')).toBe(1);
    expect(picksAvailable(state, c, 'guardian')).toBe(1);
    expect(picksAvailable(state, c, 'keeper')).toBe(0);
    const taken = ok(state, 'scout', pick('scout-a1')).state;
    expect(picksAvailable(taken, me(taken, 'scout'), 'scout')).toBe(0);
    expect(picksAvailable(taken, me(taken, 'scout'), 'guardian')).toBe(1);
    const dev = createGame(1, { characterIds: ['a'], config: { notchesPerPick: 4 } });
    expect(
      picksAvailable(dev, me(skilled(dev, 'a', { notches: { scout: 8 } }), 'a'), 'scout'),
    ).toBe(2);
  });

  it('costs no actions, and works with none left', () => {
    let state = scout({ notches: { scout: 10 } });
    state = withCharacter(state, { ...me(state, 'scout'), actionsLeft: 0 });
    expect(checkAction(state, 'scout', pick('scout-a1'))).toMatchObject({ ok: true, cost: 0 });
    const done = ok(state, 'scout', pick('scout-a1'));
    expect(me(done.state, 'scout').skills.taken).toEqual(['scout-a1']);
    expect(done.events).toEqual([{ kind: 'skill-picked', characterId: 'scout', node: 'scout-a1' }]);
  });

  it('refuses with a code for each reason', () => {
    const reason = (state: GameState, node: string) => {
      const r = act(state, 'scout', pick(node));
      return r.ok ? 'ok' : r.reason;
    };
    expect(reason(scout({ notches: { scout: 10 } }), 'nope')).toBe('unknown-skill');
    expect(reason(scout({ notches: { scout: 30 } }), 'scout-a2')).toBe('skill-veiled');
    expect(reason(scout({ notches: { scout: 9 } }), 'scout-a1')).toBe('no-pick');
    expect(reason(scout({ notches: { guardian: 10 } }), 'scout-a1')).toBe('no-pick');
    expect(reason(scout({ notches: { scout: 20 }, taken: ['scout-a1'] }), 'scout-a1')).toBe(
      'already-have',
    );
    expect(reason(scout({ notches: { scout: 20 }, taken: ['scout-a1'] }), 'scout-b1')).toBe(
      'branch-closed',
    );
    expect(reason(scout({ notches: { guardian: 10 } }), 'guardian-a1')).toBe('ok');
    expect(
      reason(scout({ notches: { guardian: 20 }, taken: ['guardian-b1'] }), 'guardian-a1'),
    ).toBe('branch-closed');
    const over = {
      ...scout({ notches: { scout: 10 } }),
      season: { status: 'over', outcome: 'safe', day: 3 },
    } as GameState;
    expect(reason(over, 'scout-a1')).toBe('season-over');
    const lost = withCharacter(scout({ notches: { scout: 10 } }), {
      ...me(scout({}), 'scout'),
      status: 'lost',
    });
    expect(reason(lost, 'scout-a1')).toBe('character-lost');
  });

  it('keeps tier order and limits another role to tier 1 (shown with tier 2 switched on for the test)', () => {
    const a2 = skillNode('scout-a2') as { active: boolean };
    const g2 = skillNode('guardian-a2') as { active: boolean };
    a2.active = true;
    g2.active = true;
    try {
      const rich = (skills: Partial<Skills>) =>
        me(scout({ notches: { scout: 40, guardian: 40 }, ...skills }), 'scout');
      const state = scout({ notches: { scout: 40, guardian: 40 } });
      expect(pickRefusal(state, rich({}), 'scout-a2')).toBe('skill-tier-order');
      expect(pickRefusal(state, rich({ taken: ['scout-a1'] }), 'scout-a2')).toBeNull();
      expect(pickRefusal(state, rich({ taken: ['scout-b1'] }), 'scout-a2')).toBe('branch-closed');
      expect(pickRefusal(state, rich({ taken: ['guardian-a1'] }), 'guardian-a2')).toBe(
        'skill-tier-limit',
      );
    } finally {
      a2.active = false;
      g2.active = false;
    }
  });

  it('is public on the view: notches and taken nodes', () => {
    const state = scout({ notches: { scout: 3 }, taken: ['scout-b1'] });
    const view = toPlayerView(state);
    expect(view.characters.find((c) => c.id === 'scout')?.skills).toEqual({
      notches: { scout: 3 },
      taken: ['scout-b1'],
    });
  });
});

describe('tier 1 effects', () => {
  it('scout A1 trap sense: a hidden trap is revealed and never springs', () => {
    const base = withFeature(placeCharacter(chainGame(['scout']), 'scout', P), N, 'pitfall');
    const caught = move(base, 'scout', N);
    expect(caught.ok && caught.trapped).toBe(true);
    const sensed = move(take(base, 'scout', 'scout-a1'), 'scout', N);
    expect(sensed.ok && sensed.trapped).toBe(false);
    if (!sensed.ok) throw new Error(sensed.reason);
    expect(sensed.events.map((e) => e.kind)).toEqual(['explore', 'reveal']);
    expect(sensed.state.features['3,-2']?.revealed).toBe(true);
    expect(me(sensed.state, 'scout').actionsLeft).toBe(2);
  });

  describe('scout B1 glints', () => {
    const grid = () => {
      let s = placeCharacter(chainGame(['scout', 'engineer']), 'scout', P);
      s = withFeature(s, hex(5, -1), 'pitfall'); // 2 away
      s = withFeature(s, hex(6, -1), 'iron-deposit'); // 3 away
      s = withFeature(s, hex(4, -1), 'tomb'); // 1 away, to be explored
      s = exploreHex(s, hex(4, -1)).state;
      return take(s, 'scout', 'scout-b1');
    };

    it('shows unexplored hexes within 2 that hold something, never what', () => {
      expect(glintsFor(grid(), 'scout')).toEqual([hex(5, -1)]);
    });

    it('is for this viewer only', () => {
      const s = grid();
      expect(glintsFor(s, 'engineer')).toEqual([]);
      expect(glintsFor(s, null)).toEqual([]);
      expect(glintsFor(placeCharacter(s, 'engineer', P), 'engineer')).toEqual([]);
      expect(JSON.stringify(toPlayerView(s))).not.toContain('glint');
    });

    it('needs the skill, and measures a rider from the creature', () => {
      let s = placeCharacter(chainGame(['scout']), 'scout', P);
      s = withFeature(s, hex(5, -1), 'pitfall');
      expect(glintsFor(s, 'scout')).toEqual([]);
      let riding = take(withFeature(chainGame(['scout']), hex(3, 0), 'tomb'), 'scout', 'scout-b1');
      riding = withCharacter(riding, { ...me(riding, 'scout'), at: ON_CREATURE });
      // 3 from the centre, so 2 from the footprint.
      expect(glintsFor(riding, 'scout')).toEqual([hex(3, 0)]);
    });
  });

  it('scholar A1 field kit: working a site costs 1, not 2', () => {
    const base = withFeature(placeCharacter(chainGame(['scholar']), 'scholar', P), P, 'tomb', true);
    expect(checkAction(base, 'scholar', { kind: 'work-site' })).toMatchObject({
      ok: true,
      cost: 2,
    });
    const kit = take(base, 'scholar', 'scholar-a1');
    expect(checkAction(kit, 'scholar', { kind: 'work-site' })).toMatchObject({ ok: true, cost: 1 });
    expect(me(ok(kit, 'scholar', { kind: 'work-site' }).state, 'scholar').actionsLeft).toBe(2);
  });

  it('scholar B1 lamplight: +20% on dark sites only, and only for those who can work them', () => {
    let base = withFeature(
      placeCharacter(chainGame(['scholar', 'scout']), 'scholar', P),
      P,
      'deep-tomb',
      true,
    );
    base = { ...base, unlocks: ['lantern'] };
    const lamp = take(base, 'scholar', 'scholar-b1');
    const chance = (s: GameState, id: string) => {
      const c = checkAction(s, id, { kind: 'work-site' });
      return c.ok ? c.chance : c.reason;
    };
    expect(chance(base, 'scholar')).toBeCloseTo(0.8);
    expect(chance(lamp, 'scholar')).toBeCloseTo(1);
    // A tomb that is not dark is unchanged.
    const plain = withFeature(
      placeCharacter(chainGame(['scholar']), 'scholar', P),
      P,
      'tomb',
      true,
    );
    expect(chance(take(plain, 'scholar', 'scholar-b1'), 'scholar')).toBeCloseTo(0.7);
    // A scout cannot work a deep tomb, lamplight or not.
    const scouting = take(placeCharacter(base, 'scout', P), 'scout', 'scholar-b1');
    expect(chance(scouting, 'scout')).toBe('cannot-work');
  });

  it('keeper A1 good forage: food gives 2, other materials still 1', () => {
    const forage = withFeature(
      placeCharacter(chainGame(['keeper']), 'keeper', P),
      P,
      'berry-bushes',
      true,
    );
    expect(ok(forage, 'keeper', { kind: 'gather' }).events).toMatchObject([{ amount: 1 }]);
    const good = take(forage, 'keeper', 'keeper-a1');
    const done = ok(good, 'keeper', { kind: 'gather' });
    expect(done.events).toMatchObject([{ kind: 'gather', material: 'forage', amount: 2 }]);
    expect(me(done.state, 'keeper').pack).toEqual({ forage: 2 });
    const timber = take(
      withFeature(placeCharacter(chainGame(['keeper']), 'keeper', P), P, 'timber-stand', true),
      'keeper',
      'keeper-a1',
    );
    expect(ok(timber, 'keeper', { kind: 'gather' }).events).toMatchObject([{ amount: 1 }]);
  });

  it('keeper B1 quiet linger: linger costs 1', () => {
    const base = chainGame(['keeper']);
    expect(checkAction(base, 'keeper', { kind: 'linger' })).toMatchObject({ ok: true, cost: 2 });
    expect(
      checkAction(take(base, 'keeper', 'keeper-b1'), 'keeper', { kind: 'linger' }),
    ).toMatchObject({
      ok: true,
      cost: 1,
    });
  });

  it('guardian A1 skywatch: +1 strike against flying threats only', () => {
    const near = (type: string) =>
      withThreat(placeCharacter(chainGame(['guardian']), 'guardian', P), type, N, 3);
    const strength = (s: GameState) => s.threats[0]?.strength;
    expect(
      strength(ok(near('swarm'), 'guardian', { kind: 'strike', threat: 'xswarm' }).state),
    ).toBe(1);
    const sky = (type: string) => take(near(type), 'guardian', 'guardian-a1');
    const cleared = ok(sky('swarm'), 'guardian', { kind: 'strike', threat: 'xswarm' });
    expect(cleared.events.map((e) => e.kind)).toEqual(['threat-hit', 'threat-cleared']);
    expect(
      strength(ok(sky('captors'), 'guardian', { kind: 'strike', threat: 'xcaptors' }).state),
    ).toBe(1);
  });

  it('guardian B1 bulwark: a defending guardian takes 3 off, not 2', () => {
    const base = chainGame(['guardian']);
    expect(defence(ok(base, 'guardian', { kind: 'defend' }).state)).toBe(2);
    expect(
      defence(ok(take(base, 'guardian', 'guardian-b1'), 'guardian', { kind: 'defend' }).state),
    ).toBe(3);
  });

  it('engineer A1 double yield: 2 units, within the pack', () => {
    const at = (pack: Record<string, number>) => {
      const s = withFeature(
        placeCharacter(chainGame(['engineer']), 'engineer', P),
        P,
        'timber-stand',
        true,
      );
      return take(withCharacter(s, { ...me(s, 'engineer'), pack }), 'engineer', 'engineer-a1');
    };
    expect(ok(at({}), 'engineer', { kind: 'gather' }).events).toMatchObject([{ amount: 2 }]);
    // One slot left: gathers the one that fits.
    const tight = ok(at({ iron: 5 }), 'engineer', { kind: 'gather' });
    expect(tight.events).toMatchObject([{ amount: 1 }]);
    expect(me(tight.state, 'engineer').pack).toEqual({ iron: 5, timber: 1 });
    // No room at all: refused as before.
    expect(checkAction(at({ iron: 6 }), 'engineer', { kind: 'gather' })).toMatchObject({
      ok: false,
      reason: 'pack-full',
    });
  });

  it('engineer B1 quick hands: each build action adds 2 work', () => {
    const base = { ...chainGame(['engineer']), stores: { stone: 1, timber: 1 } };
    const plain = ok(base, 'engineer', { kind: 'build', unlock: 'lantern' }).state;
    expect(plain.project).toEqual({ unlock: 'lantern', work: 1 });
    const quick = take(base, 'engineer', 'engineer-b1');
    const first = ok(quick, 'engineer', { kind: 'build', unlock: 'lantern' });
    expect(first.state.project).toEqual({ unlock: 'lantern', work: 2 });
    const second = ok(first.state, 'engineer', { kind: 'build', unlock: 'lantern' });
    expect(second.state.unlocks).toEqual(['lantern']);
    expect(second.state.project).toBeNull();
  });

  it('envoy A1 silver tongue: a parley gives 1 more favour', () => {
    const at = (role: string) => withSettlement(placeCharacter(chainGame([role]), role, P), P);
    const favour = (s: GameState, id: string) =>
      ok(s, id, { kind: 'parley' }).events.find((e) => e.kind === 'parley');
    expect(favour(at('envoy'), 'envoy')).toMatchObject({ favour: 2 });
    expect(favour(take(at('envoy'), 'envoy', 'envoy-a1'), 'envoy')).toMatchObject({ favour: 3 });
  });

  it('envoy B1 ravens: parley from up to 3 hexes away, nothing else', () => {
    const base = chainGame(['envoy']);
    const far = withSettlement(placeCharacter(base, 'envoy', hex(3, -1)), hex(6, -1));
    const parley: Action = { kind: 'parley' };
    expect(checkAction(far, 'envoy', parley)).toMatchObject({ ok: false, reason: 'no-settlement' });
    const ravens = take(far, 'envoy', 'envoy-b1');
    expect(checkAction(ravens, 'envoy', parley)).toMatchObject({ ok: true });
    expect(ok(ravens, 'envoy', parley).events).toMatchObject([{ kind: 'parley', id: 's1' }]);
    // 4 away is too far.
    const farther = withSettlement(placeCharacter(base, 'envoy', hex(3, -1)), hex(7, -1));
    expect(checkAction(take(farther, 'envoy', 'envoy-b1'), 'envoy', parley)).toMatchObject({
      ok: false,
      reason: 'no-settlement',
    });
    // Offers still need the character's own hex.
    const pocket = withCharacter(ravens, { ...me(ravens, 'envoy'), pack: { 'old-coin': 1 } });
    expect(checkAction(pocket, 'envoy', { kind: 'offer', material: 'old-coin' })).toMatchObject({
      ok: false,
      reason: 'no-settlement',
    });
    // A rider reaches from the creature's footprint.
    const riding = withSettlement(take(base, 'envoy', 'envoy-b1'), hex(3, 0));
    expect(checkAction(riding, 'envoy', parley)).toMatchObject({ ok: true });
  });
});

describe('the tick keeps skills', () => {
  it('leaves picks and notches alone', () => {
    const state = skilled(chainGame(['scout']), 'scout', {
      notches: { scout: 4 },
      taken: ['scout-a1'],
    });
    const { state: next } = nextDayWithEvents(state);
    expect(me(next, 'scout').skills).toEqual({ notches: { scout: 4 }, taken: ['scout-a1'] });
  });
});
