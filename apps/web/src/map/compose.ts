/**
 * Splits the art kit's scene into layers so the interface overlays can go between them: overlays that sit
 * on the ground go below the layer of upright props and figures, the rest above everything except the paper
 * grain. The scene's own `<svg>` wrapper is dropped, because the map draws it inside one pan-and-zoom group.
 */
import type { SvgNode } from '@behemoth-road/art';

export interface SceneLayers {
  /** Paper, ground wash and crisp ground lines. */
  readonly ground: readonly SvgNode[];
  /** Props, the creature and characters (the ink layer). */
  readonly figures: readonly SvgNode[];
  /** The paper grain, sized to cover the screen: draw it outside the pan-and-zoom group. */
  readonly grain: readonly SvgNode[];
}

const usesFilter = (node: SvgNode, name: string): boolean => {
  const filter = node.attrs['filter'];
  return typeof filter === 'string' && filter.endsWith(`-${name})`);
};

const SCREEN = { x: 0, y: 0, width: '100%', height: '100%' } as const;

const isVignette = (node: SvgNode): boolean => {
  const fill = node.attrs['fill'];
  return node.tag === 'rect' && typeof fill === 'string' && fill.endsWith('-vignette)');
};

export function splitScene(scene: SvgNode): SceneLayers {
  const children = scene.children;
  const ink = children.findIndex(
    (c) => c.attrs['data-layer'] === 'objects' || usesFilter(c, 'ink'),
  );
  const grain = children.findIndex((c) => usesFilter(c, 'grain'));
  const end = grain === -1 ? children.length : grain;
  const start = ink === -1 ? end : Math.min(ink, end);
  return {
    // The scene's page vignette frames a fixed picture; on a map that pans it would show as a box.
    ground: children.slice(0, start).filter((c) => !isVignette(c)),
    figures: children.slice(start, end),
    // The grain covers the screen rather than the scene's frame, so the frame's edge never shows.
    grain: children
      .slice(end)
      .map((c) => (c.tag === 'rect' ? { ...c, attrs: { ...c.attrs, ...SCREEN } } : c)),
  };
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Where a popover of `size` goes for a hex whose top edge is at `anchor` (screen px): centred above it,
 * or below when there is no room above, and always inside the screen with `margin` to spare.
 */
export function placePopover(
  anchor: { x: number; y: number },
  below: number,
  size: { width: number; height: number },
  screen: { width: number; height: number },
  margin: number,
): Rect {
  const gap = 6;
  let y = anchor.y - gap - size.height;
  if (y < margin) y = anchor.y + below + gap;
  const clamp = (v: number, max: number): number => Math.min(Math.max(v, margin), max - margin);
  const x = clamp(anchor.x - size.width / 2, screen.width - size.width);
  y = clamp(y, screen.height - size.height);
  return { x, y, width: size.width, height: size.height };
}
