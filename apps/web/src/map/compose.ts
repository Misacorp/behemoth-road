/**
 * Splits a scene drawn with `frame: 'none'` into two layers so the interface overlays can go between them:
 * overlays on the ground go below the layer of upright props and figures, the rest above it. The scene's
 * own `<svg>` wrapper is dropped, because the map draws it inside one pan-and-zoom group.
 */
import type { SvgNode } from '@behemoth-road/art';

export interface SceneLayers {
  /** Filter defs, the ground wash and crisp ground lines. */
  readonly ground: readonly SvgNode[];
  /** Props, the creature and characters (the art kit's `objects` layer) and anything after it. */
  readonly figures: readonly SvgNode[];
}

export function splitScene(scene: SvgNode): SceneLayers {
  const children = scene.children;
  const objects = children.findIndex((c) => c.attrs['data-layer'] === 'objects');
  const at = objects === -1 ? children.length : objects;
  return { ground: children.slice(0, at), figures: children.slice(at) };
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Where a popover of `size` goes for a hex whose top edge is at `anchor` (screen px): centred above it,
 * or below when asked (`prefer`) or when there is no room above, and always inside the screen with `margin`
 * to spare.
 */
export function placePopover(
  anchor: { x: number; y: number },
  below: number,
  size: { width: number; height: number },
  screen: { width: number; height: number },
  margin: number,
  prefer: 'above' | 'below' = 'above',
): Rect {
  const gap = 6;
  const above = anchor.y - gap - size.height;
  const under = anchor.y + below + gap;
  const fitsBelow = under + size.height <= screen.height - margin;
  let y = prefer === 'below' && fitsBelow ? under : above;
  if (y < margin) y = under;
  const clamp = (v: number, max: number): number => Math.min(Math.max(v, margin), max - margin);
  const x = clamp(anchor.x - size.width / 2, screen.width - size.width);
  y = clamp(y, screen.height - size.height);
  return { x, y, width: size.width, height: size.height };
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A convex polygon (a hex's top face on screen), its corners in order. */
export type Polygon = readonly Point[];

/** Whether a rectangle and a convex polygon overlap (separating axes; touching edges do not count). */
export function overlaps(rect: Rect, poly: Polygon): boolean {
  const box: Polygon = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
  const axes: Point[] = [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
  ];
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    axes.push({ x: a.y - b.y, y: b.x - a.x });
  }
  const eps = 0.01;
  for (const ax of axes) {
    const project = (pts: Polygon): [number, number] => {
      let lo = Infinity;
      let hi = -Infinity;
      for (const pt of pts) {
        const d = pt.x * ax.x + pt.y * ax.y;
        lo = Math.min(lo, d);
        hi = Math.max(hi, d);
      }
      return [lo, hi];
    };
    const [a0, a1] = project(box);
    const [b0, b1] = project(poly);
    if (a1 <= b0 + eps || b1 <= a0 + eps) return false;
  }
  return true;
}

/**
 * Where a card about your own hex goes so it covers none of `avoid` (your hex and its six neighbours, on
 * screen): below them, then beside (right, left), then above, each inside the screen with `margin`. When
 * none fits, the usual place (`placePopover`).
 */
export function placeClear(
  anchor: Point,
  below: number,
  size: { width: number; height: number },
  screen: { width: number; height: number },
  margin: number,
  avoid: readonly Polygon[],
): Rect {
  const fallback = placePopover(anchor, below, size, screen, margin);
  const pts = avoid.flat();
  if (pts.length === 0) return fallback;
  const gap = 6;
  const x0 = Math.min(...pts.map((pt) => pt.x));
  const x1 = Math.max(...pts.map((pt) => pt.x));
  const y0 = Math.min(...pts.map((pt) => pt.y));
  const y1 = Math.max(...pts.map((pt) => pt.y));
  const midY = (y0 + y1) / 2 - size.height / 2;
  const clamp = (v: number, max: number): number => Math.min(Math.max(v, margin), max - margin);
  const candidates: Point[] = [
    { x: anchor.x - size.width / 2, y: y1 + gap },
    { x: x1 + gap, y: midY },
    { x: x0 - gap - size.width, y: midY },
    { x: anchor.x - size.width / 2, y: y0 - gap - size.height },
  ];
  for (const c of candidates) {
    const rect: Rect = {
      x: clamp(c.x, screen.width - size.width),
      y: clamp(c.y, screen.height - size.height),
      width: size.width,
      height: size.height,
    };
    if (!avoid.some((poly) => overlaps(rect, poly))) return rect;
  }
  return fallback;
}

/** The chevron on a popover's edge, in the popover's own px: a paper fill and its two ink sides. */
export interface Chevron {
  readonly fill: string;
  readonly edge: string;
}

const CHEVRON_HALF = 8;
/** As deep as the gap `placePopover` leaves, so the tip just meets the thing. */
const CHEVRON_DEPTH = 6;
/** A card placed further off (clear of your neighbours) reaches toward its thing, up to this. */
const CHEVRON_REACH = 22;
/** Keep the chevron clear of the card's rounded corners. */
const CHEVRON_INSET = 18;

/**
 * A small chevron on the popover edge facing what it belongs to, sliding along the edge to point at it
 * when the card is clamped to the screen; deeper (up to `CHEVRON_REACH`) when the card sits further off.
 * `anchor` is the top of the thing, `below` its height (screen px). A card beside the thing gets the
 * chevron on that side. The card body spans `height - 2` px (the last 2 px are its shadow).
 */
export function chevronFor(rect: Rect, anchor: { x: number; y: number }, below: number): Chevron {
  const bottom = rect.height - 2;
  const right = rect.width - 2;
  const middle = anchor.y + below / 2;
  const n = (v: number): string => (Math.round(v * 10) / 10).toString();
  const depth = (gap: number): number => Math.min(CHEVRON_REACH, Math.max(CHEVRON_DEPTH, gap));
  let a: string;
  let t: string;
  let b: string;
  if (rect.y + bottom <= middle || rect.y >= middle) {
    const down = rect.y + bottom <= middle;
    const half = Math.min(CHEVRON_HALF, (rect.width - 2 * CHEVRON_INSET) / 2);
    const x = Math.min(
      Math.max(anchor.x - rect.x, CHEVRON_INSET + half),
      rect.width - 2 - CHEVRON_INSET - half,
    );
    // The base sits just inside the card so the fill hides the card's border under the chevron.
    const [base, tip] = down
      ? [bottom - 1, bottom + depth(anchor.y - (rect.y + bottom))]
      : [1, -depth(rect.y - (anchor.y + below))];
    a = `${n(x - half)} ${n(base)}`;
    t = `${n(x)} ${n(tip)}`;
    b = `${n(x + half)} ${n(base)}`;
  } else {
    // Beside the thing: the chevron on the facing side, at the thing's middle height.
    const leftOf = rect.x + right <= anchor.x;
    const half = Math.min(CHEVRON_HALF, (rect.height - 2 * CHEVRON_INSET) / 2);
    const y = Math.min(
      Math.max(middle - rect.y, CHEVRON_INSET / 2 + half),
      bottom - CHEVRON_INSET / 2 - half,
    );
    const [base, tip] = leftOf
      ? [right - 1, right + depth(anchor.x - (rect.x + right))]
      : [1, -depth(rect.x - anchor.x)];
    a = `${n(base)} ${n(y - half)}`;
    t = `${n(tip)} ${n(y)}`;
    b = `${n(base)} ${n(y + half)}`;
  }
  return { fill: `M${a}L${t}L${b}Z`, edge: `M${a}L${t}L${b}` };
}
