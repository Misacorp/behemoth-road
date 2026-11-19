/**
 * Flat-top axial hex coordinates to the screen. The only place that knows where a hex is drawn, so the
 * isometric-style view and the top-down view differ only here.
 */
import { ART_TUNING } from './config.ts';
import type { Point } from './geom.ts';

export interface Projection {
  readonly kind: 'iso' | 'top';
  /** Vertical squash of the plane: the tilt for iso, 1 for top-down. */
  readonly squash: number;
  /** Hex circumradius in px. */
  readonly size: number;
  /** Side face depth in px (0 top-down). */
  readonly depth: number;
  /** Scale of line widths and props against the reference hex size. */
  readonly k: number;
}

export function isometric(
  size: number = ART_TUNING.hexSize,
  tilt: number = ART_TUNING.tilt,
): Projection {
  const t = Math.min(1, Math.max(0.2, tilt));
  return {
    kind: 'iso',
    squash: t,
    size,
    depth: size * ART_TUNING.sideDepth * Math.sqrt(1 - t * t),
    k: size / ART_TUNING.hexSize,
  };
}

export function topDown(size: number = ART_TUNING.hexSize): Projection {
  return { kind: 'top', squash: 1, size, depth: 0, k: size / ART_TUNING.hexSize };
}

export interface Hex {
  readonly q: number;
  readonly r: number;
}

/**
 * Neighbour offsets in edge order: edge i runs from corner i to corner i + 1, corners counted clockwise
 * from east (screen y points down). Edges 0, 1 and 2 face the viewer.
 */
export const DIRECTIONS: readonly Hex[] = [
  { q: 1, r: 0 },
  { q: 0, r: 1 },
  { q: -1, r: 1 },
  { q: -1, r: 0 },
  { q: 0, r: -1 },
  { q: 1, r: -1 },
];

export function hexKey(q: number, r: number): string {
  return `${q},${r}`;
}

export function hexDistance(a: Hex, b: Hex): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export function hexCenter(p: Projection, q: number, r: number): Point {
  return { x: p.size * 1.5 * q, y: p.size * Math.sqrt(3) * (r + q / 2) * p.squash };
}

export function hexCorners(p: Projection, c: Point, scale = 1): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < 6; i += 1) {
    const a = (Math.PI / 3) * i;
    out.push({
      x: c.x + p.size * scale * Math.cos(a),
      y: c.y + p.size * scale * Math.sin(a) * p.squash,
    });
  }
  return out;
}

/** A point on the ground plane, offset from `c` by (dx, dy) in hex sizes. */
export function onPlane(p: Projection, c: Point, dx: number, dy: number): Point {
  return { x: c.x + dx * p.size, y: c.y + dy * p.size * p.squash };
}

/** Painter's order: back (smaller y) first, then left to right. */
export function drawOrder(a: Point, b: Point): number {
  return a.y - b.y || a.x - b.x;
}
