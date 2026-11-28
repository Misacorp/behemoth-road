import { describe, expect, it } from 'vitest';
import {
  createGame,
  FEATURE_TYPES,
  featureType,
  generateFeature,
  hex,
  hexesInRange,
  hexKey,
  isExplored,
  move,
  moveAlong,
  nextDay,
  onHex,
  terrainAt,
  toPlayerView,
  toSeed,
} from '../src/index.ts';
import { CALM, chainGame, placeCharacter, withFeature } from './helpers.ts';

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
    // Everything is hidden until explored, except a brazier, which shows as soon as its hex is seen.
    for (const f of Object.values(state.features)) expect(f.revealed).toBe(f.type === 'brazier');
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
      let state = createGame(s, { config: CALM });
      for (let d = 0; d < 40; d++) {
        for (const f of Object.values(state.features)) seen.add(f.type);
        state = nextDay(state);
      }
    }
    expect([...seen].sort()).toEqual(FEATURE_TYPES.map((t) => t.id).sort());
  });
});

describe('exploring and revealing', () => {
  it('explores a hex for everyone when anyone enters, revealing its feature', () => {
    let state = placeCharacter(chainGame(['engineer']), 'engineer', P);
    state = withFeature(state, N, 'iron-deposit');
    expect(isExplored(state, N)).toBe(false);
    expect(toPlayerView(state).features[hexKey(N)]).toBeUndefined();
    const result = move(state, 'engineer', N);
    if (!result.ok) throw new Error(result.reason);
    expect(result.events).toEqual([
      { kind: 'explore', hex: N },
      { kind: 'reveal', hex: N, feature: 'iron-deposit' },
    ]);
    const view = toPlayerView(result.state);
    expect(view.tiles[hexKey(N)]?.explored).toBe(true);
    expect(view.features[hexKey(N)]).toMatchObject({ type: 'iron-deposit', revealed: true });
  });

  it('keeps a hex explored as the window moves on', () => {
    let state = placeCharacter(chainGame(['engineer']), 'engineer', P);
    const moved = move(state, 'engineer', N);
    if (!moved.ok) throw new Error(moved.reason);
    state = nextDay(moved.state);
    expect(isExplored(state, N)).toBe(true);
  });

  it('springs a hidden trap on anyone, scouts too: the day ends; then it is harmless', () => {
    for (const role of ['scout', 'engineer']) {
      let state = placeCharacter(chainGame([role, 'scholar']), role, P);
      state = placeCharacter(state, 'scholar', P);
      state = withFeature(state, N, 'snare');
      const caught = move(state, role, N);
      if (!caught.ok) throw new Error(caught.reason);
      expect(caught.trapped).toBe(true);
      expect(caught.events).toContainEqual({ kind: 'trap', hex: N, characterId: role });
      expect(caught.state.characters[0]?.actionsLeft).toBe(0);
      const after = move(caught.state, 'scholar', N);
      expect(after.ok && after.trapped).toBe(false);
    }
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
    expect(result.ok && result.events).toEqual([{ kind: 'explore', hex: N }]);
    expect(JSON.stringify(toPlayerView(state))).not.toContain('"tomb"');
  });

  it('knows every feature type it can generate', () => {
    for (const t of FEATURE_TYPES) expect(featureType(t.id)).toBe(t);
    expect(() => featureType('dragon')).toThrow();
  });
});
