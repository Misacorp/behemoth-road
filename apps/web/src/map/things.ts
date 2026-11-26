/**
 * What the lure and cart rework adds to the map, as `SvgNode` trees in world px: a scree field's loose stones
 * on the ground under its rockslides, the capybara (normal or settled, with its leads-left pawprints), the
 * cart in its four states with its cargo mark, and, while a lure is being led, the hexes it can go to and the
 * arrow to the one chosen. `under` is ground; `over` stands on top of the figures.
 */
import {
  drawCapybara,
  drawCargoFill,
  drawCart,
  drawLeadsLeft,
  drawScreeField,
  el,
  hexCenter,
  hexCorners,
  type Palette,
  type Projection,
  type SvgNode,
} from '@behemoth-road/art';
import type { GameStateView, Hex } from '@behemoth-road/core';
import { accentOf } from '../game/identity.ts';
import { cargoFill, cartLook } from '../game/cart.ts';
import { screeFields } from '../game/hazards.ts';
import { leadTargets, lureById, lureLook } from '../game/lure.ts';
import { MAP_TUNING } from './config.ts';
import { cartFeet, lureFeet } from './figures.ts';
import type { Flow } from './flow.ts';
import { inkArrow, type OverlayInput } from './overlays.ts';

const n = (v: number): string => (Math.round(v * 10) / 10).toString();

/** A size in world px that is at least `screenPx` on screen at the settled zoom. */
const atLeast = (zoom: number | undefined, world: number, screenPx: number): number =>
  Math.max(world, screenPx / (zoom ?? 1));

function hexPath(p: Projection, h: Hex, scale: number): string {
  const pts = hexCorners(p, hexCenter(p, h.q, h.r), scale);
  return `M${pts.map((q) => `${n(q.x)} ${n(q.y)}`).join('L')}Z`;
}

/** An art kit `<svg>` (a mark with its own size) centred on (x, y), `size` world px tall. */
function centred(mark: SvgNode, at: { x: number; y: number }, width: number, height: number): SvgNode {
  return el(
    'svg',
    { ...mark.attrs, x: at.x - width / 2, y: at.y - height / 2, width, height },
    [...mark.children],
  );
}

/** The lure animal with its leads-left pawprints above it. */
function lureNodes(i: OverlayInput): SvgNode[] {
  const p = i.projection;
  return i.state.lures.map((lure) => {
    const feet = lureFeet(p, lure.hex);
    const drawn = drawCapybara(i.palette, lureLook(lure), {
      origin: feet,
      k: p.size / 64,
      squash: p.squash,
      seed: lure.id,
    });
    const h = atLeast(i.zoom, 0.22 * p.size, 13);
    return el('g', { 'data-lure': lure.id, 'data-leads': lure.leadsLeft }, [
      ...drawn.nodes,
      el('g', { 'data-mark': 'leads-left' }, [
        centred(
          drawLeadsLeft(i.palette, lure.leadsLeft, h),
          { x: feet.x, y: feet.y - 0.62 * p.size },
          h * 2.4,
          h,
        ),
      ]),
    ]);
  });
}

/** The cart in its state, with its cargo-fill mark above it. */
function cartNodes(i: OverlayInput): SvgNode[] {
  const p = i.projection;
  return i.state.carts.map((cart) => {
    const feet = cartFeet(p, cart.hex);
    const look = cartLook(cart);
    const who = cart.rider ?? cart.puller;
    const drawn = drawCart(i.palette, look, {
      origin: feet,
      k: p.size / 64,
      squash: p.squash,
      seed: cart.id,
      ...(who ? { accent: accentOf(who, MAP_TUNING.accent) } : {}),
    });
    const h = atLeast(i.zoom, 0.2 * p.size, 12);
    const slots = Math.max(1, Math.min(8, i.state.config.cartCargo));
    const mark = drawCargoFill(i.palette, cargoFill(i.state, cart), slots, h);
    const w = (h * (slots * 10.5 + 6)) / 16;
    return el('g', { 'data-cart': cart.id, 'data-look': look }, [
      ...drawn.nodes,
      el('g', { 'data-mark': 'cargo-fill' }, [
        centred(mark, { x: feet.x + 0.1 * p.size, y: feet.y - 0.78 * p.size }, w, h),
      ]),
    ]);
  });
}

/** The hexes the lure being led can go to, and the arrow and ring on the chosen one. */
function leadMarks(i: OverlayInput, flow: Extract<Flow, { kind: 'lead' }>): {
  under: SvgNode[];
  over: SvgNode[];
} {
  const lure = lureById(i.state, flow.id);
  if (!lure) return { under: [], over: [] };
  const p = i.projection;
  const k = p.k;
  const targets = leadTargets(i.state, lure);
  const under: SvgNode[] = [];
  if (targets.length > 0) {
    const d = targets.map((h) => hexPath(p, h, 0.86)).join('');
    under.push(
      el('g', { 'data-mark': 'lead-targets', 'data-count': targets.length }, [
        el('path', { d, fill: i.palette.paper, opacity: 0.5 }),
        el('path', {
          d,
          fill: 'none',
          stroke: i.palette.ink,
          'stroke-width': 1.6 * k,
          'stroke-dasharray': `${n(3 * k)} ${n(4 * k)}`,
          'stroke-linejoin': 'round',
          opacity: 0.85,
        }),
      ]),
    );
  }
  // The lure's own hex is ringed, so what is being led reads.
  under.push(
    el('path', {
      d: hexPath(p, lure.hex, 0.92),
      fill: 'none',
      stroke: i.palette.ink,
      'stroke-width': 2.2 * k,
      'stroke-linejoin': 'round',
    }),
  );
  const over: SvgNode[] = [];
  if (flow.to) {
    const from = hexCenter(p, lure.hex.q, lure.hex.r);
    const to = hexCenter(p, flow.to.q, flow.to.r);
    under.push(
      el('path', {
        d: hexPath(p, flow.to, 0.92),
        fill: 'none',
        stroke: i.palette.accents.sage.shade,
        'stroke-width': 3 * k,
        'stroke-linejoin': 'round',
        'data-mark': 'lead-chosen',
      }),
    );
    over.push(...inkArrow(i, [from, to], { inset: 0.5 * p.size, width: 2.4, mark: 'lead-arrow' }));
  }
  return { under, over };
}

/** A scree field's stones, under its rockslides: one wash per field, so a cluster reads as one. */
function screeNodes(state: GameStateView, p: Projection, palette: Palette): SvgNode[] {
  return screeFields(state).map(({ patch, hexes }) =>
    el('g', { 'data-scree': patch, 'data-hexes': hexes.length }, [
      drawScreeField(p, hexes, palette, patch),
    ]),
  );
}

export function buildThings(i: OverlayInput): { under: SvgNode[]; over: SvgNode[] } {
  const under = screeNodes(i.state, i.projection, i.palette);
  const over = [...lureNodes(i), ...cartNodes(i)];
  if (i.flow.kind === 'lead') {
    const marks = leadMarks(i, i.flow);
    under.push(...marks.under);
    over.push(...marks.over);
  }
  return { under, over };
}
