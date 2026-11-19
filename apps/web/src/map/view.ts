/**
 * The view transform: world px to screen px is `screen = world * scale + (x, y)`. Pure functions, so pan,
 * pinch and wheel zoom are tested without a browser.
 */
import type { Point } from './pick.ts';

export interface View {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

export interface ZoomLimits {
  readonly min: number;
  readonly max: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export const toScreen = (v: View, p: Point): Point => ({
  x: p.x * v.scale + v.x,
  y: p.y * v.scale + v.y,
});

export const toWorld = (v: View, p: Point): Point => ({
  x: (p.x - v.x) / v.scale,
  y: (p.y - v.y) / v.scale,
});

export const panBy = (v: View, dx: number, dy: number): View => ({
  ...v,
  x: v.x + dx,
  y: v.y + dy,
});

export const clampScale = (scale: number, limits: ZoomLimits): number =>
  Math.min(limits.max, Math.max(limits.min, scale));

/** Zooms by `factor` keeping the world point under `at` (screen px) where it is. Zoom is clamped. */
export function zoomAt(v: View, at: Point, factor: number, limits: ZoomLimits): View {
  const scale = clampScale(v.scale * factor, limits);
  const world = toWorld(v, at);
  return { scale, x: at.x - world.x * scale, y: at.y - world.y * scale };
}

/** A view at `scale` with the world point `p` in the middle of the screen. */
export const centreOn = (p: Point, scale: number, screen: Size): View => ({
  scale,
  x: screen.width / 2 - p.x * scale,
  y: screen.height / 2 - p.y * scale,
});

/** The `transform` attribute for the world group. */
export const transformAttr = (v: View): string => `matrix(${v.scale} 0 0 ${v.scale} ${v.x} ${v.y})`;

/** Interpolates between two views (for the follow animation). `t` runs 0..1. */
export const lerpView = (a: View, b: View, t: number): View => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  scale: a.scale + (b.scale - a.scale) * t,
});
