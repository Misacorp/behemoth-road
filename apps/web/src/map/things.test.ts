/**
 * The lure and cart on the map: taps, lead mode, the refusal tips, and what is drawn (scree under its
 * rockslides, the capybara, the cart in each state, the harm mark on a creature step, the pull cost).
 */
import { MORNING, paletteColours, walk, type SvgNode } from '@behemoth-road/art';
import {
  characterOf,
  onHex,
  planPath,
  predictCreature,
  reachablePlaces,
  toPlayerView,
} from '@behemoth-road/core';
import { describe, expect, it } from 'vitest';
import { type SeasonStage, seasonScenario, USERS } from '../api/fixtures.ts';
import { momentsFromEvents } from '../game/moments.ts';
import { PROJECTION } from './art.ts';
import { cartFeet, lureFeet, pickableFeet } from './figures.ts';
import { cartToggles } from '../game/cart.ts';
import { leadTargets as leadTargetsOf } from '../game/lure.ts';
import { choose, type Flow, IDLE, startLead, tap, tapHex } from './flow.ts';
import { moveOption } from '../game/move.ts';
import { mapTipAt } from './mapTips.ts';
import { buildOverlays } from './overlays.ts';
import { buildThings, sceneExtras } from './things.ts';
import { pickTarget } from './pick.ts';

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

function input(g: ReturnType<typeof staged>, flow: Flow) {
  return {
    state: g.view,
    flow,
    characterId: g.me,
    reachable: reachablePlaces(g.view, g.me),
    predicted: predictCreature(g.view),
    projection: PROJECTION,
    palette: MORNING,
  };
}

const marks = (nodes: SvgNode[], key: string, value?: string): SvgNode[] => {
  const out: SvgNode[] = [];
  for (const n of nodes) {
    walk(n, (x) => {
      if (key in x.attrs && (value === undefined || x.attrs[key] === value)) out.push(x);
    });
  }
  return out;
};

describe('taps on the lure and the cart', () => {
  it('opens the lure card on a tap, and the same tap again closes it', () => {
    const g = staged({ lures: [{ at: { q: 3, r: 3 } }] });
    const open = tap(IDLE, g.view, g.me, { kind: 'lure', id: 'lure-1' });
    expect(open).toEqual({ kind: 'lure', id: 'lure-1' });
    expect(tap(open, g.view, g.me, { kind: 'lure', id: 'lure-1' })).toEqual(IDLE);
  });

  it('lead mode: the button lights the targets, a target shows the confirm, elsewhere lets go', () => {
    const g = staged({ lures: [{ at: NEXT }] });
    const card: Flow = { kind: 'lure', id: 'lure-1' };
    const mode = startLead(card);
    expect(mode).toEqual({ kind: 'lead', id: 'lure-1' });
    const lit = marks(buildThings(input(g, mode)).under, 'data-mark', 'lead-targets');
    expect(lit).toHaveLength(1);
    const target = [
      { q: g.abs(NEXT).q + 1, r: g.abs(NEXT).r },
      { q: g.abs(NEXT).q, r: g.abs(NEXT).r + 1 },
      { q: g.abs(NEXT).q + 1, r: g.abs(NEXT).r - 1 },
    ].find(
      (h) => tapHex(mode, g.view, g.me, h).kind === 'lead' && 'to' in tapHex(mode, g.view, g.me, h),
    );
    expect(target).toBeDefined();
    const chosen = tapHex(mode, g.view, g.me, target!);
    expect(chosen).toMatchObject({ kind: 'lead', id: 'lure-1', to: target });
    expect(
      marks(buildThings(input(g, chosen)).over, 'data-mark', 'lead-arrow').length,
    ).toBeGreaterThan(0);
    // A hex it cannot go to (two away), or the creature, lets go.
    expect(tapHex(mode, g.view, g.me, { q: g.abs(NEXT).q + 3, r: g.abs(NEXT).r })).toEqual(IDLE);
  });

  it('a cart on another hex opens its card, even selected; on your own hex it is one of several things', () => {
    const g = staged({ carts: [{ at: NEXT }] });
    const open = tap({ kind: 'selected' }, g.view, g.me, { kind: 'cart', id: 'cart-1' });
    expect(open).toEqual({ kind: 'cart', id: 'cart-1' });
    const own = staged({ carts: [{ at: START }] });
    // On your own hex the cart is one of several things there: the picker, then its card with a back.
    const shared = tap({ kind: 'selected' }, own.view, own.me, { kind: 'cart', id: 'cart-1' });
    expect(shared.kind).toBe('pick');
    expect(choose(own.view, own.me, shared, { kind: 'cart', id: 'cart-1' })).toMatchObject({
      kind: 'cart',
      id: 'cart-1',
      back: shared,
    });
  });

  it('picks the cart and the lure by their drawings', () => {
    const g = staged({ carts: [{ at: NEXT }], lures: [{ at: { q: 3, r: 3 } }] });
    const cart = g.view.carts[0]!;
    const feet = cartFeet(PROJECTION, cart.hex);
    const others = [{ id: cart.id, feet, kind: 'cart' as const }];
    expect(pickTarget(PROJECTION, { x: feet.x, y: feet.y - 10 }, null, others)).toEqual({
      kind: 'cart',
      id: 'cart-1',
    });
    const lf = lureFeet(PROJECTION, g.view.lures[0]!.hex);
    expect(
      pickTarget(PROJECTION, { x: lf.x, y: lf.y - 8 }, null, [
        { id: 'lure-1', feet: lf, kind: 'lure' },
      ]),
    ).toEqual({ kind: 'lure', id: 'lure-1' });
  });

  it('gives the aboard tip when a rider taps another hex, and the cart-terrain tip for ground it cannot roll', () => {
    const rider = staged({ carts: [{ at: START, rider: 'me' }] });
    expect(moveOption(rider.view, rider.me, onHex(rider.abs(NEXT)))).toMatchObject({
      enabled: false,
      why: 'why:aboard',
    });
    const puller = staged({
      carts: [{ at: START, puller: 'me' }],
      terrains: [{ at: NEXT, terrain: 'swamp' }],
    });
    const plan = planPath(puller.view, puller.me, puller.abs(NEXT));
    expect(plan).toEqual({ ok: false, reason: 'cart-terrain' });
    expect(moveOption(puller.view, puller.me, onHex(puller.abs(NEXT)))).toMatchObject({
      enabled: false,
      why: 'why:cart-terrain',
    });
  });

  it('has tips for the lure and the cart on the map', () => {
    const g = staged({
      lures: [{ at: { q: 3, r: 3 } }, { at: { q: 3, r: 4 }, leadsLeft: 0 }],
      carts: [{ at: NEXT }],
    });
    expect(mapTipAt(g.view, g.abs({ q: 3, r: 3 }))).toBe('map:lure');
    expect(mapTipAt(g.view, g.abs({ q: 3, r: 4 }))).toBe('map:lure-settled');
    expect(mapTipAt(g.view, g.abs(NEXT))).toBe('map:cart');
  });
});

describe('what is drawn', () => {
  it('draws one scree field under its rockslides, the capybara and the cart in each state', () => {
    const g = staged({
      threats: [
        { type: 'rockslide', at: { q: 0, r: 4 }, patch: 'h1' },
        { type: 'rockslide', at: { q: 1, r: 4 }, patch: 'h1' },
      ],
      lures: [{ at: { q: 3, r: 3 } }, { at: { q: 3, r: 4 }, leadsLeft: 0 }],
      carts: [{ at: NEXT, cargo: { timber: 3 } }],
    });
    const things = buildThings(input(g, IDLE));
    const extras = sceneExtras(input(g, IDLE)).flatMap((x) => x.drawn.nodes);
    expect(marks(things.under, 'data-scree', 'h1')).toHaveLength(1);
    expect(marks(extras, 'data-lure').map((n) => n.attrs['data-leads'])).toContain(0);
    expect(marks(extras, 'data-cart')[0]!.attrs['data-look']).toBe('loaded');
    expect(marks(extras, 'data-mark', 'cargo-fill')).toHaveLength(1);
    for (const look of ['empty', 'rider', 'hitched']) {
      const s = staged({
        carts: [
          {
            at: START,
            ...(look === 'rider' ? { rider: 'me' as const } : {}),
            ...(look === 'hitched' ? { puller: 'me' as const } : {}),
          },
        ],
      });
      const nodes = sceneExtras(input(s, IDLE)).flatMap((x) => x.drawn.nodes);
      expect(marks(nodes, 'data-cart')[0]!.attrs['data-look']).toBe(look);
    }
  });

  it('uses palette colours only', () => {
    const g = staged({ lures: [{ at: NEXT }], carts: [{ at: START, cargo: { timber: 2 } }] });
    const t = buildThings(input(g, { kind: 'lead', id: 'lure-1' }));
    const palette = paletteColours(MORNING);
    const extras = sceneExtras(input(g, { kind: 'lead', id: 'lure-1' })).flatMap(
      (x) => x.drawn.nodes,
    );
    for (const n of [...t.under, ...t.over, ...extras]) {
      walk(n, (x) => {
        for (const k of ['fill', 'stroke']) {
          const v = x.attrs[k];
          if (typeof v === 'string' && v !== 'none' && !v.startsWith('url'))
            expect(palette.has(v.toLowerCase()), v).toBe(true);
        }
      });
    }
  });

  it('puts the harm mark on a creature step hint that lands on harmful ground', () => {
    const probe = staged({});
    const first = predictCreature(probe.view)[0]!;
    const c = probe.state.creature.centre;
    const g = staged({
      terrains: [
        { at: { q: first.centre.q - c.q, r: first.centre.r - c.r }, terrain: 'glass-waste' },
      ],
    });
    const under = buildOverlays(input(g, IDLE)).under;
    expect(marks(under, 'data-mark', 'step-harm')).toHaveLength(1);
    expect(marks(buildOverlays(input(probe, IDLE)).under, 'data-mark', 'step-harm')).toHaveLength(
      0,
    );
  });

  it('shows glass waste’s extra cost like any extra cost, and the pull extra on every step', () => {
    const g = staged({ terrains: [{ at: NEXT, terrain: 'glass-waste' }] });
    const plan = planPath(g.view, g.me, g.abs(NEXT));
    if (!plan.ok) throw new Error('no plan');
    expect(plan.steps.at(-1)!.cost).toBe(g.view.config.moveCost + 1);
    const pulling = staged({ carts: [{ at: START, puller: 'me' }] });
    const p2 = planPath(pulling.view, pulling.me, pulling.abs(NEXT));
    if (!p2.ok) throw new Error('no plan');
    const flow: Flow = {
      kind: 'planned',
      to: p2.steps.at(-1)!.place,
      steps: p2.steps,
      cost: p2.cost,
    };
    const o = buildOverlays(input(pulling, flow));
    const arrows = marks(o.over, 'data-arrow', 'ready').length;
    expect(arrows).toBe(p2.cost);
    expect(p2.cost).toBe(
      p2.steps.length * 0 +
        p2.steps.reduce((a, s) => a + s.cost, 0) +
        p2.steps.length * pulling.view.config.cartPullExtra,
    );
  });
});

describe('moments for the new events', () => {
  const hex = { q: 2, r: 1 };
  const from = { q: 1, r: 1 };
  it('plays hazard steps, lure leads, settling and fleeing', () => {
    expect(
      momentsFromEvents(
        [
          { kind: 'hazard-step', hex, terrain: 'glass-waste' },
          { kind: 'lure-led', from, to: hex },
          { kind: 'lure-settled', hex },
          { kind: 'lure-fled', hex },
        ],
        { q: 0, r: 0 },
        'me',
      ),
    ).toEqual([
      { kind: 'hazard-step', hex, terrain: 'glass-waste' },
      { kind: 'lure-led', hex, from },
      { kind: 'lure-settled', hex },
      { kind: 'lure-fled', hex },
    ]);
  });

  it('plays the cart events', () => {
    const e = (kind: string, more = {}) => ({ kind, hex, ...more });
    expect(
      momentsFromEvents(
        [
          e('cart-built'),
          e('hitched'),
          e('unhitched'),
          e('boarded-cart'),
          e('left-cart'),
          e('loaded', { material: 'timber' }),
          e('unloaded', { material: 'stone' }),
          e('cart-lost'),
        ],
        { q: 0, r: 0 },
        'me',
      ).map((m) => m.kind),
    ).toEqual([
      'cart-built',
      'cart-take',
      'cart-leave',
      'cart-take',
      'cart-leave',
      'cart-load',
      'cart-unload',
      'cart-lost',
    ]);
  });
});

describe('review fixes', () => {
  it('lead mode takes a tap on a figure standing on a target hex as that hex', () => {
    const g = staged({ lures: [{ at: NEXT }] });
    const mode: Flow = { kind: 'lead', id: 'lure-1' };
    const lure = g.view.lures[0]!;
    const free = leadTargetsOf(g.view, lure)[0]!;
    const other = g.view.characters.find((c) => c.id !== g.me)!.id;
    const moved = {
      ...g.view,
      characters: g.view.characters.map((c) =>
        c.id === other ? { ...c, at: { kind: 'hex' as const, hex: free } } : c,
      ),
    };
    expect(tap(mode, moved, g.me, { kind: 'character', id: other })).toMatchObject({
      kind: 'lead',
      to: free,
    });
    const withCart = {
      ...g.view,
      carts: [{ id: 'cart-9', hex: free, cargo: {}, puller: null, rider: null }],
    };
    expect(tap(mode, withCart, g.me, { kind: 'cart', id: 'cart-9' })).toMatchObject({
      kind: 'lead',
      to: free,
    });
  });

  it('arms every button but the ones flagged to run on one tap', () => {
    const open = staged({ carts: [{ at: START }] });
    expect(cartToggles(open.view, open.me).map((t) => t.noArm)).toEqual([undefined, undefined]);
    const pulling = staged({ carts: [{ at: START, puller: 'me' }] });
    expect(cartToggles(pulling.view, pulling.me).find((t) => t.kind === 'unhitch')?.noArm).toBe(
      true,
    );
  });

  it('takes a tap on a shared hex to the picker, whichever figure is hit', () => {
    const g = staged({ lures: [{ at: START }], carts: [{ at: START }] });
    const feet = pickableFeet(g.view, g.me, PROJECTION);
    expect(feet.others.flatMap((o) => (o.kind ? [o.kind] : []))).toEqual(['lure', 'cart']);
    const mine = feet.mine!;
    for (const dy of [-0.5, -0.3, -0.1]) {
      const at = { x: mine.x, y: mine.y + dy * PROJECTION.size };
      const target = pickTarget(PROJECTION, at, feet.mine, feet.others);
      expect(tap(IDLE, g.view, g.me, target)).toMatchObject({ kind: 'pick' });
    }
  });
});
