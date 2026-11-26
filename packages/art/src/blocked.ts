/**
 * The blocked-hex pattern: diagonal stripes over hexes a selected subject cannot enter, with a thin edge round
 * the whole cluster. Reusable for any "blocked" reason; the first reason is fire (hexes a fire-fearing swarm
 * will not enter). It sits on the ground plane (drawing coordinates), over the terrain and under the props,
 * and reads on every ground colour: coral stripes over a pale wash, so they show on dark forest and on pale
 * desert alike.
 */
import { jaggedFlameNodes } from './fire-art.ts';
import { ellipsePath, poly, type Point } from './geom.ts';
import type { Palette } from './palette.ts';
import { hexCenter, hexCorners, hexKey, type Hex, type Projection } from './projection.ts';
import { el, type SvgNode } from './svg.ts';

export interface BlockedOptions {
  /** Why they are blocked; a known reason draws its small mark at the cluster's centre (`fire`). */
  readonly reason?: string;
}

/** Reasons that have a mark of their own. */
export const BLOCKED_REASONS = ['fire'] as const;
export type BlockedReason = (typeof BLOCKED_REASONS)[number];

const isHex = (h: Hex): boolean => Number.isFinite(h.q) && Number.isFinite(h.r);

/** The outline edges that belong to exactly one hex of the cluster (its rim), as path data. */
function rimOf(p: Projection, hexes: readonly Hex[]): string {
  const edges = new Map<string, { a: Point; b: Point; n: number }>();
  for (const h of hexes) {
    const corners = hexCorners(p, hexCenter(p, h.q, h.r));
    corners.forEach((a, i) => {
      const b = corners[(i + 1) % 6]!;
      const key = [a, b]
        .map((q) => `${Math.round(q.x)},${Math.round(q.y)}`)
        .sort()
        .join('|');
      const seen = edges.get(key);
      if (seen) seen.n += 1;
      else edges.set(key, { a, b, n: 1 });
    });
  }
  return [...edges.values()]
    .filter((e) => e.n === 1)
    .map((e) => poly([e.a, e.b], false))
    .join('');
}

/** A short stable number from the hexes, so two clusters never share a pattern id. */
function hashOf(keys: readonly string[]): string {
  let h = 17;
  for (const ch of keys.join(';')) h = (h * 31 + ch.charCodeAt(0)) % 1_000_003;
  return h.toString(36);
}

/**
 * Stripes over each of `hexes` (duplicates and non-finite hexes are ignored), a thin edge round the
 * cluster's outside, and with a known `reason` a small mark at the cluster's centre: for `fire`, a flame on
 * a paper disc. Carries `data-blocked="<count>"` (and `data-reason`). An empty list draws an empty group.
 */
export function drawBlockedHexes(
  p: Projection,
  hexes: readonly Hex[],
  palette: Palette,
  opts: BlockedOptions = {},
): SvgNode {
  const unique = new Map<string, Hex>();
  for (const h of hexes) if (isHex(h)) unique.set(hexKey(h.q, h.r), h);
  const list = [...unique.values()].sort((a, b) => a.q - b.q || a.r - b.r);
  if (list.length === 0) return el('g', { 'data-blocked': 0 });
  const stripe = palette.accents.coral;
  const period = 9 * p.k;
  const id = `blocked_${palette.id}_${hashOf([...unique.keys()].sort())}`;
  const fillD = list.map((h) => poly(hexCorners(p, hexCenter(p, h.q, h.r)))).join('');
  const rim = rimOf(p, list);
  const nodes: SvgNode[] = [
    el('defs', {}, [
      el(
        'pattern',
        {
          id,
          patternUnits: 'userSpaceOnUse',
          width: period,
          height: period,
          patternTransform: 'rotate(45)',
        },
        [
          el('rect', {
            x: 0,
            y: 0,
            width: period,
            height: period,
            fill: palette.paper,
            opacity: 0.3,
          }),
          el('rect', {
            x: 0,
            y: 0,
            width: period * 0.42,
            height: period,
            fill: stripe.shade,
            opacity: 0.8,
          }),
          el('rect', {
            x: period * 0.42,
            y: 0,
            width: period * 0.1,
            height: period,
            fill: palette.paper,
            opacity: 0.7,
          }),
        ],
      ),
    ]),
    el('path', { d: fillD, fill: `url(#${id})` }),
    el('path', {
      d: rim,
      fill: 'none',
      stroke: stripe.shade,
      'stroke-width': Math.max(1.2, 1.6 * p.k),
      'stroke-linecap': 'round',
      opacity: 0.9,
    }),
  ];
  const reason = opts.reason;
  if (reason === 'fire') {
    const centres = list.map((h) => hexCenter(p, h.q, h.r));
    const x = centres.reduce((s, c) => s + c.x, 0) / centres.length;
    const y = centres.reduce((s, c) => s + c.y, 0) / centres.length;
    const r = 0.4 * p.size;
    nodes.push(
      el('g', { 'data-reason': 'fire' }, [
        el('path', {
          d: ellipsePath(x, y, r, r * Math.max(0.7, p.squash)),
          fill: palette.paper,
          stroke: stripe.shade,
          'stroke-width': Math.max(1.2, 1.6 * p.k),
        }),
        ...jaggedFlameNodes(palette, x, y + r * 0.5, r * 1.1, r * 1.35),
      ]),
    );
  }
  return el('g', { 'data-blocked': list.length }, nodes);
}
