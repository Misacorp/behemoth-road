import { describe, expect, it } from 'vitest';
import {
  act,
  type Action,
  actionsHere,
  checkAction,
  entryInto,
  type GameState,
  hex,
  hexKey,
  isExplored,
  move,
  nextDay,
  ON_CREATURE,
  onHex,
  planPath,
  possibleActions,
  toPlayerView,
} from '../src/index.ts';
import { chainGame, placeCharacter, withCharacter, withFeature, withTerrain } from './helpers.ts';

const P = hex(3, -1);
const N = hex(3, -2);

const ok = (state: GameState, id: string, action: Action) => {
  const result = act(state, id, action);
  if (!result.ok) throw new Error(result.reason);
  return result;
};

const withStores = (state: GameState, stores: Record<string, number>): GameState => ({
  ...state,
  stores,
});

const withPack = (state: GameState, id: string, pack: Record<string, number>): GameState =>
  withCharacter(state, { ...state.characters.find((c) => c.id === id)!, pack });

const riding = (state: GameState, id: string): GameState =>
  withCharacter(state, { ...state.characters.find((c) => c.id === id)!, at: ON_CREATURE });

describe('survey', () => {
  it('explores an adjacent hex from outside: 1 action for a scout, 2 for others', () => {
    for (const [role, cost] of [
      ['scout', 1],
      ['engineer', 2],
    ] as const) {
      let state = placeCharacter(chainGame([role]), role, P);
      state = withFeature(state, N, 'iron-deposit');
      expect(checkAction(state, role, { kind: 'survey', hex: N })).toMatchObject({
        ok: true,
        cost,
      });
      const result = ok(state, role, { kind: 'survey', hex: N });
      expect(result.events).toEqual([
        { kind: 'survey', hex: N, characterId: role },
        { kind: 'explore', hex: N },
        { kind: 'reveal', hex: N, feature: 'iron-deposit' },
      ]);
      expect(isExplored(result.state, N)).toBe(true);
      expect(result.state.characters[0]).toMatchObject({ at: onHex(P), actionsLeft: 3 - cost });
    }
  });

  it('says when a surveyed hex holds nothing', () => {
    let state = placeCharacter(chainGame(['scout']), 'scout', P);
    const features = { ...state.features };
    delete features[`${N.q},${N.r}`];
    state = { ...state, features };
    expect(ok(state, 'scout', { kind: 'survey', hex: N }).events).toEqual([
      { kind: 'survey', hex: N, characterId: 'scout' },
      { kind: 'explore', hex: N },
      { kind: 'survey-empty', hex: N, characterId: 'scout' },
    ]);
  });

  it('makes a trap harmless: nobody springs it, then or later', () => {
    let state = placeCharacter(chainGame(['scout']), 'scout', P);
    state = withFeature(state, N, 'pitfall');
    const surveyed = ok(state, 'scout', { kind: 'survey', hex: N });
    expect(surveyed.events.some((e) => e.kind === 'trap')).toBe(false);
    const entered = move(surveyed.state, 'scout', N);
    expect(entered.ok && entered.trapped).toBe(false);
  });

  it('works from the creature onto a hex beside it', () => {
    const state = chainGame(['scout']);
    const edge = hex(2, -1);
    expect(checkAction(state, 'scout', { kind: 'survey', hex: edge })).toMatchObject({ ok: true });
  });

  it('refuses far, explored, footprint, hidden and malformed hexes', () => {
    let state = placeCharacter(chainGame(['scout']), 'scout', P);
    const check = (h: { q: number; r: number }) =>
      checkAction(state, 'scout', { kind: 'survey', hex: h });
    expect(check(hex(3, -3))).toMatchObject({
      ok: false,
      reason: 'not-adjacent',
    });
    expect(check(hex(1, 0))).toMatchObject({
      ok: false,
      reason: 'not-adjacent',
    });
    expect(check(hex(0.5, 0))).toMatchObject({
      ok: false,
      reason: 'invalid-hex',
    });
    state = ok(state, 'scout', { kind: 'survey', hex: N }).state;
    expect(check(N)).toMatchObject({
      ok: false,
      reason: 'already-explored',
    });
    const edge = placeCharacter(state, 'scout', hex(0, -6));
    expect(checkAction(edge, 'scout', { kind: 'survey', hex: hex(0, -7) })).toMatchObject({
      ok: false,
      reason: 'unreachable',
    });
  });
});

describe('gather', () => {
  it('puts one unit in the gatherer’s pack for one action, spending a charge', () => {
    for (const role of ['scout', 'engineer']) {
      let state = placeCharacter(chainGame([role]), role, P);
      state = withFeature(state, P, 'iron-deposit', true);
      const result = ok(state, role, { kind: 'gather' });
      // No double yield yet: that is a later engineer upgrade.
      expect(result.state.characters[0]?.pack).toEqual({ iron: 1 });
      expect(result.state.stores).toEqual({});
      expect(result.state.features[hexKey(P)]?.left).toBe(2);
      expect(result.state.characters[0]?.actionsLeft).toBe(2);
      expect(result.events).toEqual([
        { kind: 'gather', hex: P, characterId: role, material: 'iron', amount: 1 },
      ]);
    }
  });

  it('refuses a full pack, hidden, spent and missing nodes, riders and the tired', () => {
    const base = placeCharacter(chainGame(['engineer']), 'engineer', P);
    const gather = (s: GameState) => checkAction(s, 'engineer', { kind: 'gather' });
    const node = withFeature(base, P, 'iron-deposit', true);
    expect(gather(withPack(node, 'engineer', { iron: 4, stone: 2 }))).toMatchObject({
      ok: false,
      reason: 'pack-full',
    });
    expect(gather(withPack(node, 'engineer', { iron: 5 }))).toMatchObject({ ok: true });
    expect(gather(base)).toMatchObject({
      ok: false,
      reason: 'nothing-here',
    });
    expect(gather(withFeature(base, P, 'iron-deposit'))).toMatchObject({
      ok: false,
      reason: 'nothing-here',
    });
    expect(gather(withFeature(base, P, 'tomb', true))).toMatchObject({
      ok: false,
      reason: 'nothing-here',
    });
    expect(gather(withFeature(base, P, 'iron-deposit', true, 0))).toMatchObject({
      ok: false,
      reason: 'depleted',
    });
    expect(gather(riding(node, 'engineer'))).toMatchObject({
      ok: false,
      reason: 'not-on-hex',
    });
    const tired = withCharacter(node, { ...node.characters[0]!, actionsLeft: 0 });
    expect(gather(tired)).toMatchObject({
      ok: false,
      reason: 'not-enough-actions',
    });
  });
});

describe('packs and stores', () => {
  it('empties a pack into the stores on boarding', () => {
    let state = placeCharacter(chainGame(['scout']), 'scout', hex(2, -1));
    state = withPack(withStores(state, { iron: 1 }), 'scout', { iron: 2, timber: 1 });
    const boarded = move(state, 'scout', ON_CREATURE);
    if (!boarded.ok) throw new Error(boarded.reason);
    expect(boarded.state.stores).toEqual({ iron: 3, timber: 1 });
    expect(boarded.state.characters[0]?.pack).toEqual({});
    expect(boarded.events).toEqual([
      { kind: 'deposit', characterId: 'scout', materials: { iron: 2, timber: 1 } },
    ]);
  });

  it('empties the pack of anyone the creature picks up', () => {
    const ahead = hex(1, -2); // under the footprint once the creature steps north
    let state = chainGame(['scout']);
    state = {
      ...state,
      config: { ...state.config, veerWeights: { left: 0, straight: 1, right: 0 } },
    };
    state = withPack(placeCharacter(state, 'scout', ahead), 'scout', { stone: 2 });
    const next = nextDay(state);
    expect(next.characters[0]).toMatchObject({ at: ON_CREATURE, pack: {} });
    expect(next.stores).toEqual({ stone: 2 });
  });

  it('loses the pack with a lost character', () => {
    let state = chainGame(['scout']);
    state = {
      ...state,
      config: { ...state.config, veerWeights: { left: 0, straight: 1, right: 0 } },
    };
    state = withPack(placeCharacter(state, 'scout', hex(0, 6)), 'scout', { iron: 3 });
    state = nextDay(nextDay(state));
    expect(state.characters[0]).toMatchObject({ status: 'lost', pack: {} });
    expect(state.stores).toEqual({});
  });
});

describe('work-site', () => {
  const scholarAt = (type: string, unlocks: string[] = []): GameState => ({
    ...withFeature(placeCharacter(chainGame(['scholar', 'scout']), 'scholar', P), P, type, true),
    unlocks,
  });

  it('costs two actions; success puts the find in the pack and spends the site', () => {
    // Try days until a success: the roll is seeded, so this is the same every run.
    let state = scholarAt('tomb');
    for (let day = 0; day < 20; day++) {
      const result = ok(state, 'scholar', { kind: 'work-site' });
      expect(result.state.characters[0]?.actionsLeft).toBe(1);
      const [event] = result.events;
      if (event?.kind === 'find') {
        expect(event).toEqual({
          kind: 'find',
          hex: P,
          characterId: 'scholar',
          material: 'old-coin',
          amount: 1,
        });
        expect(result.state.characters[0]?.pack).toEqual({ 'old-coin': 1 });
        expect(result.state.features[hexKey(P)]?.left).toBe(0);
        expect(checkAction(result.state, 'scholar', { kind: 'work-site' })).toMatchObject({
          ok: false,
          reason: 'depleted',
        });
        return;
      }
      expect(event).toEqual({ kind: 'site-failed', hex: P, characterId: 'scholar' });
      expect(result.state.features[hexKey(P)]?.left).toBe(1);
      state = placeCharacter(nextDay(state), 'scholar', P);
    }
    throw new Error('no success in 20 days');
  });

  it('rolls the same for the same day, character and site', () => {
    const state = scholarAt('tomb');
    expect(ok(state, 'scholar', { kind: 'work-site' })).toEqual(
      ok(state, 'scholar', { kind: 'work-site' }),
    );
  });

  it('gives the scholar better chances; tier 2 is for scholars, with the lantern', () => {
    const tomb = scholarAt('tomb');
    expect(checkAction(tomb, 'scholar', { kind: 'work-site' })).toMatchObject({ chance: 0.7 });
    const other = placeCharacter(tomb, 'scout', P);
    expect(checkAction(other, 'scout', { kind: 'work-site' })).toMatchObject({ chance: 0.35 });

    const deep = scholarAt('deep-tomb');
    expect(checkAction(deep, 'scholar', { kind: 'work-site' })).toMatchObject({
      ok: false,
      reason: 'needs-unlock',
    });
    // Whether the character could ever work it is said first.
    expect(
      checkAction(placeCharacter(deep, 'scout', P), 'scout', { kind: 'work-site' }),
    ).toMatchObject({
      ok: false,
      reason: 'cannot-work',
    });
    const lit = scholarAt('deep-tomb', ['lantern']);
    expect(checkAction(lit, 'scholar', { kind: 'work-site' })).toMatchObject({
      ok: true,
      chance: 0.8,
      cost: 2,
    });
    expect(
      checkAction(withPack(lit, 'scholar', { iron: 6 }), 'scholar', { kind: 'work-site' }),
    ).toMatchObject({
      ok: false,
      reason: 'pack-full',
    });
  });

  it('refuses a full pack before rolling, changing nothing', () => {
    const full = withPack(scholarAt('tomb'), 'scholar', { iron: 6 });
    const before = JSON.stringify(full);
    expect(act(full, 'scholar', { kind: 'work-site' })).toMatchObject({
      ok: false,
      reason: 'pack-full',
    });
    expect(JSON.stringify(full)).toBe(before);
  });

  it('measures close to the configured chance over many rolls', () => {
    let successes = 0;
    const tries = 400;
    for (let i = 0; i < tries; i++) {
      const state = { ...scholarAt('tomb'), day: i + 1 };
      if (ok(state, 'scholar', { kind: 'work-site' }).events[0]?.kind === 'find') successes++;
    }
    expect(successes / tries).toBeGreaterThan(0.62);
    expect(successes / tries).toBeLessThan(0.78);
  });

  it('cannot be rolled on a player view', () => {
    expect(() =>
      act(toPlayerView(scholarAt('tomb')) as GameState, 'scholar', { kind: 'work-site' }),
    ).toThrow(/seed/);
  });
});

describe('build', () => {
  const engineers = () =>
    withStores(chainGame(['engineer', 'scout']), { iron: 3, timber: 2, stone: 1 });
  const build = (unlock: string): Action => ({ kind: 'build', unlock });

  it('starts an unlock from the stores, then adds one work per action until done', () => {
    let state = engineers();
    const first = ok(state, 'engineer', build('grappling-hook'));
    expect(first.state.stores).toEqual({ iron: 1, timber: 1, stone: 1 });
    expect(first.state.project).toEqual({ unlock: 'grappling-hook', work: 1 });
    expect(first.events).toEqual([
      { kind: 'unlock-progress', unlock: 'grappling-hook', work: 1, needed: 4 },
    ]);
    state = ok(first.state, 'engineer', build('grappling-hook')).state;
    state = ok(state, 'engineer', build('grappling-hook')).state;
    expect(state.stores).toEqual({ iron: 1, timber: 1, stone: 1 }); // paid once
    expect(state.project).toEqual({ unlock: 'grappling-hook', work: 3 });
    state = nextDay(state);
    const last = ok(state, 'engineer', build('grappling-hook'));
    expect(last.state.unlocks).toEqual(['grappling-hook']);
    expect(last.state.project).toBeNull();
    expect(last.events).toContainEqual({ kind: 'unlock-done', unlock: 'grappling-hook' });
    expect(checkAction(last.state, 'engineer', build('grappling-hook'))).toMatchObject({
      ok: false,
      reason: 'already-have',
    });
  });

  it('lets several engineers work on the same unlock', () => {
    let state = chainGame(['engineer', 'engineer2']);
    state = {
      ...withStores(state, { stone: 1, timber: 1 }),
      characters: state.characters.map((c) => ({ ...c, role: 'engineer' })),
    };
    state = ok(state, 'engineer', build('lantern')).state;
    state = ok(state, 'engineer2', build('lantern')).state;
    state = ok(state, 'engineer2', build('lantern')).state;
    expect(state.unlocks).toEqual(['lantern']);
  });

  it('is for engineers riding the creature, one unlock at a time, with the materials in store', () => {
    const state = engineers();
    expect(checkAction(state, 'scout', build('lantern'))).toMatchObject({
      ok: false,
      reason: 'needs-specialist',
    });
    expect(
      checkAction(placeCharacter(state, 'engineer', P), 'engineer', build('lantern')),
    ).toMatchObject({
      ok: false,
      reason: 'not-riding',
    });
    const started = ok(state, 'engineer', build('lantern')).state;
    expect(checkAction(started, 'engineer', build('grappling-hook'))).toMatchObject({
      ok: false,
      reason: 'busy',
    });
    expect(checkAction(state, 'engineer', build('climbing-spikes'))).toMatchObject({
      ok: false,
      reason: 'missing-materials',
    });
    expect(checkAction(state, 'engineer', build('catapult'))).toMatchObject({
      ok: false,
      reason: 'unknown-unlock',
    });
    expect(checkAction(state, 'engineer', { kind: 'dance' } as unknown as Action)).toMatchObject({
      ok: false,
      reason: 'invalid-action',
    });
  });
});

describe('refusals still say the cost', () => {
  it('for survey, gather, work-site and build, by role and config, with missing materials', () => {
    const state = withStores(placeCharacter(chainGame(['scout', 'engineer']), 'scout', P), {
      iron: 1,
    });
    // The scout is not next to (0, -4): refused, but the cost is the scout's.
    expect(checkAction(state, 'scout', { kind: 'survey', hex: hex(0, -4) })).toEqual({
      ok: false,
      reason: 'not-adjacent',
      cost: 1,
    });
    expect(checkAction(state, 'engineer', { kind: 'survey', hex: hex(0, -4) })).toEqual({
      ok: false,
      reason: 'not-adjacent',
      cost: 2,
    });
    expect(checkAction(state, 'scout', { kind: 'gather' })).toEqual({
      ok: false,
      reason: 'nothing-here',
      cost: 1,
    });
    expect(checkAction(state, 'scout', { kind: 'work-site' })).toEqual({
      ok: false,
      reason: 'nothing-here',
      cost: 2,
    });
    expect(checkAction(state, 'engineer', { kind: 'build', unlock: 'grappling-hook' })).toEqual({
      ok: false,
      reason: 'missing-materials',
      cost: 1,
      missing: [
        { material: 'iron', amount: 1 },
        { material: 'timber', amount: 1 },
      ],
    });
    // Not an engineer: still told the cost and what the stores lack.
    expect(checkAction(state, 'scout', { kind: 'build', unlock: 'lantern' })).toEqual({
      ok: false,
      reason: 'needs-specialist',
      cost: 1,
      missing: [
        { material: 'stone', amount: 1 },
        { material: 'timber', amount: 1 },
      ],
    });
    // Unknown things have no cost.
    expect(checkAction(state, 'engineer', { kind: 'build', unlock: 'catapult' })).toEqual({
      ok: false,
      reason: 'unknown-unlock',
    });
  });

  it('come through actionsHere for unavailable actions too', () => {
    const state = placeCharacter(chainGame(['engineer']), 'engineer', P);
    for (const { check } of actionsHere(toPlayerView(state), 'engineer')) {
      expect(typeof check.cost).toBe('number');
    }
  });
});

describe('inactive perks (later upgrades)', () => {
  it('give a scout no trap immunity and an engineer no double yield yet', () => {
    let scouting = placeCharacter(chainGame(['scout']), 'scout', P);
    scouting = withFeature(scouting, N, 'pitfall');
    const caught = move(scouting, 'scout', N);
    expect(caught.ok && caught.trapped).toBe(true);

    let gathering = placeCharacter(chainGame(['engineer']), 'engineer', P);
    gathering = withFeature(gathering, P, 'timber-stand', true);
    const gathered = ok(gathering, 'engineer', { kind: 'gather' });
    expect(gathered.events).toEqual([
      { kind: 'gather', hex: P, characterId: 'engineer', material: 'timber', amount: 1 },
    ]);
  });
});

describe('unlocks and movement', () => {
  const cliff = hex(3, -2);
  const cliffy = () =>
    withTerrain(placeCharacter(chainGame(['scout']), 'scout', P), cliff, 'cliff');

  it('lets everyone onto cliffs with the grappling hook, at 2, marked on the path', () => {
    expect(move(cliffy(), 'scout', cliff)).toMatchObject({
      ok: false,
      reason: 'impassable',
    });
    const hooked = { ...cliffy(), unlocks: ['grappling-hook'] };
    expect(entryInto(hooked, cliff)).toEqual({ cost: 2, via: 'grappling-hook' });
    expect(planPath(hooked, 'scout', cliff)).toEqual({
      ok: true,
      steps: [{ place: { kind: 'hex', hex: cliff }, cost: 2, via: 'grappling-hook' }],
      cost: 2,
    });
  });

  it('makes cliffs cost 1 with climbing spikes, also on a player view', () => {
    const spiked = { ...cliffy(), unlocks: ['grappling-hook', 'climbing-spikes'] };
    expect(entryInto(spiked, cliff)).toEqual({ cost: 1, via: 'climbing-spikes' });
    expect(entryInto(toPlayerView(spiked), cliff)).toEqual({ cost: 1, via: 'climbing-spikes' });
  });
});

describe('actionsHere', () => {
  it('lists surveys of adjacent unexplored hexes, gathering here and builds, on a view', () => {
    let state = placeCharacter(chainGame(['engineer']), 'engineer', P);
    state = withFeature(state, P, 'river-stones', true);
    const options = actionsHere(toPlayerView(state), 'engineer');
    const possible = options.filter((o) => o.check.ok).map((o) => o.action);
    expect(possible.filter((a) => a.kind === 'survey')).toHaveLength(6);
    expect(possible.filter((a) => a.kind !== 'survey')).toEqual([{ kind: 'gather' }]);
    expect(possibleActions(toPlayerView(state), 'engineer')).toEqual(options);
  });
});
