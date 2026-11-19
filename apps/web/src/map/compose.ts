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
