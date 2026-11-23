import { describe, expect, it } from 'vitest';
import {
  act,
  checkAction,
  entryInto,
  FEATURE_TYPES,
  generateFeature,
  type GameState,
  hex,
  hexesInRange,
  hexRing,
  neighbours,
  nextDayWithEvents,
  PEOPLE_TYPES,
  terrainAt,
  terrainOf,
  toSeed,
} from '../src/index.ts';
import {
  fieldGame,
  placeCharacter,
  QUIET,
  withFeature,
  withSettlement,
  withTerrain,
} from './helpers.ts';

const at = hex(3, -1);

describe('swamp and the marsh boards', () => {
  const swamp = (unlocks: string[], terrain = 'swamp'): GameState => ({
    ...withTerrain(fieldGame(['a'], QUIET), at, terrain),
    unlocks,
  });

  it('costs 2 to enter swamp on foot, and 1 with the boards, while plains stay 1', () => {
    expect(entryInto(swamp([]), at)).toEqual({ cost: 2 });
    expect(entryInto(swamp(['marsh-boards']), at)).toEqual({ cost: 1, via: 'marsh-boards' });
    expect(entryInto(swamp(['marsh-boards']), hex(3, -2))).toEqual({ cost: 1 });
  });

  it('keeps sand at 1 a step, boards or not', () => {
    expect(entryInto(swamp([], 'desert'), at)).toEqual({ cost: 1 });
    expect(entryInto(swamp(['marsh-boards'], 'desert'), at)).toEqual({ cost: 1 });
  });

  it('does not make the cliff passable', () => {
    const state = swamp(['marsh-boards'], 'cliff');
    expect(entryInto(state, at)).toBeNull();
    expect(entryInto({ ...state, unlocks: ['climbing-spikes'] }, at)).toEqual({
      cost: 1,
      via: 'climbing-spikes',
    });
  });

  it('generates swamp deterministically, in patches beside rivers, not crowding the map', () => {
    let swampHexes = 0;
    let total = 0;
    let byWater = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      for (const h of hexesInRange(hex(0, 0), 30)) {
        total += 1;
        expect(terrainAt(toSeed(seed), h).id).toBe(terrainAt(toSeed(seed), h).id);
        if (terrainAt(toSeed(seed), h).id !== 'swamp') continue;
        swampHexes += 1;
        if (hexesInRange(h, 3).some((n) => terrainAt(toSeed(seed), n).tags.includes('water'))) {
          byWater += 1;
        }
      }
    }
    expect(swampHexes / total).toBeGreaterThan(0.01);
    expect(swampHexes / total).toBeLessThan(0.08);
    expect(byWater / swampHexes).toBeGreaterThan(0.8);
  });
});

describe('river folk', () => {
  /** The ring just inside the window's edge is a river, so every edge hex stands by water. */
  const byTheWater = (seed: number): GameState => {
    let state = fieldGame(['a'], { ...QUIET, settlementFirst: 1, settlementEvery: 2 }, seed);
    for (const h of hexRing(state.creature.centre, state.config.windowRadius - 1)) {
      state = withTerrain(state, h, 'river');
    }
    return state;
  };

  it('settle only by water or swamp, and the hill folk settle anywhere', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const wet = nextDayWithEvents(byTheWater(seed)).state;
      for (const s of wet.settlements) {
        seen.add(s.type);
        if (s.type === 'river-folk') {
          const tags = [s.hex, ...neighbours(s.hex)].flatMap((h) => terrainOf(wet, h)!.tags);
          expect(tags.includes('water') || tags.includes('boggy')).toBe(true);
        }
      }
    }
    expect([...seen].sort()).toEqual(['hill-folk', 'river-folk']);
  });

  it('turn friendly sooner and offer no shelter', () => {
    const river = PEOPLE_TYPES.find((p) => p.id === 'river-folk')!;
    const hill = PEOPLE_TYPES.find((p) => p.id === 'hill-folk')!;
    expect(river.favourNeeded).toBeLessThan(hill.favourNeeded);
    expect(river.boons).not.toContain('shelter');
    let state = placeCharacter(
      withSettlement(fieldGame(['envoy'], QUIET), at, { type: 'river-folk' }),
      'envoy',
      at,
    );
    // An envoy's parley gains 2: one parley is enough for river folk (2), not for hill folk (3).
    const r = act(state, 'envoy', { kind: 'parley' });
    if (!r.ok) throw new Error(r.reason);
    state = r.state;
    expect(state.settlements[0]).toMatchObject({ attitude: 'friendly' });
    expect(checkAction(state, 'envoy', { kind: 'ask-boon', boon: 'shelter' })).toMatchObject({
      ok: false,
      reason: 'unknown-boon',
    });
    expect(checkAction(state, 'envoy', { kind: 'ask-boon', boon: 'gift' })).toMatchObject({
      ok: true,
    });
  });
});

describe('the sunken shrine and the undertow', () => {
  it('stand only on rivers and swamp, and the shrine finds a river pearl a settlement takes', () => {
    const seed = toSeed(17);
    const seen = new Set<string>();
    for (const h of hexesInRange(hex(0, 0), 60)) {
      const type = generateFeature(seed, h, 0.08);
      if (type?.id !== 'sunken-shrine' && type?.id !== 'undertow') continue;
      seen.add(type.id);
      const tags = terrainAt(seed, h).tags;
      expect(tags.includes('water') || tags.includes('boggy')).toBe(true);
    }
    expect([...seen].sort()).toEqual(['sunken-shrine', 'undertow']);
    const shrine = FEATURE_TYPES.find((f) => f.id === 'sunken-shrine');
    expect(shrine).toMatchObject({ kind: 'site', tier: 1, finds: { material: 'river-pearl' } });
  });

  it('lets a scholar work a shrine and offer the pearl to a settlement', () => {
    let found = false;
    for (let seed = 1; seed <= 20 && !found; seed++) {
      const s = placeCharacter(
        withFeature(
          withTerrain(fieldGame(['scholar'], QUIET, seed), at, 'river'),
          at,
          'sunken-shrine',
          true,
        ),
        'scholar',
        at,
      );
      const r = act(s, 'scholar', { kind: 'work-site' });
      if (r.ok && r.events.some((e) => e.kind === 'find')) {
        found = true;
        expect(r.state.characters[0]?.pack).toEqual({ 'river-pearl': 1 });
      }
    }
    expect(found).toBe(true);
    const offer = placeCharacter(withSettlement(fieldGame(['scholar'], QUIET), at), 'scholar', at);
    const withPearl: GameState = {
      ...offer,
      characters: offer.characters.map((c) => ({ ...c, pack: { 'river-pearl': 1 } })),
    };
    expect(
      checkAction(withPearl, 'scholar', { kind: 'offer', material: 'river-pearl' }),
    ).toMatchObject({
      ok: true,
    });
  });
});
