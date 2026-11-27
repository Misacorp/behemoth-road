import { describe, expect, it } from 'vitest';
import {
  act,
  type Action,
  checkAction,
  actionsHere,
  type GameEvent,
  type GameState,
  forecastDays,
  glintsFor,
  hex,
  isEscorted,
  nextDay,
  nextDayWithEvents,
  packCapacityOf,
  MATERIALS,
  SKILL_NODES,
  stimulusPush,
  threatNextPath,
} from '../src/index.ts';
import { exploreHex, keyToHex } from '../src/features.ts';
import { hexKey, neighbours } from '../src/hex.ts';
import {
  chainGame,
  fieldGame,
  findSeed,
  lingering,
  placeCharacter,
  withCharacter,
  withFeature,
  withSettlement,
  withThreat,
} from './helpers.ts';

const P = hex(3, -1);

const me = (state: GameState, id: string) => state.characters.find((c) => c.id === id)!;
const take = (state: GameState, id: string, ...taken: string[]): GameState =>
  withCharacter(state, { ...me(state, id), skills: { xp: 0, taken } });
const ok = (state: GameState, id: string, action: Action) => {
  const result = act(state, id, action);
  if (!result.ok) throw new Error(result.reason);
  return result;
};
const ofKind = <K extends GameEvent['kind']>(events: readonly GameEvent[], kind: K) =>
  events.filter((e): e is Extract<GameEvent, { kind: K }> => e.kind === kind);

describe('tier 2 and 3 nodes', () => {
  it('are all active, in tier order, each with an effect a rule reads', () => {
    for (const n of SKILL_NODES) {
      expect(n.active).toBe(true);
      expect(n.effect.kind).not.toBe('veiled');
    }
  });
});

describe('scout', () => {
  it('A2 long survey: a survey reaches hexes two away, at the same cost', () => {
    const base = placeCharacter(chainGame(['scout']), 'scout', P);
    const far: Action = { kind: 'survey', hex: hex(5, -1) };
    expect(checkAction(base, 'scout', far)).toMatchObject({ ok: false, reason: 'not-adjacent' });
    const long = take(base, 'scout', 'scout-a1', 'scout-a2');
    expect(checkAction(long, 'scout', far)).toMatchObject({ ok: true, cost: 1 });
    expect(checkAction(long, 'scout', { kind: 'survey', hex: hex(6, -1) })).toMatchObject({
      ok: false,
      reason: 'not-adjacent',
    });
    expect(ok(long, 'scout', far).state.tiles['5,-1']?.explored).toBe(true);
    // The list of options offers them too.
    const offered = actionsHere(long, 'scout').filter((a) => a.action.kind === 'survey');
    expect(offered.length).toBeGreaterThan(6);
  });

  it('A3 sweep: at each tick up to two hexes next to a scout are explored, for no XP', () => {
    const base = take(
      placeCharacter(chainGame(['scout']), 'scout', P),
      'scout',
      'scout-a1',
      'scout-a2',
      'scout-a3',
    );
    const before = Object.values(base.tiles).filter((t) => t.explored).length;
    const next = nextDayWithEvents(base);
    const explored = ofKind(next.events, 'explore');
    expect(explored).toHaveLength(2);
    for (const e of explored)
      expect(Math.abs(e.hex.q - P.q) + Math.abs(e.hex.r - P.r)).toBeLessThan(3);
    expect(Object.values(next.state.tiles).filter((t) => t.explored).length).toBe(before + 2);
    expect(me(next.state, 'scout').skills.xp).toBe(0);
    // Without the node nothing is explored.
    const plain = nextDayWithEvents(take(base, 'scout', 'scout-a1'));
    expect(ofKind(plain.events, 'explore')).toHaveLength(0);
  });

  it('A3 sweep runs after the creature steps: a scout at the window edge sees the new hexes', () => {
    const base = chainGame(['scout']);
    const old = new Set(Object.keys(base.tiles).filter((k) => base.tiles[k]?.visibility === 'seen'));
    const moved = nextDay(base);
    const fresh = Object.keys(moved.tiles).filter(
      (k) => moved.tiles[k]?.visibility === 'seen' && !old.has(k),
    );
    expect(fresh.length).toBeGreaterThan(0);
    // An old hex next to a new one, on the creature's leading edge.
    const edge = [...old]
      .map(keyToHex)
      .find((h) => neighbours(h).some((n) => fresh.includes(hexKey(n))))!;
    expect(edge).toBeDefined();
    let s = placeCharacter(base, 'scout', edge);
    // Everything else around them is already explored, so only the new hexes are left to sweep.
    for (const n of neighbours(edge)) if (!fresh.includes(hexKey(n))) s = exploreHex(s, n).state;
    s = take(s, 'scout', 'scout-a1', 'scout-a2', 'scout-a3');
    const next = nextDayWithEvents(s);
    const around = neighbours(edge).filter((n) => fresh.includes(hexKey(n)));
    expect(around.length).toBeGreaterThan(0);
    for (const n of around.slice(0, 2)) {
      expect(next.state.tiles[hexKey(n)]).toMatchObject({ visibility: 'seen', explored: true });
    }
    // The reveals come after the creature's step in the log.
    const kinds = next.events.map((e) => e.kind);
    expect(kinds.indexOf('explore')).toBeGreaterThan(kinds.indexOf('creature-step'));
    expect(me(next.state, 'scout').skills.xp).toBe(0);
    // The same tick twice gives the same result.
    expect(nextDayWithEvents(s)).toEqual(next);
  });

  it('B2 far sight: glints reach four hexes', () => {
    let s = placeCharacter(chainGame(['scout']), 'scout', P);
    s = withFeature(s, hex(5, -1), 'pitfall'); // 2 away
    s = withFeature(s, hex(4, -5), 'tomb'); // 4 away
    expect(glintsFor(take(s, 'scout', 'scout-b1'), 'scout')).toEqual([hex(5, -1)]);
    expect(glintsFor(take(s, 'scout', 'scout-b1', 'scout-b2'), 'scout')).toEqual([
      hex(4, -5),
      hex(5, -1),
    ]);
  });

  it('B3 forecast: threat trails show two ticks ahead, for everyone, while the scout is in', () => {
    const base = withThreat(chainGame(['scout', 'engineer']), 'raiders', hex(0, 5), 3);
    expect(forecastDays(base)).toBe(1);
    const seen = take(base, 'scout', 'scout-b1', 'scout-b2', 'scout-b3');
    expect(forecastDays(seen)).toBe(2);
    const one = threatNextPath(seen, 'xraiders');
    const two = threatNextPath(seen, 'xraiders', forecastDays(seen));
    expect(one.length).toBeGreaterThan(0);
    expect(two.length).toBeGreaterThan(one.length);
    expect(two.slice(0, one.length)).toEqual(one);
    // A lost scout no longer forecasts.
    expect(forecastDays(withCharacter(seen, { ...me(seen, 'scout'), status: 'lost' }))).toBe(1);
  });
});

describe('scholar', () => {
  it('A2 steady hands: +15% on every site', () => {
    const base = withFeature(placeCharacter(chainGame(['scholar']), 'scholar', P), P, 'tomb', true);
    const chance = (s: GameState) => {
      const c = checkAction(s, 'scholar', { kind: 'work-site' });
      return c.ok ? c.chance : c.reason;
    };
    expect(chance(base)).toBeCloseTo(0.7);
    expect(chance(take(base, 'scholar', 'scholar-a1', 'scholar-a2'))).toBeCloseTo(0.85);
  });

  const site = (seed: number, ...taken: string[]) =>
    take(
      withFeature(placeCharacter(chainGame(['scholar'], seed), 'scholar', P), P, 'tomb', true),
      'scholar',
      ...taken,
    );
  const opens = (seed: number, ...taken: string[]) => {
    const r = act(site(seed, ...taken), 'scholar', { kind: 'work-site' });
    return r.ok && r.events.some((e) => e.kind === 'find') ? r : null;
  };

  it('A3 second chamber: a site you open gives one more find, within the pack', () => {
    const seed = findSeed((s) => opens(s, 'scholar-a1', 'scholar-a2', 'scholar-a3') !== null);
    const r = opens(seed, 'scholar-a1', 'scholar-a2', 'scholar-a3')!;
    expect(ofKind(r.events, 'find')).toMatchObject([{ material: 'old-coin', amount: 2 }]);
    expect(me(r.state, 'scholar').pack).toEqual({ 'old-coin': 2 });
    // One slot left: only the base find fits.
    const tight = withCharacter(site(seed, 'scholar-a1', 'scholar-a2', 'scholar-a3'), {
      ...me(site(seed, 'scholar-a1', 'scholar-a2', 'scholar-a3'), 'scholar'),
      pack: { iron: 5 },
    });
    expect(ofKind(ok(tight, 'scholar', { kind: 'work-site' }).events, 'find')).toMatchObject([
      { amount: 1 },
    ]);
  });

  it('B2 relic sense: now and then one extra rare material with a find', () => {
    const picks = ['scholar-b1', 'scholar-b2'];
    let extra = 0;
    let plain = 0;
    for (let seed = 1; seed < 80; seed++) {
      const r = opens(seed, ...picks);
      if (r) {
        const finds = ofKind(r.events, 'find');
        // One find event, the bonus folded into it.
        expect(finds).toHaveLength(1);
        if (finds[0]?.extra) {
          extra++;
          expect(finds[0].extra).toMatchObject({ amount: 1 });
          expect(MATERIALS.find((m) => m.id === finds[0]?.extra?.material)?.tags).toContain('rare');
        } else plain++;
      }
      // The same seed without the node never has an extra.
      const base = opens(seed, 'scholar-b1');
      if (base) expect(ofKind(base.events, 'find')).toHaveLength(1);
    }
    expect(extra).toBeGreaterThan(0);
    expect(plain).toBeGreaterThan(extra);
  });

  it('B3 old maps: a find shows the nearest unexplored site within four, for everyone', () => {
    const seed = findSeed((s) => opens(s, 'scholar-b1', 'scholar-b2', 'scholar-b3') !== null);
    let s = site(seed, 'scholar-b1', 'scholar-b2', 'scholar-b3');
    s = withFeature(s, hex(5, -1), 'iron-deposit'); // a node, 2 away: not a site
    s = withFeature(s, hex(4, -2), 'pitfall'); // a trap, 1 away: never shown
    s = withFeature(s, hex(4, -1), 'timber-stand'); // a node, 1 away: never shown
    s = withFeature(s, hex(4, -5), 'deep-tomb'); // 4 away
    s = withFeature(s, hex(5, -3), 'tomb'); // 2 away: nearer
    s = withFeature(s, hex(3, -6), 'tomb'); // too far
    const r = ok(s, 'scholar', { kind: 'work-site' });
    expect(ofKind(r.events, 'reveal').map((e) => e.hex)).toEqual([hex(5, -3)]);
    expect(r.state.features['5,-3']?.revealed).toBe(true);
    expect(r.state.features['4,-5']?.revealed).toBe(false);
    expect(r.state.features['5,-1']?.revealed).toBe(false);
    expect(r.state.features['4,-2']?.revealed).toBe(false);
    expect(r.state.features['4,-1']?.revealed).toBe(false);
    expect(r.state.tiles['5,-3']?.explored).toBe(true);
  });
});

describe('keeper', () => {
  const fed = (taken: string[], peril = 3) => {
    let s = chainGame(['keeper']);
    s = { ...s, stores: { forage: 3 }, peril };
    return take(s, 'keeper', ...taken);
  };

  it('A2 soothing herbs: the first feeding of a day also lowers peril by 1', () => {
    const herbs = ['keeper-a1', 'keeper-a2'];
    const first = ok(fed(herbs), 'keeper', { kind: 'feed' });
    expect(first.state.peril).toBe(2);
    expect(ofKind(first.events, 'peril')).toEqual([
      { kind: 'peril', from: 3, to: 2, sources: [{ source: 'calm', amount: -1 }] },
    ]);
    // Once a day: the second feeding eases nothing, and a new day does again.
    const second = ok(first.state, 'keeper', { kind: 'feed' });
    expect(second.state.peril).toBe(2);
    const next = { ...nextDay(second.state), peril: 3 };
    expect(ok(next, 'keeper', { kind: 'feed' }).state.peril).toBe(2);
    // Not without the node, and never below nothing.
    expect(ok(fed(['keeper-a1']), 'keeper', { kind: 'feed' }).state.peril).toBe(3);
    expect(ok(fed(herbs, 0), 'keeper', { kind: 'feed' }).state.peril).toBe(0);
  });

  it('A3 contented: hunger drains every second day while the keeper is in', () => {
    const run = (taken: string[]) => {
      let s = fed(taken, 0);
      const start = s.care.satiety;
      s = nextDay(nextDay(s));
      return start - s.care.satiety;
    };
    expect(run([])).toBe(2);
    expect(run(['keeper-a1', 'keeper-a2', 'keeper-a3'])).toBe(1);
    // A lost keeper no longer slows it.
    let s = fed(['keeper-a1', 'keeper-a2', 'keeper-a3'], 0);
    s = withCharacter(s, { ...me(s, 'keeper'), status: 'lost' });
    const start = s.care.satiety;
    expect(start - nextDay(nextDay(s)).care.satiety).toBe(2);
  });

  it('B2 long rest: lingering is allowed the day after a linger', () => {
    const base = {
      ...chainGame(['keeper']),
      creature: { ...chainGame(['keeper']).creature, lingeredDay: 0 },
    };
    expect(base.day).toBe(1);
    const linger: Action = { kind: 'linger' };
    expect(checkAction(take(base, 'keeper', 'keeper-b1'), 'keeper', linger)).toMatchObject({
      ok: false,
      reason: 'lingered-yesterday',
    });
    expect(
      checkAction(take(base, 'keeper', 'keeper-b1', 'keeper-b2'), 'keeper', linger),
    ).toMatchObject({ ok: true });
  });

  it('B2 long rest is capped at lingerChainMax days in a row', () => {
    const base = chainGame(['keeper']);
    const at = (streak: number) =>
      take(
        { ...base, creature: { ...base.creature, lingeredDay: 0, lingerStreak: streak } },
        'keeper',
        'keeper-b1',
        'keeper-b2',
      );
    const linger: Action = { kind: 'linger' };
    expect(checkAction(at(1), 'keeper', linger)).toMatchObject({ ok: true });
    expect(checkAction(at(base.config.lingerChainMax), 'keeper', linger)).toMatchObject({
      ok: false,
      reason: 'lingered-yesterday',
    });
    // The tick counts the streak: two lingers in a row reach the cap.
    const t = nextDay(ok({ ...base }, 'keeper', linger).state);
    expect(t.creature.lingerStreak).toBe(1);
    const second = nextDay(ok(take(t, 'keeper', 'keeper-b1', 'keeper-b2'), 'keeper', linger).state);
    expect(second.creature.lingerStreak).toBe(2);
    expect(
      checkAction(take(second, 'keeper', 'keeper-b1', 'keeper-b2'), 'keeper', linger),
    ).toMatchObject({ ok: false, reason: 'lingered-yesterday' });
  });

  it('B3 beacon: fires you light reach 5 hexes and push twice as hard', () => {
    let s = placeCharacter(chainGame(['keeper']), 'keeper', hex(-4, 2));
    // Deadfalls to burn: each is a one-night fire.
    s = withFeature(withFeature(s, hex(-4, 2), 'deadfall', true), hex(-2, 0), 'deadfall', true);
    s = {
      ...s,
      nature: { ...s.nature, reactions: { fire: 'attracted' } },
      care: { ...s.care, satiety: 12 },
      stores: {},
    };
    s = withCharacter(s, { ...me(s, 'keeper'), pack: { timber: 1 } });
    const lit = (taken: string[]) =>
      ok(take(s, 'keeper', ...taken), 'keeper', { kind: 'light-fire' }).state;
    const plain = lit([]);
    expect(plain.stimuli[0]).toEqual({ type: 'fire', hex: hex(-4, 2), litDay: 1 });
    // 4 away: out of the usual range of 3.
    expect(stimulusPush(plain)).toBe(0);
    const beacon = lit(['keeper-b1', 'keeper-b2', 'keeper-b3']);
    expect(beacon.stimuli[0]).toMatchObject({ range: 5, push: 2 });
    expect(Math.abs(stimulusPush(beacon))).toBe(2);
    // Near, the beacon is twice the push of a plain fire.
    let near = placeCharacter(s, 'keeper', hex(-2, 0));
    near = ok(take(near, 'keeper', 'keeper-b1', 'keeper-b2', 'keeper-b3'), 'keeper', {
      kind: 'light-fire',
    }).state;
    const ordinary = ok(placeCharacter(s, 'keeper', hex(-2, 0)), 'keeper', {
      kind: 'light-fire',
    }).state;
    expect(Math.abs(stimulusPush(near))).toBe(2 * Math.abs(stimulusPush(ordinary)));
  });
});

describe('engineer', () => {
  it('A2 pack mule: the pack holds 10', () => {
    const base = chainGame(['engineer']);
    expect(packCapacityOf(base, me(base, 'engineer'))).toBe(6);
    const mule = take(base, 'engineer', 'engineer-a1', 'engineer-a2');
    expect(packCapacityOf(mule, me(mule, 'engineer'))).toBe(10);
    // Gathers until the larger pack is full.
    let s = withFeature(placeCharacter(mule, 'engineer', P), P, 'timber-stand', true);
    s = withCharacter(s, { ...me(s, 'engineer'), pack: { iron: 8 } });
    expect(ok(s, 'engineer', { kind: 'gather' }).events).toMatchObject([{ amount: 2 }]);
    s = withCharacter(s, { ...me(s, 'engineer'), pack: { iron: 10 } });
    expect(checkAction(s, 'engineer', { kind: 'gather' })).toMatchObject({
      ok: false,
      reason: 'pack-full',
    });
  });

  it('A3 monkey drone: a unit a day from a node beside the creature into the stores', () => {
    const picks = ['engineer-a1', 'engineer-a2', 'engineer-a3'];
    let s = withFeature(chainGame(['engineer']), hex(2, 0), 'timber-stand', true);
    s = placeCharacter(s, 'engineer', P);
    const next = nextDayWithEvents(take(s, 'engineer', ...picks));
    expect(next.state.stores).toEqual({ timber: 1 });
    expect(next.state.features['2,0']?.left).toBe((s.features['2,0']?.left ?? 0) - 1);
    expect(ofKind(next.events, 'gather')).toMatchObject([{ material: 'timber', amount: 1 }]);
    // Not without the node, and not for a node that is far away or hidden.
    expect(nextDay(take(s, 'engineer', 'engineer-a1')).stores).toEqual({});
    const far = withFeature(chainGame(['engineer']), hex(5, 0), 'timber-stand', true);
    expect(nextDay(take(far, 'engineer', ...picks)).stores).toEqual({});
    const hidden = withFeature(chainGame(['engineer']), hex(2, 0), 'timber-stand', false);
    expect(nextDay(take(hidden, 'engineer', ...picks)).stores).toEqual({});
  });

  it('B2 thrift: starting an unlock costs one less of its largest material', () => {
    const base = { ...chainGame(['engineer']), stores: { iron: 1, timber: 1 } };
    const hook: Action = { kind: 'build', unlock: 'grappling-hook' };
    expect(checkAction(base, 'engineer', hook)).toMatchObject({
      ok: false,
      reason: 'missing-materials',
    });
    const thrift = take(base, 'engineer', 'engineer-b1', 'engineer-b2');
    expect(checkAction(thrift, 'engineer', hook)).toMatchObject({
      ok: true,
      uses: [
        { material: 'iron', amount: 1 },
        { material: 'timber', amount: 1 },
      ],
    });
    expect(ok(thrift, 'engineer', hook).state.stores).toEqual({ iron: 0, timber: 0 });
    // A single unit is never made free.
    const lantern = { ...chainGame(['engineer']), stores: { stone: 1, timber: 1 } };
    expect(
      checkAction(take(lantern, 'engineer', 'engineer-b1', 'engineer-b2'), 'engineer', {
        kind: 'build',
        unlock: 'lantern',
      }),
    ).toMatchObject({ ok: true, uses: [{ amount: 1 }, { amount: 1 }] });
  });

  it('B3 self-winding: the unlock in progress gains 1 work at each tick, and can finish', () => {
    const base = take(
      { ...chainGame(['engineer']), project: { unlock: 'lantern', work: 1 } },
      'engineer',
      'engineer-b1',
      'engineer-b2',
      'engineer-b3',
    );
    const one = nextDayWithEvents(base);
    expect(one.state.project).toEqual({ unlock: 'lantern', work: 2 });
    expect(ofKind(one.events, 'unlock-progress')).toEqual([
      { kind: 'unlock-progress', unlock: 'lantern', work: 2, needed: 3 },
    ]);
    const two = nextDayWithEvents(one.state);
    expect(two.state.project).toBeNull();
    expect(two.state.unlocks).toContain('lantern');
    expect(ofKind(two.events, 'unlock-done')).toHaveLength(1);
    // Nothing without a project, or without the node.
    expect(nextDay(take(chainGame(['engineer']), 'engineer', 'engineer-b1')).project).toBeNull();
    const plain = { ...chainGame(['engineer']), project: { unlock: 'lantern', work: 1 } };
    expect(nextDay(plain).project).toEqual({ unlock: 'lantern', work: 1 });
  });
});

describe('warden', () => {
  it('A3 standing guard: a riding warden defends at the tick with no action', () => {
    const struck = (taken: string[]) => {
      const s = withThreat(lingering(fieldGame(['warden'])), 'captors', hex(0, 3), 3);
      return nextDayWithEvents(take(s, 'warden', ...taken));
    };
    const plain = struck([]);
    expect(ofKind(plain.events, 'threat-strikes')[0]?.damage).toBe(3);
    const guard = struck(['warden-a1', 'warden-a2', 'warden-a3']);
    // Bulwark takes 3 off: held in full.
    expect(ofKind(guard.events, 'threat-strikes')[0]?.damage).toBe(0);
    expect(ofKind(guard.events, 'defend')).toHaveLength(1);
    // It spends an action as a hand defend does: with none left there is no guard.
    const spent = struck(['warden-a1', 'warden-a2', 'warden-a3']);
    expect(ofKind(spent.events, 'defend')).toHaveLength(1);
    const tired = withThreat(lingering(fieldGame(['warden'])), 'captors', hex(0, 3), 3);
    const none = take(tired, 'warden', 'warden-a1', 'warden-a2', 'warden-a3');
    const empty = withCharacter(none, { ...me(none, 'warden'), actionsLeft: 0 });
    const rested = nextDayWithEvents(empty);
    expect(ofKind(rested.events, 'defend')).toHaveLength(0);
    expect(ofKind(rested.events, 'threat-strikes')[0]?.damage).toBe(3);
    // Only riders; one who stands on a hex does not defend.
    const off = placeCharacter(
      take(
        withThreat(lingering(fieldGame(['warden'])), 'captors', hex(0, 3), 3),
        'warden',
        'warden-a1',
        'warden-a2',
        'warden-a3',
      ),
      'warden',
      hex(4, -2),
    );
    expect(ofKind(nextDayWithEvents(off).events, 'threat-strikes')[0]?.damage).toBe(3);
    // Never counted twice with a defend action.
    const both = ok(
      take(
        withThreat(lingering(fieldGame(['warden'])), 'captors', hex(0, 3), 3),
        'warden',
        'warden-a1',
        'warden-a2',
        'warden-a3',
      ),
      'warden',
      { kind: 'defend' },
    ).state;
    expect(nextDayWithEvents(both).state.peril).toBe(0);
    expect(ofKind(nextDayWithEvents(both).events, 'defend')).toHaveLength(0);
  });

  it('A2 silver tongue keeps its tier order', () => {
    const s = withSettlement(chainGame(['warden']), hex(3, 0));
    expect(
      act(take(s, 'warden', 'warden-b2'), 'warden', { kind: 'pick-skill', node: 'warden-a1' }).ok,
    ).toBe(false);
  });

  it('B2 long reach: a strike reaches a threat two hexes away, not three', () => {
    const near = (at: ReturnType<typeof hex>, taken: string[]) =>
      take(
        withThreat(placeCharacter(chainGame(['warden']), 'warden', P), 'swarm', at, 3),
        'warden',
        ...taken,
      );
    const strike: Action = { kind: 'strike', threat: 'xswarm' };
    const two = hex(5, -1);
    expect(checkAction(near(two, []), 'warden', strike)).toMatchObject({
      ok: false,
      reason: 'not-near',
    });
    expect(checkAction(near(two, ['warden-b1', 'warden-b2']), 'warden', strike)).toMatchObject({
      ok: true,
    });
    expect(
      checkAction(near(hex(6, -1), ['warden-b1', 'warden-b2']), 'warden', strike),
    ).toMatchObject({ ok: false, reason: 'not-near' });
  });

  it('B3 wide guard: the escort covers two hexes', () => {
    const at = (taken: string[]) =>
      take(placeCharacter(chainGame(['warden', 'scout']), 'warden', P), 'warden', ...taken);
    const two = hex(5, -1);
    expect(isEscorted(at([]), two)).toBe(false);
    expect(isEscorted(at(['warden-b1', 'warden-b2', 'warden-b3']), two)).toBe(true);
    expect(isEscorted(at(['warden-b1', 'warden-b2', 'warden-b3']), hex(6, -1))).toBe(false);
  });
});

describe('tick effects are deterministic', () => {
  it('gives the same result for the same seed and state', () => {
    let s = withFeature(chainGame(['scout', 'engineer']), hex(2, 0), 'timber-stand', true);
    s = placeCharacter(s, 'scout', P);
    s = take(s, 'scout', 'scout-a1', 'scout-a2', 'scout-a3');
    s = take(s, 'engineer', 'engineer-a1', 'engineer-a2', 'engineer-a3');
    expect(nextDayWithEvents(s)).toEqual(nextDayWithEvents(s));
  });
});

describe('monkey drone takes what it gives', () => {
  it('a node with one charge left gives one and is spent', () => {
    let s = withFeature(chainGame(['engineer']), hex(2, 0), 'timber-stand', true, 1);
    s = take(s, 'engineer', 'engineer-a1', 'engineer-a2', 'engineer-a3');
    const next = nextDay(s);
    expect(next.stores).toEqual({ timber: 1 });
    expect(next.features['2,0']?.left).toBe(0);
  });
});

describe('exploring helpers stay put', () => {
  it('a sweep never explores what is explored', () => {
    let s = placeCharacter(chainGame(['scout']), 'scout', P);
    for (const h of [hex(4, -1), hex(4, -2)]) s = exploreHex(s, h).state;
    s = take(s, 'scout', 'scout-a1', 'scout-a2', 'scout-a3');
    const next = nextDayWithEvents(s);
    for (const e of ofKind(next.events, 'explore')) {
      expect([hex(4, -1), hex(4, -2)]).not.toContainEqual(e.hex);
    }
  });
});
