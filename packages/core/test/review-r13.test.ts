import { describe, expect, it } from 'vitest';
import {
  act,
  type Cart,
  cartCanEnter,
  cartSpot,
  type GameState,
  type Hex,
  hex,
  loadGame,
  nextDay,
  nextDayWithEvents,
  resolveConfig,
  toPlayerView,
  toSeed,
} from '../src/index.ts';
import { hazardLookahead, hazardRoutePosition } from '../src/hazards.ts';
import { lureRoutePosition } from '../src/lures.ts';
import {
  CALM,
  fieldGame,
  P,
  placeCharacter,
  QUIET,
  withCharacter,
  withFeature,
  withTerrain,
} from './helpers.ts';

const me = (s: GameState, id: string) => s.characters.find((c) => c.id === id)!;
const allTerrain = (s: GameState, terrain: string): GameState => {
  let next = s;
  for (const key of Object.keys(s.tiles)) {
    const [q, r] = key.split(',').map(Number) as [number, number];
    next = withTerrain(next, { q, r }, terrain);
  }
  return next;
};

describe('a cart finished by self-winding', () => {
  const winding = (): GameState => {
    const g = { ...fieldGame(['engineer'], CALM), project: { unlock: 'cart', work: 2 } };
    return withCharacter(g, {
      ...me(g, 'engineer'),
      skills: { xp: 0, taken: ['engineer-b1', 'engineer-b2', 'engineer-b3'] },
    });
  };

  it('is placed when there is room', () => {
    const r = nextDayWithEvents(winding());
    expect(r.state.carts).toHaveLength(1);
    expect(r.state.project).toBeNull();
  });

  it('with no room holds the project one work short', () => {
    const r = nextDayWithEvents(allTerrain(winding(), 'lake'));
    expect(r.state.carts).toEqual([]);
    expect(r.state.project).toEqual({ unlock: 'cart', work: 2 });
    expect(r.events.some((e) => e.kind === 'unlock-done')).toBe(false);
  });
});

describe('cart ids, spots and islets', () => {
  it('stay unique when two carts are built (cartsMax 2)', () => {
    let s: GameState = {
      ...fieldGame(['engineer'], { ...CALM, cartsMax: 2 }),
      stores: { timber: 4 },
    };
    for (let i = 0; i < 8; i++) {
      const r = act(s, 'engineer', { kind: 'build', unlock: 'cart' });
      s = r.ok ? r.state : nextDay(s);
    }
    expect(s.carts).toHaveLength(2);
    expect(new Set(s.carts.map((c) => c.id)).size).toBe(2);
    expect(new Set(s.carts.map((c) => `${c.hex.q},${c.hex.r}`)).size).toBe(2);
    expect(s.cartCount).toBe(2);
    expect(Object.keys(toPlayerView(s))).not.toContain('cartCount');
  });

  it('refuse a hex another cart holds', () => {
    const s = fieldGame(['engineer'], CALM);
    const cart: Cart = { id: 'cart1', hex: P, cargo: {}, puller: null, rider: null };
    expect(cartCanEnter(s, P)).toBe(true);
    const held = { ...s, carts: [cart] };
    expect(cartCanEnter(held, P)).toBe(false);
    expect(cartSpot(held, P)).not.toEqual(P);
  });

  it('never roll on an islet, by its tag', () => {
    const s = withTerrain(fieldGame(['engineer'], CALM), P, 'islet');
    expect(cartCanEnter(s, P)).toBe(false);
    expect(cartCanEnter(withTerrain(s, P, 'plains'), P)).toBe(true);
  });

  it('a stored game without a counter resumes from its carts', () => {
    const s = fieldGame(['engineer'], CALM);
    const old: Record<string, unknown> = { ...s, carts: [{ id: 'cart1', hex: P }] };
    delete old['cartCount'];
    expect(loadGame(old).cartCount).toBe(1);
  });
});

describe('leading a lure onto a revealed feature', () => {
  it('is refused, as placement is', () => {
    let s: GameState = {
      ...fieldGame(['keeper'], { ...QUIET, routeLength: 100_000 }),
      lures: [{ id: 'l1', type: 'capybara', hex: hex(4, -2), leadsLeft: 3 }],
    };
    s = placeCharacter(s, 'keeper', hex(5, -2));
    const target: Hex = hex(4, -3);
    expect(act(s, 'keeper', { kind: 'lead', lure: 'l1', to: target }).ok).toBe(true);
    const shown = withFeature(s, target, 'brazier', true);
    expect(act(shown, 'keeper', { kind: 'lead', lure: 'l1', to: target }).ok).toBe(false);
  });
});

describe('mapgen tuning in the config', () => {
  it('defaults keep the old numbers', () => {
    const c = resolveConfig();
    expect(hazardLookahead(c)).toBe(c.windowRadius + 3);
    expect(hazardRoutePosition(toSeed(1), c, 0)).toBeGreaterThanOrEqual(c.hazardFirst + 3);
    expect(lureRoutePosition(toSeed(1), c, 0)).toBe(c.lureFirstWithin);
  });

  it('are validated', () => {
    for (const bad of [
      { hazardSideChance: 1.5 },
      { hazardJitter: -1 },
      { hazardLookaheadBeyond: 0 },
      { lureWideMin: 0 },
      { lureWideMin: 3, lureWideMax: 2 },
      { lureAheadMin: 0 },
    ]) {
      expect(() => resolveConfig(bad)).toThrow(RangeError);
    }
  });
});
