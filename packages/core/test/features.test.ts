import { describe, expect, it } from 'vitest';
import {
  createGame,
  FEATURE_TYPES,
  featureType,
  generateFeature,
  hex,
  hexesInRange,
  hexKey,
  move,
  moveAlong,
  nextDay,
  onHex,
  terrainAt,
  toPlayerView,
  toSeed,
} from '../src/index.ts';
import { chainGame, placeCharacter, withFeature } from './helpers.ts';

const P = hex(3, -1); // plain, east of the creature
const N = hex(3, -2); // north of P

describe('feature generation', () => {
  it('is sparse, pure per hex, and matches terrain by tags', () => {
    const seed = toSeed(17);
    let count = 0;
    const hexes = hexesInRange(hex(0, 0), 30);
    for (const h of hexes) {
      const type = generateFeature(seed, h, 0.08);
      expect(generateFeature(seed, h, 0.08)).toBe(type);
      if (!type) continue;
      count++;
      const terrain = terrainAt(seed, h);
      expect(terrain.passable).toBe(true);
      const near = hexesInRange(h, 1).flatMap((n) => terrainAt(seed, n).tags);
      const fits =
        type.placement.on.some((t) => terrain.tags.includes(t)) ||
        (type.placement.near ?? []).some((t) => near.includes(t));
      expect(fits).toBe(true);
    }
    expect(count / hexes.length).toBeGreaterThan(0.01);
    // Most hexes stay empty.
    expect(count / hexes.length).toBeLessThan(0.15);
    expect(generateFeature(seed, hex(0, 0), 0)).toBeNull();
  });

  it('adds hidden features as hexes come into view, and keeps them', () => {
    let state = createGame(5);
    expect(Object.keys(state.features).length).toBeGreaterThan(0);
    for (const f of Object.values(state.features)) expect(f.revealed).toBe(false);
    for (let d = 0; d < 10; d++) {
      const before = state.features;
      state = nextDay(state);
      for (const [key, f] of Object.entries(before)) {
        if (state.tiles[key]) expect(state.features[key]).toEqual(f);
      }
    }
    for (const key of Object.keys(state.features)) expect(state.tiles[key]).toBeDefined();
  });

  it('places every kind somewhere over a long walk', () => {
    const seen = new Set<string>();
    for (const s of [1, 2, 3]) {
      let state = createGame(s);
      for (let d = 0; d < 40; d++) {
        for (const f of Object.values(state.features)) seen.add(f.type);
        state = nextDay(state);
      }
    }
    expect([...seen].sort()).toEqual(FEATURE_TYPES.map((t) => t.id).sort());
  });
});

describe('revealing', () => {
  it('reveals a feature for everyone when anyone enters', () => {
    let state = placeCharacter(chainGame(['engineer']), 'engineer', P);
    state = withFeature(state, N, 'iron-deposit');
    expect(toPlayerView(state).features[hexKey(N)]).toBeUndefined();
    const result = move(state, 'engineer', N);
    if (!result.ok) throw new Error(result.reason);
    expect(result.events).toEqual([{ kind: 'reveal', hex: N, feature: 'iron-deposit' }]);
    expect(toPlayerView(result.state).features[hexKey(N)]).toMatchObject({ revealed: true });
  });

  it('springs a hidden trap on a non-scout: the day ends, the trap is revealed and harmless', () => {
    let state = placeCharacter(chainGame(['engineer', 'scout']), 'engineer', P);
    state = placeCharacter(state, 'scout', P);
    state = withFeature(state, N, 'snare');
    const caught = move(state, 'engineer', N);
    if (!caught.ok) throw new Error(caught.reason);
    expect(caught.trapped).toBe(true);
    expect(caught.events).toContainEqual({ kind: 'trap', hex: N, characterId: 'engineer' });
    expect(caught.state.characters[0]?.actionsLeft).toBe(0);
    // Now revealed: the next one through is fine.
    const after = move(caught.state, 'scout', N);
    expect(after.ok && after.trapped).toBe(false);
  });

  it('never springs a trap on a scout, who also senses hidden features nearby', () => {
    let state = placeCharacter(chainGame(['scout']), 'scout', P);
    state = withFeature(state, N, 'pitfall');
    const beyond = hex(3, -3);
    const aside = hex(4, -3);
    state = withFeature(state, beyond, 'tomb');
    state = withFeature(state, aside, 'iron-deposit', true);
    const result = move(state, 'scout', N);
    if (!result.ok) throw new Error(result.reason);
    expect(result.trapped).toBe(false);
    expect(result.state.characters[0]?.actionsLeft).toBe(2);
    expect(result.events).toContainEqual({ kind: 'sense', hex: beyond });
    // A revealed feature needs no glint; a glint never says what is there.
    expect(result.state.glints).toEqual({ [hexKey(beyond)]: true });
    const view = toPlayerView(result.state);
    expect(view.glints).toEqual({ [hexKey(beyond)]: true });
    expect(view.features[hexKey(beyond)]).toBeUndefined();
    expect(JSON.stringify(view)).not.toContain('"tomb"');
  });

  it('stops a walk at a trap: the rest is neither taken nor spent', () => {
    let state = placeCharacter(chainGame(['engineer']), 'engineer', P);
    state = withFeature(state, N, 'snare');
    const result = moveAlong(state, 'engineer', [N, hex(3, -3)]);
    expect(result).toMatchObject({ ok: true, stopped: { step: 0, reason: 'trap' } });
    if (!result.ok) return;
    expect(result.state.characters[0]).toMatchObject({ at: onHex(N), actionsLeft: 0 });
  });

  it('still refuses a whole path when any step is illegal, revealing nothing', () => {
    let state = placeCharacter(chainGame(['engineer']), 'engineer', P);
    state = withFeature(state, N, 'snare');
    const result = moveAlong(state, 'engineer', [N, hex(3, -5)]);
    expect(result).toEqual({ ok: false, reason: 'not-adjacent', step: 1 });
  });

  it('reveals nothing on a player view (it holds no hidden features)', () => {
    let state = placeCharacter(chainGame(['scout']), 'scout', P);
    state = withFeature(state, N, 'tomb');
    const result = move(toPlayerView(state), 'scout', N);
    expect(result.ok && result.events).toEqual([]);
  });

  it('knows every feature type it can generate', () => {
    for (const t of FEATURE_TYPES) expect(featureType(t.id)).toBe(t);
    expect(() => featureType('dragon')).toThrow();
  });
});
