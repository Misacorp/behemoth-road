/**
 * The lure, the cart and the hazards as the client reads them: what the cards offer (the core's own checks),
 * where a lure can be led, how the cart looks, and which creature steps land on harmful ground.
 */
import { characterOf, predictCreature, toPlayerView } from '@behemoth-road/core';
import { describe, expect, it } from 'vitest';
import { type SeasonStage, seasonScenario, USERS } from '../api/fixtures.ts';
import { cargoFill, cargoUnits, cartLook, cartMoves, cartToggles, moveRefusalTip } from './cart.ts';
import { harmfulSteps, hazardIconAt, hazardIconOf, screeFields } from './hazards.ts';
import { leadOption, leadTargets, lureLook } from './lure.ts';
import { unlockOptions } from './chain.ts';

const START = { q: 1, r: 2 };
const NEXT = { q: 2, r: 2 };

function staged(stage: SeasonStage) {
  const s = seasonScenario(stage);
  const view = toPlayerView(s.state);
  const me = characterOf(s.state, USERS.MISA)!.id;
  const c = s.state.creature.centre;
  const abs = (h: { q: number; r: number }) => ({ q: c.q + h.q, r: c.r + h.r });
  return { view, me, abs, state: s.state };
}

describe('the lure animal', () => {
  it('lists the neighbours the core lets it be led onto, and never the creature', () => {
    const { view, abs } = staged({ lures: [{ at: START }] });
    const lure = view.lures[0]!;
    const targets = leadTargets(view, lure);
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.length).toBeLessThanOrEqual(6);
    for (const t of targets) {
      expect(Math.abs(t.q - lure.hex.q) + Math.abs(t.r - lure.hex.r)).toBeGreaterThan(0);
    }
    expect(
      targets.some((t) => t.q === abs({ q: 0, r: 0 }).q && t.r === abs({ q: 0, r: 0 }).r),
    ).toBe(false);
  });

  it('offers leading on or next to it at the core cost, and not from afar', () => {
    const near = staged({ lures: [{ at: NEXT }] });
    expect(leadOption(near.view, near.me, 'lure-1')).toEqual({
      cost: near.view.config.leadCost,
      enabled: true,
    });
    const far = staged({ lures: [{ at: { q: -3, r: 4 } }] });
    expect(leadOption(far.view, far.me, 'lure-1')).toBeNull();
    expect(leadOption(far.view, far.me, 'nope')).toBeNull();
  });

  it('fades the button with the core’s reason: settled, or no actions left', () => {
    const settled = staged({ lures: [{ at: NEXT, leadsLeft: 0 }] });
    expect(lureLook(settled.view.lures[0]!)).toBe('settled');
    expect(leadOption(settled.view, settled.me, 'lure-1')).toMatchObject({
      enabled: false,
      why: 'why:settled',
    });
    const near = staged({ lures: [{ at: NEXT }] });
    const tired = {
      ...near.view,
      characters: near.view.characters.map((c) => ({ ...c, actionsLeft: 0 })),
    };
    expect(leadOption(tired, near.me, 'lure-1')).toMatchObject({
      enabled: false,
      why: 'why:not-enough-actions',
    });
  });
});

describe('the cart', () => {
  it('looks empty, loaded, ridden or hitched, a rider or puller winning over the load', () => {
    const base = { id: 'c', hex: START, cargo: {}, puller: null, rider: null };
    expect(cartLook(base)).toBe('empty');
    expect(cartLook({ ...base, cargo: { timber: 2 } })).toBe('loaded');
    expect(cartLook({ ...base, cargo: { timber: 2 }, puller: 'a' })).toBe('hitched');
    expect(cartLook({ ...base, puller: 'a', rider: 'b' })).toBe('rider');
    expect(cargoUnits({ ...base, cargo: { timber: 2, stone: 1 } })).toBe(3);
  });

  it('fills the cargo mark by the core’s capacity', () => {
    const { view } = staged({ carts: [{ at: START, cargo: { timber: 4 } }] });
    expect(cargoFill(view, view.carts[0]!)).toBe(4 / view.config.cartCargo);
  });

  it('offers hitch and board on its hex, and let go and leave once you do', () => {
    const open = staged({ carts: [{ at: START }] });
    expect(cartToggles(open.view, open.me).map((t) => [t.kind, t.enabled, t.done])).toEqual([
      ['hitch', true, false],
      ['board-cart', true, false],
    ]);
    const pulling = staged({ carts: [{ at: START, puller: 'me' }] });
    const t = cartToggles(pulling.view, pulling.me);
    expect(t.find((x) => x.kind === 'unhitch')).toMatchObject({ enabled: true, done: true });
    const riding = staged({ carts: [{ at: START, rider: 'me' }] });
    expect(cartToggles(riding.view, riding.me).find((x) => x.kind === 'leave-cart')).toMatchObject({
      enabled: true,
      done: true,
    });
  });

  it('offers nothing from another hex', () => {
    const { view, me } = staged({ carts: [{ at: { q: 3, r: 3 } }] });
    expect(cartToggles(view, me)).toEqual([]);
  });

  it('moves a unit per tap: your pack into the cart, the cart into your pack', () => {
    const { view, me } = staged({
      pack: { timber: 2 },
      carts: [{ at: START, cargo: { stone: 1 } }],
    });
    const moves = cartMoves(view, me, view.carts[0]!, { timber: 2 });
    expect(moves.load).toEqual([{ material: 'timber', count: 2, enabled: true }]);
    expect(moves.unload).toEqual([{ material: 'stone', count: 1, enabled: true }]);
  });

  it('greys a load when the cart is full, and says why', () => {
    const { view, me } = staged({
      pack: { timber: 2 },
      carts: [{ at: START, cargo: { stone: 8 } }],
    });
    const [load] = cartMoves(view, me, view.carts[0]!, { timber: 2 }).load;
    expect(load).toMatchObject({ enabled: false, why: 'why:pack-full' });
  });

  it('turns the cart’s move refusals into tips', () => {
    expect(moveRefusalTip('aboard')).toBe('why:aboard');
    expect(moveRefusalTip('cart-terrain')).toBe('why:cart-terrain');
    expect(moveRefusalTip('no-path')).toBeNull();
  });

  it('lists the cart in the hub as built while one stands, and buildable again once lost', () => {
    const built = staged({ carts: [{ at: START }] });
    const cart = (s: typeof built) =>
      unlockOptions(s.view, s.me).find((o) => o.unlock.vehicle !== undefined)!;
    expect(cart(built).done).toBe(true);
    const none = staged({});
    expect(cart(none).done).toBe(false);
    expect(cart(none).unlock.id).toBe('cart');
  });
});

describe('hazards', () => {
  it('knows hazard terrain from its peril, and a known hex’s icon', () => {
    expect(hazardIconOf('glass-waste')).toBe('glass-waste');
    expect(hazardIconOf('poisoned-lake')).toBe('poisoned-lake');
    expect(hazardIconOf('plains')).toBeNull();
    expect(hazardIconOf('mystery')).toBeNull();
    const { view, abs } = staged({ terrains: [{ at: NEXT, terrain: 'glass-waste' }] });
    expect(hazardIconAt(view, abs(NEXT))).toBe('glass-waste');
    expect(hazardIconAt(view, abs(START))).toBeNull();
  });

  it('marks each creature step that would end on harmful ground, and none otherwise', () => {
    const plain = staged({});
    expect(harmfulSteps(plain.view, predictCreature(plain.view))).toEqual([]);
    const probe = staged({});
    const options = predictCreature(probe.view);
    const first = options[0]!;
    const c = probe.state.creature.centre;
    const rel = { q: first.centre.q - c.q, r: first.centre.r - c.r };
    const s = staged({ terrains: [{ at: rel, terrain: 'poisoned-lake' }] });
    const harm = harmfulSteps(s.view, predictCreature(s.view));
    expect(harm).toHaveLength(1);
    expect(harm[0]).toMatchObject({
      direction: first.direction,
      terrain: 'poisoned-lake',
      amount: 2,
    });
  });

  it('shows no harm for a creature that lingers', () => {
    const s = staged({ lingering: true });
    expect(harmfulSteps(s.view, predictCreature(s.view))).toEqual([]);
  });

  it('groups rockslides by the scree field that laid them', () => {
    const { view, abs } = staged({
      threats: [
        { type: 'rockslide', at: { q: 0, r: 4 }, patch: 'h1' },
        { type: 'rockslide', at: { q: 1, r: 4 }, patch: 'h1' },
        { type: 'rockslide', at: { q: 3, r: 3 } },
      ],
    });
    expect(screeFields(view)).toEqual([
      { patch: 'h1', hexes: [abs({ q: 0, r: 4 }), abs({ q: 1, r: 4 })] },
    ]);
  });
});
