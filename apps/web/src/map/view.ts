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

/** Interpolates between two views (for the follow animation). `t` runs 0..1. */
export const lerpView = (a: View, b: View, t: number): View => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  scale: a.scale + (b.scale - a.scale) * t,
});

/**
 * The zoom step the scene's ink is drawn for: the scale rounded to half powers of two (…, 0.71, 1, 1.41, …),
 * so small zoom changes never redraw the scene.
 */
export const inkZoomFor = (scale: number): number => 2 ** (Math.round(Math.log2(scale) * 2) / 2);

/**
 * The CSS transform for the world layer. The layer is the world drawn at `raster` CSS px per world px with
 * world point `origin` at its top-left corner; the transform places it so that world point (wx, wy) lands
 * where the view puts it, `(v.x + v.scale·wx, v.y + v.scale·wy)`. Between redraws it only scales the
 * finished bitmap, so the compositor moves the map without re-rasterising it.
 */
export function layerTransform(v: View, raster: number, origin: { x: number; y: number }): string {
  const k = v.scale / raster;
  const tx = v.x + v.scale * origin.x;
  const ty = v.y + v.scale * origin.y;
  return `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${k.toFixed(5)})`;
}

/** Largest world-layer bitmap: per side and in area, in device px (GPU texture limits on phones). */
export interface LayerLimits {
  readonly maxSide: number;
  readonly maxPixels: number;
}

/**
 * The raster scale for the world layer: the wanted ink-zoom step, lowered if needed so the layer's bitmap
 * (`box` × raster × device pixel ratio) stays within `limits` on both sides and in area. Ink may be slightly
 * softer at an extreme zoom; the transform makes up the rest of the scale.
 */
export function layerRaster(
  wanted: number,
  box: { width: number; height: number },
  dpr: number,
  limits: LayerLimits,
): number {
  const d = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  const w = Math.max(1, box.width) * d;
  const h = Math.max(1, box.height) * d;
  const fit = Math.min(
    limits.maxSide / w,
    limits.maxSide / h,
    Math.sqrt(limits.maxPixels / (w * h)),
  );
  return Math.min(wanted, fit);
}
