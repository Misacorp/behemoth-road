import { describe, expect, it } from 'vitest';
import {
  ACTION_XP,
  act,
  type Action,
  checkAction,
  createGame,
  DEFAULT_CONFIG,
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

const PER = DEFAULT_CONFIG.xpPerPick;
const P = hex(3, -1);
const N = hex(3, -2);

const skilled = (state: GameState, id: string, skills: Partial<Skills>): GameState => {
  const c = state.characters.find((x) => x.id === id)!;
  return withCharacter(state, { ...c, skills: { xp: 0, taken: [], ...skills } });
};

const take = (state: GameState, id: string, ...taken: string[]): GameState =>
  skilled(state, id, { taken });

const ok = (state: GameState, id: string, action: Action) => {
  const result = act(state, id, action);
  if (!result.ok) throw new Error(result.reason);
  return result;
};

const me = (state: GameState, id: string) => state.characters.find((c) => c.id === id)!;
const xp = (state: GameState, id: string) => me(state, id).skills.xp;

describe('skill content', () => {
  it('has two branches of three tiers for each of the five roles, with unique ids', () => {
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
    expect(SKILL_NODES).toHaveLength(30);
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

  it('lists the contributing actions in ACTION_XP and never moving or picking', () => {
    for (const k of [
      'survey',
      'gather',
      'build',
      'work-site',
      'feed',
      'linger',
      'light-fire',
      'strike',
      'defend',
      'parley',
      'offer',
      'ask-boon',
    ]) {
      expect(ACTION_XP[k]).toBeGreaterThan(0);
    }
    expect(ACTION_XP['move']).toBeUndefined();
    expect(ACTION_XP['pick-skill']).toBeUndefined();
  });

  it('gives only the scout XP for exploring, as data on the role', () => {
    expect(ROLES.filter((r) => r.exploreXp > 0).map((r) => r.id)).toEqual(['scout']);
  });
});

describe('xp', () => {
  it('goes to the actor for any contributing act, whatever the role', () => {
    // Food gathering, a tomb and a build: one XP each, for engineer, keeper and scholar alike.
    let state = placeCharacter(chainGame(['engineer']), 'engineer', P);
    state = withFeature(state, P, 'berry-bushes', true);
    state = ok(state, 'engineer', { kind: 'gather' }).state;
    expect(xp(state, 'engineer')).toBe(1);

    let site = placeCharacter(chainGame(['keeper']), 'keeper', P);
    site = withFeature(site, P, 'tomb', true);
    site = ok(site, 'keeper', { kind: 'work-site' }).state;
    expect(xp(site, 'keeper')).toBe(1);

    let build = chainGame(['engineer']);
    build = { ...build, stores: { stone: 1, timber: 1 } };
    build = ok(build, 'engineer', { kind: 'build', unlock: 'lantern' }).state;
    expect(xp(build, 'engineer')).toBe(1);
  });

  it('counts feeding, lingering, defending and parleying', () => {
    let state = chainGame(['keeper', 'warden']);
    state = { ...state, stores: { forage: 2 } };
    state = ok(state, 'keeper', { kind: 'feed' }).state;
    state = ok(state, 'keeper', { kind: 'linger' }).state;
    expect(xp(state, 'keeper')).toBe(2);
    state = ok(state, 'warden', { kind: 'defend' }).state;
    expect(xp(state, 'warden')).toBe(1);
    state = placeCharacter(state, 'warden', P);
    state = withSettlement(state, P);
    state = ok(state, 'warden', { kind: 'parley' }).state;
    expect(xp(state, 'warden')).toBe(2);
  });

  it('gives a scout XP for each newly explored hex, by surveying or by walking, and others none for walking', () => {
    let state = placeCharacter(chainGame(['scout']), 'scout', P);
    // A survey: 1 for the act, 1 for the new hex.
    state = ok(state, 'scout', { kind: 'survey', hex: N }).state;
    expect(xp(state, 'scout')).toBe(2);
    // Walking into an unexplored hex: 1 for the hex, none for the move.
    const walked = move(state, 'scout', hex(4, -2));
    expect(walked.ok).toBe(true);
    if (walked.ok) expect(xp(walked.state, 'scout')).toBe(3);
    // An engineer walking the same way earns nothing.
    const eng = move(placeCharacter(chainGame(['engineer']), 'engineer', P), 'engineer', N);
    expect(eng.ok).toBe(true);
    if (eng.ok) expect(xp(eng.state, 'engineer')).toBe(0);
  });

  it('earns nothing for moving onto explored ground, a refused action, or picking a skill', () => {
    let state = placeCharacter(chainGame(['scout']), 'scout', P);
    expect(act(state, 'scout', { kind: 'gather' }).ok).toBe(false);
    expect(xp(state, 'scout')).toBe(0);
    state = skilled(state, 'scout', { xp: PER });
    state = ok(state, 'scout', { kind: 'pick-skill', node: 'scout-a1' }).state;
    expect(xp(state, 'scout')).toBe(PER);
  });

  it('gives everyone active catchUpXp when the route steps reach a multiple of 10', () => {
    let state = chainGame(['scout', 'keeper', 'warden']);
    state = { ...state, creature: { ...state.creature, steps: 9 } };
    state = withCharacter(state, { ...me(state, 'warden'), status: 'lost' });
    const next = nextDay(state);
    expect(next.creature.steps).toBe(10);
    expect(xp(next, 'scout')).toBe(1);
    expect(xp(next, 'keeper')).toBe(1);
    expect(xp(next, 'warden')).toBe(0);
    expect(xp(nextDay(next), 'scout')).toBe(1);
    // A stay at step 10 adds no step, so no second catch-up.
    const staying = { ...next, creature: { ...next.creature, lingering: true } };
    expect(nextDay(staying).creature.steps).toBe(10);
    expect(xp(nextDay(staying), 'scout')).toBe(1);
  });

  it('follows catchUpEverySteps from the config', () => {
    let state = createGame(1, { characterIds: ['a'], config: { ...CALM, catchUpEverySteps: 2 } });
    state = nextDay(state);
    expect(xp(state, 'a')).toBe(0);
    state = nextDay(state);
    expect(xp(state, 'a')).toBe(1);
  });
});

describe('picking a skill', () => {
  const pick = (node: string): Action => ({ kind: 'pick-skill', node });
  const scout = (skills: Partial<Skills>) =>
    skilled(chainGame(['scout', 'warden']), 'scout', skills);

  it('has a pick per xpPerPick XP, less the nodes taken', () => {
    const state = scout({ xp: PER * 2 - 1 });
    expect(picksAvailable(state, me(state, 'scout'))).toBe(1);
    const taken = ok(state, 'scout', pick('scout-a1')).state;
    expect(picksAvailable(taken, me(taken, 'scout'))).toBe(0);
    // The XP is one pool: it buys another role's tier 1 as well.
    const other = ok(scout({ xp: PER }), 'scout', pick('warden-a1')).state;
    expect(me(other, 'scout').skills.taken).toEqual(['warden-a1']);
    const dev = createGame(1, { characterIds: ['a'], config: { xpPerPick: 4 } });
    expect(picksAvailable(dev, me(skilled(dev, 'a', { xp: 8 }), 'a'))).toBe(2);
  });

  it('costs no actions, and works with none left', () => {
    let state = scout({ xp: PER });
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
    expect(reason(scout({ xp: PER }), 'nope')).toBe('unknown-skill');
    expect(reason(scout({ xp: PER * 3 }), 'scout-a2')).toBe('skill-veiled');
    expect(reason(scout({ xp: PER - 1 }), 'scout-a1')).toBe('no-pick');
    expect(reason(scout({ xp: PER * 2, taken: ['scout-a1'] }), 'scout-a1')).toBe('already-have');
    expect(reason(scout({ xp: PER * 2, taken: ['scout-a1'] }), 'scout-b1')).toBe('branch-closed');
    expect(reason(scout({ xp: PER }), 'warden-a1')).toBe('ok');
    expect(reason(scout({ xp: PER * 2, taken: ['warden-b1'] }), 'warden-a1')).toBe('branch-closed');
    const over = {
      ...scout({ xp: PER }),
      season: { status: 'over', outcome: 'safe', day: 3 },
    } as GameState;
    expect(reason(over, 'scout-a1')).toBe('season-over');
    const lost = withCharacter(scout({ xp: PER }), {
      ...me(scout({}), 'scout'),
      status: 'lost',
    });
    expect(reason(lost, 'scout-a1')).toBe('character-lost');
  });

  it('keeps tier order and limits another role to tier 1 (shown with tier 2 switched on for the test)', () => {
    const a2 = skillNode('scout-a2') as { active: boolean };
    const g2 = skillNode('warden-a2') as { active: boolean };
    a2.active = true;
    g2.active = true;
    try {
      const rich = (skills: Partial<Skills>) => me(scout({ xp: PER * 4, ...skills }), 'scout');
      const state = scout({ xp: PER * 4 });
      expect(pickRefusal(state, rich({}), 'scout-a2')).toBe('skill-tier-order');
      expect(pickRefusal(state, rich({ taken: ['scout-a1'] }), 'scout-a2')).toBeNull();
      expect(pickRefusal(state, rich({ taken: ['scout-b1'] }), 'scout-a2')).toBe('branch-closed');
      expect(pickRefusal(state, rich({ taken: ['warden-a1'] }), 'warden-a2')).toBe(
        'skill-tier-limit',
      );
    } finally {
      a2.active = false;
      g2.active = false;
    }
  });

  it('is public on the view: xp and taken nodes', () => {
    const state = scout({ xp: 3, taken: ['scout-b1'] });
    const view = toPlayerView(state);
    expect(view.characters.find((c) => c.id === 'scout')?.skills).toEqual({
      xp: 3,
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

  it('a strike-bonus effect: +1 strike against flying threats only (no node carries it now; tier 2 is lent it)', () => {
    const lent = skillNode('warden-a2') as { effect: unknown; active: boolean };
    const was = lent.effect;
    lent.effect = { kind: 'strike-bonus', tag: 'flying', bonus: 1 };
    lent.active = true;
    try {
      const near = (type: string) =>
        withThreat(placeCharacter(chainGame(['warden']), 'warden', P), type, N, 3);
      const strength = (s: GameState) => s.threats[0]?.strength;
      expect(
        strength(ok(near('swarm'), 'warden', { kind: 'strike', threat: 'xswarm' }).state),
      ).toBe(1);
      const sky = (type: string) => take(near(type), 'warden', 'warden-a2');
      const cleared = ok(sky('swarm'), 'warden', { kind: 'strike', threat: 'xswarm' });
      expect(cleared.events.map((e) => e.kind)).toEqual(['threat-hit', 'threat-cleared']);
      expect(
        strength(ok(sky('captors'), 'warden', { kind: 'strike', threat: 'xcaptors' }).state),
      ).toBe(1);
    } finally {
      lent.effect = was;
      lent.active = false;
    }
  });

  it('warden A1 bulwark: a defending warden takes 3 off, not 2', () => {
    const base = chainGame(['warden']);
    expect(defence(ok(base, 'warden', { kind: 'defend' }).state)).toBe(2);
    expect(defence(ok(take(base, 'warden', 'warden-a1'), 'warden', { kind: 'defend' }).state)).toBe(
      3,
    );
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

  it('a parley-favour effect: a parley gives 1 more favour (Silver tongue is tier 2, so it is lent the effect)', () => {
    const lent = skillNode('warden-a2') as { effect: unknown; active: boolean };
    const was = lent.effect;
    lent.effect = { kind: 'parley-favour', bonus: 1 };
    lent.active = true;
    try {
      const at = (role: string) => withSettlement(placeCharacter(chainGame([role]), role, P), P);
      const favour = (s: GameState, id: string) =>
        ok(s, id, { kind: 'parley' }).events.find((e) => e.kind === 'parley');
      expect(favour(at('warden'), 'warden')).toMatchObject({ favour: 2 });
      expect(favour(take(at('warden'), 'warden', 'warden-a2'), 'warden')).toMatchObject({
        favour: 3,
      });
    } finally {
      lent.effect = was;
      lent.active = false;
    }
  });

  it('warden B1 ravens: parley from up to 3 hexes away, nothing else', () => {
    const base = chainGame(['warden']);
    const far = withSettlement(placeCharacter(base, 'warden', hex(3, -1)), hex(6, -1));
    const parley: Action = { kind: 'parley' };
    expect(checkAction(far, 'warden', parley)).toMatchObject({
      ok: false,
      reason: 'no-settlement',
    });
    const ravens = take(far, 'warden', 'warden-b1');
    expect(checkAction(ravens, 'warden', parley)).toMatchObject({ ok: true });
    expect(ok(ravens, 'warden', parley).events).toMatchObject([{ kind: 'parley', id: 's1' }]);
    // 4 away is too far.
    const farther = withSettlement(placeCharacter(base, 'warden', hex(3, -1)), hex(7, -1));
    expect(checkAction(take(farther, 'warden', 'warden-b1'), 'warden', parley)).toMatchObject({
      ok: false,
      reason: 'no-settlement',
    });
    // Offers still need the character's own hex.
    const pocket = withCharacter(ravens, { ...me(ravens, 'warden'), pack: { 'old-coin': 1 } });
    expect(checkAction(pocket, 'warden', { kind: 'offer', material: 'old-coin' })).toMatchObject({
      ok: false,
      reason: 'no-settlement',
    });
    // A rider reaches from the creature's footprint.
    const riding = withSettlement(take(base, 'warden', 'warden-b1'), hex(3, 0));
    expect(checkAction(riding, 'warden', parley)).toMatchObject({ ok: true });
  });
});

describe('the tick keeps skills', () => {
  it('leaves picks and xp alone', () => {
    const state = skilled(chainGame(['scout']), 'scout', {
      xp: 4,
      taken: ['scout-a1'],
    });
    const { state: next } = nextDayWithEvents(state);
    expect(me(next, 'scout').skills).toEqual({ xp: 4, taken: ['scout-a1'] });
  });
});
